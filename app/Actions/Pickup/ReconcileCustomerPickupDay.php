<?php

namespace App\Actions\Pickup;

use App\Jobs\RenderPickupAwbManifestJob;
use App\Models\Customer;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupPendingItem;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class ReconcileCustomerPickupDay
{
    public function __construct(private QueryPickupResults $pickups, private PickupAwbEligibility $eligibility, private BuildPickupAwbManifest $manifests) {}

    /** @return list<int> */
    public function memberIds(PickupTask $task): array
    {
        $task->loadMissing('proof');
        $date = PickupResultPeriod::date($task->proof->picked_up_at ?? $task->scheduled_at)->toDateString();

        return array_values($this->pickups->handle(['date_from' => $date, 'date_to' => $date, 'customer_id' => $task->customer_id])
            ->whereNotIn('task_status', ['CANCELLED', 'NO_PACKAGES'])->orderBy('id')->pluck('id')->map(fn ($id): int => (int) $id)->all());
    }

    public function handle(int $taskId, ReconcilePickupProcessing $evaluate): PickupCustomerReconciliation
    {
        return DB::transaction(function () use ($taskId, $evaluate): PickupCustomerReconciliation {
            $origin = PickupTask::with('proof')->findOrFail($taskId);
            $customer = Customer::whereKey($origin->customer_id)->lockForUpdate()->firstOrFail();
            $date = PickupResultPeriod::date($origin->proof->picked_up_at ?? $origin->scheduled_at)->toDateString();
            $ids = $this->memberIds($origin);
            if ($ids === []) {
                $ids = [$taskId];
            }
            $group = PickupCustomerReconciliation::firstOrCreate(['customer_id' => $customer->id, 'business_date' => $date], ['anchor_task_id' => min($ids)]);
            $group = PickupCustomerReconciliation::whereKey($group->id)->lockForUpdate()->firstOrFail();
            if ($group->status === 'DONE' && $group->locked_at !== null) {
                PickupProcessingReconciliation::whereIn('pickup_task_id', $group->evidence['pickup_task_ids'] ?? [])
                    ->where('review_open', false)->whereNull('locked_at')->update(['locked_at' => $group->locked_at]);
            }
            $tasks = PickupTask::whereIn('id', $ids)->orderBy('id')->lockForUpdate()->with(['proof.revisions', 'handoverItem.revisions', 'handoverItem.proof.revisions'])->get()->keyBy('id');
            $refreshSources = true;
            foreach ($tasks as $task) {
                if ($task->proof?->finalized_at) {
                    $evaluate->evaluate($task->id, $refreshSources);
                    $refreshSources = false;
                } else {
                    PickupProcessingReconciliation::firstOrCreate(['pickup_task_id' => $task->id]);
                }
            }
            $results = PickupProcessingReconciliation::whereIn('pickup_task_id', $ids)->lockForUpdate()->get();
            $reasons = [];
            $baseline = true;
            $counts = [];
            foreach (PickupProcessingRecord::CATEGORIES as $category) {
                $pop = 0;
                $received = 0;
                $validPop = true;
                $validWarehouse = true;
                foreach ($tasks as $task) {
                    $proof = $task->proof?->finalized_at ? $task->proof->effectiveValues() : null;
                    $handover = $task->handoverItem;
                    $warehouse = $handover && $handover->status !== 'PENDING' ? $handover->effectiveValues() : null;
                    $validPop = $validPop && $proof !== null;
                    $validWarehouse = $validWarehouse && $warehouse !== null;
                    $pop += (int) ($proof[$category] ?? 0);
                    $received += (int) ($warehouse[$category] ?? 0);
                    $valid = $proof !== null && $warehouse !== null && ! $handover->needsReview() && ($warehouse['status'] ?? '') === 'VERIFIED' && (int) $proof[$category] === (int) $warehouse[$category];
                    $baseline = $baseline && $valid;
                    if ($proof && $warehouse && ! $valid) {
                        $reasons[] = $task->reference.': POP dan verifikasi gudang perlu diperiksa.';
                    }
                }
                $counts[$category] = ['pop' => $validPop ? $pop : null, 'received' => $validWarehouse ? $received : null, 'expected' => null, 'confirmed' => 0, 'shortfall' => null, 'excess' => null];
            }
            if (! $customer->is_active) {
                $reasons[] = 'Customer tidak aktif.';
            }
            if ($results->contains('review_open', true)) {
                $reasons[] = 'Koreksi isi buku pickup belum divalidasi.';
            }
            if (PickupPendingItem::whereIn('pickup_task_id', $ids)->whereIn('status', ['PENDING', 'READY'])->exists()) {
                $reasons[] = 'Masih ada barang pending yang belum diselesaikan.';
            }
            $from = PickupResultPeriod::start($date)->utc();
            $olderPending = PickupPendingItem::whereIn('status', ['PENDING', 'READY'])
                ->whereHas('pickup', fn ($pickup) => $pickup->where('customer_id', $customer->id)->whereHas('proof', fn ($proof) => $proof->where('picked_up_at', '<', $from)))->exists();
            /** Separate current reads avoid locking the global NULL-owner range through the OR predicate. */
            $owned = JneShipment::whereIn('pickup_task_id', $ids)->orderBy('id')->lockForUpdate()->get();
            $pool = JneShipment::where('customer_id', $customer->id)->whereNull('pickup_task_id')
                ->when(DB::connection()->getDriverName() === 'mysql', fn (Builder $query) => $query->forceIndex('jne_shipments_customer_id_foreign'))
                ->whereHas('latestSource', fn ($source) => $source->where('entry_at', '>=', $from)->where('entry_at', '<', $from->addDay()))
                ->whereNotExists(fn ($excluded) => $excluded->selectRaw('1')->from('pickup_awb_exclusions')->whereColumn('jne_shipment_id', 'jne_shipments.id')->whereIn('pickup_task_id', $ids))
                ->orderBy('id')->lockForUpdate()->get();
            $scope = $owned->merge($pool)->sortBy('id')->values();
            $scope->load(['latestSource.reportJob', 'cashlessClaim']);
            $processedKeys = $this->eligibility->processedKeys($tasks, $scope);
            $confirmed = $scope->filter(function (JneShipment $shipment) use ($tasks, $customer, $olderPending, $processedKeys): bool {
                $task = $tasks->get($shipment->pickup_task_id);

                $owned = $task && $shipment->match_status === 'MATCHED' && $this->eligibility->allowed($task, $shipment, $processedKeys);
                $pooled = ! $olderPending && $shipment->pickup_task_id === null && $shipment->match_method === 'CUSTOMER_CODE_DATE' && in_array($shipment->match_status, ['AMBIGUOUS', 'UNMATCHED'], true) && $shipment->cashlessClaim === null;

                return ($owned || $pooled) && $shipment->customer_id === $customer->id && $shipment->customer_match_status === 'MATCHED'
                    && $shipment->category_status === 'MATCHED' && in_array($shipment->category, PickupProcessingRecord::CATEGORIES, true) && $shipment->tracking_status !== 'CANCELLED'
                    && $shipment->latestSource?->reportJob?->workflowStage() === 'READY';
            });
            if ($scope->count() !== $confirmed->count()) {
                $reasons[] = ($scope->count() - $confirmed->count()).' resi belum terkonfirmasi untuk bucket customer, kategori atau sumbernya.';
            }
            $totals = [];
            foreach ($counts as $category => $count) {
                $count['expected'] = $baseline ? $count['received'] : null;
                $count['confirmed'] = $confirmed->where('category', $category)->count();
                $count['shortfall'] = $baseline ? max(0, $count['expected'] - $count['confirmed']) : null;
                $count['excess'] = $baseline ? max(0, $count['confirmed'] - $count['expected']) : null;
                if ($count['excess'] > 0) {
                    $reasons[] = 'Jumlah '.$category.' melebihi target gabungan sebesar '.$count['excess'].' AWB.';
                }
                $totals[$category] = $count;
            }
            $counts = $totals;
            $same = $baseline && array_sum(array_column($counts, 'expected')) > 0 && collect($counts)->every(fn (array $count): bool => $count['confirmed'] === $count['expected']);
            if ($same && $reasons === [] && $confirmed->contains('pickup_task_id', null)) {
                $owner = $tasks->first(fn ($task) => $results->firstWhere('pickup_task_id', $task->id)?->locked_at === null && ! $results->firstWhere('pickup_task_id', $task->id)?->review_open);
                if (! $owner) {
                    $reasons[] = 'Resi tambahan belum dapat diikat karena seluruh buku pickup terkunci.';
                } else {
                    foreach ($confirmed->whereNull('pickup_task_id') as $shipment) {
                        JneShipmentMatchEvent::create(['jne_shipment_id' => $shipment->id, 'previous_pickup_task_id' => null, 'pickup_task_id' => $owner->id,
                            'previous_customer_id' => $customer->id, 'customer_id' => $customer->id, 'customer_match_status' => 'MATCHED', 'match_status' => 'MATCHED',
                            'method' => AllocatePickupAwbBuckets::METHOD, 'actor_id' => null, 'reason' => 'Diikat setelah jumlah gabungan customer per hari sesuai.',
                            'evidence' => ['customer_reconciliation_id' => $group->id, 'business_date' => $date, 'pickup_task_ids' => $ids]]);
                        $shipment->update(['pickup_task_id' => $owner->id, 'match_status' => 'MATCHED', 'match_method' => AllocatePickupAwbBuckets::METHOD, 'version' => $shipment->version + 1]);
                    }
                    $evaluate->evaluate($owner->id, false);
                }
            }
            $status = $reasons !== [] ? 'REVIEW' : (! $baseline ? 'AWAITING_VERIFICATION' : ($same ? 'DONE' : ($confirmed->isNotEmpty() ? 'PARTIAL' : 'WAITING_DATA')));
            $snapshot = ['status' => $status, 'categories' => $counts, 'reasons' => array_values(array_unique($reasons)), 'evidence' => [
                'unit' => 'AWB', 'pickup_task_ids' => $ids, 'business_date' => $date,
                'shipments' => $scope->map(fn (JneShipment $row): array => $row->only(['id', 'awb', 'pickup_task_id', 'customer_id', 'category', 'match_status', 'category_status', 'customer_match_status']))->all(),
                'input_versions' => $results->pluck('input_version', 'pickup_task_id')->all(),
            ]];
            $hash = hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR));
            if ($group->evidence_hash !== $hash) {
                $group->fill([...$snapshot, 'evidence_hash' => $hash, 'revision' => $group->revision + 1]);
                DB::table('pickup_customer_reconciliation_events')->insert(['customer_reconciliation_id' => $group->id, 'revision' => $group->revision, 'snapshot' => json_encode($snapshot, JSON_THROW_ON_ERROR), 'created_at' => now()]);
            }
            $group->fill(['anchor_task_id' => min($ids), 'pickup_count' => count($ids), 'evaluated_at' => now()]);
            if ($status === 'DONE') {
                $group->locked_at ??= now();
            }
            $group->save();
            PickupProcessingReconciliation::whereIn('pickup_task_id', $ids)->update(['customer_reconciliation_id' => $group->id]);
            if ($status === 'DONE') {
                PickupProcessingReconciliation::whereIn('pickup_task_id', $ids)->whereNull('locked_at')->update(['locked_at' => now()]);
                $manifest = $this->manifests->handle($tasks->get($group->anchor_task_id), $counts, $confirmed, $group);
                if ($manifest->status === 'PENDING') {
                    RenderPickupAwbManifestJob::dispatch($manifest->id)->afterCommit();
                }
            } else {
                $manifests = PickupAwbManifest::whereIn('pickup_task_id', $ids)->whereIn('status', ['READY', 'PENDING', 'RENDERING', 'FAILED'])->pluck('id');
                PickupAwbManifest::whereIn('id', $manifests)->update(['status' => 'SUPERSEDED']);
                PickupAwbDelivery::whereIn('pickup_awb_manifest_id', $manifests)->whereIn('status', ['READY', 'AWAITING_CONFIGURATION'])->update(['status' => 'CANCELLED']);
            }

            return $group;
        }, 3);
    }
}

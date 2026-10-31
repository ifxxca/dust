<?php

namespace App\Actions\Pickup;

use App\Actions\Reports\MatchJneShipments;
use App\Actions\Reports\ResolveJneCategories;
use App\Models\Customer;
use App\Models\JneCustomerCodeAlias;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneSourceContract;
use App\Models\PickupPendingItem;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class ReconcilePickupProcessing
{
    public function __construct(private MatchJneShipments $matcher, private ResolveJneCategories $categories, private AssessPickupReportCoverage $coverage, private AllocatePickupAwbBuckets $buckets) {}

    public function handle(int $taskId): PickupProcessingReconciliation
    {
        app(ReconcileCustomerPickupDay::class)->handle($taskId, $this);

        return PickupProcessingReconciliation::where('pickup_task_id', $taskId)->firstOrFail();
    }

    public function evaluate(int $taskId, bool $refreshSources = true): PickupProcessingReconciliation
    {
        return DB::transaction(function () use ($taskId, $refreshSources): PickupProcessingReconciliation {
            $customerId = PickupTask::whereKey($taskId)->value('customer_id');
            Customer::whereKey($customerId)->lockForUpdate()->firstOrFail();
            $task = PickupTask::whereKey($taskId)->lockForUpdate()->with(['proof.revisions', 'handoverItem.revisions', 'handoverItem.proof.revisions'])->firstOrFail();
            PickupProcessingReconciliation::firstOrCreate(['pickup_task_id' => $taskId], ['revision' => 0]);
            $result = PickupProcessingReconciliation::where('pickup_task_id', $taskId)->lockForUpdate()->firstOrFail();
            if ($result->status === 'DONE' && $result->locked_at === null && ! $result->review_open && $result->customer_reconciliation_id === null) {
                $result->update(['locked_at' => now()]);
            }
            $from = $task->proof?->picked_up_at ? PickupResultPeriod::start(PickupResultPeriod::date($task->proof->picked_up_at)->toDateString())->utc() : null;
            $thru = $from?->addDay();
            $customer = Customer::findOrFail($task->customer_id);
            $sources = new Collection;
            if ($refreshSources) {
                $known = JneShipment::where('pickup_task_id', $task->id)
                    ->when($from, fn (Builder $query) => $query->orWhere(fn (Builder $day) => $day->where('customer_id', $task->customer_id)->whereHas('latestSource', fn ($source) => $source->where('entry_at', '>=', $from)->where('entry_at', '<', $thru))))
                    ->pluck('latest_report_awb_id');
                $sourceQuery = JneReportAwb::query()->join('jne_shipments as current_source', 'current_source.latest_report_awb_id', '=', 'jne_report_awbs.id')
                    ->select('jne_report_awbs.*')->whereIn('jne_report_awbs.id', $known);
                $codes = JneCustomerCodeAlias::where('customer_id', $customer->id)->where('is_active', true)->whereNotNull('verified_at')->pluck('code')->push($customer->customer_code)->filter()->all();
                if ($from && config('jne-reports.evidence_policies_enabled')) {
                    foreach (JneSourceContract::whereNotNull('active_key')->whereNotNull('verified_at')->get() as $contract) {
                        $column = $contract->definition['customer_code_column'] ?? null;
                        if (! is_string($column) || $column === '') {
                            continue;
                        }
                        $sourceQuery->orWhere(fn (Builder $query) => $query->where('entry_at', '>=', $from)->where('entry_at', '<', $thru)->whereIn('raw_data->'.$column, $codes)
                            ->whereHas('reportJob', fn ($job) => $job->where('source', $contract->source)->where('report_type', $contract->report_type)));
                    }
                }
                $sources = $sourceQuery->orderBy('jne_report_awbs.id')->get();
                if ($sources->isNotEmpty()) {
                    $decisions = $this->matcher->candidates($sources);
                    $registry = JneShipment::whereIn('awb', $sources->pluck('awb'))->with('pickup:id,customer_id')->get()->keyBy('awb');
                    foreach ($sources as $source) {
                        if ($shipment = $registry->get($source->awb)) {
                            $this->matcher->automatic($shipment, $source, $decisions);
                        }
                    }
                    if (ResolveJneCategories::markersEnabled()) {
                        $this->categories->handle(JneShipment::whereIn('awb', $registry->keys())->get());
                    }
                }
                $this->buckets->handle($task);
            }
            $scopeIds = JneShipment::where('pickup_task_id', $taskId)
                ->whereNotExists(fn ($excluded) => $excluded->selectRaw('1')->from('pickup_awb_exclusions')->whereColumn('jne_shipment_id', 'jne_shipments.id')->where('pickup_task_id', $taskId))
                ->lockForUpdate()->pluck('id');
            if ($from !== null) {
                $related = JneShipment::where('customer_id', $task->customer_id)->whereNull('pickup_task_id')
                    ->when(DB::connection()->getDriverName() === 'mysql', fn (Builder $query) => $query->forceIndex('jne_shipments_customer_id_foreign'))
                    ->whereHas('sources', fn ($row) => $row->where('entry_at', '>=', $from)->where('entry_at', '<', $thru))
                    ->whereNotExists(fn ($excluded) => $excluded->selectRaw('1')->from('pickup_awb_exclusions')->whereColumn('jne_shipment_id', 'jne_shipments.id')->where('pickup_task_id', $taskId))
                    ->lockForUpdate()->pluck('id');
                $scopeIds = $scopeIds->merge($related);
            }
            $sourceAwbs = $sources->filter(fn (JneReportAwb $row): bool => $from !== null && $row->entry_at !== null && $row->entry_at->greaterThanOrEqualTo($from) && $row->entry_at->lessThan($thru))->pluck('awb');
            if ($sourceAwbs->isNotEmpty()) {
                $sourceIds = JneShipment::whereIn('awb', $sourceAwbs)->whereNull('pickup_task_id')
                    ->when(DB::connection()->getDriverName() === 'mysql', fn (Builder $query) => $query->forceIndex('jne_shipments_awb_unique'))
                    ->whereNotExists(fn ($excluded) => $excluded->selectRaw('1')->from('pickup_awb_exclusions')->whereColumn('jne_shipment_id', 'jne_shipments.id')->where('pickup_task_id', $taskId))
                    ->lockForUpdate()->pluck('id');
                $scopeIds = $scopeIds->merge($sourceIds);
            }
            /** Current locking reads protect discovery; the final read preserves database AWB ordering. */
            $scope = JneShipment::whereIn('id', $scopeIds->unique()->all())
                ->when(DB::connection()->getDriverName() === 'mysql', fn (Builder $query) => $query->forceIndex('PRIMARY'))
                ->with('latestSource.reportJob')->orderBy('awb')->lockForUpdate()->get();
            $proof = $task->proof;
            $handover = $task->handoverItem;
            $pop = $proof?->finalized_at ? $proof->effectiveValues() : null;
            $received = $handover && $handover->status !== 'PENDING' ? $handover->effectiveValues() : null;
            $baselineValid = $pop !== null && $received !== null && ! $handover->needsReview() && ($received['status'] ?? '') === 'VERIFIED';
            $reasons = [];
            if ($result->review_open) {
                $reasons[] = 'Koreksi isi pickup belum divalidasi dan dikunci.';
            }
            if (PickupPendingItem::where('pickup_task_id', $taskId)->whereIn('status', ['PENDING', 'READY'])->exists()) {
                $reasons[] = 'Masih ada barang pending yang belum diselesaikan.';
            }
            if ($pop && $received && (! $baselineValid || collect(PickupProcessingRecord::CATEGORIES)->contains(fn (string $category): bool => (int) $pop[$category] !== (int) $received[$category]))) {
                $baselineValid = false;
                $reasons[] = 'POP dan verifikasi gudang berbeda atau revisinya berubah; selesaikan pemeriksaan baseline.';
            }
            if (! $customer->is_active) {
                $reasons[] = 'Customer tidak aktif.';
            }
            $unreadySources = $scope->filter(fn (JneShipment $row): bool => $row->latestSource?->reportJob?->workflowStage() !== 'READY');
            if ($unreadySources->isNotEmpty()) {
                $reasons[] = $unreadySources->count().' resi memiliki report sumber yang belum selesai diimpor dan diproyeksikan.';
            }
            $eligibility = app(PickupAwbEligibility::class);
            $processedKeys = $eligibility->processedKeys(new Collection([$task]), $scope);
            $confirmed = $scope->filter(fn (JneShipment $row): bool => $row->customer_id === $task->customer_id && $row->customer_match_status === 'MATCHED' && $row->pickup_task_id === $taskId
                && $row->match_status === 'MATCHED' && $row->category_status === 'MATCHED' && in_array($row->category, PickupProcessingRecord::CATEGORIES, true) && $row->tracking_status !== 'CANCELLED'
                && $row->latestSource?->reportJob?->workflowStage() === 'READY'
                && $eligibility->allowed($task, $row, $processedKeys));
            if ($scope->count() !== $confirmed->count()) {
                $reasons[] = ($scope->count() - $confirmed->count()).' resi belum terkonfirmasi untuk customer, pickup, kategori atau validitasnya.';
            }
            $counts = [];
            foreach (PickupProcessingRecord::CATEGORIES as $category) {
                $expected = $baselineValid ? (int) $received[$category] : null;
                $count = $confirmed->where('category', $category)->count();
                $counts[$category] = ['pop' => $pop === null ? null : (int) $pop[$category], 'received' => $received === null ? null : (int) $received[$category],
                    'expected' => $expected, 'confirmed' => $count, 'shortfall' => $expected === null ? null : max(0, $expected - $count), 'excess' => $expected === null ? null : max(0, $count - $expected)];
                if ($expected !== null && $count > $expected) {
                    $label = ['manual_hybrid' => 'Manual', 'cashless_hybrid' => 'Cashless', 'css_orion' => 'Orion'][$category];
                    $reasons[] = 'Jumlah '.$label.' melebihi target gudang sebesar '.($count - $expected).' AWB.';
                }
            }
            $coverage = $this->coverage->handle($task);
            $total = array_sum(array_column($counts, 'confirmed'));
            $expectedTotal = $baselineValid ? array_sum(array_column($counts, 'expected')) : null;
            $same = $baselineValid && $expectedTotal > 0 && collect($counts)->every(fn (array $row): bool => $row['confirmed'] === $row['expected']);
            $state = $reasons !== [] ? 'REVIEW' : (! $baselineValid ? 'AWAITING_VERIFICATION' : ($same ? 'DONE' : ($total > 0 ? 'PARTIAL' : 'WAITING_DATA')));
            $evidence = ['unit' => 'AWB', 'pickup_revision' => $proof?->revisionNumber(), 'handover_revision' => $handover?->latestCorrection()->revision ?? 0,
                'coverage' => $coverage, 'shipments' => $scope->map(fn (JneShipment $row): array => $row->only(['id', 'awb', 'customer_id', 'pickup_task_id', 'customer_match_status', 'match_status', 'category', 'category_status', 'tracking_status']))->all()];
            $snapshot = ['status' => $state, 'categories' => $counts, 'reasons' => $reasons, 'evidence' => $evidence];
            $hash = hash('sha256', json_encode($snapshot, JSON_THROW_ON_ERROR));
            if ($result->evidence_hash !== $hash) {
                $result->fill([...$snapshot, 'evidence_hash' => $hash, 'revision' => $result->revision + 1]);
                DB::table('pickup_processing_reconciliation_events')->insert(['pickup_task_id' => $taskId, 'revision' => $result->revision, 'snapshot' => json_encode($snapshot, JSON_THROW_ON_ERROR), 'created_at' => now()]);
            }
            $result->fill(['evaluated_at' => now(), 'evaluated_input_version' => $result->input_version, 'next_evaluation_at' => now()->addMinutes(5), 'last_error' => null])->save();

            return $result;
        }, 3);
    }
}

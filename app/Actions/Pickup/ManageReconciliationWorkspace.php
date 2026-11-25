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
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ManageReconciliationWorkspace
{
    public const CLOSURE_REASONS = ['PENDING_GOODS' => 'Barang pending', 'CUSTOMER_REQUEST' => 'Permintaan customer', 'WRONG_CODE' => 'Salah kode', 'OTHER' => 'Lainnya'];

    public function __construct(private QueryReconciliationWorkspace $query, private ReviewPickupAwbs $review, private ExtractPickupAwbDetails $awbDetails) {}

    /** @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function change(User $actor, PickupTask $origin, array $data, bool $apply): array
    {
        return DB::transaction(function () use ($actor, $origin, $data, $apply): array {
            $this->authorize($actor);
            $sourceTaskIds = in_array($data['action'], ['REASSIGN', 'REMOVE'], true) ? JneShipment::whereIn('id', array_column($data['items'], 'id'))->whereNotNull('pickup_task_id')->pluck('pickup_task_id')->unique()->all() : [];
            $customerIds = PickupTask::whereIn('id', $sourceTaskIds)->pluck('customer_id')->push($origin->customer_id)->unique()->sort()->values();
            $customers = Customer::whereIn('id', $customerIds)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $targetCustomer = $customers->get($origin->customer_id);
            abort_unless($targetCustomer, 404);
            $group = $this->query->group($origin);
            abort_unless($group, 409, 'Antrekan validasi sebelum memilih resi.');
            $group = PickupCustomerReconciliation::whereKey($group->id)->lockForUpdate()->firstOrFail();
            abort_unless($group->revision === (int) $data['expected_revision'], 409, 'Revisi rekonsiliasi berubah. Muat ulang preview.');
            abort_if($group->approval_snapshot !== null, 409, 'Snapshot terkunci. Buka review resmi terlebih dahulu.');
            $task = PickupTask::whereKey($data['target_task_id'])->lockForUpdate()->firstOrFail();
            $memberIds = $this->query->members($origin)->modelKeys();
            abort_unless(in_array($task->id, $memberIds, true), 422, 'Target bukan anggota bucket customer/hari ini.');
            $result = PickupProcessingReconciliation::where('pickup_task_id', $task->id)->lockForUpdate()->firstOrFail();
            abort_unless($result->input_version === (int) $data['expected_version'], 409, 'Versi buku pickup berubah. Muat ulang preview.');
            $sourceTasks = PickupTask::whereIn('id', $sourceTaskIds)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $sourceResults = PickupProcessingReconciliation::whereIn('pickup_task_id', $sourceTaskIds)->orderBy('pickup_task_id')->lockForUpdate()->get()->keyBy('pickup_task_id');
            $sourceGroups = PickupCustomerReconciliation::whereIn('id', $sourceResults->pluck('customer_reconciliation_id')->filter())->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $rows = JneShipment::whereIn('id', array_column($data['items'], 'id'))->orderBy('id')->lockForUpdate()->with(['latestSource.reportJob', 'customer', 'cashlessClaim'])->get();
            abort_unless($rows->count() === count($data['items']), 404);
            $versions = array_column($data['items'], 'version', 'id');
            $preview = [];
            foreach ($rows as $row) {
                abort_unless($row->version === (int) $versions[$row->id], 409, 'Bukti resi berubah. Muat ulang preview.');
                $conflicts = [];
                if (! $row->latestSource || $row->latestSource->reportJob?->workflowStage() !== 'READY') {
                    $conflicts[] = 'Report sumber belum siap atau tidak tersedia.';
                }
                if (in_array($data['action'], ['ADD', 'CONFIRM', 'REASSIGN'], true)) {
                    if ($result->locked_at || $result->status === 'DONE') {
                        $conflicts[] = 'Buka koreksi buku pickup sebelum menambah resi.';
                    }
                    if ($data['action'] === 'ADD' && $row->pickup_task_id !== null) {
                        $conflicts[] = $row->pickup_task_id === $task->id ? 'Resi sudah termasuk pickup ini. Gunakan konfirmasi atribusi.' : 'Resi terikat pada pickup lain; koreksi asal harus dilakukan lebih dahulu.';
                    }
                    if ($data['action'] === 'CONFIRM' && $row->pickup_task_id !== $task->id) {
                        $conflicts[] = 'Konfirmasi hanya untuk resi yang sudah termasuk pickup ini.';
                    }
                    if ($data['action'] === 'REASSIGN') {
                        $sourceResult = $sourceResults->get($row->pickup_task_id);
                        $sourceGroup = $sourceGroups->get($sourceResult?->customer_reconciliation_id);
                        if ($row->pickup_task_id === null || $row->pickup_task_id === $task->id || ! $sourceTasks->has($row->pickup_task_id)) {
                            $conflicts[] = 'Pindahkan hanya AWB dari buku pickup lain. Gunakan Add untuk AWB tanpa alokasi.';
                        } elseif (! $sourceResult || $sourceResult->locked_at || $sourceResult->status === 'DONE' || $sourceGroup?->approval_snapshot !== null) {
                            $conflicts[] = 'Buku pickup asal belum dievaluasi atau terkunci. Buka review asal terlebih dahulu.';
                        }
                    }
                    if (! app(PickupAwbEligibility::class)->sameDay($task, $row)) {
                        $conflicts[] = 'Di luar bucket retail. Lintas hari wajib melalui barang pending tercatat.';
                    }
                    if ($row->category_status !== 'MATCHED' || $row->tracking_status === 'CANCELLED') {
                        $conflicts[] = 'Kategori belum sah atau AWB dibatalkan.';
                    }
                    if ($row->cashlessClaim && ($row->cashlessClaim->customer_id !== $task->customer_id || $row->cashlessClaim->pickup_task_id !== $task->id)) {
                        $conflicts[] = 'Bertentangan dengan Sertim aktif; gunakan koreksi Sertim oleh Admin.';
                    }
                } else {
                    $sourceResult = $sourceResults->get($row->pickup_task_id);
                    if (! in_array($row->pickup_task_id, $memberIds, true) || ! $sourceResult || $sourceResult->locked_at || $sourceResult->status === 'DONE') {
                        $conflicts[] = 'Resi bukan anggota bucket yang terbuka untuk koreksi.';
                    }
                }
                $preview[] = ['id' => $row->id, 'awb' => $row->awb, 'version' => $row->version, 'category' => $row->category,
                    'before_customer' => $row->customer?->only(['id', 'name', 'customer_code']),
                    'after_customer' => $data['action'] !== 'REMOVE' ? $targetCustomer->only(['id', 'name', 'customer_code']) : $row->customer?->only(['id', 'name', 'customer_code']),
                    'before' => $row->only(['customer_id', 'pickup_task_id', 'category', 'version']),
                    'after' => ['customer_id' => $data['action'] !== 'REMOVE' ? $task->customer_id : $row->customer_id, 'pickup_task_id' => $data['action'] !== 'REMOVE' ? $task->id : null],
                    'source_version' => $sourceResults->get($row->pickup_task_id)?->input_version,
                    'source_revision' => $sourceGroups->get($sourceResults->get($row->pickup_task_id)?->customer_reconciliation_id)?->revision,
                    'evidence' => ['source_id' => $row->latest_report_awb_id, 'report_id' => $row->latest_report_job_id, 'source_row' => $row->latestSource?->source_row], 'conflicts' => $conflicts];
            }
            $allowed = collect($preview)->every(fn (array $row): bool => $row['conflicts'] === []);
            $hash = hash('sha256', json_encode([$preview, $task->id, $result->input_version, $group->revision, $data['action'], $data['reason']], JSON_THROW_ON_ERROR));
            if ($apply) {
                abort_unless(hash_equals($hash, $data['preview_hash']), 409, 'Preview sudah berubah. Periksa bukti terbaru sebelum konfirmasi.');
                abort_unless($allowed, 409, 'Pilihan mengandung konflik. Tinjau preview dan selesaikan bukti asal.');
                foreach ($rows as $row) {
                    if ($data['action'] === 'REASSIGN') {
                        $sourceResult = $sourceResults->get($row->pickup_task_id);
                        $this->review->handle($actor, $row->pickup_task_id, ['action' => 'REMOVE', 'reason' => $data['reason'], 'shipment_id' => $row->id, 'shipment_version' => $row->version, 'expected_version' => $sourceResult->input_version], recalculate: false);
                        $sourceResult->refresh();
                        $row->refresh();
                    }
                    $reviewTask = $data['action'] === 'REMOVE' ? $row->pickup_task_id : $task->id;
                    $reviewVersion = $data['action'] === 'REMOVE' ? $sourceResults->get($reviewTask)->input_version : $result->input_version;
                    $this->review->handle($actor, $reviewTask, ['action' => $data['action'] === 'REASSIGN' ? 'ADD' : $data['action'], 'reason' => $data['reason'], 'shipment_id' => $row->id, 'shipment_version' => $row->version, 'expected_version' => $reviewVersion], recalculate: false);
                    if ($data['action'] === 'REMOVE') {
                        $sourceResults->get($reviewTask)->refresh();
                    }
                    $result->refresh();
                }
                foreach (array_unique([...$sourceTaskIds, $task->id]) as $affectedId) {
                    $affectedTask = $sourceTasks->get($affectedId) ?? $task;
                    PickupProcessingReconciliation::whereIn('pickup_task_id', $this->query->members($affectedTask)->modelKeys())
                        ->where('review_open', true)->update(['review_open' => false, 'input_version' => DB::raw('input_version + 1')]);
                    app(ReconcilePickupProcessing::class)->handle($affectedId);
                }
            }

            return ['allowed' => $allowed, 'applied' => $apply, 'preview_hash' => $hash, 'items' => $preview, 'target_task_id' => $task->id, 'action' => $data['action'], 'reason' => $data['reason'], 'quantities_changed' => false,
                'category_impact' => $rows->groupBy('category')->map(fn ($items): int => $items->count() * match ($data['action']) {
                    'ADD', 'REASSIGN' => 1, 'REMOVE' => -1, default => 0
                })->all(),
                'required_permission' => 'admin_supervisor', 'lock_implications' => 'Setelah koreksi, sistem menghitung ulang dan mengunci otomatis bila seluruh bukti memenuhi syarat.'];
        }, 3);
    }

    /** @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function lock(?User $actor, PickupTask $task, array $data, bool $automatic = false): array
    {
        if ($automatic && ! Schema::hasColumn('pickup_customer_reconciliations', 'approval_snapshot')) {
            return ['action' => 'PENDING_SCHEMA'];
        }
        abort_unless(Schema::hasColumn('pickup_customer_reconciliations', 'approval_snapshot'), 409, 'Migrasi snapshot persetujuan belum diterapkan.');

        return DB::transaction(function () use ($actor, $task, $data, $automatic): array {
            $exception = ! $automatic && $data['action'] === 'CLOSE_WITH_EXCEPTION';
            if (! $automatic) {
                abort_unless($actor, 403);
                if ($exception) {
                    abort_unless(User::whereKey($actor->id)->whereIn('role', ['retail_staff', 'admin_supervisor'])->where('is_active', true)->lockForUpdate()->exists(), 403);
                    abort_unless(isset(self::CLOSURE_REASONS[$data['reason_code'] ?? '']) && mb_strlen(trim($data['reason'] ?? '')) >= 5, 422, 'Pilih alasan dan jelaskan selisihnya.');
                } else {
                    $this->authorize($actor);
                }
            }
            $customer = Customer::whereKey($task->customer_id)->lockForUpdate()->firstOrFail();
            abort_if($exception && ! $customer->is_active, 409, 'Customer tidak aktif; periksa master customer sebelum menutup buku.');
            $group = $this->query->group($task);
            abort_unless($group, 409, 'Rekonsiliasi belum dihitung.');
            $group = PickupCustomerReconciliation::whereKey($group->id)->lockForUpdate()->firstOrFail();
            if ($automatic && $group->approval_snapshot !== null) {
                return ['action' => 'ALREADY_LOCKED', 'revision' => $group->revision];
            }
            $closureKey = $exception ? hash('sha256', json_encode([$actor->id, $data['expected_revision'], $data['fingerprint'], $data['review_token'], $data['reason_code'], $data['reason']], JSON_THROW_ON_ERROR)) : null;
            if ($exception && ($group->approval_snapshot['closure_key'] ?? null) === $closureKey) {
                return ['action' => 'ALREADY_CLOSED', 'revision' => $group->revision];
            }
            abort_unless($group->revision === (int) $data['expected_revision'], 409, 'Revisi berubah. Muat ulang sebelum keputusan.');
            $members = $this->query->members($task);
            $ids = $members->modelKeys();
            PickupTask::whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
            PickupProcessingReconciliation::whereIn('pickup_task_id', $ids)->orderBy('pickup_task_id')->lockForUpdate()->get();
            $rows = $this->query->scope($task, $ids)->orderBy('id')->lockForUpdate()->with(['latestSource.reportJob', 'cashlessClaim'])->get();
            $manifestIds = PickupAwbManifest::whereIn('pickup_task_id', $ids)->pluck('id');
            $deliveryUncertain = PickupAwbDelivery::whereIn('pickup_awb_manifest_id', $manifestIds)->whereIn('status', ['SENDING', 'UNKNOWN'])->exists();
            if ($automatic && $deliveryUncertain) {
                return ['action' => 'PENDING_DELIVERY'];
            }
            abort_if($deliveryUncertain, 409, 'Pengiriman sedang berlangsung atau belum pasti.');
            if ($data['action'] === 'REOPEN') {
                abort_unless($group->approval_snapshot !== null, 409, 'Belum ada persetujuan yang terkunci.');
                $snapshot = ['event' => 'REOPEN', 'previous_approval' => $group->approval_snapshot, 'reviewer' => $actor->only(['id', 'name']), 'reason' => $data['reason']];
                $group->fill(['approval_snapshot' => null, 'post_lock_change' => null, 'locked_at' => null, 'status' => 'REVIEW']);
                PickupProcessingReconciliation::whereIn('pickup_task_id', $ids)->update(['locked_at' => null, 'status' => 'REVIEW', 'review_open' => true, 'input_version' => DB::raw('input_version + 1')]);
            } else {
                abort_if($group->approval_snapshot !== null, 409, 'Sudah dikunci. Snapshot persetujuan tidak ditimpa.');
                $workspace = $this->query->handle($task);
                if ($automatic && ! $workspace['eligible']) {
                    return ['action' => 'PENDING_EVIDENCE'];
                }
                if ($exception) {
                    abort_unless($workspace['closure']['ready'] && ! $workspace['dirty'], 409, 'POP dan validasi gudang terkini harus tersedia; hitung ulang rekonsiliasi sebelum menutup buku.');
                    abort_if($rows->contains(fn (JneShipment $row): bool => $row->pickup_task_id !== null && $row->latestSource?->reportJob?->workflowStage() !== 'READY'), 409, 'Sumber resi terikat belum siap. Selesaikan impor sumber dan hitung ulang sebelum menutup buku.');
                } else {
                    abort_unless($workspace['eligible'], 409, implode(' ', $workspace['blockers']));
                }
                if (! $automatic) {
                    abort_unless(hash_equals($workspace['fingerprint'], $data['fingerprint']), 409, 'Bukti berubah sejak ditinjau. Muat ulang workspace.');
                    abort_unless(hash_equals(QueryReconciliationWorkspace::reviewToken($rows), $data['review_token']) && hash_equals($workspace['review_token'], $data['review_token']), 409, 'Versi atau sumber AWB berubah sejak ditinjau. Muat ulang workspace.');
                }
                abort_unless(hash_equals(QueryReconciliationWorkspace::reviewToken($rows), $workspace['review_token']), 409, 'Sumber AWB berubah saat penguncian. Hitung ulang.');
                $included = $rows;
                if ($exception) {
                    $eligibility = app(PickupAwbEligibility::class);
                    $processed = $eligibility->processedKeys($members, $rows);
                    $byId = $members->keyBy('id');
                    $from = PickupResultPeriod::start($group->business_date->toDateString())->utc();
                    $olderPending = PickupPendingItem::whereIn('status', ['PENDING', 'READY'])
                        ->whereHas('pickup', fn ($pickup) => $pickup->where('customer_id', $task->customer_id)->whereHas('proof', fn ($proof) => $proof->where('picked_up_at', '<', $from)))->exists();
                    $included = $rows->filter(function (JneShipment $row) use ($task, $byId, $eligibility, $processed, $olderPending): bool {
                        $owned = $byId->has($row->pickup_task_id) && $row->match_status === 'MATCHED' && $eligibility->allowed($byId->get($row->pickup_task_id), $row, $processed);
                        $pooled = ! $olderPending && $row->pickup_task_id === null && $row->match_method === 'CUSTOMER_CODE_DATE'
                            && in_array($row->match_status, ['AMBIGUOUS', 'UNMATCHED'], true) && $row->cashlessClaim === null;
                        $bucket = $byId->has($row->pickup_task_id) && $row->match_method === 'CUSTOMER_CODE_DATE'
                            && in_array($row->match_status, ['AMBIGUOUS', 'UNMATCHED'], true) && $row->cashlessClaim === null && $eligibility->sameDay($byId->get($row->pickup_task_id), $row);

                        return ($owned || $pooled || $bucket) && $row->customer_id === $task->customer_id && $row->customer_match_status === 'MATCHED' && $row->category_status === 'MATCHED'
                        && in_array($row->category, PickupProcessingRecord::CATEGORIES, true) && $row->tracking_status !== 'CANCELLED'
                        && $row->latestSource?->reportJob?->workflowStage() === 'READY';
                    });
                    foreach ($included->filter(fn (JneShipment $row): bool => $row->pickup_task_id === null || $row->match_status !== 'MATCHED') as $row) {
                        $owner = $row->pickup_task_id ?? $group->anchor_task_id;
                        JneShipmentMatchEvent::create(['jne_shipment_id' => $row->id, 'previous_pickup_task_id' => $row->pickup_task_id, 'pickup_task_id' => $owner,
                            'previous_customer_id' => $task->customer_id, 'customer_id' => $task->customer_id, 'customer_match_status' => 'MATCHED', 'match_status' => 'MATCHED',
                            'method' => 'MANUAL', 'actor_id' => $actor->id, 'reason' => mb_substr('Penutupan PIC: '.$data['reason'], 0, 500),
                            'evidence' => ['customer_reconciliation_id' => $group->id, 'business_date' => $group->business_date->toDateString(), 'pickup_task_ids' => $ids, 'closure_key' => $closureKey]]);
                        $row->update(['pickup_task_id' => $owner, 'match_status' => 'MATCHED', 'match_method' => 'MANUAL', 'version' => $row->version + 1]);
                    }
                    $counts = $group->categories;
                    foreach (PickupProcessingRecord::CATEGORIES as $category) {
                        $counts[$category]['confirmed'] = $included->where('category', $category)->count();
                        $expected = $counts[$category]['expected'];
                        $counts[$category]['shortfall'] = $expected === null ? null : max(0, $expected - $counts[$category]['confirmed']);
                        $counts[$category]['excess'] = $expected === null ? null : max(0, $counts[$category]['confirmed'] - $expected);
                        $workspace['categories'][$category] = [...$workspace['categories'][$category], ...$counts[$category]];
                    }
                    $group->categories = $counts;
                    $group->evidence = [...$group->evidence, 'shipments' => $rows->map->only(QueryReconciliationWorkspace::MATERIAL_FIELDS)->all()];
                }
                $materialFingerprint = QueryReconciliationWorkspace::materialFingerprint($group->categories ?? [], $ids, $rows->map->only(QueryReconciliationWorkspace::MATERIAL_FIELDS)->all());
                $snapshot = ['event' => $exception ? 'CLOSE_WITH_EXCEPTION' : ($automatic ? 'AUTO_LOCK' : 'LOCK'), 'mode' => $exception ? 'EXCEPTION' : ($automatic ? 'AUTOMATIC' : 'MANUAL'), 'lock_basis' => $exception ? 'PIC_EXPLAINED_DISCREPANCY' : 'MATCHED_OPERATIONAL_AWBS', 'version' => $group->revision + 1, 'reviewer' => $actor?->only(['id', 'name']) ?? ['id' => null, 'name' => 'Sistem'], 'reason' => $automatic ? 'POP, verifikasi gudang, atribusi resi dan jumlah setiap kategori cocok.' : $data['reason'], 'locked_at' => now()->toIso8601String(),
                    'fingerprint' => $workspace['fingerprint'], 'review_token' => $workspace['review_token'], 'customer' => $workspace['header']['customer'], 'business_date' => $workspace['header']['business_date'],
                    'material_fingerprint' => $materialFingerprint,
                    'members' => $workspace['members'], 'categories' => $workspace['categories'], 'coverage' => $workspace['coverage'], 'discrepancies' => $workspace['discrepancies'], 'included_count' => $included->count(),
                    'included_awbs' => $included->map(fn ($row): array => [...$row->only(['id', 'awb', 'version', 'customer_id', 'customer_account', 'pickup_task_id', 'category', 'category_status', 'tracking_status', 'match_status', 'match_method', 'customer_match_status', 'customer_match_method', 'latest_report_job_id', 'latest_report_awb_id']),
                        'source_row' => $row->latestSource?->source_row, 'source' => $row->latestSource?->reportJob?->source, 'shipper_name' => $row->latestSource?->shipper_name, 'consignee_name' => $row->latestSource?->consignee_name,
                        ...$this->awbDetails->handle($row->latestSource, $row->category),
                        'entry_at' => $row->latestSource?->entry_at, 'imported_at' => $row->latestSource?->reportJob?->imported_at])->all(),
                    'excluded' => DB::table('pickup_awb_exclusions')->join('jne_shipments', 'jne_shipments.id', '=', 'jne_shipment_id')->whereIn('pickup_awb_exclusions.pickup_task_id', $ids)
                        ->get(['pickup_awb_exclusions.*', 'jne_shipments.awb'])->all()];
                if ($exception) {
                    $snapshot['closure_key'] = $closureKey;
                    $snapshot['exception'] = [...$workspace['closure'], 'reason_code' => $data['reason_code'], 'reason_label' => self::CLOSURE_REASONS[$data['reason_code']], 'explanation' => $data['reason'],
                        'omitted_awb_count' => $rows->count() - $included->count(),
                        'pending_items' => PickupPendingItem::whereIn('pickup_task_id', $ids)->whereIn('status', ['PENDING', 'READY'])->get(['id', 'reference', 'category', 'label', 'reason', 'status', 'version'])->toArray()];
                    $group->status = 'DONE';
                    PickupProcessingReconciliation::whereIn('pickup_task_id', $ids)->update(['status' => 'DONE', 'review_open' => false]);
                }
                $group->fill(['approval_snapshot' => $snapshot, 'post_lock_change' => null, 'locked_at' => now()]);
                PickupProcessingReconciliation::whereIn('pickup_task_id', $ids)->whereNull('locked_at')->update(['locked_at' => now()]);
            }
            $group->revision++;
            $group->save();
            DB::table('pickup_customer_reconciliation_events')->insert(['customer_reconciliation_id' => $group->id, 'revision' => $group->revision, 'snapshot' => json_encode($snapshot, JSON_THROW_ON_ERROR), 'created_at' => now()]);
            if ($exception) {
                $counts = $group->categories;
                foreach (PickupProcessingRecord::CATEGORIES as $category) {
                    $counts[$category]['confirmed'] = $included->where('category', $category)->count();
                }
                $manifest = app(BuildPickupAwbManifest::class)->handle($members->firstWhere('id', $group->anchor_task_id), $counts, $included, $group);
                if ($manifest->status === 'PENDING') {
                    RenderPickupAwbManifestJob::dispatch($manifest->id)->afterCommit();
                }
            }

            return ['action' => $data['action'], 'revision' => $group->revision];
        }, 3);
    }

    private function authorize(User $actor): void
    {
        abort_unless(User::whereKey($actor->id)->where('role', 'admin_supervisor')->where('is_active', true)->lockForUpdate()->exists(), 403);
    }
}

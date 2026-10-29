<?php

namespace App\Actions\Pickup;

use App\Actions\Reports\ReviewJneExceptions;
use App\Models\Customer;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupPendingItem;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReviewPickupAwbs
{
    public function __construct(private ReviewJneExceptions $reviewer, private ReconcilePickupProcessing $reconcile, private PickupAwbEligibility $eligibility) {}

    /** @param array<string, mixed> $data */
    public function handle(User $actor, int $taskId, array $data): PickupProcessingReconciliation
    {
        return DB::transaction(function () use ($actor, $taskId, $data): PickupProcessingReconciliation {
            abort_unless(User::whereKey($actor->id)->where('is_active', true)->where('role', 'admin_supervisor')->exists(), 403);
            Customer::whereKey(PickupTask::whereKey($taskId)->value('customer_id'))->lockForUpdate()->firstOrFail();
            $task = PickupTask::whereKey($taskId)->lockForUpdate()->with(['proof.revisions', 'handoverItem.revisions', 'handoverItem.proof.revisions'])->firstOrFail();
            PickupProcessingReconciliation::firstOrCreate(['pickup_task_id' => $taskId]);
            $result = PickupProcessingReconciliation::where('pickup_task_id', $taskId)->lockForUpdate()->firstOrFail();
            abort_unless($result->input_version === (int) $data['expected_version'], 409, 'Isi pickup berubah. Muat ulang sebelum menyimpan.');
            $action = $data['action'];
            abort_if($action !== 'UNLOCK' && ($result->locked_at !== null || $result->status === 'DONE'), 409, 'Pickup terkunci. Buka koreksi terlebih dahulu.');
            $manifestIds = PickupAwbManifest::where(fn ($query) => $query->where('pickup_task_id', $taskId)->when($result->customer_reconciliation_id, fn ($group) => $group->orWhere('customer_reconciliation_id', $result->customer_reconciliation_id)))->pluck('id');
            abort_if(PickupAwbDelivery::whereIn('pickup_awb_manifest_id', $manifestIds)->whereIn('status', ['SENDING', 'UNKNOWN'])->exists(), 409, 'Selesaikan status pengiriman yang belum pasti sebelum mengubah daftar resi.');
            $before = ['status' => $result->status, 'input_version' => $result->input_version, 'locked_at' => $result->locked_at];
            $evidence = [];
            if (in_array($action, ['ADD', 'REMOVE'], true)) {
                $shipment = JneShipment::whereKey($data['shipment_id'])->lockForUpdate()->with('latestSource')->firstOrFail();
                abort_unless($shipment->version === (int) $data['shipment_version'], 409, 'Bukti resi berubah. Muat ulang daftar resi.');
                $evidence['shipment_before'] = $shipment->only(['id', 'awb', 'pickup_task_id', 'customer_id', 'version', 'category']);
                if ($action === 'ADD') {
                    abort_if($shipment->pickup_task_id !== null, 409, 'Resi sudah terikat ke pickup. Keluarkan dari pickup asal terlebih dahulu.');
                    abort_if($shipment->tracking_status === 'CANCELLED' || $shipment->category_status !== 'MATCHED', 422, 'Resi batal atau kategori belum terkonfirmasi. Selesaikan pemeriksaan sumber terlebih dahulu.');
                    $pending = empty($data['pending_id']) ? null : PickupPendingItem::whereKey($data['pending_id'])->where('pickup_task_id', $taskId)->lockForUpdate()->firstOrFail();
                    if ($pending) {
                        abort_unless($pending->status === 'READY' && $pending->version === (int) $data['pending_version'], 409, 'Barang pending belum siap atau telah berubah.');
                        $entry = $shipment->latestSource?->entry_at;
                        $origin = $task->proof?->picked_up_at;
                        abort_unless($entry && $origin && PickupResultPeriod::date($entry)->greaterThanOrEqualTo(PickupResultPeriod::date($origin)) && PickupResultPeriod::date($entry)->lessThanOrEqualTo(PickupResultPeriod::today()), 422, 'Tanggal sumber resi tidak sesuai jalur pending.');
                        abort_unless($pending->category === $shipment->category, 422, 'Kategori resi berbeda dari barang pending.');
                    } else {
                        abort_unless($this->eligibility->sameDay($task, $shipment), 422, 'Resi harus berada dalam bucket 05.00–04.59 pickup. Lintas hari hanya melalui barang pending yang tercatat.');
                    }
                    if ($pending) {
                        $pending->update(['status' => 'PROCESSED', 'jne_shipment_id' => $shipment->id, 'processing_date' => PickupResultPeriod::date($entry)->toDateString(), 'processed_at' => now(), 'updated_by' => $actor->id, 'version' => $pending->version + 1]);
                        $evidence['pending'] = $pending->toArray();
                    }
                    $this->reviewer->handle($actor, ['items' => [['id' => $shipment->id, 'version' => $shipment->version]], 'group_key' => ReviewJneExceptions::groupKey($shipment),
                        'action' => 'CONFIRM', 'customer_id' => $task->customer_id, 'pickup_reference' => $task->reference, 'reason' => $data['reason']]);
                    DB::table('pickup_awb_exclusions')->where('pickup_task_id', $taskId)->where('jne_shipment_id', $shipment->id)->delete();
                } else {
                    abort_unless($shipment->pickup_task_id === $taskId, 409, 'Resi tidak terikat pada pickup ini.');
                    DB::table('pickup_awb_exclusions')->updateOrInsert(['pickup_task_id' => $taskId, 'jne_shipment_id' => $shipment->id], ['actor_id' => $actor->id, 'reason' => $data['reason'], 'created_at' => now(), 'updated_at' => now()]);
                    $shipment->update(['pickup_task_id' => null, 'match_status' => 'UNMATCHED', 'match_method' => 'REFERENCE', 'identity_review_hash' => null, 'match_note' => $data['reason'], 'version' => $shipment->version + 1]);
                    JneShipmentMatchEvent::create(['jne_shipment_id' => $shipment->id, 'previous_pickup_task_id' => $taskId, 'pickup_task_id' => null, 'previous_customer_id' => $shipment->customer_id, 'customer_id' => $shipment->customer_id,
                        'customer_match_status' => $shipment->customer_match_status, 'match_status' => 'UNMATCHED', 'method' => 'REVIEW', 'actor_id' => $actor->id, 'reason' => $data['reason'], 'evidence' => [['review_action' => 'REMOVE', 'excluded_pickup_task_id' => $taskId]]]);
                    $pending = PickupPendingItem::where('jne_shipment_id', $shipment->id)->lockForUpdate()->first();
                    if ($pending) {
                        $pending->update(['status' => 'READY', 'jne_shipment_id' => null, 'processing_date' => null, 'processed_at' => null, 'version' => $pending->version + 1, 'updated_by' => $actor->id]);
                    }
                }
                $evidence['shipment_after'] = $shipment->fresh()->only(['id', 'awb', 'pickup_task_id', 'customer_id', 'version', 'category']);
            } elseif ($action === 'PENDING') {
                $handover = $task->handoverItem;
                $values = $handover?->effectiveValues();
                abort_unless($task->proof?->finalized_at && $handover && ! $handover->needsReview() && ($values['status'] ?? '') === 'VERIFIED', 422, 'POP dan verifikasi gudang harus sah sebelum mencatat barang pending.');
                $pop = $task->proof->effectiveValues();
                abort_unless(collect(PickupProcessingRecord::CATEGORIES)->every(fn (string $category): bool => (int) $pop[$category] === (int) $values[$category]), 422, 'Jumlah POP dan gudang berbeda. Selesaikan baseline terlebih dahulu.');
                $category = $data['category'];
                $confirmed = JneShipment::where('pickup_task_id', $taskId)->where('category', $category)->where('match_status', 'MATCHED')->where('customer_match_status', 'MATCHED')->where('category_status', 'MATCHED')->where('tracking_status', '!=', 'CANCELLED')->count();
                $pendingCount = PickupPendingItem::where('pickup_task_id', $taskId)->where('category', $category)->whereIn('status', ['PENDING', 'READY'])->count();
                abort_unless($confirmed + $pendingCount < (int) $values[$category], 422, 'Jumlah pending melebihi paket yang belum diproses pada kategori ini.');
                $pending = PickupPendingItem::create(['reference' => (string) Str::ulid(), 'pickup_task_id' => $taskId, 'category' => $category, 'label' => $data['label'], 'reason' => $data['reason'], 'created_by' => $actor->id, 'updated_by' => $actor->id]);
                $evidence['pending'] = $pending->toArray();
            } elseif (in_array($action, ['READY', 'CANCEL_PENDING'], true)) {
                $pending = PickupPendingItem::whereKey($data['pending_id'])->where('pickup_task_id', $taskId)->lockForUpdate()->firstOrFail();
                abort_unless($pending->version === (int) $data['pending_version'] && in_array($pending->status, ['PENDING', 'READY'], true), 409, 'Barang pending telah berubah atau sudah diproses.');
                $evidence['pending_before'] = $pending->toArray();
                $pending->update(['status' => $action === 'READY' ? 'READY' : 'CANCELLED', 'ready_at' => $action === 'READY' ? now() : $pending->ready_at, 'updated_by' => $actor->id, 'version' => $pending->version + 1]);
                $evidence['pending_after'] = $pending->toArray();
            }
            PickupAwbManifest::whereIn('id', $manifestIds)->where('status', '!=', 'SUPERSEDED')->update(['status' => 'SUPERSEDED']);
            PickupAwbDelivery::whereIn('pickup_awb_manifest_id', $manifestIds)->whereIn('status', ['READY', 'AWAITING_CONFIGURATION'])->update(['status' => 'CANCELLED']);
            $result->update(['locked_at' => null, 'review_open' => $action !== 'VALIDATE', 'input_version' => $result->input_version + 1]);
            DB::table('pickup_awb_review_events')->insert(['pickup_task_id' => $taskId, 'actor_id' => $actor->id, 'action' => $action, 'reason' => $data['reason'], 'evidence' => json_encode(['before' => $before, ...$evidence], JSON_THROW_ON_ERROR), 'created_at' => now()]);

            return $this->reconcile->handle($taskId);
        }, 3);
    }
}

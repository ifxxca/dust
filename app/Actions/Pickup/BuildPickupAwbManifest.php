<?php

namespace App\Actions\Pickup;

use App\Models\Customer;
use App\Models\JneShipment;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupTask;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class BuildPickupAwbManifest
{
    public function __construct(private ExtractPickupAwbDetails $details) {}

    /**
     * @param  array<string, array<string, int|null>>  $counts
     * @param  Collection<int, JneShipment>  $shipments
     */
    public function handle(PickupTask $task, array $counts, Collection $shipments, ?PickupCustomerReconciliation $group = null): PickupAwbManifest
    {
        $customer = Customer::findOrFail($task->customer_id);
        if (($group?->approval_snapshot['mode'] ?? null) === 'EXCEPTION') {
            foreach ($counts as $category => &$count) {
                $count['confirmed'] = collect($group->approval_snapshot['included_awbs'])->where('category', $category)->count();
            }
            unset($count);
        }
        $approvedCustomer = $group?->approval_snapshot['customer'] ?? null;
        $snapshot = ['customer_id' => $customer->id, 'customer_name' => $customer->name, 'customer_code' => $customer->customer_code,
            'reference' => $task->reference, 'pickup_date' => PickupResultPeriod::date($task->proof->picked_up_at)->toDateString(),
            'categories' => $counts, 'unit' => 'AWB', 'template_version' => 3];
        if ($approvedCustomer) {
            $snapshot['customer_name'] = $approvedCustomer['name'];
            $snapshot['customer_code'] = $approvedCustomer['customer_code'];
        }
        if (($group?->approval_snapshot['mode'] ?? null) === 'EXCEPTION') {
            $snapshot['closure'] = $group->approval_snapshot['exception'];
        }
        $taskIds = $group?->evidence['pickup_task_ids'] ?? [$task->id];
        if (count($taskIds) > 1) {
            $snapshot['reference'] = $customer->customer_code.' / '.$group->business_date->toDateString();
            $snapshot['pickup_task_ids'] = $taskIds;
            $snapshot['pickup_references'] = PickupTask::whereIn('id', $taskIds)->orderBy('id')->pluck('reference')->all();
        }
        if ($group?->approval_snapshot !== null) {
            $details = collect($group->approval_snapshot['included_awbs'])->sortBy('awb')->values();
        } else {
            $shipments->loadMissing('latestSource');
            $details = $shipments->sortBy('awb')->map(fn (JneShipment $row): array => [
                'awb' => $row->awb, 'category' => $row->category, 'consignee_name' => $row->latestSource?->consignee_name,
                ...$this->details->handle($row->latestSource, $row->category),
            ])->values();
        }
        $items = $details->map(fn (array $row): array => ['awb' => $row['awb'], 'category' => $row['category'], 'consignee_name' => $row['consignee_name'] ?? null])->all();
        $snapshot['shipment_details'] = $details->mapWithKeys(fn (array $row): array => ['awb:'.$row['awb'] => [
            'shipper_name' => $row['shipper_name'] ?? null, 'consignee_address' => $row['consignee_address'] ?? null,
            'destination_code' => $row['destination_code'] ?? null, 'consignee_district' => $row['consignee_district'] ?? null,
            'district_status' => $row['district_status'] ?? 'UNKNOWN', 'payment_type' => $row['payment_type'] ?? null,
            'cod_flag' => $row['cod_flag'] ?? null, 'source_amount_cents' => $row['source_amount_cents'] ?? null,
            'amount_cents' => $row['amount_cents'] ?? null,
        ]])->all();
        $hash = hash('sha256', json_encode([$snapshot, $items], JSON_THROW_ON_ERROR));
        $existing = PickupAwbManifest::where('pickup_task_id', $task->id)->where('content_hash', $hash)->first();
        if ($existing) {
            if ($group && $existing->customer_reconciliation_id !== $group->id) {
                $existing->update(['customer_reconciliation_id' => $group->id]);
            }
            if ($existing->status === 'SUPERSEDED') {
                $others = PickupAwbManifest::where('pickup_task_id', $task->id)->where('id', '!=', $existing->id)->pluck('id');
                $sentCorrection = PickupAwbDelivery::whereIn('pickup_awb_manifest_id', $others)->whereIn('status', ['SENDING', 'UNKNOWN', 'ACCEPTED', 'DELIVERED'])->exists();
                PickupAwbManifest::whereIn('id', $others)->where('status', '!=', 'SUPERSEDED')->update(['status' => 'SUPERSEDED']);
                PickupAwbDelivery::whereIn('pickup_awb_manifest_id', $others)->whereIn('status', ['READY', 'AWAITING_CONFIGURATION'])->update(['status' => 'CANCELLED']);
                $existing->update(['status' => $sentCorrection ? 'REVIEW' : ($existing->xlsx_path && $existing->pdf_path ? 'READY' : 'PENDING'), 'last_error' => $sentCorrection ? 'Versi koreksi pernah dikirim; periksa sebelum memulihkan daftar lama.' : null]);
            }

            return $existing;
        }
        $previous = PickupAwbManifest::whereIn('pickup_task_id', $taskIds)->pluck('id');
        $sent = PickupAwbDelivery::whereIn('pickup_awb_manifest_id', $previous)->whereIn('status', ['SENDING', 'UNKNOWN', 'ACCEPTED', 'DELIVERED'])->exists();
        PickupAwbManifest::whereIn('id', $previous)->where('status', '!=', 'SUPERSEDED')->update(['status' => 'SUPERSEDED']);
        PickupAwbDelivery::whereIn('pickup_awb_manifest_id', $previous)->whereIn('status', ['READY', 'AWAITING_CONFIGURATION'])->update(['status' => 'CANCELLED']);
        $manifest = PickupAwbManifest::create(['pickup_task_id' => $task->id, 'customer_reconciliation_id' => $group?->id, 'revision' => (int) PickupAwbManifest::where('pickup_task_id', $task->id)->max('revision') + 1,
            'content_hash' => $hash, 'snapshot' => $snapshot, 'status' => $sent ? 'REVIEW' : 'PENDING', 'last_error' => $sent ? 'Daftar berubah setelah percobaan pengiriman; tinjau koreksi sebelum mengirim versi baru.' : null]);
        foreach (array_chunk($items, 250) as $chunk) {
            DB::table('pickup_awb_manifest_items')->insert(array_map(fn (array $row): array => ['pickup_awb_manifest_id' => $manifest->id, ...$row], $chunk));
        }

        return $manifest;
    }
}

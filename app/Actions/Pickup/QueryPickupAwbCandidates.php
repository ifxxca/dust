<?php

namespace App\Actions\Pickup;

use App\Models\Customer;
use App\Models\JneShipment;
use App\Models\JneShipperAlias;
use App\Models\PickupPendingItem;
use App\Models\PickupTask;
use Illuminate\Support\Facades\DB;

class QueryPickupAwbCandidates
{
    /** @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    public function handle(PickupTask $task, array $filters): array
    {
        $task->loadMissing('proof');
        abort_unless($task->proof?->picked_up_at !== null, 422, 'Pickup belum memiliki POP.');
        $originDate = PickupResultPeriod::date($task->proof->picked_up_at)->toDateString();
        $pending = empty($filters['pending_id']) ? null : PickupPendingItem::whereKey($filters['pending_id'])->where('pickup_task_id', $task->id)->where('status', 'READY')->firstOrFail();
        $date = $pending ? ($filters['process_date'] ?? PickupResultPeriod::today()->toDateString()) : $originDate;
        abort_unless($date >= $originDate && $date <= PickupResultPeriod::today()->toDateString(), 422, 'Tanggal operasional di luar jangkauan pending.');
        $start = PickupResultPeriod::start($date)->utc();
        $customer = Customer::findOrFail($task->customer_id);
        $query = JneShipment::whereNull('pickup_task_id')->where('tracking_status', '!=', 'CANCELLED')
            ->whereHas('latestSource', fn ($source) => $source->where('entry_at', '>=', $start)->where('entry_at', '<', $start->addDay()))
            ->when($pending, fn ($rows) => $rows->where('category', $pending->category))->with(['latestSource', 'cashlessClaim']);
        $q = trim($filters['q'] ?? '');
        if ($q !== '') {
            $query->where(fn ($search) => $search->where('awb', 'like', '%'.$q.'%')->orWhereHas('latestSource', fn ($source) => $source->where('shipper_name', 'like', '%'.$q.'%')));
        } else {
            $name = preg_split('/\s+/', trim($customer->name))[0] ?? $customer->name;
            $query->where(fn ($matches) => $matches->where('customer_id', $customer->id)->orWhereJsonContains('customer_match_candidates', ['customer_id' => $customer->id])
                ->orWhereHas('cashlessClaim', fn ($claim) => $claim->where('pickup_task_id', $task->id))
                ->orWhereHas('latestSource', fn ($source) => $source->where('shipper_name', 'like', '%'.$name.'%')));
        }
        $excluded = DB::table('pickup_awb_exclusions')->where('pickup_task_id', $task->id)->pluck('reason', 'jne_shipment_id');
        $aliases = JneShipperAlias::where('customer_id', $customer->id)->where('is_active', true)->pluck('shipper_name')->push($customer->name)->push($customer->customer_code.' '.$customer->name)->map($this->fold(...));
        $rows = $query->orderBy('awb')->paginate(30)->through(function (JneShipment $row) use ($task, $aliases, $excluded): array {
            $name = $row->latestSource->shipper_name ?? '';
            $folded = $this->fold($name);
            $similar = $folded !== '' && mb_strlen($folded) <= 120 && $aliases->contains(fn (string $alias): bool => $alias !== '' && levenshtein($alias, $folded) <= 2);
            $reason = $row->cashlessClaim?->pickup_task_id === $task->id ? 'AWB sama dengan Sertim Cashless pickup ini.'
                : ($row->customer_id === $task->customer_id && $row->customer_match_status === 'MATCHED' ? 'Customer dikenali dari bukti sumber.' : ($similar ? 'Nama/kode mirip setelah normalisasi spasi atau ejaan; periksa bukti typo.' : 'Hasil pencarian; identitas customer perlu dibuktikan.'));

            return [...$row->only(['id', 'awb', 'version', 'category', 'category_status']), 'shipper_name' => $name, 'entry_at' => $row->latestSource?->entry_at, 'recommendation' => $reason,
                'excluded_reason' => $excluded->get($row->id), 'sertim_conflict' => $row->cashlessClaim !== null && $row->cashlessClaim->pickup_task_id !== $task->id];
        });

        return ['rows' => $rows, 'business_date' => $date, 'origin_date' => $originDate];
    }

    private function fold(string $value): string
    {
        return preg_replace('/[^\pL\pN]/u', '', mb_strtoupper($value)) ?? '';
    }
}

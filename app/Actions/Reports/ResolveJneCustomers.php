<?php

namespace App\Actions\Reports;

use App\Models\JneReportAwb;
use App\Models\JneShipperAlias;
use Illuminate\Support\Collection;

class ResolveJneCustomers
{
    /**
     * @param  Collection<int, JneReportAwb>  $sources
     * @return array<int, array{customer_id: ?int, status: string, method: string, note: string}>
     */
    public function handle(Collection $sources): array
    {
        $aliases = collect();
        $keys = $sources->map(fn (JneReportAwb $source): string => hash('sha256', JneShipperAlias::normalize($source->shipper_name ?? '')))->unique();
        foreach ($keys->chunk(500) as $chunk) {
            $aliases = $aliases->concat(JneShipperAlias::whereNotNull('mapping_key')->where('is_active', true)
                ->whereIn('alias_key', $chunk)->with('customer:id,is_active')->get(['id', 'customer_id', 'alias_key', 'normalized_name']));
        }
        $byKey = $aliases->groupBy('alias_key');
        $resolved = [];
        foreach ($sources as $source) {
            $id = null;
            $status = 'UNMATCHED';
            $method = 'SHIPPER_NAME';
            $name = JneShipperAlias::normalize($source->shipper_name ?? '');
            $matches = $byKey->get(hash('sha256', $name), collect())->filter(fn (JneShipperAlias $alias): bool => $alias->normalized_name === $name);
            $ids = $matches->pluck('customer_id')->unique();
            $note = 'SHIPPER_NAME belum mempunyai alias customer aktif.';
            if ($ids->count() > 1) {
                $status = 'AMBIGUOUS';
                $note = 'Nama pengirim mengarah ke beberapa kode customer. Periksa daftar nama pengirim.';
            } elseif ($ids->count() === 1 && $matches->first()?->customer?->is_active) {
                $id = (int) $ids->first();
            }
            if ($id !== null) {
                $status = 'MATCHED';
                $note = 'Customer dikenali dari daftar nama pengirim milik customer.';
            }
            $resolved[$source->id] = ['customer_id' => $id, 'status' => $status, 'method' => $method, 'note' => $note];
        }

        return $resolved;
    }
}

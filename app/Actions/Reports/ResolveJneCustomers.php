<?php

namespace App\Actions\Reports;

use App\Models\JneReportAwb;
use App\Models\JneShipperAlias;
use Illuminate\Support\Collection;

class ResolveJneCustomers
{
    public function __construct(private SuggestJneCustomers $suggestions, private ResolveJneCustomerCodes $codes, private JneEvidenceScope $scope) {}

    /**
     * @param  Collection<int, JneReportAwb>  $sources
     * @return array<int, array{customer_id: ?int, status: string, method: string, note: string, evidence: list<array<string, mixed>>, candidates?: list<array<string, mixed>>}>
     */
    public function handle(Collection $sources): array
    {
        $aliases = collect();
        $keys = $sources->map(fn (JneReportAwb $source): string => hash('sha256', JneShipperAlias::normalize($source->shipper_name ?? '')))->unique();
        foreach ($keys->chunk(500) as $chunk) {
            $aliases = $aliases->concat(JneShipperAlias::whereNotNull('mapping_key')->where('is_active', true)
                ->whereIn('alias_key', $chunk)->with('customer:id,is_active')->get());
        }
        $byKey = $aliases->groupBy('alias_key');
        $resolved = [];
        $codes = $this->codes->handle($sources);
        foreach ($sources as $source) {
            $id = null;
            $status = 'UNMATCHED';
            $method = 'SHIPPER_NAME';
            $name = JneShipperAlias::normalize($source->shipper_name ?? '');
            $matches = $byKey->get(hash('sha256', $name), collect())->filter(fn (JneShipperAlias $alias): bool => $alias->normalized_name === $name && $this->scope->allows($alias, $source));
            if ($this->suggestions->isNonIdentifying($name)) {
                $matches = collect();
            }
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
            $resolved[$source->id] = ['customer_id' => $id, 'status' => $status, 'method' => $method, 'note' => $note,
                'evidence' => array_values($matches->map(fn (JneShipperAlias $alias): array => ['source_id' => $source->id, 'alias_id' => $alias->id, 'customer_id' => $alias->customer_id])->values()->all())];
            if ($code = $codes[$source->id] ?? null) {
                $decision = &$resolved[$source->id];
                $decision['evidence'] = [...$decision['evidence'], ...$code['evidence']];
                if ($code['status'] === 'CONFLICT' || ($code['status'] === 'MATCHED' && ($status === 'AMBIGUOUS' || ($id !== null && $id !== $code['customer_id'])))) {
                    $decision['customer_id'] = null;
                    $decision['status'] = 'CONFLICT';
                    $decision['note'] = 'Kode customer dan bukti nama pengirim bertentangan; perlu pemeriksaan.';
                } elseif ($code['status'] === 'MATCHED' || ($code['status'] === 'CANDIDATE' && $status === 'UNMATCHED')) {
                    $decision = [...$code, 'evidence' => $decision['evidence']];
                } elseif ($code['status'] === 'UNMATCHED' && $status === 'UNMATCHED') {
                    $decision['note'] = 'Kode sumber belum terdaftar; nama pengirim juga belum terverifikasi.';
                }
                unset($decision);
            }
        }

        return $resolved;
    }
}

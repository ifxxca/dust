<?php

namespace App\Actions\Pickup;

use App\Actions\Reports\ExtractJneAwbMetrics;
use App\Models\JneReportAwb;

class ExtractPickupAwbDetails
{
    /** @var array<string, list<string>>|null */
    private ?array $districts = null;

    public function __construct(private ExtractJneAwbMetrics $metrics) {}

    /**
     * @return array{shipper_name: ?string, consignee_address: string, destination_code: ?string, consignee_district: ?string, district_status: string, payment_type: ?string, cod_flag: ?string, source_amount_cents: ?int, amount_cents: ?int}
     */
    public function handle(?JneReportAwb $source, ?string $category): array
    {
        $raw = $source?->raw_data ?? [];
        $destination = $this->label($source?->destination ?? $raw['DEST'] ?? null);
        $this->districts ??= json_decode(file_get_contents(config_path('jne-districts.json')), true, flags: JSON_THROW_ON_ERROR)['districts'];
        $districts = $this->districts[$destination ?? ''] ?? [];
        $cod = $this->label($raw['COD_FLAG'] ?? null);
        $amount = $source?->amount_cents ?? $this->metrics->handle($raw)['amount_cents'];
        $amount = $amount !== null && $amount >= 0 ? (int) $amount : null;
        $displayAmount = match (true) {
            $category === 'cashless_hybrid', $cod === 'Y' => 0,
            in_array($category, ['manual_hybrid', 'css_orion'], true) && $cod === 'N' => $amount,
            default => null,
        };

        return [
            'shipper_name' => $source?->shipper_name,
            'consignee_address' => implode("\n", array_filter(array_map(fn (string $key): string => trim((string) ($raw[$key] ?? '')), ['ADDR1', 'ADDR2', 'ADDR3']), fn (string $line): bool => $line !== '')),
            'destination_code' => $destination,
            'consignee_district' => count($districts) === 1 ? $districts[0] : null,
            'district_status' => match (count($districts)) {
                0 => 'UNKNOWN', 1 => 'MATCHED', default => 'AMBIGUOUS'
            },
            'payment_type' => $this->label($raw['PAYMENT_TYPE'] ?? null),
            'cod_flag' => $cod,
            'source_amount_cents' => $amount,
            'amount_cents' => $displayAmount,
        ];
    }

    private function label(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return null;
        }
        $value = mb_strtoupper(trim((string) $value));

        return $value !== '' ? $value : null;
    }
}

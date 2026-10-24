<?php

namespace App\Actions\Reports;

use Carbon\CarbonImmutable;
use Throwable;

class ExtractJneAwbMetrics
{
    /**
     * @param  array<string, mixed>  $cells
     * @return array{service: ?string, destination: ?string, destination_name: ?string, delivered_at: ?string, etd_days: ?int, amount_cents: ?int, weight_grams: ?int, quantity: ?int, metrics_version: int}
     */
    public function handle(array $cells): array
    {
        $web = $this->cell($cells['STATUS_WEB'] ?? null);
        $destinationName = null;
        $deliveredAt = null;
        if (preg_match('/^DELIVERED TO \[[^|\[\]]*\|\s*([^|]+)\|\s*([^|\[\]]+)\]$/iuD', $web, $matches)) {
            $name = mb_strtoupper(trim(preg_replace('/\s+/u', ' ', $matches[2]) ?? ''));
            $destinationName = $name !== '' && mb_strlen($name) <= 180 ? $name : null;
            $deliveredAt = $this->date(trim($matches[1]), ['d-m-Y H:i', 'd-m-Y H:i:s']);
        }
        if ($deliveredAt === null && (str_starts_with(strtoupper($web), 'DELIVERED TO [') || strtoupper($web) === 'DELIVERED')) {
            $deliveredAt = $this->date($this->cell($cells['TGL_RECEIVED'] ?? null), ['d-M-Y H:i', 'd-M-Y H:i:s']);
        }
        $etd = $this->scaled($cells['ETD'] ?? null, 0);

        return [
            'service' => $this->label($cells['SERVICE'] ?? null),
            'destination' => $this->label($cells['DEST'] ?? null),
            'destination_name' => $destinationName,
            'delivered_at' => $deliveredAt,
            'etd_days' => $etd !== null && $etd <= 365 ? $etd : null,
            'amount_cents' => $this->scaled($cells['AMOUNT'] ?? null, 2),
            'weight_grams' => $this->scaled($cells['WEIGHT'] ?? null, 3),
            'quantity' => $this->scaled($cells['QTY'] ?? null, 0),
            'metrics_version' => 2,
        ];
    }

    /** @param list<string> $formats */
    private function date(string $value, array $formats): ?string
    {
        foreach ($formats as $format) {
            try {
                $date = CarbonImmutable::createFromFormat('!'.$format, $value, config('jne-reports.source_timezone'));
                if ($date && strtoupper($date->format($format)) === strtoupper($value)) {
                    return $date->utc()->format('Y-m-d H:i:s');
                }
            } catch (Throwable) {
                continue;
            }
        }

        return null;
    }

    private function cell(mixed $value): string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return '';
        }
        $value = trim((string) $value);
        if (preg_match('/^="((?:[^"]|"")*)"$/sD', $value, $matches)) {
            $value = trim(str_replace('""', '"', $matches[1]));
        }

        return $value;
    }

    private function label(mixed $value): ?string
    {
        $value = mb_strtoupper($this->cell($value));

        return $value !== '' && mb_strlen($value) <= 100 ? $value : null;
    }

    private function scaled(mixed $value, int $precision): ?int
    {
        $value = $this->cell($value);
        $fraction = $precision > 0 ? '(?:\.([0-9]{1,'.$precision.'}))?' : '';
        if (! preg_match('/^([0-9]{1,12})'.$fraction.'$/D', $value, $matches)) {
            return null;
        }

        return (int) $matches[1] * (10 ** $precision) + (int) str_pad($matches[2] ?? '', $precision, '0');
    }
}

<?php

namespace App\Actions\Reports;

use App\Models\JneShipperAlias;
use Illuminate\Support\Collection;

class SuggestJneCustomers
{
    /**
     * @param  list<string>  $names
     * @return array<string, list<array{customer_id: int, customer_code: ?string, customer_name: string, alias_id: int, registered_name: string, distance: int, reason: string}>>
     */
    public function handle(array $names): array
    {
        if ($names === []) {
            return [];
        }
        $aliases = JneShipperAlias::whereNotNull('mapping_key')->where('is_active', true)->whereHas('customer', fn ($query) => $query->where('is_active', true))
            ->with('customer:id,name,customer_code')->orderBy('id')->limit(5001)->get();
        if ($aliases->count() > 5000) {
            return [];
        }
        $result = [];
        foreach (array_slice(array_values(array_unique($names)), 0, 100) as $name) {
            $folded = $this->fold($name);
            if (mb_strlen($folded) < 4 || mb_strlen($folded) > 120 || $this->isNonIdentifying($name)) {
                continue;
            }
            $result[$name] = $this->suggestions($folded, $aliases);
        }

        return $result;
    }

    public function isNonIdentifying(string $name): bool
    {
        return in_array(JneShipperAlias::normalize($name), array_map(JneShipperAlias::normalize(...), config('jne-reports.non_identifying_shipper_names', [])), true);
    }

    /**
     * @param  Collection<int, JneShipperAlias>  $aliases
     * @return list<array{customer_id: int, customer_code: ?string, customer_name: string, alias_id: int, registered_name: string, distance: int, reason: string}>
     */
    private function suggestions(string $name, Collection $aliases): array
    {
        $maximumDistance = min(2, max(1, (int) floor(mb_strlen($name) / 10)));
        $matches = [];
        foreach ($aliases as $alias) {
            $registered = $this->fold($alias->normalized_name);
            if (abs(mb_strlen($registered) - mb_strlen($name)) > $maximumDistance) {
                continue;
            }
            $distance = levenshtein($name, $registered);
            if ($distance <= $maximumDistance) {
                $matches[] = ['customer_id' => $alias->customer_id, 'customer_code' => $alias->customer->customer_code,
                    'customer_name' => $alias->customer->name, 'alias_id' => $alias->id, 'registered_name' => $alias->shipper_name,
                    'distance' => $distance, 'reason' => $distance === 0 ? 'Punctuation/spacing similarity; review required.' : 'Similar registered sender spelling; review required.'];
            }
        }
        usort($matches, fn (array $one, array $two): int => [$one['distance'], $one['customer_id'], $one['alias_id']] <=> [$two['distance'], $two['customer_id'], $two['alias_id']]);
        $byCustomer = [];
        foreach ($matches as $match) {
            $byCustomer[$match['customer_id']] ??= $match;
        }

        return array_slice(array_values($byCustomer), 0, 5);
    }

    private function fold(string $name): string
    {
        return preg_replace('/[^\pL\pN]/u', '', JneShipperAlias::normalize($name)) ?? '';
    }
}

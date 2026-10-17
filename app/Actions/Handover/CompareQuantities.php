<?php

namespace App\Actions\Handover;

class CompareQuantities
{
    /**
     * @param  array{manual_hybrid: int, cashless_hybrid: int, css_orion: int}  $pickup
     * @param  array{manual_hybrid: int, cashless_hybrid: int, css_orion: int}  $retail
     * @return array{status: string, differences: array<string, int>}
     */
    public function handle(array $pickup, array $retail): array
    {
        $differences = [];
        foreach (['manual_hybrid', 'cashless_hybrid', 'css_orion'] as $category) {
            $differences[$category] = $retail[$category] - $pickup[$category];
        }

        return ['status' => count(array_filter($differences)) === 0 ? 'VERIFIED' : 'DISCREPANCY', 'differences' => $differences];
    }
}

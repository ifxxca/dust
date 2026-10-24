<?php

namespace App\Actions\Reports;

class JneAwbSource
{
    public const LABELS = ['pm' => 'Server PM', 'puman' => 'Server Puman', 'css_orion' => 'CSS/Orion', 'other' => 'Lainnya'];

    public static function classify(string $awb): string
    {
        $awb = strtoupper(trim($awb));
        if (str_starts_with($awb, '0101')) {
            return 'pm';
        }
        if (str_starts_with($awb, '0166')) {
            return 'puman';
        }
        if (str_starts_with($awb, 'CGKEC') || str_starts_with($awb, 'CSS01')) {
            return 'css_orion';
        }

        return 'other';
    }

    /** @return literal-string */
    public static function sql(): string
    {
        return "CASE WHEN UPPER(s.awb) LIKE '0101%' THEN 'pm' WHEN UPPER(s.awb) LIKE '0166%' THEN 'puman' WHEN UPPER(s.awb) LIKE 'CGKEC%' OR UPPER(s.awb) LIKE 'CSS01%' THEN 'css_orion' ELSE 'other' END";
    }
}

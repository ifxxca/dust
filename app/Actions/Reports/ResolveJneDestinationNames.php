<?php

namespace App\Actions\Reports;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class ResolveJneDestinationNames
{
    /**
     * @return array<string, array{name: string, ambiguous: bool}>
     */
    public function handle(): array
    {
        $revision = DB::table('jne_report_awbs')->max('id') ?? 0;

        return Cache::remember('jne:destination-names:v4:'.$revision, 600, function (): array {
            return DB::table('jne_report_awbs')->whereNotNull('destination')->whereNotNull('destination_name')
                ->select(['destination', 'destination_name'])->distinct()->orderBy('destination_name')->get()->groupBy('destination')
                ->map(fn ($rows): array => [
                    'name' => $rows->take(3)->map(fn ($row): string => $this->formatName((string) $row->destination_name))->implode(' / ').($rows->count() > 3 ? ' / lokasi lainnya' : ''),
                    'ambiguous' => $rows->count() > 1,
                ])->all();
        });
    }

    private function formatName(string $name): string
    {
        return mb_convert_case(preg_replace('/\.(?=\p{L})/u', '. ', $name) ?? $name, MB_CASE_TITLE, 'UTF-8');
    }
}

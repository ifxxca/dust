<?php

namespace App\Actions\Reports;

use App\Actions\Pickup\PickupResultPeriod;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class QueryUserProductivity
{
    /**
     * @param  array{date_from: string, date_thru: string, q?: string|null, manual_seconds: int|string, cashless_seconds: int|string, orion_seconds: int|string}  $filters
     * @return array{rows: list<array<string, mixed>>, days: int, capacity_seconds: int, totals: array<string, int>}
     */
    public function handle(array $filters): array
    {
        $from = PickupResultPeriod::start($filters['date_from']);
        $until = PickupResultPeriod::start($filters['date_thru'])->addDay();
        $days = (int) $from->diffInDays($until);
        $staff = $this->staffExpression();
        $population = DB::table('jne_shipments as s')
            ->join('jne_report_awbs as a', 'a.id', '=', 's.latest_report_awb_id')
            ->where('a.entry_at', '>=', $from->utc())->where('a.entry_at', '<', $until->utc())
            ->where('s.awb', '<>', '')
            ->selectRaw("$staff as staff, CASE WHEN s.category_status = 'MATCHED' THEN s.category ELSE NULL END as category");
        $groups = DB::query()->fromSub($population, 'entries')->select('staff')->selectRaw('COUNT(*) as total');
        foreach (['manual' => 'manual_hybrid', 'cashless' => 'cashless_hybrid', 'orion' => 'css_orion'] as $key => $category) {
            $groups->selectRaw("SUM(CASE WHEN category = ? THEN 1 ELSE 0 END) as $key", [$category]);
        }
        $groups = $groups->groupBy('staff')->get();
        $names = User::query()->whereIn(DB::raw('UPPER(TRIM(hybrid_username))'), $groups->pluck('staff')->filter()->all())
            ->get(['name', 'hybrid_username'])->groupBy(fn (User $user): string => mb_strtoupper(trim($user->hybrid_username)));
        $rows = [];
        $search = mb_strtolower(trim($filters['q'] ?? ''));
        $totals = ['total' => 0, 'manual' => 0, 'cashless' => 0, 'orion' => 0, 'unclassified' => 0, 'missing_staff' => 0];
        foreach ($groups as $group) {
            $owners = $names->get($group->staff);
            $name = $owners?->count() === 1 ? $owners->first()->name : ($group->staff ?? 'Tanpa petugas entry');
            if ($search !== '' && ! str_contains(mb_strtolower($name.' '.$group->staff), $search)) {
                continue;
            }
            $manual = (int) $group->manual;
            $cashless = (int) $group->cashless;
            $orion = (int) $group->orion;
            $total = (int) $group->total;
            $unclassified = $total - $manual - $cashless - $orion;
            $seconds = $manual * (int) $filters['manual_seconds'] + $cashless * (int) $filters['cashless_seconds'] + $orion * (int) $filters['orion_seconds'];
            $row = ['staff' => $group->staff, 'name' => $name, 'manual' => $manual, 'cashless' => $cashless, 'orion' => $orion,
                'total' => $total, 'unclassified' => $unclassified, 'estimated_seconds' => $seconds,
                'productivity_percent' => $unclassified > 0 || $group->staff === null ? null : round($seconds / ($days * 7 * 3600) * 100, 1)];
            $rows[] = $row;
            foreach (['total', 'manual', 'cashless', 'orion', 'unclassified'] as $key) {
                $totals[$key] += $row[$key];
            }
            if ($group->staff === null) {
                $totals['missing_staff'] += $total;
            }
        }
        usort($rows, fn (array $left, array $right): int => ($right['estimated_seconds'] <=> $left['estimated_seconds']) ?: strcmp($left['name'], $right['name']) ?: strcmp($left['staff'] ?? '', $right['staff'] ?? ''));

        return ['rows' => $rows, 'days' => $days, 'capacity_seconds' => $days * 7 * 3600, 'totals' => $totals];
    }

    /** @return literal-string */
    private function staffExpression(): string
    {
        $value = DB::getDriverName() === 'sqlite'
            ? 'json_extract(a.raw_data, \'$."USER_CONNOTE"\')'
            : 'JSON_UNQUOTE(JSON_EXTRACT(a.raw_data, \'$."USER_CONNOTE"\'))';

        return "UPPER(NULLIF(NULLIF(TRIM($value), ''), 'null'))";
    }
}

<?php

namespace App\Actions\Pickup;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Pagination\LengthAwarePaginator;

class ReportPickupResults
{
    /** @return LengthAwarePaginator<int, \stdClass> */
    public function handle(Builder $query, QueryPickupResults $results, string $group, int $page, int $perPage): LengthAwarePaginator
    {
        if ($group !== 'date') {
            $id = $group === 'staff' ? 'staff_id' : 'customer_id';
            $name = $group === 'staff' ? 'staff_name' : 'customer_label';

            return (clone $query)->select([$id.' as group_id', $name.' as label'])
                ->selectRaw($results->aggregateSql())->groupBy($id, $name)
                ->orderByDesc('total')->orderBy($name)->orderBy($id)->paginate($perPage)->withQueryString();
        }
        $bounds = (clone $query)->selectRaw('min(period_at) as first_date, max(period_at) as last_date')->first();
        if (! $bounds?->first_date) {
            return new LengthAwarePaginator([], 0, $perPage, $page, ['path' => LengthAwarePaginator::resolveCurrentPath(), 'query' => request()->query()]);
        }
        $first = PickupResultPeriod::date(CarbonImmutable::parse($bounds->first_date, 'UTC'));
        $last = PickupResultPeriod::date(CarbonImmutable::parse($bounds->last_date, 'UTC'));
        $total = (int) $first->diffInDays($last) + 1;
        $union = null;
        for ($offset = ($page - 1) * $perPage; $offset < min($total, $page * $perPage); $offset++) {
            $day = $last->subDays($offset);
            $start = PickupResultPeriod::start($day->toDateString())->utc();
            $daily = (clone $query)->where('period_at', '>=', $start)->where('period_at', '<', $start->addDay())
                ->selectRaw('? as label', [$day->toDateString()])->selectRaw($results->aggregateSql());
            $union = $union ? $union->unionAll($daily) : $daily;
        }

        return new LengthAwarePaginator($union?->get() ?? [], $total, $perPage, $page, ['path' => LengthAwarePaginator::resolveCurrentPath(), 'query' => request()->query()]);
    }
}

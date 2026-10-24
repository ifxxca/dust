<?php

namespace App\Actions\Reports;

use App\Models\JneShipment;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

class QueryActiveJneAwbs
{
    /** @return Builder<JneShipment> */
    public function handle(int $maximumAgeDays): Builder
    {
        $cutoff = CarbonImmutable::now('Asia/Jakarta')->startOfDay()->subDays($maximumAgeDays - 1)->utc();

        return JneShipment::whereNotIn('tracking_status', ['DELIVERED', 'CANCELLED'])->where('awb', '<>', '')
            ->where(function (Builder $query) use ($cutoff): void {
                $query->whereDoesntHave('latestSource')->orWhereHas('latestSource', fn (Builder $source) => $source->whereNull('entry_at')->orWhere('entry_at', '>=', $cutoff));
            });
    }

    /** @return Builder<JneShipment> */
    public function due(int $maximumAgeDays, int $intervalMinutes): Builder
    {
        return $this->handle($maximumAgeDays)->where(function (Builder $query) use ($intervalMinutes): void {
            foreach (['IN_TRANSIT', 'EXCEPTION', 'UNKNOWN', 'RETURNED'] as $status) {
                $minutes = max(5, $intervalMinutes, (int) config('jne-reports.refresh_minimum_minutes.'.$status, 0));
                $query->orWhere(fn (Builder $statusQuery) => $statusQuery->where('tracking_status', $status)
                    ->whereDoesntHave('observations', fn (Builder $observations) => $observations->where('created_at', '>', now()->subMinutes($minutes))));
            }
        });
    }
}

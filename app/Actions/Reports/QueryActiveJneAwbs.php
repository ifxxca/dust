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
}

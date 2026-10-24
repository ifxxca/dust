<?php

namespace App\Actions\Reports;

use App\Models\JneShipment;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

class QueryActiveJneAwbs
{
    /**
     * @param  array<string, mixed>|null  $policy
     * @return Builder<JneShipment>
     */
    public function handle(int $maximumAgeDays, ?array $policy = null): Builder
    {
        $cutoff = CarbonImmutable::now('Asia/Jakarta')->startOfDay()->subDays($maximumAgeDays - 1)->utc();

        $query = JneShipment::where('awb', '<>', '')
            ->where(function (Builder $query) use ($cutoff): void {
                $query->whereDoesntHave('latestSource')->orWhereHas('latestSource', fn (Builder $source) => $source->whereNull('entry_at')->orWhere('entry_at', '>=', $cutoff));
            });
        if ($policy === null) {
            return $query->whereNotIn('tracking_status', ['DELIVERED', 'CANCELLED']);
        }
        foreach ($policy['terminal_statuses'] ?? [] as $status) {
            $query->where(fn (Builder $query) => $query->where('tracking_status', '<>', $status)->orWhereRaw(
                '(select count(distinct t.observed_at) from jne_shipment_observations t where t.jne_shipment_id = jne_shipments.id and t.tracking_status = ? and not exists (select 1 from jne_shipment_observations d where d.jne_shipment_id = t.jne_shipment_id and d.tracking_status <> ? and d.observed_at >= t.observed_at)) < ?',
                [$status, $status, $policy['terminal_confirmations']]
            ));
        }

        return $query;
    }

    /**
     * @param  array<string, mixed>|null  $policy
     * @return Builder<JneShipment>
     */
    public function due(int $maximumAgeDays, int $intervalMinutes, ?array $policy = null): Builder
    {
        if ($policy !== null) {
            return $this->handle($maximumAgeDays, $policy)->where(function (Builder $query) use ($intervalMinutes, $policy): void {
                foreach (JneShipment::STATUSES as $status) {
                    $minutes = max(5, $intervalMinutes, (int) ($policy['intervals'][$status] ?? 0));
                    $query->orWhere(function (Builder $query) use ($status, $minutes, $intervalMinutes, $policy): void {
                        $query->where('tracking_status', $status)->where(function (Builder $query) use ($minutes, $intervalMinutes, $policy): void {
                            $query->whereDoesntHave('observations', fn (Builder $observations) => $observations->where('created_at', '>', now()->subMinutes($minutes)));
                            if (! empty($policy['sla_after_days']) && ! empty($policy['sla_interval_minutes'])) {
                                $query->orWhere(fn (Builder $risk) => $risk->whereHas('latestSource', fn (Builder $source) => $source->where('entry_at', '<=', now()->subDays($policy['sla_after_days'])))
                                    ->whereDoesntHave('observations', fn (Builder $observations) => $observations->where('created_at', '>', now()->subMinutes(max(5, $intervalMinutes, $policy['sla_interval_minutes'])))));
                            }
                        });
                    });
                }
            });
        }

        return $this->handle($maximumAgeDays)->where(function (Builder $query) use ($intervalMinutes): void {
            foreach (['IN_TRANSIT', 'EXCEPTION', 'UNKNOWN', 'RETURNED'] as $status) {
                $minutes = max(5, $intervalMinutes, (int) config('jne-reports.refresh_minimum_minutes.'.$status, 0));
                $query->orWhere(fn (Builder $statusQuery) => $statusQuery->where('tracking_status', $status)
                    ->whereDoesntHave('observations', fn (Builder $observations) => $observations->where('created_at', '>', now()->subMinutes($minutes))));
            }
        });
    }
}

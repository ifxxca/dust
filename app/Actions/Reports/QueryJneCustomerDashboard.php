<?php

namespace App\Actions\Reports;

use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class QueryJneCustomerDashboard
{
    public function __construct(private ResolveJneDestinationNames $destinationNames) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function handle(array $filters, CarbonImmutable $from, CarbonImmutable $thru): array
    {
        $scope = DB::table('jne_shipments as s')->join('jne_report_awbs as a', 'a.id', '=', 's.latest_report_awb_id');
        if ($filters['customer_id']) {
            $scope->where('s.customer_id', $filters['customer_id']);
        }
        if ($filters['mapping'] === 'unmapped') {
            $scope->whereNull('s.customer_id');
        } elseif ($filters['mapping'] === 'ambiguous') {
            $scope->where('s.customer_match_status', 'AMBIGUOUS');
        }
        foreach (['service' => 'a.service', 'destination' => 'a.destination', 'status' => 's.tracking_status'] as $filter => $column) {
            if ($filters[$filter] !== '') {
                $scope->where($column, $filters[$filter]);
            }
        }
        $today = CarbonImmutable::today(config('jne-reports.source_timezone'));
        $cutoff7 = $today->subDays(6)->utc()->format('Y-m-d H:i:s');
        $cutoff14 = $today->subDays(13)->utc()->format('Y-m-d H:i:s');
        if ($filters['age'] !== 'all') {
            $scope->whereNotIn('s.tracking_status', ['DELIVERED', 'CANCELLED', 'RETURNED'])->where('a.entry_at', '<', $filters['age'] === '14_plus' ? $cutoff14 : $cutoff7);
        }
        $sourceSql = JneAwbSource::sql();
        $sourceRows = (clone $scope)->where('a.entry_at', '>=', $from->utc()->format('Y-m-d H:i:s'))
            ->where('a.entry_at', '<', $thru->addDay()->utc()->format('Y-m-d H:i:s'))
            ->selectRaw($sourceSql.' as server, COUNT(*) as shipments, SUM(a.amount_cents) as amount_cents, COUNT(a.amount_cents) as amount_known')->groupBy('server')->get()->keyBy('server');
        $servers = [];
        foreach (JneAwbSource::LABELS as $key => $label) {
            $row = $sourceRows->get($key);
            $servers[] = ['key' => $key, 'label' => $label, 'shipments' => (int) ($row->shipments ?? 0), 'amount' => ! $row ? 0 : ((int) $row->amount_known > 0 ? (int) $row->amount_cents / 100 : null)];
        }
        if ($filters['server'] !== 'all') {
            $scope->whereRaw('('.$sourceSql.') = ?', [$filters['server']]);
        }
        $undated = (clone $scope)->whereNull('a.entry_at')->count();
        $query = (clone $scope)->where('a.entry_at', '>=', $from->utc()->format('Y-m-d H:i:s'))
            ->where('a.entry_at', '<', $thru->addDay()->utc()->format('Y-m-d H:i:s'));
        $summary = (array) (clone $query)->selectRaw("COUNT(*) as shipments, COUNT(DISTINCT s.customer_id) as customers, COUNT(DISTINCT s.customer_account) as accounts,
            SUM(CASE WHEN s.customer_id IS NOT NULL THEN 1 ELSE 0 END) as mapped,
            SUM(CASE WHEN s.customer_match_status = 'AMBIGUOUS' THEN 1 ELSE 0 END) as ambiguous,
            COUNT(a.amount_cents) as amount_known, SUM(a.amount_cents) as amount_cents,
            COUNT(a.weight_grams) as weight_known, SUM(a.weight_grams) as weight_grams,
            COUNT(a.quantity) as quantity_known, SUM(a.quantity) as quantity,
            SUM(CASE WHEN s.tracking_status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered,
            SUM(CASE WHEN s.tracking_status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
            SUM(CASE WHEN s.tracking_status = 'RETURNED' THEN 1 ELSE 0 END) as returned,
            SUM(CASE WHEN s.tracking_status = 'EXCEPTION' THEN 1 ELSE 0 END) as exceptions,
            SUM(CASE WHEN s.tracking_status NOT IN ('DELIVERED','CANCELLED','RETURNED') THEN 1 ELSE 0 END) as active,
            MAX(s.last_observed_at) as last_observed_at")->first();
        foreach (['shipments', 'customers', 'accounts', 'mapped', 'ambiguous', 'amount_known', 'weight_known', 'quantity_known', 'quantity', 'delivered', 'active', 'cancelled', 'returned', 'exceptions'] as $key) {
            $summary[$key] = (int) ($summary[$key] ?? 0);
        }
        $summary['amount'] = $summary['amount_known'] > 0 ? (int) $summary['amount_cents'] / 100 : null;
        $summary['weight_kg'] = $summary['weight_known'] > 0 ? (int) $summary['weight_grams'] / 1000 : null;
        $summary['average_amount'] = $summary['amount_known'] > 0 ? round($summary['amount'] / $summary['amount_known'], 2) : null;
        $summary['unmapped'] = $summary['shipments'] - $summary['mapped'];
        $summary['undated'] = $undated;
        $summary['last_observed_at'] = $summary['last_observed_at'] ? CarbonImmutable::parse($summary['last_observed_at'], 'UTC')->toIso8601String() : null;
        unset($summary['amount_cents'], $summary['weight_grams']);

        $offset = (int) ($from->utcOffset());
        $sqlite = DB::getDriverName() === 'sqlite';
        $duration = $sqlite ? '(JULIANDAY(a.delivered_at) - JULIANDAY(a.entry_at)) * 24.0' : 'TIMESTAMPDIFF(SECOND, a.entry_at, a.delivered_at) / 3600.0';
        $delivery = (clone $query)->where('s.tracking_status', 'DELIVERED')->whereNotNull('a.delivered_at')->whereColumn('a.delivered_at', '>=', 'a.entry_at')
            ->selectRaw('COUNT(*) as known, AVG('.$duration.') as hours')->first();
        $summary['delivery_known'] = (int) $delivery->known;
        $summary['average_delivery_hours'] = $delivery->hours !== null ? round((float) $delivery->hours, 1) : null;
        $active = (clone $query)->whereNotIn('s.tracking_status', ['DELIVERED', 'CANCELLED', 'RETURNED']);
        $ageCounts = (clone $active)->selectRaw('COUNT(CASE WHEN a.entry_at >= ? THEN 1 END) as young, COUNT(CASE WHEN a.entry_at < ? AND a.entry_at >= ? THEN 1 END) as middle, COUNT(CASE WHEN a.entry_at < ? AND a.entry_at >= ? THEN 1 END) as old, COUNT(CASE WHEN a.entry_at < ? THEN 1 END) as oldest, MIN(a.entry_at) as first_entry', [
            $today->subDays(2)->utc()->format('Y-m-d H:i:s'), $today->subDays(2)->utc()->format('Y-m-d H:i:s'), $cutoff7, $cutoff7, $cutoff14, $cutoff14,
        ])->first();
        $summary['active_7_plus'] = (int) $ageCounts->old + (int) $ageCounts->oldest;
        $summary['oldest_active_days'] = $ageCounts->first_entry ? max(0, (int) CarbonImmutable::parse($ageCounts->first_entry, 'UTC')->setTimezone(config('jne-reports.source_timezone'))->startOfDay()->diffInDays($today)) : null;
        $ages = [['label' => '0–2 hari', 'shipments' => (int) $ageCounts->young], ['label' => '3–6 hari', 'shipments' => (int) $ageCounts->middle], ['label' => '7–13 hari', 'shipments' => (int) $ageCounts->old], ['label' => '14+ hari', 'shipments' => (int) $ageCounts->oldest]];
        $periodDays = (int) $from->diffInDays($thru) + 1;
        $previousFrom = $from->subDays($periodDays);
        $previousThru = $from->subDay();
        $previous = (clone $scope)->where('a.entry_at', '>=', $previousFrom->utc()->format('Y-m-d H:i:s'))->where('a.entry_at', '<', $from->utc()->format('Y-m-d H:i:s'))
            ->selectRaw('COUNT(*) as shipments, SUM(a.amount_cents) as amount_cents, COUNT(a.amount_cents) as amount_known')->first();
        $previousAmount = (int) $previous->amount_known > 0 ? (int) $previous->amount_cents / 100 : null;
        $amountComplete = (int) $previous->amount_known === (int) $previous->shipments && $summary['amount_known'] === $summary['shipments'];
        $comparison = ['date_from' => $previousFrom->toDateString(), 'date_thru' => $previousThru->toDateString(), 'shipments' => (int) $previous->shipments, 'amount' => $previousAmount, 'amount_known' => (int) $previous->amount_known, 'amount_complete' => $amountComplete,
            'shipment_change_percent' => (int) $previous->shipments > 0 ? round(($summary['shipments'] - (int) $previous->shipments) / (int) $previous->shipments * 100, 1) : null,
            'amount_change_percent' => $amountComplete && $previousAmount > 0 && $summary['amount'] !== null ? round(($summary['amount'] - $previousAmount) / $previousAmount * 100, 1) : null];
        $names = $this->destinationNames->handle();
        $destinationCounts = (clone $query)->selectRaw('a.destination, COUNT(*) as shipments')->groupBy('a.destination')->get();
        $summary['destination_named'] = (int) $destinationCounts->sum(fn ($row): int => isset($names[$row->destination]) ? (int) $row->shipments : 0);
        $summary['destination_multiple'] = (int) $destinationCounts->sum(fn ($row): int => ($names[$row->destination]['ambiguous'] ?? false) ? (int) $row->shipments : 0);
        $summary['destination_count'] = $destinationCounts->whereNotNull('destination')->count();
        $day = $sqlite ? 'DATE(a.entry_at, ?)' : 'DATE(DATE_ADD(a.entry_at, INTERVAL ? MINUTE))';
        $daily = (clone $query)->selectRaw($day.' as day, COUNT(*) as shipments, SUM(a.amount_cents) as amount_cents, COUNT(a.amount_cents) as amount_known', [$sqlite ? "{$offset} minutes" : $offset])
            ->groupBy('day')->orderBy('day')->get()->keyBy('day');
        $days = [];
        for ($date = $from; $date->lessThanOrEqualTo($thru); $date = $date->addDay()) {
            $row = $daily->get($date->toDateString());
            $days[] = ['date' => $date->toDateString(), 'shipments' => (int) ($row->shipments ?? 0),
                'amount' => ! $row ? 0 : ((int) $row->amount_known > 0 ? (int) $row->amount_cents / 100 : null),
                'amount_known' => (int) ($row->amount_known ?? 0)];
        }
        $statuses = (clone $query)->selectRaw('s.tracking_status as label, COUNT(*) as shipments')->groupBy('s.tracking_status')->orderByDesc('shipments')->get()
            ->map(fn ($row): array => ['label' => $row->label, 'shipments' => (int) $row->shipments])->all();
        $shipments = (clone $query)->leftJoin('customers as c', 'c.id', '=', 's.customer_id')
            ->select(['s.id', 's.awb', 's.customer_account', 's.tracking_status', 's.customer_match_status', 'a.entry_at', 'a.service', 'a.destination', 'a.amount_cents', 'a.weight_grams', 'a.quantity', 'a.etd_days', 'c.name as customer_name', 'c.customer_code'])
            ->orderByDesc('a.entry_at')->orderByDesc('s.id')->paginate(25)->withQueryString()->through(fn ($row): array => [
                ...array_diff_key((array) $row, array_flip(['amount_cents', 'weight_grams'])),
                'entry_at' => CarbonImmutable::parse($row->entry_at, 'UTC')->toIso8601String(),
                'amount' => $row->amount_cents !== null ? (int) $row->amount_cents / 100 : null,
                'weight_kg' => $row->weight_grams !== null ? (int) $row->weight_grams / 1000 : null,
                'server' => JneAwbSource::classify($row->awb),
                'destination_name' => $names[$row->destination]['name'] ?? null,
                'destination_multiple' => $names[$row->destination]['ambiguous'] ?? false,
            ]);

        $destinations = array_map(fn (array $row): array => [...$row, 'key' => $row['label'], 'label' => $names[$row['label']]['name'] ?? null, 'multiple_names' => $names[$row['label']]['ambiguous'] ?? false], $this->breakdown($query, 'destination'));

        return ['summary' => $summary, 'daily' => $days, 'destinations' => $destinations, 'servers' => $servers, 'ages' => $ages, 'comparison' => $comparison,
            'services' => $this->breakdown($query, 'service'), 'statuses' => $statuses, 'shipments' => $shipments,
            'selectedDestination' => $filters['destination'] !== '' ? ($names[$filters['destination']]['name'] ?? 'Nama daerah belum tersedia') : null];
    }

    /**
     * @param  'destination'|'service'  $field
     * @return list<array{label: ?string, shipments: int, amount: int|float|null}>
     */
    private function breakdown(Builder $query, string $field): array
    {
        $label = $field === 'destination' ? 'a.destination' : 'a.service';

        return array_values((clone $query)->selectRaw($label.' as label, COUNT(*) as shipments, SUM(a.amount_cents) as amount_cents, COUNT(a.amount_cents) as amount_known')
            ->groupBy('a.'.$field)->orderByDesc('shipments')->orderBy('label')->limit(10)->get()->map(fn ($row): array => [
                'label' => $row->label === null ? null : (string) $row->label, 'shipments' => (int) $row->shipments,
                'amount' => (int) $row->amount_known > 0 ? (int) $row->amount_cents / 100 : null,
            ])->all());
    }
}

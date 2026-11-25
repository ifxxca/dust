<?php

namespace App\Actions\Reports;

use App\Models\JneReportAwb;
use App\Models\JneShipment;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

class QueryShipmentMonitoring
{
    /** @param array<string, mixed> $filters
     * @return Builder<JneShipment>
     */
    public function handle(array $filters): Builder
    {
        $query = JneShipment::query()->fromSub($this->population($this->scope($filters)), 'jne_shipments');
        foreach (['sla_status', 'native_sla_grade'] as $field) {
            if (! empty($filters[$field])) {
                $query->where($field, $filters[$field]);
            }
        }
        foreach (['overdue_min' => '>=', 'overdue_max' => '<='] as $filter => $operator) {
            if (isset($filters[$filter])) {
                $query->where('sla_variance', $operator, (int) $filters[$filter]);
            }
        }
        if (! empty($filters['attention'])) {
            $this->attention($query, $filters['attention']);
        }

        return $query;
    }

    /** @param array<string, mixed> $filters
     * @return Builder<JneShipment>
     */
    private function scope(array $filters): Builder
    {
        $query = JneShipment::query();
        if (isset($filters['shipment_id'])) {
            $query->whereKey($filters['shipment_id']);
        }
        if (isset($filters['q']) && trim($filters['q']) !== '') {
            $prefix = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtoupper(trim($filters['q'])));
            $query->whereRaw("awb like ? ESCAPE '!'", [$prefix.'%']);
        }
        if (isset($filters['shipper']) && trim($filters['shipper']) !== '') {
            $shipper = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], trim($filters['shipper']));
            $query->whereHas('latestSource', fn (Builder $source) => $source->whereRaw("shipper_name like ? ESCAPE '!'", ['%'.$shipper.'%']));
        }
        foreach (['customer_id' => 'customer_id', 'status' => 'tracking_status'] as $filter => $column) {
            if (! empty($filters[$filter])) {
                $query->where($column, $filters[$filter]);
            }
        }
        if (($filters['customer_link'] ?? '') === 'linked') {
            $query->whereNotNull('customer_id');
        } elseif (($filters['customer_link'] ?? '') === 'unlinked') {
            $query->whereNull('customer_id');
        }
        if (($filters['attribution'] ?? '') === 'matched') {
            $query->whereNotNull('customer_id')->where('customer_match_status', 'MATCHED');
        } elseif (($filters['attribution'] ?? '') === 'unresolved') {
            $query->where(fn (Builder $attribution) => $attribution->whereNull('customer_id')->orWhere('customer_match_status', '<>', 'MATCHED'));
        }
        foreach (['outlet' => 'ZONE_USER_ENTRI', 'source_code' => 'IREG_CODE', 'source_reason' => 'RECEIVED/REASON'] as $filter => $key) {
            if (array_key_exists($filter, $filters)) {
                $expression = QueryOperationalPerformance::rawText($key, 'jne_report_awbs');
                $query->whereHas('latestSource', fn (Builder $source) => ($filters[$filter] ?? '') === ''
                    ? $source->whereRaw($expression.' IS NULL')
                    : $source->whereRaw($expression.' = ?', [$filters[$filter]]));
            }
        }
        foreach (['source_service' => 'service', 'source_web' => 'status_web', 'source_pod' => 'status_pod'] as $filter => $column) {
            if (array_key_exists($filter, $filters)) {
                $query->whereHas('latestSource', fn (Builder $source) => ($filters[$filter] ?? '') === ''
                    ? $source->whereRaw("NULLIF(TRIM($column), '') IS NULL")
                    : $source->whereRaw("TRIM($column) = ?", [$filters[$filter]]));
            }
        }
        if (! empty($filters['lifecycle'])) {
            if ($filters['lifecycle'] === 'terminal') {
                $query->whereIn('tracking_status', JneShipment::TRACKING_TERMINAL_STATUSES);
            } else {
                $query->whereIn('tracking_status', ['IN_TRANSIT', 'EXCEPTION']);
            }
        }
        if (! empty($filters['date_from']) || ! empty($filters['date_thru'])) {
            $query->whereHas('latestSource', function (Builder $source) use ($filters): void {
                if (! empty($filters['date_from'])) {
                    $from = CarbonImmutable::parse($filters['date_from'], 'Asia/Jakarta');
                    $source->where('entry_at', '>=', (str_contains($filters['date_from'], 'T') ? $from : $from->setTime(5, 0))->utc());
                }
                if (! empty($filters['date_thru'])) {
                    $thru = CarbonImmutable::parse($filters['date_thru'], 'Asia/Jakarta');
                    $source->where('entry_at', '<', (str_contains($filters['date_thru'], 'T') ? $thru->addMinute() : $thru->addDay()->setTime(5, 0))->utc());
                }
            });
        }
        if (($filters['freshness'] ?? '') === 'unobserved') {
            $query->whereNull('last_observed_at');
        } elseif (($filters['freshness'] ?? '') === 'stale' && ! empty($filters['freshness_hours'])) {
            $query->whereNotIn('tracking_status', JneShipment::TRACKING_TERMINAL_STATUSES)
                ->where('last_observed_at', '<', now()->subHours((int) $filters['freshness_hours']));
        }

        if (! empty($filters['service'])) {
            $query->whereHas('latestSource', fn (Builder $source) => $source->where('service', mb_strtoupper(trim($filters['service']))));
        }
        if (! empty($filters['destination'])) {
            $destination = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], trim($filters['destination']));
            $query->whereHas('latestSource', fn (Builder $source) => $source->whereRaw("destination like ? ESCAPE '!'", ['%'.$destination.'%']));
        }

        return $query;
    }

    /**
     * Daily entry and delivery totals within the same entry cohort as the overview.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{date: string, entered: int, delivered: int}>
     */
    public function trend(array $filters): array
    {
        $end = empty($filters['date_thru']) ? CarbonImmutable::now('Asia/Jakarta')->subHours(5)
            : CarbonImmutable::parse($filters['date_thru'], 'Asia/Jakarta')->subHours(str_contains($filters['date_thru'], 'T') ? 5 : 0);
        $end = $end->startOfDay();
        $start = empty($filters['date_from']) ? $end->subDays(13)
            : CarbonImmutable::parse($filters['date_from'], 'Asia/Jakarta')->subHours(str_contains($filters['date_from'], 'T') ? 5 : 0)->startOfDay();
        $start = $start->max($end->subDays(13));
        $base = $this->scope($filters)->join('jne_report_awbs as trend_source', 'trend_source.id', '=', 'jne_shipments.latest_report_awb_id')->toBase();
        $totals = [];
        foreach (['entered' => 'entry_at', 'delivered' => 'delivered_at'] as $metric => $column) {
            $dateSql = DB::getDriverName() === 'sqlite'
                ? "date(trend_source.$column, '+2 hours')"
                : "DATE(DATE_ADD(trend_source.$column, INTERVAL 2 HOUR))";
            $query = (clone $base)->whereNotNull('trend_source.'.$column)
                ->where('trend_source.'.$column, '>=', $start->setTime(5, 0)->utc())->where('trend_source.'.$column, '<', $end->addDay()->setTime(5, 0)->utc());
            if ($metric === 'delivered') {
                $query->where('jne_shipments.tracking_status', 'DELIVERED');
            }
            $totals[$metric] = $query->selectRaw("$dateSql as day, COUNT(*) as total")->groupByRaw($dateSql)->pluck('total', 'day');
        }
        $rows = [];
        for ($date = $start; $date->lessThanOrEqualTo($end); $date = $date->addDay()) {
            $key = $date->toDateString();
            $rows[] = ['date' => $key, 'entered' => (int) ($totals['entered'][$key] ?? 0), 'delivered' => (int) ($totals['delivered'][$key] ?? 0)];
        }

        return $rows;
    }

    /** @param Builder<JneShipment> $query */
    private function attention(Builder $query, string $category): void
    {
        $expressions = [
            'all' => self::attentionExpression(),
            'exception' => "tracking_status = 'EXCEPTION'",
            'return' => "tracking_status = 'RETURNED'",
            'over_sla' => "sla_status = 'OVER_SLA'",
            'potential_overdue' => 'potential_overdue = 1',
        ];
        $query->whereRaw($expressions[$category] ?? '1 = 0');
    }

    /** @param literal-string $prefix
     * @return literal-string
     */
    public static function attentionExpression(string $prefix = ''): string
    {
        return "({$prefix}tracking_status IN ('EXCEPTION','RETURNED') OR {$prefix}sla_status = 'OVER_SLA' OR {$prefix}potential_overdue = 1)";
    }

    /**
     * Materialize compact source cells once per scoped row. Unbounded LIMIT prevents
     * derived-table merging from repeating JSON extraction for every KPI expression.
     *
     * @param  Builder<JneShipment>  $scope
     */
    private function population(Builder $scope): QueryBuilder
    {
        $columns = ['id', 'awb', 'customer_account', 'tracking_status', 'customer_match_status', 'customer_id', 'pickup_task_id', 'latest_report_awb_id', 'latest_report_job_id', 'last_observed_at'];
        $source = DB::query()->fromSub($scope->select(array_map(fn (string $column): string => 'jne_shipments.'.$column, $columns))->toBase(), 's')->leftJoin('jne_report_awbs as a', 'a.id', '=', 's.latest_report_awb_id')->select('s.*')
            ->selectRaw('a.service as m_service, a.destination as m_destination, a.entry_at as m_entry_at');
        $cells = ['AGING' => 'r_aging', 'AGING_ONGOING' => 'r_ongoing', 'ETD' => 'r_etd', 'SLA' => 'r_sla', 'CARRER' => 'r_carrer'];
        if (DB::getDriverName() === 'mysql') {
            $columns = implode(', ', array_map(fn (string $key, string $alias): string => "$alias VARCHAR(2048) PATH '$.\"$key\"' NULL ON EMPTY NULL ON ERROR", array_keys($cells), array_values($cells)));
            $source->crossJoin(DB::raw("JSON_TABLE(COALESCE(a.raw_data, JSON_OBJECT()), '$' COLUMNS ($columns)) AS raw_cells"));
        }
        foreach ($cells as $key => $alias) {
            $cell = QueryOperationalPerformance::rawText($key);
            if (DB::getDriverName() === 'mysql') {
                $cell = "NULLIF(NULLIF(TRIM(raw_cells.$alias), ''), 'null') COLLATE utf8mb4_bin";
            } elseif (DB::getDriverName() === 'sqlite') {
                $cell = "CASE WHEN json_type(a.raw_data, '$.\"$key\"') IN ('text','integer') THEN $cell ELSE NULL END";
            }
            $source->selectRaw("$cell as $alias");
        }
        $source->limit(PHP_INT_MAX);
        $numbers = DB::query()->fromSub($source, 'cells')->select('cells.*');
        foreach (['r_aging' => 'm_aging', 'r_ongoing' => 'm_ongoing', 'r_etd' => 'm_etd', 'r_sla' => 'm_source_sla'] as $cell => $alias) {
            $numbers->selectRaw($this->numberExpression($cell, $cell === 'r_sla')." as $alias");
        }
        $numbers->selectRaw($this->sourceText('r_carrer').' as m_carrer')->limit(PHP_INT_MAX);
        $grade = "CASE WHEN m_carrer IN ('On Time SLA','On Time SLA (became)') AND m_source_sla <= 0 THEN 'ON_TIME' WHEN m_carrer IN ('Over SLA','Over SLA (became)') AND m_source_sla > 0 THEN 'OVER_SLA' ELSE 'UNKNOWN' END";
        $native = DB::query()->fromSub($numbers, 'evidence')->select('evidence.*')->selectRaw("$grade as native_sla_grade")->limit(PHP_INT_MAX);
        $potential = "tracking_status IN ('IN_TRANSIT','EXCEPTION') AND native_sla_grade <> 'OVER_SLA' AND m_ongoing IS NOT NULL AND m_etd IS NOT NULL AND m_ongoing > m_etd";
        $evaluated = DB::query()->fromSub($native, 'native')->select('native.*')
            ->selectRaw("CASE WHEN $potential THEN 1 ELSE 0 END as potential_overdue")
            ->selectRaw("CASE WHEN $potential THEN m_ongoing - m_etd ELSE NULL END as potential_variance")
            ->selectRaw("CASE WHEN tracking_status IN ('IN_TRANSIT','EXCEPTION','DELIVERED') AND native_sla_grade <> 'UNKNOWN' THEN m_source_sla ELSE NULL END as sla_variance");
        $classification = "CASE WHEN tracking_status = 'CANCELLED' THEN 'EXCLUDED' WHEN tracking_status = 'RETURNED' THEN 'RETURN' WHEN native_sla_grade = 'UNKNOWN' THEN 'UNKNOWN' WHEN tracking_status = 'DELIVERED' THEN CASE WHEN native_sla_grade = 'OVER_SLA' THEN 'DELIVERED_LATE' ELSE 'DELIVERED_ON_TIME' END WHEN tracking_status IN ('IN_TRANSIT','EXCEPTION') THEN native_sla_grade ELSE 'UNKNOWN' END";

        return DB::query()->fromSub($evaluated, 'evaluated')->select('evaluated.*')->selectRaw("$classification as sla_status");
    }

    /** @param literal-string $key
     * @return literal-string
     */
    private function numberExpression(string $key, bool $signed): string
    {
        $value = $this->sourceText($key);
        if (DB::getDriverName() === 'sqlite') {
            $digits = $signed ? "CASE WHEN substr($value, 1, 1) = '-' THEN substr($value, 2) ELSE $value END" : $value;
            $valid = "length($digits) BETWEEN 1 AND 6 AND ($digits) NOT GLOB '*[^0-9]*'";
        } else {
            $pattern = $signed ? '^-?[0-9]{1,6}$' : '^[0-9]{1,6}$';
            $valid = "$value REGEXP '$pattern'";
        }

        return "CASE WHEN $valid THEN CAST($value AS ".(DB::getDriverName() === 'sqlite' ? 'INTEGER' : 'SIGNED').') ELSE NULL END';
    }

    /** @param literal-string $value
     * @return literal-string
     */
    private function sourceText(string $value): string
    {
        return "CASE WHEN substr($value, 1, 2) = '=\"' AND substr($value, -1) = '\"' THEN TRIM(substr($value, 3, length($value) - 3)) ELSE $value END";
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function summary(array $filters): array
    {
        $hours = empty($filters['freshness_hours']) ? null : (int) $filters['freshness_hours'];
        $active = "tracking_status IN ('IN_TRANSIT','EXCEPTION')";
        $stale = $hours === null ? '1 = 0' : "$active and last_observed_at < ?";
        $cutoff = $hours === null ? [] : [now()->subHours($hours)];
        $query = $this->handle($filters)->toBase()->selectRaw('count(*) as total, max(last_observed_at) as observed_at')
            ->selectRaw("count(case when $active then 1 end) as active")
            ->selectRaw('count(case when customer_id is null then 1 end) as unlinked')
            ->selectRaw('count(case when last_observed_at is null then 1 end) as unobserved')
            ->selectRaw("count(case when $active and last_observed_at is null then 1 end) as source_missing")
            ->selectRaw("count(case when $stale then 1 end) as stale", $cutoff)
            ->selectRaw('count(case when '.self::attentionExpression().' then 1 end) as attention');
        $query->selectRaw('count(case when potential_overdue = 1 then 1 end) as potential_overdue');
        foreach (JneShipment::NATIVE_SLA_GRADES as $grade) {
            $query->selectRaw('count(case when native_sla_grade = ? then 1 end) as native_'.strtolower($grade), [$grade]);
        }
        foreach (JneShipment::SLA_STATUSES as $status) {
            $query->selectRaw('count(case when sla_status = ? then 1 end) as sla_'.strtolower($status), [$status]);
        }
        foreach (JneShipment::STATUSES as $status) {
            $query->selectRaw('count(case when tracking_status = ? then 1 end) as '.strtolower($status), [$status]);
        }
        $result = (array) $query->first();
        $distribution = [];
        foreach (JneShipment::STATUSES as $status) {
            $distribution[$status] = (int) $result[strtolower($status)];
        }
        $slaDistribution = [];
        foreach (JneShipment::SLA_STATUSES as $status) {
            $slaDistribution[$status] = (int) $result['sla_'.strtolower($status)];
        }
        $evaluatedDelivered = $slaDistribution['DELIVERED_ON_TIME'] + $slaDistribution['DELIVERED_LATE'];

        return [
            'total' => (int) $result['total'], 'active' => (int) $result['active'],
            'calculated_at' => now()->toIso8601String(),
            'delivered' => $distribution['DELIVERED'], 'cancelled' => $distribution['CANCELLED'],
            'unknown' => $distribution['UNKNOWN'], 'exception' => $distribution['EXCEPTION'], 'failed_final' => null,
            'stale' => $hours === null ? null : (int) $result['stale'], 'unobserved' => (int) $result['unobserved'],
            'source_missing' => (int) $result['source_missing'], 'unlinked' => (int) $result['unlinked'],
            'attention' => (int) $result['attention'], 'distribution' => $distribution,
            'over_sla' => $slaDistribution['OVER_SLA'], 'potential_overdue' => (int) $result['potential_overdue'], 'returned' => $distribution['RETURNED'],
            'native_sla_distribution' => array_combine(JneShipment::NATIVE_SLA_GRADES, array_map(fn (string $grade): int => (int) $result['native_'.strtolower($grade)], JneShipment::NATIVE_SLA_GRADES)),
            'sla_distribution' => $slaDistribution,
            'on_time_rate' => $evaluatedDelivered === 0 ? null : round(100 * $slaDistribution['DELIVERED_ON_TIME'] / $evaluatedDelivered, 1),
            'delivered_evaluated' => $evaluatedDelivered, 'delivered_unknown' => $distribution['DELIVERED'] - $evaluatedDelivered,
            'excluded' => $distribution['CANCELLED'] + $distribution['RETURNED'],
            'observed_at' => $result['observed_at'] ? CarbonImmutable::parse($result['observed_at'], 'UTC')->toIso8601String() : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @param  Builder<JneShipment>|null  $scope
     * @return Builder<JneShipment>
     */
    public function listing(array $filters, ?Builder $scope = null): Builder
    {
        $query = ($scope === null ? $this->handle($filters) : JneShipment::query()->fromSub($this->population($scope), 'jne_shipments'))->select(['id', 'awb', 'customer_account', 'tracking_status', 'customer_match_status', 'customer_id', 'pickup_task_id', 'latest_report_awb_id', 'latest_report_job_id', 'last_observed_at', 'm_service', 'm_destination', 'm_aging', 'm_ongoing', 'm_etd', 'm_source_sla', 'm_carrer', 'native_sla_grade', 'potential_overdue', 'potential_variance', 'sla_status', 'sla_variance'])
            ->with(['latestSource:id,shipper_name,status_web,status_pod,source_status_at,entry_at', 'customer:id,name,customer_code', 'pickup:id,reference'])
            ->withMax('observations as last_report_received_at', 'created_at');
        if (! empty($filters['attention'])) {
            $query->orderByRaw("CASE WHEN sla_status = 'OVER_SLA' THEN 0 WHEN tracking_status = 'EXCEPTION' THEN 1 WHEN potential_overdue = 1 THEN 2 WHEN tracking_status = 'RETURNED' THEN 3 ELSE 4 END")
                ->orderByDesc('sla_variance')->orderByDesc('potential_variance')->orderBy('m_entry_at')->orderBy('id');
        } else {
            $query->orderByDesc('last_observed_at')->orderByDesc('id');
        }

        return $query;
    }

    /** @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    public function cachedSummary(array $filters, bool $refresh = false): array
    {
        $filters = Arr::except($filters, ['page', 'per_page', 'history', 'back', 'return_page']);
        $identity = [];
        foreach ($filters as $field => $value) {
            if (($value === null || $value === '') && ! in_array($field, ['outlet', 'source_code', 'source_reason', 'source_service', 'source_web', 'source_pod'], true)) {
                continue;
            }
            $identity[$field] = (string) ($value ?? '');
        }
        ksort($identity);
        $connection = DB::connection();
        $key = 'shipment-monitoring:summary:v1:'.hash('sha256', json_encode([$connection->getName(), $connection->getDatabaseName(), $identity], JSON_THROW_ON_ERROR));
        $seconds = (int) config('jne-reports.monitoring_summary_cache_seconds', 15);
        if ($seconds <= 0) {
            return $this->summary($filters);
        }
        $cache = Cache::store(config('jne-reports.monitoring_cache_store'));
        if ($refresh) {
            $result = $this->summary($filters);
            $cache->put($key, $result, $seconds);

            return $result;
        }

        return $cache->remember($key, $seconds, fn (): array => $this->summary($filters));
    }

    /**
     * Evaluate SLA only for the visible page when no filter depends on SLA.
     *
     * @param  array<string, mixed>  $filters
     * @return LengthAwarePaginator<int, JneShipment>
     */
    public function paginate(array $filters, int $perPage, int $page): LengthAwarePaginator
    {
        if (array_filter(Arr::only($filters, ['attention', 'sla_status', 'native_sla_grade', 'overdue_min', 'overdue_max']), fn (mixed $value): bool => $value !== null && $value !== '') !== []) {
            return $this->listing($filters)->paginate($perPage, page: $page);
        }
        $scope = $this->scope($filters);
        $total = (clone $scope)->count();
        $scope->orderByDesc('last_observed_at')->orderByDesc('id')->forPage($page, $perPage);
        $rows = $total > 0 ? $this->listing($filters, $scope)->get() : (new JneShipment)->newCollection();

        return new LengthAwarePaginator($rows, $total, $perPage, $page, ['path' => LengthAwarePaginator::resolveCurrentPath()]);
    }

    /** @return array<string, mixed> */
    public function row(JneShipment $shipment, ?int $freshnessHours): array
    {
        $terminal = in_array($shipment->tracking_status, JneShipment::TRACKING_TERMINAL_STATUSES, true);
        if ($terminal) {
            $freshness = 'terminal';
        } elseif ($shipment->last_observed_at === null) {
            $freshness = 'unobserved';
        } elseif ($freshnessHours === null) {
            $freshness = 'unconfigured';
        } else {
            $freshness = $shipment->last_observed_at->lessThan(now()->subHours($freshnessHours)) ? 'stale' : 'fresh';
        }

        return [
            ...$shipment->only(['id', 'awb', 'customer_account', 'tracking_status', 'customer_match_status']),
            'customer' => $shipment->customer?->only(['id', 'name', 'customer_code']),
            'shipper_name' => $shipment->latestSource?->shipper_name,
            'pickup_reference' => $shipment->pickup?->reference,
            'status_web' => $shipment->latestSource?->status_web,
            'status_pod' => $shipment->latestSource?->status_pod,
            'entry_at' => $shipment->latestSource?->entry_at?->toIso8601String(),
            'source_status_at' => $shipment->latestSource?->source_status_at?->toIso8601String(),
            'observed_at' => $shipment->last_observed_at?->toIso8601String(),
            'received_at' => $shipment->last_report_received_at?->toIso8601String(),
            'terminal' => $terminal,
            'freshness' => $freshness,
            'source_report_id' => $shipment->latest_report_job_id,
            'service' => $shipment->getAttribute('m_service'),
            'destination' => $shipment->getAttribute('m_destination'),
            'aging_days' => $shipment->getAttribute('m_aging'),
            'ongoing_days' => $shipment->getAttribute('m_ongoing'),
            'etd_days' => $shipment->getAttribute('m_etd'),
            'sla_status' => $shipment->getAttribute('sla_status') ?? 'UNKNOWN',
            'native_sla_grade' => $shipment->getAttribute('native_sla_grade') ?? 'UNKNOWN',
            'potential_overdue' => (bool) $shipment->getAttribute('potential_overdue'),
            'potential_variance' => $shipment->getAttribute('potential_variance'),
            'potential_reason' => $shipment->getAttribute('potential_overdue') ? 'AGING_ONGOING melebihi ETD sumber; satuan layanan dan kalender belum memastikan keterlambatan aktual.' : null,
            'sla_variance' => $shipment->getAttribute('sla_variance'),
            'source_sla' => $shipment->getAttribute('m_source_sla'),
            'source_carrer' => $shipment->getAttribute('m_carrer'),
            'sla_reason' => $this->slaReason($shipment),
        ];
    }

    private function slaReason(JneShipment $shipment): ?string
    {
        if ($shipment->getAttribute('native_sla_grade') !== 'UNKNOWN') {
            return null;
        }

        return 'CARRER atau SLA sumber hilang, tidak dikenal, atau tanda nilainya bertentangan.';
    }

    /** @return list<array{label: string, field: string, at: string}> */
    public function journey(JneReportAwb $source, string $trackingStatus): array
    {
        $events = [];
        $fields = ['OUTBOUND_MANIFEST_DATE' => 'Manifest outbound', 'INBOUND_MANIFEST_DATE' => 'Manifest inbound',
            'TRANSIT_MANIFEST_DATE' => 'Manifest transit', 'HVO_DATE' => 'HVO sumber', 'DATE_RUNSHEET' => 'Runsheet pengantaran',
            'DATE_1ST_ATTEMPT' => 'Percobaan antar pertama', 'DATE_2ND_ATTEMPT' => 'Percobaan antar kedua'];
        if ($trackingStatus === 'DELIVERED') {
            $fields['TGL_RECEIVED'] = 'Diterima';
        }
        foreach ($fields as $key => $label) {
            $value = $source->raw_data[$key] ?? null;
            if (! is_string($value) || trim($value) === '') {
                continue;
            }
            $value = trim($value);
            if (preg_match('/^="([^"]*)"$/D', $value, $matches)) {
                $value = trim($matches[1]);
            }
            foreach (['d-M-Y H:i', 'd-M-Y H:i:s', 'Y-m-d H:i:s', 'Y-m-d\TH:i:sP'] as $format) {
                try {
                    $at = CarbonImmutable::createFromFormat('!'.$format, $value, config('jne-reports.source_timezone'));
                    if ($at && strcasecmp($at->format($format), $value) === 0) {
                        $events[] = ['label' => $label, 'field' => $key, 'at' => $at->utc()->toIso8601String()];
                        break;
                    }
                } catch (Throwable) {
                    continue;
                }
            }
        }
        usort($events, fn (array $left, array $right): int => strcmp($left['at'], $right['at']));

        return $events;
    }
}

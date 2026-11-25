<?php

namespace App\Actions\Reports;

use App\Actions\Pickup\PickupResultPeriod;
use App\Models\JneShipment;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class QueryOperationalPerformance
{
    public function __construct(private QueryShipmentMonitoring $monitoring) {}

    /** @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    public function handle(array $filters): array
    {
        $from = PickupResultPeriod::start($filters['date_from']);
        $until = PickupResultPeriod::start($filters['date_thru'])->addDay();
        $customerId = "CASE WHEN jne_shipments.customer_match_status = 'MATCHED' THEN jne_shipments.customer_id ELSE NULL END";
        $day = DB::getDriverName() === 'sqlite' ? "DATE(a.entry_at, '+2 hours')" : 'DATE(DATE_ADD(a.entry_at, INTERVAL 2 HOUR))';
        $population = $this->scope(array_diff_key($filters, ['outlet' => true]))
            ->where('a.entry_at', '>=', $from->utc())->where('a.entry_at', '<', $until->utc())
            ->leftJoin('customers as c', 'c.id', '=', DB::raw($customerId))
            ->select(['jne_shipments.id', 'jne_shipments.awb', 'jne_shipments.tracking_status', 'jne_shipments.customer_match_status', 'jne_shipments.last_observed_at', 'c.name as customer_name'])
            ->selectRaw("$customerId as customer_id, $day as day")
            ->selectRaw(self::rawText('ZONE_USER_ENTRI').' as outlet')
            ->selectRaw(self::rawText('IREG_CODE').' as code')
            ->selectRaw(self::rawText('RECEIVED/REASON').' as description')
            ->selectRaw("COALESCE(NULLIF(TRIM(a.service), ''), 'Belum tersedia') as service, NULLIF(TRIM(a.status_web), '') as status_web, NULLIF(TRIM(a.status_pod), '') as status_pod")
            ->selectRaw('CASE WHEN '.$this->attentionExpression().' THEN 1 ELSE 0 END as needs_attention');
        $cohort = DB::query()->from('population as p');
        if (isset($filters['outlet']) && $filters['outlet'] !== '') {
            $cohort->where('p.outlet', $filters['outlet']);
        }
        $page = (int) ($filters['customer_page'] ?? 1);
        $counts = $this->countExpressions();
        $query = $this->payload(clone $cohort, 'summary', [...$counts, 'observed_at' => 'MAX(p.last_observed_at)', 'customer_groups' => "COUNT(DISTINCT COALESCE(CAST(p.customer_id AS CHAR), 'unresolved'))"]);
        $query->unionAll($this->payload(clone $cohort, 'customers', [...$counts, 'customer_id' => 'p.customer_id', 'customer_name' => 'p.customer_name'])
            ->groupBy('p.customer_id', 'p.customer_name')->orderByRaw('COUNT(*) DESC')->orderBy('p.customer_id')->limit(15)->offset(($page - 1) * 15));
        foreach (['services' => 'service', 'outlets' => 'outlet', 'daily' => 'day'] as $kind => $column) {
            $branch = $this->payload(clone $cohort, $kind, [...$counts, $kind === 'daily' ? 'date' : 'label' => 'p.'.$column])->groupBy('p.'.$column);
            if ($kind === 'daily') {
                $branch->orderBy('p.day')->limit(92);
            } else {
                $branch->orderByRaw('COUNT(*) DESC')->orderBy('p.'.$column)->limit(21);
            }
            $query->unionAll($branch);
        }
        foreach (['exceptions' => 'EXCEPTION', 'returns' => 'RETURNED'] as $kind => $status) {
            $query->unionAll($this->payload((clone $cohort)->where('p.tracking_status', $status), $kind,
                ['total' => 'COUNT(*)', 'code' => 'p.code', 'description' => 'p.description', 'status_web' => 'p.status_web', 'status_pod' => 'p.status_pod'])
                ->groupBy('p.code', 'p.description', 'p.status_web', 'p.status_pod')->orderByRaw('COUNT(*) DESC')
                ->orderBy('p.code')->orderBy('p.description')->orderBy('p.status_web')->orderBy('p.status_pod')->limit(16));
        }
        $query->unionAll($this->payload((clone $cohort)->where('p.needs_attention', 1), 'attention', [
            'id' => 'p.id', 'awb' => 'p.awb', 'tracking_status' => 'p.tracking_status', 'customer_match_status' => 'p.customer_match_status',
            'customer_name' => 'p.customer_name', 'status_web' => 'p.status_web', 'status_pod' => 'p.status_pod',
            'note' => 'NULL', 'responsible_party' => 'NULL', 'last_follow_up_at' => 'NULL', 'follow_up_state' => 'NULL',
        ])->orderBy('p.last_observed_at')->orderBy('p.id')->limit(10));
        $query->unionAll($this->payload(DB::query()->from('population as p')->whereNotNull('p.outlet'), 'outlet_options', ['label' => 'p.outlet'])
            ->groupBy('p.outlet')->orderBy('p.outlet')->limit(101));

        /** @var array<string, list<array<string, mixed>>> $groups */
        $groups = [];
        $rows = DB::select('WITH population AS ('.$population->toSql().') '.$query->toSql(), [...$population->getBindings(), ...$query->getBindings()]);
        foreach ($rows as $row) {
            $data = array_intersect_key((array) $row, array_flip(explode(',', $row->fields)));
            foreach (['total', 'delivered', 'active', 'returned', 'exceptions', 'unknown', 'unlinked', 'attention', 'customer_groups', 'customer_id', 'id'] as $key) {
                if (isset($data[$key])) {
                    $data[$key] = (int) $data[$key];
                }
            }
            $groups[$row->kind][] = $data;
        }
        $summary = $groups['summary'][0];
        $summary['observed_at'] = $summary['observed_at'] ? CarbonImmutable::parse($summary['observed_at'], 'UTC')->toIso8601String() : null;
        foreach (['on_sla', 'over_sla', 'on_time_success_rate', 'unrcc'] as $unavailable) {
            $summary[$unavailable] = null;
        }
        $summary['undated'] = $this->scope($filters)->whereNull('a.entry_at')->count();
        $daily = collect($groups['daily'] ?? [])->keyBy('date');
        $days = [];
        for ($date = $from->startOfDay(); $date->lessThan($until->startOfDay()); $date = $date->addDay()) {
            $days[] = $daily->get($date->toDateString()) ?? ['date' => $date->toDateString(), ...array_fill_keys(array_keys($counts), 0)];
        }

        return [
            'summary' => $summary,
            'customers' => ['data' => $groups['customers'] ?? [], 'current_page' => $page, 'last_page' => max(1, (int) ceil($summary['customer_groups'] / 15)), 'total' => $summary['customer_groups']],
            'services' => array_slice($groups['services'] ?? [], 0, 20), 'services_truncated' => count($groups['services'] ?? []) > 20,
            'outlets' => array_slice($groups['outlets'] ?? [], 0, 20), 'outlets_truncated' => count($groups['outlets'] ?? []) > 20,
            'outlet_options' => array_column(array_slice($groups['outlet_options'] ?? [], 0, 100), 'label'), 'outlet_options_truncated' => count($groups['outlet_options'] ?? []) > 100,
            'daily' => $days,
            'exceptions' => ['rows' => array_slice($groups['exceptions'] ?? [], 0, 15), 'truncated' => count($groups['exceptions'] ?? []) > 15],
            'returns' => ['rows' => array_slice($groups['returns'] ?? [], 0, 15), 'truncated' => count($groups['returns'] ?? []) > 15],
            'attention' => $groups['attention'] ?? [],
            'limitations' => [
                'sla' => 'Evaluasi SLA harian tersedia di Monitoring Resi berdasarkan snapshot sumber. Cutoff layanan YES belum terverifikasi.',
                'unrcc' => 'Kategori UNRCC belum tersedia. Exception tracking ditampilkan terpisah dan tidak dianggap UNRCC.',
                'returns' => 'Hanya status RETURNED dari proyeksi tracking. Kode dan keterangan sumber dipertahankan; alasan yang kosong tidak ditebak.',
                'follow_up' => 'Daftar baca saja untuk AWB yang perlu ditinjau. Catatan, penanggung jawab, dan status follow-up manual belum tersedia.',
                'outlet' => 'Outlet mengikuti label sumber terbaru. Baris tanpa outlet tetap disertakan pada Semua outlet.',
            ],
        ];
    }

    /** @param array<string, mixed> $filters */
    private function scope(array $filters): Builder
    {
        $query = $this->monitoring->handle([])->toBase()->leftJoin('jne_report_awbs as a', 'a.id', '=', 'jne_shipments.latest_report_awb_id');
        if (! empty($filters['customer_id'])) {
            $query->where('jne_shipments.customer_id', $filters['customer_id'])->where('jne_shipments.customer_match_status', 'MATCHED');
        }
        if (isset($filters['outlet']) && $filters['outlet'] !== '') {
            $query->whereRaw(self::rawText('ZONE_USER_ENTRI').' = ?', [$filters['outlet']]);
        }

        return $query;
    }

    /** @return literal-string */
    private function attentionExpression(): string
    {
        return QueryShipmentMonitoring::attentionExpression('jne_shipments.');
    }

    /** @return array<literal-string, literal-string> */
    private function countExpressions(): array
    {
        $terminal = "'".implode("','", JneShipment::TRACKING_TERMINAL_STATUSES)."'";

        return [
            'total' => 'COUNT(*)',
            'delivered' => "COUNT(CASE WHEN p.tracking_status = 'DELIVERED' THEN 1 END)",
            'active' => "COUNT(CASE WHEN p.tracking_status NOT IN ($terminal) THEN 1 END)",
            'returned' => "COUNT(CASE WHEN p.tracking_status = 'RETURNED' THEN 1 END)",
            'exceptions' => "COUNT(CASE WHEN p.tracking_status = 'EXCEPTION' THEN 1 END)",
            'unknown' => "COUNT(CASE WHEN p.tracking_status = 'UNKNOWN' THEN 1 END)",
            'unlinked' => 'COUNT(CASE WHEN p.customer_id IS NULL THEN 1 END)',
            'attention' => 'COUNT(CASE WHEN p.needs_attention = 1 THEN 1 END)',
        ];
    }

    /** @param array<literal-string, literal-string> $fields */
    private function payload(Builder $query, string $kind, array $fields): Builder
    {
        $query->selectRaw('/*+ NO_MERGE(p) */ ? as kind, ? as fields', [$kind, implode(',', array_keys($fields))]);
        foreach (['total', 'delivered', 'active', 'returned', 'exceptions', 'unknown', 'unlinked', 'attention', 'observed_at', 'customer_groups', 'customer_id', 'customer_name', 'label', 'date', 'code', 'description', 'status_web', 'status_pod', 'id', 'awb', 'tracking_status', 'customer_match_status', 'note', 'responsible_party', 'last_follow_up_at', 'follow_up_state'] as $key) {
            $quote = DB::getDriverName() === 'sqlite' ? '"' : '`';
            $query->selectRaw(($fields[$key] ?? 'NULL').' as '.$quote.$key.$quote);
        }

        return $query;
    }

    /**
     * @param  literal-string  $key
     * @param  literal-string  $table
     * @return literal-string
     */
    public static function rawText(string $key, string $table = 'a'): string
    {
        $path = '$."'.$key.'"';
        $value = DB::getDriverName() === 'sqlite' ? "json_extract($table.raw_data, '$path')" : "JSON_UNQUOTE(JSON_EXTRACT($table.raw_data, '$path'))";

        return "NULLIF(NULLIF(TRIM($value), ''), 'null')";
    }
}

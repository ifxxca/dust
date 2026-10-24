<?php

namespace App\Actions\Pickup;

use App\Actions\Reports\ResolveJneDestinationNames;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class QueryOperationalDashboard
{
    public function __construct(private QueryPickupResults $results, private ResolveJneDestinationNames $destinations) {}

    /**
     * @return array<string, mixed>
     */
    public function handle(CarbonImmutable $from, CarbonImmutable $thru, bool $includeShipments): array
    {
        $query = $this->period($from, $thru);
        $current = $this->summary($query);
        $previousFrom = $from->subDays((int) $from->diffInDays($thru) + 1);
        $previous = $this->summary($this->period($previousFrom, $from->subDay()));
        $changes = [];
        foreach (['tasks', 'packages', 'customers', 'attention'] as $key) {
            $changes[$key] = $previous[$key] > 0 ? round(($current[$key] - $previous[$key]) / $previous[$key] * 100, 1) : null;
        }
        $summary = [...$current, 'previous' => $previous, 'changes' => $changes, 'completion_rate' => $current['tasks'] > 0 ? round($current['picked_up'] / $current['tasks'] * 100, 1) : null];
        $offset = (int) $from->utcOffset() - PickupResultPeriod::START_HOUR * 60;
        $sqlite = DB::getDriverName() === 'sqlite';
        $day = $sqlite ? 'DATE(r.period_at, ?)' : 'DATE(DATE_ADD(r.period_at, INTERVAL ? MINUTE))';
        $dailyRows = (clone $query)->selectRaw($day.' as day, COUNT(*) as tasks, COUNT(DISTINCT r.customer_id) as customers, SUM(CASE WHEN r.finalized_at IS NOT NULL THEN r.manual_hybrid + r.cashless_hybrid + r.css_orion ELSE 0 END) as packages', [$sqlite ? "{$offset} minutes" : $offset])->groupBy('day')->orderBy('day')->get()->keyBy('day');
        $daily = [];
        for ($date = $from; $date->lessThanOrEqualTo($thru); $date = $date->addDay()) {
            $row = $dailyRows->get($date->toDateString());
            $daily[] = ['date' => $date->toDateString(), 'tasks' => (int) ($row->tasks ?? 0), 'packages' => (int) ($row->packages ?? 0), 'customers' => (int) ($row->customers ?? 0)];
        }
        $statuses = (clone $query)->selectRaw('r.task_status as group_key, COUNT(*) as total')->groupBy('r.task_status')->orderByDesc('total')->get()->map(fn ($row): array => ['key' => $row->group_key, 'value' => (int) $row->total])->all();
        $types = (clone $query)->join('pickup_tasks as task', 'task.id', '=', 'r.id')->selectRaw('task.pickup_type as group_key, COUNT(*) as total')->groupBy('task.pickup_type')->orderByDesc('total')->get()->map(fn ($row): array => ['key' => $row->group_key, 'value' => (int) $row->total])->all();
        $categoryCounts = (clone $query)->whereNotNull('r.finalized_at')->selectRaw('SUM(r.manual_hybrid) as manual_hybrid, SUM(r.cashless_hybrid) as cashless_hybrid, SUM(r.css_orion) as css_orion')->first();
        $categories = [];
        foreach (['manual_hybrid' => 'Manual Hybrid', 'cashless_hybrid' => 'Cashless Hybrid', 'css_orion' => 'CSS/Orion'] as $key => $label) {
            $categories[] = ['key' => $key, 'label' => $label, 'value' => (int) ($categoryCounts->{$key} ?? 0)];
        }
        $team = (clone $query)->whereNotNull('r.staff_id')->selectRaw("r.staff_id as id, r.staff_name as name, COUNT(*) as tasks, SUM(CASE WHEN r.task_status = 'PICKED_UP' AND r.finalized_at IS NOT NULL THEN 1 ELSE 0 END) as picked_up, SUM(CASE WHEN r.finalized_at IS NOT NULL THEN r.manual_hybrid + r.cashless_hybrid + r.css_orion ELSE 0 END) as packages")
            ->groupBy('r.staff_id', 'r.staff_name')->orderByDesc('tasks')->orderBy('r.staff_id')->limit(6)->get()->map(fn ($row): array => ['id' => $row->id, 'name' => $row->name, 'tasks' => (int) $row->tasks, 'picked_up' => (int) $row->picked_up, 'packages' => (int) $row->packages, 'rate' => round((int) $row->picked_up / (int) $row->tasks * 100, 1)])->all();
        $customers = (clone $query)->selectRaw('r.customer_id as id, MAX(COALESCE(r.customer_label, r.customer_name)) as name, COUNT(*) as tasks, SUM(CASE WHEN r.finalized_at IS NOT NULL THEN r.manual_hybrid + r.cashless_hybrid + r.css_orion ELSE 0 END) as packages')
            ->groupBy('r.customer_id')->orderByDesc('packages')->orderByDesc('tasks')->orderBy('r.customer_id')->limit(5)->get()->map(fn ($row): array => ['id' => $row->id, 'name' => $row->name, 'tasks' => (int) $row->tasks, 'packages' => (int) $row->packages])->all();
        $returning = (clone $query)->whereExists(fn (Builder $history) => $history->selectRaw('1')->from('pickup_tasks as history')->whereColumn('history.customer_id', 'r.customer_id')->where('history.scheduled_at', '<', PickupResultPeriod::start($from->toDateString())->utc()->format('Y-m-d H:i:s')))->distinct()->count('r.customer_id');
        $recent = (clone $query)->orderByDesc('r.period_at')->orderByDesc('r.id')->limit(8)->get(['r.id', 'r.reference', 'r.customer_name', 'r.staff_name', 'r.task_status', 'r.period_at', 'r.manual_hybrid', 'r.cashless_hybrid', 'r.css_orion', 'r.finalized_at'])->map(fn ($row): array => [
            'id' => $row->id, 'reference' => $row->reference, 'customer_name' => $row->customer_name, 'staff_name' => $row->staff_name, 'status' => $row->task_status,
            'at' => CarbonImmutable::parse($row->period_at, 'UTC')->toIso8601String(), 'packages' => $row->finalized_at ? (int) $row->manual_hybrid + (int) $row->cashless_hybrid + (int) $row->css_orion : null,
        ])->all();
        $attention = (clone $query)->whereRaw($this->attentionCondition())->orderBy('r.period_at')->orderBy('r.id')->limit(6)->get(['r.id', 'r.reference', 'r.customer_name', 'r.task_status', 'r.needs_review', 'r.verification_status', 'r.finalized_at', 'r.session_id'])
            ->map(fn ($row): array => ['id' => $row->id, 'reference' => $row->reference, 'customer_name' => $row->customer_name, 'reason' => (int) $row->needs_review === 1 ? 'Verifikasi perlu diulang' : ($row->verification_status === 'DISCREPANCY' ? 'Selisih penerimaan' : ($row->task_status === 'SCHEDULED' ? 'Belum ditugaskan' : (! $row->finalized_at ? 'Bukti pickup belum final' : ($row->session_id === null ? 'Menunggu handover' : 'Menunggu verifikasi'))))])->all();

        return ['filters' => ['date_from' => $from->toDateString(), 'date_thru' => $thru->toDateString()], 'previousPeriod' => ['date_from' => $previousFrom->toDateString(), 'date_thru' => $from->subDay()->toDateString()],
            'summary' => $summary, 'daily' => $daily, 'statuses' => $statuses, 'types' => $types, 'categories' => $categories, 'team' => $team, 'customers' => $customers,
            'customerCohorts' => ['new' => $current['customers'] - $returning, 'returning' => $returning], 'recent' => $recent, 'attention' => $attention,
            'tracking' => $includeShipments ? $this->tracking($from, $thru) : null, 'operational_date' => PickupResultPeriod::today()->toDateString(), 'observed_at' => CarbonImmutable::now()->toIso8601String()];
    }

    private function period(CarbonImmutable $from, CarbonImmutable $thru): Builder
    {
        return DB::query()->fromSub($this->results->handle(['date_from' => $from->toDateString(), 'date_to' => $thru->toDateString()]), 'r');
    }

    /** @return literal-string */
    private function attentionCondition(): string
    {
        return "(r.needs_review = 1 OR r.verification_status = 'DISCREPANCY' OR r.task_status = 'SCHEDULED' OR (r.finalized_at IS NULL AND r.task_status NOT IN ('NO_PACKAGES','CANCELLED')) OR (r.finalized_at IS NOT NULL AND (r.session_id IS NULL OR r.verification_status = 'PENDING')))";
    }

    /** @return array<string, int> */
    private function summary(Builder $query): array
    {
        $row = (clone $query)->selectRaw("COUNT(*) as tasks, COUNT(DISTINCT r.customer_id) as customers, SUM(CASE WHEN r.finalized_at IS NOT NULL THEN r.manual_hybrid + r.cashless_hybrid + r.css_orion ELSE 0 END) as packages,
            SUM(CASE WHEN r.task_status = 'PICKED_UP' AND r.finalized_at IS NOT NULL THEN 1 ELSE 0 END) as picked_up,
            SUM(CASE WHEN r.task_status = 'NO_PACKAGES' THEN 1 ELSE 0 END) as no_packages,
            SUM(CASE WHEN r.task_status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
            SUM(CASE WHEN r.finalized_at IS NOT NULL AND r.session_id IS NULL THEN 1 ELSE 0 END) as waiting_handover,
            SUM(CASE WHEN r.verification_status = 'DISCREPANCY' THEN 1 ELSE 0 END) as discrepancies,
            SUM(CASE WHEN ".$this->attentionCondition().' THEN 1 ELSE 0 END) as attention')->first();

        return array_map(intval(...), (array) $row);
    }

    /** @return array<string, mixed> */
    private function tracking(CarbonImmutable $from, CarbonImmutable $thru): array
    {
        $query = DB::table('jne_shipments as s')->join('jne_report_awbs as a', 'a.id', '=', 's.latest_report_awb_id')->where('a.entry_at', '>=', $from->utc()->format('Y-m-d H:i:s'))->where('a.entry_at', '<', $thru->addDay()->utc()->format('Y-m-d H:i:s'));
        $statuses = (clone $query)->selectRaw('s.tracking_status as group_key, COUNT(*) as total')->groupBy('s.tracking_status')->orderByDesc('total')->get()->map(fn ($row): array => ['key' => $row->group_key, 'value' => (int) $row->total])->all();
        $names = $this->destinations->handle();
        $destinations = (clone $query)->selectRaw('a.destination as code, COUNT(*) as value')->groupBy('a.destination')->orderByDesc('value')->orderBy('a.destination')->limit(5)->get()->map(fn ($row): array => ['code' => $row->code, 'name' => $names[$row->code]['name'] ?? 'Nama daerah belum tersedia', 'value' => (int) $row->value])->all();
        $observedAt = (clone $query)->max('s.last_observed_at');

        return ['statuses' => $statuses, 'destinations' => $destinations, 'observed_at' => $observedAt ? CarbonImmutable::parse($observedAt, 'UTC')->toIso8601String() : null];
    }
}

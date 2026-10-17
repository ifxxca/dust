<?php

namespace App\Http\Controllers;

use App\Models\HandoverItem;
use App\Models\HandoverSession;
use App\Models\PickupTask;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class OperationalDashboardController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $user = $request->user();
        $timezone = config('pickup.timezone');
        $day = CarbonImmutable::now($timezone)->startOfDay();
        $tasks = PickupTask::query();
        if (! $user->canManagePickup()) {
            $tasks->where('assigned_staff_id', $user->id);
        }
        $today = (clone $tasks)->where('scheduled_at', '>=', $day->utc())->where('scheduled_at', '<', $day->addDay()->utc());
        $stats = [
            'today' => (clone $today)->count(),
            'waiting' => (clone $tasks)->where('status', 'SCHEDULED')->count(),
            'assigned_today' => (clone $today)->where('status', 'ASSIGNED')->count(),
            'picked_up_today' => (clone $today)->where('status', 'PICKED_UP')->count(),
            'no_packages_today' => (clone $today)->where('status', 'NO_PACKAGES')->count(),
        ];
        $trendMetrics = ['today' => null, 'waiting' => 'SCHEDULED', 'assigned_today' => 'ASSIGNED', 'picked_up_today' => 'PICKED_UP'];
        $trendQuery = (clone $tasks)->where('scheduled_at', '>=', $day->subDays(6)->utc())->where('scheduled_at', '<', $day->addDay()->utc())->toBase()->select([]);
        for ($index = 0; $index < 7; $index++) {
            $start = $day->subDays(6 - $index);
            foreach ($trendMetrics as $metric => $status) {
                $bindings = [$start->utc(), $start->addDay()->utc()];
                if ($status !== null) {
                    $bindings[] = $status;
                }
                $trendQuery->selectRaw('COUNT(CASE WHEN scheduled_at >= ? AND scheduled_at < ?'.($status === null ? '' : ' AND status = ?').' THEN 1 END) AS '.$metric.'_'.$index, $bindings);
            }
        }
        $trendCounts = $trendQuery->first();
        $trends = [];
        foreach ($trendMetrics as $metric => $status) {
            $trends[$metric] = [];
            for ($index = 0; $index < 7; $index++) {
                $trends[$metric][] = (int) ($trendCounts->{$metric.'_'.$index} ?? 0);
            }
        }
        $recent = (clone $tasks)->with('assignedStaff')->latest('id')->limit(8)->get();
        $attention = (clone $tasks)->with('assignedStaff')->where('status', 'SCHEDULED')->orderBy('scheduled_at')->limit(8)->get();
        $next = (clone $tasks)->with('assignedStaff')->where('status', 'ASSIGNED')->where(fn ($query) => $query->whereNull('execution_started_at')->orWhereDoesntHave('latestVisit', fn ($visit) => $visit->where('outcome', 'NO_PACKAGES')))->orderBy('scheduled_at')->limit(8)->get();
        $serialize = fn ($task) => [
            'id' => $task->id, 'reference' => $task->reference, 'customer_name' => $task->customer_name_snapshot,
            'pickup_address' => $task->pickup_address, 'scheduled_at' => $task->scheduled_at->toIso8601String(),
            'staff_name' => $task->assignedStaff?->name, 'status' => $task->status,
        ];
        $retail = null;
        if ($user->canExecutePickup() && $user->role !== 'pickup_staff') {
            $retail = [
                'draft' => HandoverSession::where('status', 'DRAFT')->count(),
                'in_verification' => HandoverSession::where('status', 'IN_VERIFICATION')->count(),
                'pending_items' => HandoverItem::where('status', 'PENDING')->count(),
                'discrepancies' => HandoverItem::withStatus('DISCREPANCY')->count(),
                'sessions' => HandoverSession::withCount(['items', 'items as pending_count' => fn ($query) => $query->where('status', 'PENDING'), 'items as discrepancy_count' => fn ($query) => $query->withStatus('DISCREPANCY')])
                    ->orderByRaw('CASE WHEN status = ? THEN 1 ELSE 0 END', ['CLOSED'])->latest('id')->limit(8)->get()
                    ->map(fn ($session) => $session->only(['id', 'reference', 'status', 'items_count', 'pending_count', 'discrepancy_count', 'created_at'])),
            ];
        }

        return Inertia::render('dashboard', [
            'operationalDate' => $day->toDateString(), 'timezone' => $timezone, 'stats' => $stats, 'trends' => $trends,
            'recent' => $recent->map($serialize), 'attention' => $attention->map($serialize), 'nextTasks' => $next->map($serialize), 'retail' => $retail,
        ]);
    }
}

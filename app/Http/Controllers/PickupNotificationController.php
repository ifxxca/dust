<?php

namespace App\Http\Controllers;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\Query\JoinClause;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PickupNotificationController extends Controller
{
    private const ACTIONS = ['pickup_finalized'];

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->is_active && ($request->user()->canManagePickup() || $request->user()->canExecutePickup()), 403);
        $request->validate(['page' => ['sometimes', 'integer', 'min:1'], 'unread_only' => ['sometimes', 'boolean']]);
        $query = $this->events($request->user(), $request->routeIs('mobile.*'));
        $unreadCount = (clone $query)->whereNull('read_at')->count();
        if ($request->boolean('unread_only')) {
            $query->whereNull('read_at');
        }
        $events = $query->orderByDesc('occurred_at')->orderByDesc('id')->paginate(20);

        return response()->json([
            'data' => $events->getCollection()->map(fn (\stdClass $event): array => [
                'id' => (int) $event->id,
                'type' => $event->action,
                'title' => $event->batch_id === null ? 'Pickup selesai' : match ($event->batch_status) {
                    'FAILED' => 'Pemrosesan cashless gagal',
                    'PARTIAL' => 'Cashless selesai dengan pengecualian',
                    default => 'Cashless perlu diperiksa',
                },
                'task_id' => (int) $event->task_id,
                'reference' => $event->reference,
                'customer_name' => $event->customer_name_snapshot,
                'staff_name' => $event->staff_name,
                'occurred_at' => CarbonImmutable::parse($event->occurred_at, 'UTC')->toIso8601String(),
                'read' => $event->read_at !== null,
                ...($event->batch_id === null ? [] : ['batch_id' => (int) $event->batch_id,
                    'message' => $event->message ?? 'Ada resi yang belum berhasil diproses. Periksa hasil per resi pada batch.']),
            ]),
            'meta' => [
                'current_page' => $events->currentPage(),
                'last_page' => $events->lastPage(),
                'unread_count' => $unreadCount,
            ],
        ])->header('Cache-Control', 'no-store, private');
    }

    public function update(Request $request): JsonResponse
    {
        abort_unless($request->user()?->is_active && ($request->user()->canManagePickup() || $request->user()->canExecutePickup()), 403);
        abort_if($request->filled('event_ids') && (! $request->user()->canManagePickup() || $request->routeIs('mobile.*')), 403);
        $data = $request->validate([
            'event_ids' => ['required_without:cashless_alert_ids', 'array', 'min:1', 'max:20'],
            'event_ids.*' => ['required', 'integer', 'distinct', Rule::exists('pickup_task_events', 'id')->whereIn('action', self::ACTIONS)],
            'cashless_alert_ids' => ['required_without:event_ids', 'array', 'min:1', 'max:20'],
            'cashless_alert_ids.*' => ['required', 'integer', 'distinct', Rule::exists('cashless_entry_alerts', 'id')->where('user_id', $request->user()->id)],
        ]);
        $now = now();
        DB::table('pickup_notification_reads')->insertOrIgnore(array_map(fn (int $eventId): array => [
            'user_id' => $request->user()->id,
            'pickup_task_event_id' => $eventId,
            'read_at' => $now,
        ], $data['event_ids'] ?? []));
        DB::table('cashless_entry_alerts')->where('user_id', $request->user()->id)->whereIn('id', $data['cashless_alert_ids'] ?? [])
            ->whereNull('read_at')->update(['read_at' => $now]);

        return response()->json(['message' => 'Notifikasi ditandai sudah dibaca.']);
    }

    private function events(User $user, bool $mobile = false): Builder
    {
        $events = DB::table('pickup_task_events as events')
            ->join('pickup_tasks as tasks', 'tasks.id', '=', 'events.pickup_task_id')
            ->leftJoin('users as actors', 'actors.id', '=', 'events.actor_id')
            ->leftJoin('pickup_notification_reads as reads', function (JoinClause $join) use ($user): void {
                $join->on('reads.pickup_task_event_id', '=', 'events.id')->where('reads.user_id', $user->id);
            })
            ->whereIn('events.action', self::ACTIONS)
            ->whereRaw($user->canManagePickup() && ! $mobile ? '1 = 1' : '1 = 0')
            ->select(['events.id', 'events.action', 'events.occurred_at', 'tasks.id as task_id', 'tasks.reference',
                'tasks.customer_name_snapshot', 'actors.name as staff_name', 'reads.read_at'])
            ->selectRaw('NULL as batch_id, NULL as batch_status, NULL as message');
        $cashless = DB::table('cashless_entry_alerts as alerts')
            ->join('cashless_entry_batches as batches', 'batches.id', '=', 'alerts.batch_id')
            ->join('pickup_tasks as tasks', 'tasks.id', '=', 'batches.pickup_task_id')
            ->join('users as actors', 'actors.id', '=', 'alerts.user_id')
            ->where('alerts.user_id', $user->id)
            ->select(['alerts.id'])->selectRaw("'cashless_entry_attention' as action")
            ->addSelect(['alerts.created_at as occurred_at', 'tasks.id as task_id', 'tasks.reference',
                'tasks.customer_name_snapshot', 'actors.name as staff_name', 'alerts.read_at', 'batches.id as batch_id',
                'batches.status as batch_status', 'batches.error_message as message']);

        return DB::query()->fromSub($events->unionAll($cashless), 'notifications');
    }
}

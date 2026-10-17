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
        abort_unless($request->user()?->canManagePickup(), 403);
        $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);
        $query = $this->events($request->user());
        $unreadCount = (clone $query)->whereNull('reads.read_at')->count();
        $events = $query->select([
            'events.id', 'events.action', 'events.occurred_at',
            'tasks.id as task_id', 'tasks.reference', 'tasks.customer_name_snapshot',
            'actors.name as staff_name', 'reads.read_at',
        ])->orderByDesc('events.id')->paginate(20);

        return response()->json([
            'data' => $events->getCollection()->map(fn (\stdClass $event): array => [
                'id' => (int) $event->id,
                'type' => $event->action,
                'title' => 'Pickup selesai',
                'task_id' => (int) $event->task_id,
                'reference' => $event->reference,
                'customer_name' => $event->customer_name_snapshot,
                'staff_name' => $event->staff_name,
                'occurred_at' => CarbonImmutable::parse($event->occurred_at, 'UTC')->toIso8601String(),
                'read' => $event->read_at !== null,
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
        abort_unless($request->user()?->canManagePickup(), 403);
        $data = $request->validate([
            'event_ids' => ['required', 'array', 'min:1', 'max:20'],
            'event_ids.*' => ['required', 'integer', 'distinct', Rule::exists('pickup_task_events', 'id')->whereIn('action', self::ACTIONS)],
        ]);
        $now = now();
        DB::table('pickup_notification_reads')->insertOrIgnore(array_map(fn (int $eventId): array => [
            'user_id' => $request->user()->id,
            'pickup_task_event_id' => $eventId,
            'read_at' => $now,
        ], $data['event_ids']));

        return response()->json(['message' => 'Notifikasi ditandai sudah dibaca.']);
    }

    private function events(User $user): Builder
    {
        return DB::table('pickup_task_events as events')
            ->join('pickup_tasks as tasks', 'tasks.id', '=', 'events.pickup_task_id')
            ->leftJoin('users as actors', 'actors.id', '=', 'events.actor_id')
            ->leftJoin('pickup_notification_reads as reads', function (JoinClause $join) use ($user): void {
                $join->on('reads.pickup_task_event_id', '=', 'events.id')->where('reads.user_id', $user->id);
            })
            ->whereIn('events.action', self::ACTIONS);
    }
}

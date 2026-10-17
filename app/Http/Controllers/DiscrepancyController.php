<?php

namespace App\Http\Controllers;

use App\Models\HandoverItem;
use App\Models\HandoverSession;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\JoinClause;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DiscrepancyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->canExecutePickup(), 403);
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', Rule::in([10, 20, 50])],
            'view' => ['sometimes', Rule::in(['tasks', 'categories'])],
            'category' => ['nullable', Rule::in(['manual_hybrid', 'cashless_hybrid', 'css_orion'])],
            'staff_id' => ['nullable', 'integer', 'min:1'],
            'review_only' => ['sometimes', 'boolean'],
            'summary' => ['sometimes', 'boolean'],
            'session_status' => ['nullable', Rule::in(['DRAFT', 'IN_VERIFICATION', 'CLOSED'])],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d', Rule::when($request->filled('date_from'), 'after_or_equal:date_from')],
        ]);
        $query = HandoverItem::withStatus('DISCREPANCY')
            ->with(['proof.revisions', 'revisions', 'task.assignedStaff'])
            ->join('handover_sessions', 'handover_sessions.id', '=', 'handover_items.handover_session_id')
            ->select('handover_items.*', 'handover_sessions.reference as session_reference', 'handover_sessions.status as session_status', 'handover_sessions.created_at as session_created_at');
        $query->when($data['session_status'] ?? null, fn ($query, $status) => $query->where('handover_sessions.status', $status));
        $query->when($data['staff_id'] ?? null, fn ($query, $staff) => $query->whereHas('task', fn ($task) => $task->where('assigned_staff_id', $staff)));
        if (! empty($data['q'])) {
            $search = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $data['q']).'%';
            $sessionId = preg_match('/^HO-(\\d+)$/i', trim($data['q']), $matches) === 1 ? (int) $matches[1] : null;
            $taskId = preg_match('/^PCK-(\\d+)$/i', trim($data['q']), $matches) === 1 ? (int) $matches[1] : null;
            $query->where(function ($match) use ($search, $sessionId, $taskId) {
                $match->whereRaw("handover_sessions.reference LIKE ? ESCAPE '!'", [$search])
                    ->orWhereHas('task', fn ($task) => $task->where(fn ($taskMatch) => $taskMatch
                        ->whereRaw("reference LIKE ? ESCAPE '!'", [$search])
                        ->orWhereRaw("customer_name_snapshot LIKE ? ESCAPE '!'", [$search])
                        ->orWhereRaw("pickup_address LIKE ? ESCAPE '!'", [$search])
                        ->orWhereHas('assignedStaff', fn ($staff) => $staff->whereRaw("name LIKE ? ESCAPE '!'", [$search]))))
                    ->orWhereHas('proof', fn ($proof) => $proof->whereRaw("customer_name LIKE ? ESCAPE '!'", [$search])->orWhereRaw("pickup_address LIKE ? ESCAPE '!'", [$search])->orWhereHas('revisions', fn ($revision) => $revision->whereRaw("JSON_EXTRACT(`values`, '$.customer_name') LIKE ? ESCAPE '!'", [$search])->orWhereRaw("JSON_EXTRACT(`values`, '$.pickup_address') LIKE ? ESCAPE '!'", [$search])));
                if ($sessionId !== null) {
                    $match->orWhere('handover_items.handover_session_id', $sessionId);
                }
                if ($taskId !== null) {
                    $match->orWhere('handover_items.pickup_task_id', $taskId);
                }
            });
        }
        if (! empty($data['date_from'])) {
            $query->where('handover_items.verified_at', '>=', CarbonImmutable::parse($data['date_from'], config('pickup.timezone'))->utc());
        }
        if (! empty($data['date_to'])) {
            $query->where('handover_items.verified_at', '<', CarbonImmutable::parse($data['date_to'], config('pickup.timezone'))->addDay()->utc());
        }
        $summary = $request->boolean('summary') ? ['active' => HandoverSession::where('status', '!=', 'CLOSED')->count(), 'closed' => HandoverSession::where('status', 'CLOSED')->count(), 'discrepancies' => HandoverItem::withStatus('DISCREPANCY')->count()] : null;
        if (($data['view'] ?? 'tasks') === 'categories') {
            return $this->categories($query, $data, $summary);
        }
        $items = $query->orderByDesc('handover_items.id')->paginate($data['per_page'] ?? 20);

        return response()->json([
            'data' => $items->getCollection()->map(fn (HandoverItem $item) => $this->record($item)),
            'meta' => ['current_page' => $items->currentPage(), 'last_page' => $items->lastPage(), 'total' => $items->total(), 'from' => $items->firstItem(), 'to' => $items->lastItem()],
            ...($summary === null ? [] : ['summary' => $summary]),
        ]);
    }

    /** @param Builder<HandoverItem> $query
     * @param  array<string, mixed>  $data
     * @param  array<string, int>|null  $summary
     */
    private function categories(Builder $query, array $data, ?array $summary): JsonResponse
    {
        $query->join('pickup_records', 'pickup_records.id', '=', 'handover_items.pickup_record_id');
        foreach ([
            ['pickup_record_revisions', 'pickup_record_id', 'pickup_records.id', 'pickup_latest'],
            ['handover_item_revisions', 'handover_item_id', 'handover_items.id', 'retail_latest'],
        ] as [$table, $foreignKey, $parent, $alias]) {
            $latest = DB::table($table)->select($foreignKey)->selectRaw('MAX(revision) as latest_revision')->groupBy($foreignKey);
            $query->leftJoinSub($latest, $alias.'_number', fn (JoinClause $join) => $join->on($alias.'_number.'.$foreignKey, '=', $parent));
            $query->leftJoin($table.' as '.$alias, fn (JoinClause $join) => $join->on($alias.'.'.$foreignKey, '=', $parent)->on($alias.'.revision', '=', $alias.'_number.latest_revision'));
        }
        if (! empty($data['review_only'])) {
            $query->whereRaw('COALESCE(pickup_latest.revision, 0) <> COALESCE(retail_latest.pickup_revision, handover_items.verified_pickup_revision, 0)');
        }
        $quantities = [
            'manual_hybrid' => ["COALESCE(JSON_EXTRACT(pickup_latest.`values`, '$.manual_hybrid'), pickup_records.manual_hybrid)", "COALESCE(JSON_EXTRACT(retail_latest.`values`, '$.manual_hybrid'), handover_items.manual_hybrid)"],
            'cashless_hybrid' => ["COALESCE(JSON_EXTRACT(pickup_latest.`values`, '$.cashless_hybrid'), pickup_records.cashless_hybrid)", "COALESCE(JSON_EXTRACT(retail_latest.`values`, '$.cashless_hybrid'), handover_items.cashless_hybrid)"],
            'css_orion' => ["COALESCE(JSON_EXTRACT(pickup_latest.`values`, '$.css_orion'), pickup_records.css_orion)", "COALESCE(JSON_EXTRACT(retail_latest.`values`, '$.css_orion'), handover_items.css_orion)"],
        ];
        $union = null;
        foreach ($quantities as $category => [$pickup, $retail]) {
            if (! empty($data['category']) && $data['category'] !== $category) {
                continue;
            }
            $part = (clone $query)->toBase()->select('handover_items.id')->selectRaw('? as category, '.$pickup.' as pickup_quantity, '.$retail.' as received_quantity', [$category])
                ->whereRaw($pickup.' <> '.$retail);
            $union = $union === null ? $part : $union->unionAll($part);
        }
        $rows = DB::query()->fromSub($union, 'category_differences')->orderByDesc('id')->orderBy('category')->paginate($data['per_page'] ?? 20);
        $items = (clone $query)->whereIn('handover_items.id', $rows->getCollection()->pluck('id')->unique())->get()->keyBy('id');

        return response()->json([
            'data' => $rows->getCollection()->map(fn ($row) => [
                ...$this->record($items->get($row->id)),
                'category' => $row->category,
                'pickup_quantity' => (int) $row->pickup_quantity,
                'received_quantity' => (int) $row->received_quantity,
                'difference' => (int) $row->received_quantity - (int) $row->pickup_quantity,
            ]),
            'meta' => ['current_page' => $rows->currentPage(), 'last_page' => $rows->lastPage(), 'total' => $rows->total(), 'from' => $rows->firstItem(), 'to' => $rows->lastItem()],
            ...($summary === null ? [] : ['summary' => $summary]),
        ]);
    }

    /** @return array<string, mixed> */
    private function record(HandoverItem $item): array
    {
        $values = $item->effectiveValues();
        $proof = $item->proof->effectiveValues();

        return [
            'id' => $item->id, 'task_id' => $item->pickup_task_id, 'session_id' => $item->handover_session_id,
            'reference' => $item->task->reference, 'customer_name' => $proof['customer_name'], 'pickup_address' => $proof['pickup_address'],
            'staff_name' => $item->task->assignedStaff?->name, 'session_reference' => $item->getAttribute('session_reference'),
            'session_status' => $item->getAttribute('session_status'), 'session_created_at' => CarbonImmutable::parse($item->getAttribute('session_created_at'))->toISOString(),
            'status' => $values['status'], 'notes' => $values['discrepancy_notes'], 'verified_at' => $values['verified_at'], 'needs_review' => $item->needsReview(),
        ];
    }
}

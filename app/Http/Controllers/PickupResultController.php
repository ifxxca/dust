<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\PickupResultPeriod;
use App\Actions\Pickup\QueryPackageProcessing;
use App\Actions\Pickup\QueryPickupOperations;
use App\Actions\Pickup\QueryPickupProcessingDetail;
use App\Actions\Pickup\QueryPickupQuickDetail;
use App\Actions\Pickup\QueryPickupResults;
use App\Actions\Pickup\ReportPickupResults;
use App\Http\Requests\PickupResultRequest;
use App\Http\Resources\HandoverResource;
use App\Http\Resources\PickupRecordResource;
use App\Http\Resources\PickupTaskResource;
use App\Models\HandoverSession;
use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PickupResultController extends Controller
{
    public function index(PickupResultRequest $request, QueryPickupResults $results, ReportPickupResults $reports, QueryPackageProcessing $processing, QueryPickupOperations $operations): Response
    {
        $filters = array_filter($request->validated(), fn ($value) => $value !== null && $value !== '');
        $filters['monitoring'] ??= isset($filters['group_by']) ? 'pickup' : 'processing';
        unset($filters['quick_pickup']);
        $operational = $operations->handle($filters);
        if ($filters['monitoring'] === 'processing') {
            $processingQuery = $processing->handle($filters);

            return Inertia::render('pickup-results', [
                'filters' => $filters, 'summary' => [], 'pickups' => null, 'report' => null,
                'processing' => [
                    'summary' => $processing->summary($processingQuery),
                    'categories' => collect(PickupProcessingRecord::CATEGORIES)->map(fn ($category) => ['category' => $category, ...$processing->summary((clone $processingQuery)->where('category', $category))]),
                    'rows' => $processingQuery->orderBy($filters['processing_sort'] ?? 'scheduled_at', $filters['direction'] ?? 'desc')->orderBy('id')->orderBy('category')->paginate($filters['per_page'] ?? 20)->appends($filters)->through($processing->row(...)),
                    'source' => 'MANUAL_ONLY', 'generated_at' => now()->toIso8601String(),
                ],
                'timezone' => PickupResultPeriod::TIMEZONE, 'operations' => $operational,
            ]);
        }
        $query = $results->handle($filters);
        $summary = $results->summary($query);
        $hasStateFilters = array_intersect_key($filters, array_flip(['visit_outcome', 'pop_status', 'handover_status', 'verification_status', 'discrepancy_status', 'pickup_queue']));
        $overview = empty($hasStateFilters) && ($filters['scope'] ?? 'daily') === 'daily'
            ? $summary
            : $results->summary($results->handle(array_intersect_key($filters, array_flip(['q', 'reference', 'customer', 'staff', 'customer_id', 'staff_id', 'date_from', 'date_to', 'date_basis']))));

        return Inertia::render('pickup-results', [
            'filters' => $filters,
            'summary' => $summary,
            'overview' => $overview,
            'queues' => $results->queues($filters),
            'report' => ! empty($filters['group_by']) ? $reports->handle($query, $results, $filters['group_by'], (int) ($filters['page'] ?? 1), (int) ($filters['per_page'] ?? 20))->appends($filters) : null,
            'pickups' => ! empty($filters['group_by']) ? null : $query->orderBy($filters['sort'] ?? 'scheduled_at', $filters['direction'] ?? 'desc')
                ->orderBy('id', $filters['direction'] ?? 'desc')->paginate($filters['per_page'] ?? 20)
                ->appends($filters)->through($results->row(...)),
            'timezone' => PickupResultPeriod::TIMEZONE, 'operations' => $operational,
        ]);
    }

    public function export(PickupResultRequest $request, QueryPickupResults $results, QueryPackageProcessing $processing): StreamedResponse
    {
        $filters = array_filter($request->validated(), fn ($value) => $value !== null && $value !== '');
        $timezone = PickupResultPeriod::TIMEZONE;
        $isProcessing = ($filters['monitoring'] ?? null) === 'processing';
        $query = $isProcessing ? $processing->handle($filters) : $processing->pickupExport($results->handle($filters), $filters);
        $query->orderBy($isProcessing ? ($filters['processing_sort'] ?? 'scheduled_at') : ($filters['sort'] ?? 'scheduled_at'), $filters['direction'] ?? 'desc')->orderBy('id', $filters['direction'] ?? 'desc');
        if ($isProcessing) {
            $query->orderBy('category');
        }
        $columns = ['reference', 'scheduled_at', 'customer_name', 'staff_name', 'task_status', 'visit_outcome', 'visit_started_at', 'visit_recorded_at', 'finalized_at', 'pickup_revision', 'manual_hybrid', 'cashless_hybrid', 'css_orion', 'total_packages', 'session_reference', 'handover_status', 'verification_status', 'needs_review', 'verified_pickup_revision', 'received_manual_hybrid', 'received_cashless_hybrid', 'received_css_orion', 'verified_by', 'verified_at', 'closed_at', 'next_action'];
        $columns = $isProcessing
            ? ['reference', 'customer_name', 'staff_name', 'scheduled_at', 'category', 'pop_quantity', 'received_quantity', 'confirmed_quantity', 'manual_quantity', 'failed_quantity', 'pending_quantity', 'unknown_outcome_quantity', 'unconfirmed_quantity', 'not_recorded_quantity', 'processing_systems', 'processing_status', 'processing_source', 'processing_reconciliation', 'last_updated_at', 'external_confirmation_available']
            : [...$columns, 'processing_pop_quantity', 'processing_received_quantity', 'confirmed_processed_quantity', 'manual_recorded_quantity', 'failed_processing_quantity', 'pending_processing_quantity', 'unknown_processing_quantity', 'unknown_outcome_quantity', 'processing_systems', 'processing_source', 'processing_reconciliation', 'processing_updated_at', 'external_confirmation_available'];

        $columns = [...$columns, ...($isProcessing ? ['visit_started_at', 'visit_recorded_at', 'finalized_at'] : []), 'picked_up_at', 'received_at', 'handed_over_at', 'period_at', 'period_source', 'operational_date', 'subsequent_handover', 'date_basis', 'date_from', 'date_to', 'scope'];

        return response()->streamDownload(function () use ($query, $results, $columns, $timezone, $isProcessing, $filters): void {
            $output = fopen('php://output', 'w');
            if ($output === false) {
                throw new \RuntimeException('Unable to open export stream.');
            }
            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, [...$columns, 'timezone'], ',', '"', '');
            foreach ($query->lazy(500) as $record) {
                $row = $results->row($record);
                $row['processing_systems'] = implode(' / ', array_filter([$record->has_hybrid ? 'JNE Hybrid' : null, $record->has_orion ? 'MyORION' : null]));
                $row['processing_source'] = ($isProcessing ? $record->record_count : $record->processing_record_count) > 0 ? 'Dicatat Manual' : 'Belum Ada Konfirmasi';
                $row['processing_reconciliation'] = ($isProcessing ? $record->reconciliation_required : $record->processing_reconciliation) ? 'RECONCILIATION_REQUIRED' : 'Tidak terdeteksi konflik';
                $row['external_confirmation_available'] = 'Tidak tersedia';
                $row = [...$row, ...array_intersect_key($filters, array_flip(['date_basis', 'date_from', 'date_to'])), 'scope' => $filters['scope'] ?? 'daily'];
                $values = [];
                foreach ($columns as $column) {
                    $value = $row[$column] ?? '';
                    if ($value !== '' && str_ends_with($column, '_at')) {
                        $value = CarbonImmutable::parse($value)->setTimezone($timezone)->format('Y-m-d H:i:s P');
                    }
                    $value = is_bool($value) ? ($value ? 'Ya' : 'Tidak') : (string) $value;
                    $values[] = preg_match('/^[\s]*[=+@-]/u', $value) ? "'".$value : $value;
                }
                fputcsv($output, [...$values, $timezone], ',', '"', '');
            }
            fclose($output);
        }, 'hasil-pickup-'.CarbonImmutable::now($timezone)->format('Y-m-d-His').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8', 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

    public function quick(Request $request, PickupTask $task, QueryPickupResults $results, QueryPickupProcessingDetail $processingDetails, QueryPickupQuickDetail $pickupDetails): JsonResponse
    {
        abort_unless($request->user()->is_active && $request->user()->role === 'admin_supervisor', 403);
        abort_unless($request->user()->can('view', $task), 404);
        $request->validate(['processing_page' => ['sometimes', 'integer', 'min:1'], 'view' => ['sometimes', 'in:pickup,processing']]);
        if ($request->input('view') === 'pickup') {
            return response()->json($pickupDetails->handle($task, $request->user()))->header('Cache-Control', 'private, no-store');
        }

        return response()->json([
            'task' => $task->only(['id', 'reference', 'customer_name_snapshot']),
            'result' => $results->row($results->handle()->where('id', $task->id)->first()),
            'processing' => $processingDetails->handle($task), 'timezone' => PickupResultPeriod::TIMEZONE,
        ])->header('Cache-Control', 'private, no-store');
    }

    public function show(Request $request, PickupTask $task, QueryPickupResults $results, QueryPickupProcessingDetail $processingDetails): Response
    {
        abort_unless($request->user()->is_active && $request->user()->role === 'admin_supervisor', 403);
        abort_unless($request->user()->can('view', $task), 404);
        $task->load(['assignedStaff', 'events.actor', 'events.previousStaff', 'events.newStaff', 'visits', 'proof.attachments', 'proof.receipt', 'proof.receipts', 'proof.revisions', 'handoverItem']);
        $session = $task->handoverItem
            ? HandoverSession::with(['creator:id,name', 'items.proof.revisions', 'items.revisions', 'items.task.assignedStaff', 'events'])->findOrFail($task->handoverItem->handover_session_id)
            : null;
        $sessionData = $session ? (new HandoverResource($session))->resolve($request) : null;
        $item = $session?->items->firstWhere('pickup_task_id', $task->id);
        $timeline = [];
        foreach ($task->events as $event) {
            $timeline[] = ['source' => 'pickup', 'id' => $event->id, 'action' => $event->action, 'actor_id' => $event->actor_id, 'at' => $event->occurred_at, 'reason' => $event->reason, 'before' => ['staff_id' => $event->previous_staff_id], 'after' => ['staff_id' => $event->new_staff_id]];
        }
        foreach ($task->visits as $visit) {
            if ($visit->recorded_at) {
                $timeline[] = ['source' => 'visit', 'id' => $visit->id, 'action' => 'visit_outcome', 'actor_id' => $visit->staff_id, 'at' => $visit->recorded_at, 'reason' => $visit->reason, 'after' => $visit->only(['outcome', 'notes', 'started_at'])];
            }
        }
        if ($task->proof) {
            $proof = $task->proof;
            $previous = $proof->only(['customer_name', 'pickup_address', 'contact', 'manual_hybrid', 'cashless_hybrid', 'css_orion', 'notes']);
            $timeline[] = ['source' => 'pop', 'id' => $proof->id, 'action' => 'pop_finalized', 'actor_id' => $proof->staff_id, 'at' => $proof->finalized_at, 'after' => $previous];
            foreach ($proof->revisions as $revision) {
                $next = array_replace($previous, $revision->values);
                $timeline[] = ['source' => 'pop_revision', 'id' => $revision->id, 'action' => 'pop_revision', 'actor_id' => $revision->actor_id, 'at' => $revision->created_at, 'reason' => $revision->reason, 'before' => $previous, 'after' => $next];
                $previous = $next;
            }
        }
        foreach ($session ? $session->events : [] as $event) {
            if ($event->handover_item_id !== null && $event->handover_item_id !== $item?->id) {
                continue;
            }
            $timeline[] = ['source' => 'handover', 'id' => $event->id, 'action' => $event->action, 'actor_id' => $event->actor_id, 'at' => $event->occurred_at, 'reason' => $event->reason, 'after' => $event->changes];
        }
        if ($item) {
            $previous = $item->only(['manual_hybrid', 'cashless_hybrid', 'css_orion', 'status', 'discrepancy_notes', 'verified_by', 'verified_at']);
            foreach ($item->revisions as $revision) {
                $next = array_replace($previous, $revision->values);
                $timeline[] = ['source' => 'verification_revision', 'id' => $revision->id, 'action' => 'verification_revision', 'actor_id' => $revision->actor_id, 'at' => $revision->created_at, 'reason' => $revision->reason, 'before' => $previous, 'after' => $next];
                $previous = $next;
            }
        }
        $actorIds = collect($timeline)->pluck('actor_id')->push($session?->closed_by)
            ->merge($session ? $session->items->map(fn ($entry) => $entry->effectiveValues()['verified_by']) : [])->filter()->unique();
        $actors = User::whereIn('id', $actorIds)->pluck('name', 'id');
        $timeline = collect($timeline)->filter(fn ($event) => $event['at'] !== null)->sortBy('at')->values()
            ->map(fn ($event) => [...$event, 'actor_name' => $actors[$event['actor_id']] ?? null]);
        $row = $results->row($results->handle()->where('id', $task->id)->first());
        $taskData = (new PickupTaskResource($task))->resolve($request);
        $taskData['proof'] = $task->proof ? (new PickupRecordResource($task->proof))->resolve($request) : null;
        $request->validate(['processing_page' => ['sometimes', 'integer', 'min:1']]);

        return Inertia::render('pickup-result-detail', [
            'task' => $taskData, 'result' => $row,
            'session' => $sessionData, 'timeline' => $timeline, 'actors' => $actors,
            'processing' => $processingDetails->handle($task),
            'capabilities' => [
                'correct_pop' => $task->status === 'PICKED_UP' && $task->proof?->finalized_at !== null,
                'verify' => ($sessionData['can']['verify'] ?? false) && $item?->status === 'PENDING',
                'correct_verification' => $session?->status === 'IN_VERIFICATION' && $item && $item->status !== 'PENDING',
                'close' => $sessionData['can_close'] ?? false,
                'reopen' => $session?->status === 'CLOSED',
            ],
            'timezone' => config('pickup.timezone'),
        ]);
    }
}

<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\ManageCashlessEntryBatches;
use App\Models\CashlessEntryBatch;
use App\Models\PickupTask;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class CashlessMonitoringController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        abort_unless($user->canManagePickup() || $user->canExecutePickup(), 403);
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
            'state' => ['nullable', Rule::in(['registered', 'queued', 'processing', 'approval', 'success', 'failed', 'attention'])],
            'source' => ['nullable', Rule::in(['roberto', 'nuralamt'])],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', Rule::in([10, 25, 50])],
        ]);
        $today = CarbonImmutable::now(config('pickup.timezone'))->startOfDay();
        $from = CarbonImmutable::parse($data['date_from'] ?? $today->subDays(6)->toDateString(), config('pickup.timezone'));
        $to = CarbonImmutable::parse($data['date_to'] ?? $today->toDateString(), config('pickup.timezone'));
        if ($to->lessThan($from)) {
            throw ValidationException::withMessages(['date_to' => 'Tanggal akhir harus sama atau setelah tanggal awal.']);
        }

        $tasks = PickupTask::query()->select('id');
        if (! $user->canManagePickup()) {
            $tasks->where(fn ($query) => $query->where('assigned_staff_id', $user->id)->orWhereHas('handoverItem'));
        }
        $recordIds = DB::table('pickup_cashless_awbs')->select('id')->whereIn('pickup_task_id', $tasks)
            ->whereNotNull('awb')->where('created_at', '>=', $from->utc())->where('created_at', '<', $to->addDay()->utc());
        $latest = DB::table('cashless_entry_items')->whereIn('pickup_cashless_awb_id', $recordIds)
            ->select('pickup_cashless_awb_id')->selectRaw('MAX(id) as id')->groupBy('pickup_cashless_awb_id');
        $query = DB::table('pickup_cashless_awbs as records')
            ->join('pickup_tasks as tasks', 'tasks.id', '=', 'records.pickup_task_id')
            ->leftJoinSub($latest, 'latest', fn ($join) => $join->on('latest.pickup_cashless_awb_id', '=', 'records.id'))
            ->leftJoin('cashless_entry_items as items', 'items.id', '=', 'latest.id')
            ->leftJoin('cashless_entry_batches as batches', 'batches.id', '=', 'items.batch_id')
            ->leftJoin('users as staff', 'staff.id', '=', 'tasks.assigned_staff_id')
            ->whereIn('tasks.id', $tasks)->whereNotNull('records.awb')
            ->where('records.created_at', '>=', $from->utc())->where('records.created_at', '<', $to->addDay()->utc())
            ->select(['records.id', 'records.awb', 'records.created_at as scanned_at', 'tasks.id as task_id', 'tasks.reference',
                'tasks.customer_name_snapshot as customer', 'staff.name as staff', 'items.status as item_status', 'items.awb as attempted_awb', 'items.message',
                'items.previous_ho', 'items.updated_at as attempted_at', 'batches.id as batch_id', 'batches.source',
                'batches.status as batch_status', 'batches.ho_number', 'batches.approved_at', 'batches.error_message as batch_message'])
            ->selectRaw("CASE
                WHEN items.id IS NULL THEN 'registered'
                WHEN items.awb <> records.awb OR batches.pickup_task_id <> records.pickup_task_id
                    OR COALESCE(records.customer_id, 0) <> COALESCE(tasks.customer_id, 0) THEN 'attention'
                WHEN batches.status = 'INSPECTING' THEN 'processing'
                WHEN items.status = 'CONFIRMED' AND items.previous_ho IS NOT NULL AND batches.status IN ('DONE', 'PARTIAL') THEN 'success'
                WHEN items.status = 'ACCEPTED' AND batches.approved_at IS NOT NULL AND batches.status IN ('DONE', 'PARTIAL') THEN 'success'
                WHEN items.status IN ('NOT_FOUND', 'NEEDS_DATA', 'INVALID', 'ORION_REJECTED', 'CANCELLED') OR batches.status IN ('FAILED', 'CANCELLED') THEN 'failed'
                WHEN items.status IN ('PREVIOUSLY_ENTERED', 'UNKNOWN') OR batches.status = 'UNKNOWN' THEN 'attention'
                WHEN items.status = 'ACCEPTED' OR batches.status IN ('APPROVING', 'CONFIRMING') THEN 'approval'
                WHEN batches.status IN ('WAITING_SOURCE', 'WAITING_ACCOUNT', 'QUEUED') THEN 'queued'
                WHEN batches.status IN ('CLAIMED', 'CREATING_HO', 'ENTERING', 'VERIFYING') THEN 'processing'
                ELSE 'attention' END as state");
        if (! empty($data['source'])) {
            $query->where('batches.source', $data['source']);
        }
        if (trim($data['q'] ?? '') !== '') {
            $search = '%'.addcslashes(trim($data['q']), '%_\\').'%';
            $query->where(fn ($match) => $match->where('records.awb', 'like', $search)->orWhere('tasks.reference', 'like', $search)
                ->orWhere('tasks.customer_name_snapshot', 'like', $search)->orWhere('staff.name', 'like', $search)->orWhere('batches.ho_number', 'like', $search));
        }
        $rows = DB::query()->fromSub($query, 'monitor');
        if (! empty($data['state'])) {
            $rows->where('state', $data['state']);
        }

        return Inertia::render('cashless-monitoring', [
            'monitor' => function () use ($rows, $data, $user): array {
                $page = $rows->orderByDesc('id')->paginate((int) ($data['per_page'] ?? 25))->withQueryString();
                $batches = CashlessEntryBatch::whereIn('id', $page->getCollection()->pluck('batch_id')->filter()->unique())
                    ->with('items:id,batch_id,status')->get()->keyBy('id');
                $books = PickupTask::whereIn('id', $page->getCollection()->pluck('task_id')->unique())->with('proof:id,pickup_task_id,staff_id')->get()->keyBy('id');
                $page->through(function (object $row) use ($batches, $books, $user): object {
                    $batch = $batches->get($row->batch_id);
                    $actions = [];
                    if ($batch && ($user->canManagePickup() || ($user->canExecutePickup() && $batch->created_by === $user->id))) {
                        if ($batch->status === 'UNKNOWN' && $batch->ho_number !== null) {
                            $actions[] = 'inspect';
                            if ($batch->verification === null && $batch->items->contains('status', 'ACCEPTED')
                                && $batch->items->every(fn ($item): bool => in_array($item->status, ['ACCEPTED', 'PREVIOUSLY_ENTERED', 'ORION_REJECTED', 'NOT_FOUND', 'NEEDS_DATA', 'INVALID', 'CANCELLED'], true))) {
                                $actions[] = 'finalize';
                            }
                        }
                        if (in_array($batch->status, CashlessEntryBatch::Terminal, true)
                            && ! $batch->items->contains(fn ($item): bool => in_array($item->status, ['UNKNOWN', 'IN_FLIGHT', 'PENDING'], true))
                            && ($batch->approved_at !== null || ! $batch->items->contains('status', 'ACCEPTED'))
                            && $batch->items->contains(fn ($item): bool => in_array($item->status, ['NOT_FOUND', 'NEEDS_DATA', 'INVALID', 'CANCELLED'], true))) {
                            $actions[] = 'retry';
                        }
                    }
                    $row->recovery_actions = $actions;
                    $row->can_retry_book = $user->canManagePickup() || ($user->canExecutePickup() && $books->get($row->task_id)?->proof?->staff_id === $user->id);

                    return $row;
                });

                return ['rows' => $page, 'updated_at' => now()->toIso8601String()];
            },
            'filters' => ['q' => $data['q'] ?? '', 'date_from' => $from->toDateString(), 'date_to' => $to->toDateString(), 'source' => $data['source'] ?? '', 'state' => $data['state'] ?? '', 'per_page' => (int) ($data['per_page'] ?? 25)],
            'timezone' => config('pickup.timezone'),
        ]);
    }

    public function recover(Request $request, CashlessEntryBatch $batch, ManageCashlessEntryBatches $manager): JsonResponse
    {
        $actor = $request->user();
        abort_unless($actor->canManagePickup() || ($actor->canExecutePickup() && $batch->created_by === $actor->id), 404);
        $data = $request->validate(['action' => ['required', Rule::in(['inspect', 'finalize', 'retry'])],
            'reason' => ['required', 'string', 'min:5', 'max:500'], 'submission_key' => ['required', 'uuid'],
            'expected_status' => ['required', 'string', 'max:24']]);
        $result = $manager->recover($actor, $batch->id, $data['action'], $data['reason'], $data['submission_key'], $data['expected_status']);

        return response()->json(['batch_id' => $result->id, 'status' => $result->status, 'message' => match ($data['action']) {
            'inspect' => 'Pemeriksaan HO diantrekan tanpa scan atau approval. Hasil akan diperbarui otomatis.',
            'finalize' => 'Penyelesaian HO asal diantrekan. Resi tidak dipindai ulang.',
            'retry' => 'Hanya resi gagal yang diantrekan dalam batch #'.$result->id.'. Worker akan membuat HO baru.',
        }]);
    }

    public function retryBook(Request $request, PickupTask $task, ManageCashlessEntryBatches $manager): JsonResponse
    {
        $actor = $request->user();
        abort_unless($actor->canManagePickup() || ($actor->canExecutePickup() && $task->proof?->staff_id === $actor->id), 404);
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:500'], 'submission_key' => ['required', 'uuid']]);
        $batch = $manager->retryBook($actor, $task->id, $data['reason'], $data['submission_key']);
        $event = DB::table('cashless_entry_events')->where('batch_id', $batch->id)->where('type', 'book-retry-created')->firstOrFail();
        $evidence = json_decode($event->evidence, true, flags: JSON_THROW_ON_ERROR);
        $skipped = $evidence['skipped'];

        return response()->json(['batch_id' => $batch->id, 'status' => $batch->status, 'message' => $evidence['queued_count'].' resi buku ini diantrekan dalam batch #'.$batch->id.'. Dilewati: '.$skipped['successful'].' sudah berhasil, '.$skipped['queued'].' masih diproses, '.$skipped['review'].' perlu diperiksa.',
            'queued_count' => $evidence['queued_count'], 'skipped' => $skipped]);
    }
}

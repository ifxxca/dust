<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\ManageReconciliationWorkspace;
use App\Actions\Pickup\PickupResultPeriod;
use App\Actions\Pickup\QueryReconciliationWorkspace;
use App\Actions\Pickup\ReconcileCustomerPickupDay;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupTask;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class ReconciliationWorkspaceController extends Controller
{
    public function show(Request $request, PickupTask $task, QueryReconciliationWorkspace $query): JsonResponse
    {
        $this->authorizeRetail($request);
        $request->validate(['history_page' => ['nullable', 'integer', 'min:1'], 'document_page' => ['nullable', 'integer', 'min:1']]);
        $data = $query->handle($task);
        $data['schema_ready'] = Schema::hasColumn('pickup_customer_reconciliations', 'approval_snapshot');
        $admin = $request->user()->role === 'admin_supervisor';
        $data['capabilities'] = ['review' => $admin, 'lock' => $admin && $data['schema_ready'], 'close_with_explanation' => $data['schema_ready'], 'dispute' => false];
        $versions = PickupProcessingReconciliation::whereIn('pickup_task_id', array_column($data['members'], 'id'))->pluck('input_version', 'pickup_task_id');
        $data['members'] = array_map(function (array $member) use ($versions): array {
            $member['input_version'] = $versions->get($member['id'], 0);

            return $member;
        }, $data['members']);

        return response()->json($data)->header('Cache-Control', 'private, no-store');
    }

    public function awbs(Request $request, PickupTask $task, QueryReconciliationWorkspace $workspace): JsonResponse
    {
        $this->authorizeRetail($request);
        $filters = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'account' => ['nullable', 'string', 'max:100'],
            'category' => ['nullable', Rule::in(['manual_hybrid', 'cashless_hybrid', 'css_orion'])], 'source' => ['nullable', Rule::in(['apex', 'roberto', 'nuralamt', 'hybrid'])],
            'report' => ['nullable', 'integer', 'min:1'], 'matching' => ['nullable', Rule::in(JneShipment::MATCH_STATUSES)], 'date' => ['nullable', 'date_format:Y-m-d'],
            'mode' => ['nullable', Rule::in(['exceptions', 'suggested', 'included', 'unassigned', 'candidates', 'excluded', 'snapshot'])], 'page' => ['nullable', 'integer', 'min:1']]);
        $ids = app(ReconcileCustomerPickupDay::class)->memberIds($task) ?: [$task->id];
        if (($filters['mode'] ?? '') === 'snapshot') {
            $snapshot = $workspace->group($task)?->approval_snapshot;
            $items = collect($snapshot['included_awbs'] ?? []);
            $items = $items->filter(fn (array $row): bool => (empty($filters['q']) || str_contains(mb_strtoupper($row['awb'].' '.($row['shipper_name'] ?? '').' '.($row['consignee_name'] ?? '')), mb_strtoupper($filters['q'])))
                && (empty($filters['category']) || $row['category'] === $filters['category']) && (empty($filters['account']) || ($row['customer_account'] ?? null) === $filters['account'])
                && (empty($filters['report']) || $row['latest_report_job_id'] === (int) $filters['report']) && (empty($filters['source']) || ($row['source'] ?? null) === $filters['source'])
                && (empty($filters['matching']) || ($row['match_status'] ?? null) === $filters['matching']))
                ->sortBy(fn (array $row): array => [trim($row['consignee_name'] ?? '') === '' ? 1 : 0, mb_strtoupper(trim($row['consignee_name'] ?? '')), $row['awb']])->values();
            $page = $request->integer('page', 1);

            return response()->json(['data' => $items->slice(($page - 1) * 30, 30)->map(fn (array $row): array => [...$row, 'consignee_name' => $row['consignee_name'] ?? null, 'customer' => $snapshot['customer'], 'source_id' => $row['latest_report_awb_id'], 'report_id' => $row['latest_report_job_id'], 'included' => true, 'conflict' => false, 'review_status' => 'LOCKED_SNAPSHOT'])->values(), 'current_page' => $page, 'last_page' => max(1, (int) ceil($items->count() / 30)), 'total' => $items->count()]);
        }
        $task->loadMissing('proof');
        $date = $filters['date'] ?? PickupResultPeriod::date($task->proof?->picked_up_at ?? $task->scheduled_at)->toDateString();
        $from = PickupResultPeriod::start($date)->utc();
        $mode = $filters['mode'] ?? 'exceptions';
        $rows = match ($mode) {
            'candidates', 'suggested', 'unassigned' => JneShipment::query(),
            'excluded' => JneShipment::whereIn('jne_shipments.id', DB::table('pickup_awb_exclusions')->whereIn('pickup_task_id', $ids)->select('jne_shipment_id')),
            default => $workspace->scope($task, $ids),
        };
        if (in_array($mode, ['candidates', 'suggested', 'unassigned'], true)) {
            /** Materialize day IDs first so MySQL does not read historical source rows for the entire pool. */
            $joinType = DB::getDriverName() === 'mysql' ? 'straight_join' : 'inner';
            $sourceScope = JneReportAwb::select('id as day_source_id')
                ->where('entry_at', '>=', $from)->where('entry_at', '<', $from->addDay())->limit(PHP_INT_MAX);
            $candidates = JneShipment::query()->fromSub($sourceScope, 'workspace_day')
                ->join('jne_shipments', 'jne_shipments.latest_report_awb_id', '=', 'workspace_day.day_source_id', $joinType)
                ->select('jne_shipments.id as candidate_shipment_id')
                ->when($mode === 'unassigned', fn (Builder $query) => $query->whereNull('pickup_task_id'))
                ->limit(PHP_INT_MAX);
            $rows = JneShipment::query()->fromSub($candidates, 'workspace_candidates')
                ->join('jne_shipments', 'jne_shipments.id', '=', 'workspace_candidates.candidate_shipment_id', $joinType);
        }
        $rows->leftJoin('jne_report_awbs as workspace_source', 'workspace_source.id', '=', 'jne_shipments.latest_report_awb_id');
        $rows->select(array_map(fn (string $column): string => 'jne_shipments.'.$column, ['id', 'awb', 'version', 'customer_id', 'customer_account', 'category', 'category_status', 'category_method', 'match_status', 'match_method', 'customer_match_status', 'customer_match_method', 'pickup_task_id', 'latest_report_awb_id']));
        if ($mode === 'unassigned') {
            $rows->whereNull('jne_shipments.pickup_task_id');
        }
        if ($mode === 'included') {
            $rows->whereIn('jne_shipments.pickup_task_id', $ids);
        }
        if ($mode === 'exceptions') {
            $excess = collect($workspace->group($task)?->categories ?? [])->filter(fn (array $count): bool => ($count['excess'] ?? 0) > 0)->keys()->all();
            $rows->where(fn (Builder $query) => $query->where('customer_match_status', '!=', 'MATCHED')->orWhere('match_status', '!=', 'MATCHED')->orWhere('category_status', '!=', 'MATCHED')
                ->orWhere('customer_id', '!=', $task->customer_id)->orWhereNull('customer_id')->orWhere('tracking_status', 'CANCELLED')->orWhereIn('category', $excess));
        }
        if ($mode === 'suggested') {
            $references = PickupTask::whereIn('id', $ids)->pluck('reference')->all();
            $rows->where(fn (Builder $query) => $query->where(fn (Builder $customer) => $customer->where('customer_id', $task->customer_id)->where('customer_match_status', 'MATCHED'))
                ->orWhereHas('cashlessClaim', fn ($claim) => $claim->where('customer_id', $task->customer_id)->whereIn('pickup_task_id', $ids))
                ->orWhereHas('latestSource', fn ($source) => $source->whereIn('reference', $references)))
                ->where(fn (Builder $query) => $query->whereNull('pickup_task_id')->orWhereNotIn('pickup_task_id', $ids)->orWhere('match_status', '!=', 'MATCHED')->orWhere('customer_match_status', '!=', 'MATCHED')->orWhere('category_status', '!=', 'MATCHED'));
            $rows->withExists(['cashlessClaim as recommendation_scan' => fn ($claim) => $claim->where('customer_id', $task->customer_id)->whereIn('pickup_task_id', $ids),
                'latestSource as recommendation_reference' => fn ($source) => $source->whereIn('reference', $references)])
                ->orderByDesc('recommendation_scan')->orderByDesc('recommendation_reference')
                ->orderByRaw('CASE WHEN customer_id = ? AND customer_match_status = ? THEN 0 ELSE 1 END', [$task->customer_id, 'MATCHED']);
        }
        if (! empty($filters['q'])) {
            $term = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $filters['q']).'%';
            $rows->where(fn (Builder $q) => $q->whereRaw("jne_shipments.awb like ? escape '!'", [$term])->orWhereRaw("jne_shipments.customer_account like ? escape '!'", [$term])
                ->orWhereHas('customer', fn ($customer) => $customer->whereRaw("name like ? escape '!'", [$term])->orWhereRaw("customer_code like ? escape '!'", [$term]))
                ->orWhereRaw("workspace_source.shipper_name like ? escape '!'", [$term])->orWhereRaw("workspace_source.consignee_name like ? escape '!'", [$term]));
        }
        foreach (['account' => 'customer_account', 'category' => 'category', 'matching' => 'match_status'] as $filter => $column) {
            $rows->when(! empty($filters[$filter]), fn ($q) => $q->where('jne_shipments.'.$column, $filters[$filter]));
        }
        $rows->when(! empty($filters['report']), fn ($q) => $q->where('latest_report_job_id', $filters['report']));
        $rows->when(! empty($filters['source']), fn ($q) => $q->whereHas('latestSource.reportJob', fn ($job) => $job->where('source', $filters['source'])));
        $page = $rows->with(['latestSource:id,report_job_id,shipper_name,consignee_name,source_row,entry_at', 'latestSource.reportJob:id,source,imported_at', 'customer:id,name,customer_code', 'cashlessClaim:id,awb,pickup_task_id'])
            ->orderByRaw("CASE WHEN NULLIF(TRIM(workspace_source.consignee_name), '') IS NULL THEN 1 ELSE 0 END")
            ->orderByRaw("NULLIF(TRIM(workspace_source.consignee_name), '')")
            ->orderBy('jne_shipments.awb')->orderBy('jne_shipments.id')->paginate(30)->through(function (JneShipment $row) use ($ids, $task, $mode): array {
                $source = $row->latestSource;

                return [...$row->only(['id', 'awb', 'version', 'customer_id', 'customer_account', 'category', 'category_status', 'category_method', 'match_status', 'match_method', 'customer_match_status', 'customer_match_method', 'pickup_task_id']),
                    'customer' => $row->customer?->only(['id', 'name', 'customer_code']), 'shipper_name' => $source?->shipper_name, 'consignee_name' => $source?->consignee_name,
                    'source' => $source?->reportJob?->source, 'report_id' => $source?->report_job_id, 'source_id' => $source?->id, 'source_row' => $source?->source_row, 'entry_at' => $source?->entry_at,
                    'imported_at' => $source?->reportJob?->imported_at, 'included' => in_array($row->pickup_task_id, $ids, true),
                    'review_status' => $row->customer_match_method === 'REVIEW' || $row->match_method === 'REVIEW' ? 'MANUAL_REVIEW' : 'AUTOMATIC',
                    'recommendation' => $mode === 'suggested' ? ($row->recommendation_scan ? 'AWB scan pickup' : ($row->recommendation_reference ? 'Referensi pickup sama' : 'Customer terverifikasi, hari operasional sama')) : null,
                    'conflict' => ($row->pickup_task_id !== null && ! in_array($row->pickup_task_id, $ids, true)) || ($row->cashlessClaim !== null && $row->cashlessClaim->pickup_task_id !== $task->id)];
            });

        return response()->json($page)->header('Cache-Control', 'private, no-store');
    }

    public function evidence(Request $request, PickupTask $task, JneShipment $shipment): JsonResponse
    {
        $this->authorizeRetail($request);
        $request->validate(['source_page' => ['nullable', 'integer', 'min:1'], 'event_page' => ['nullable', 'integer', 'min:1']]);
        $shipment->load(['customer:id,name,customer_code', 'latestSource.reportJob', 'pickup:id,reference']);

        return response()->json(['identity' => $shipment->only(['id', 'awb', 'customer_account', 'category', 'category_status', 'category_method', 'match_status', 'match_method', 'match_note', 'customer_match_status', 'customer_match_method', 'customer_match_note', 'customer_match_candidates', 'category_evidence']),
            'customer' => $shipment->customer, 'pickup' => $shipment->pickup, 'shipper_name' => $shipment->latestSource?->shipper_name,
            'sources' => $shipment->sources()->with('reportJob:id,source,report_type,imported_at,file_checksum,hybrid_batch_id')->orderByDesc('id')->paginate(10, ['id', 'report_job_id', 'source_row', 'customer_account', 'shipper_name', 'entry_at', 'reference', 'created_at'], 'source_page'),
            'history' => DB::table('jne_shipment_match_events')->leftJoin('users', 'users.id', '=', 'actor_id')->where('jne_shipment_id', $shipment->id)->select('jne_shipment_match_events.*', 'users.name as reviewer')->latest('jne_shipment_match_events.id')->paginate(10, ['*'], 'event_page')])->header('Cache-Control', 'private, no-store');
    }

    public function preview(Request $request, PickupTask $task, ManageReconciliationWorkspace $manage): JsonResponse
    {
        $this->authorizeAdmin($request);

        return response()->json($manage->change($request->user(), $task, $this->changeData($request), apply: false));
    }

    public function apply(Request $request, PickupTask $task, ManageReconciliationWorkspace $manage): JsonResponse
    {
        $this->authorizeAdmin($request);

        $data = [...$this->changeData($request), ...$request->validate(['preview_hash' => ['required', 'string', 'size:64']])];

        return response()->json($manage->change($request->user(), $task, $data, apply: true));
    }

    public function lock(Request $request, PickupTask $task, ManageReconciliationWorkspace $manage): JsonResponse
    {
        $this->authorizeRetail($request);
        if ($request->input('action') !== 'CLOSE_WITH_EXCEPTION') {
            $this->authorizeAdmin($request);
        }
        $data = $request->validate(['action' => ['required', Rule::in(['LOCK', 'REOPEN', 'CLOSE_WITH_EXCEPTION'])], 'expected_revision' => ['required', 'integer', 'min:0'], 'reason' => ['required', 'string', 'min:5', 'max:500'],
            'reason_code' => ['required_if:action,CLOSE_WITH_EXCEPTION', Rule::in(array_keys(ManageReconciliationWorkspace::CLOSURE_REASONS))],
            'fingerprint' => ['required_if:action,LOCK,CLOSE_WITH_EXCEPTION', 'string', 'size:64'], 'review_token' => ['required_if:action,LOCK,CLOSE_WITH_EXCEPTION', 'string', 'size:64']]);

        return response()->json($manage->lock($request->user(), $task, $data));
    }

    /** @return array<string, mixed> */
    private function changeData(Request $request): array
    {
        return $request->validate(['action' => ['required', Rule::in(['ADD', 'REMOVE', 'CONFIRM', 'REASSIGN'])], 'expected_revision' => ['required', 'integer', 'min:0'], 'expected_version' => ['required', 'integer', 'min:0'], 'target_task_id' => ['required', 'integer', 'min:1'],
            'reason' => ['required', 'string', 'min:5', 'max:500'], 'items' => ['required', 'array', 'min:1', 'max:100'], 'items.*.id' => ['required', 'integer', 'distinct', 'min:1'], 'items.*.version' => ['required', 'integer', 'min:1']]);
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);
    }

    private function authorizeRetail(Request $request): void
    {
        abort_unless($request->user()?->is_active && in_array($request->user()->role, ['retail_staff', 'admin_supervisor'], true), 403);
    }
}

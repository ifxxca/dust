<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\QueryPackageProcessing;
use App\Actions\Reports\BuildJnePickupReconciliation;
use App\Actions\Reports\MatchJneShipments;
use App\Actions\Reports\QueryActiveJneAwbs;
use App\Http\Requests\BulkJneReportProfileRequest;
use App\Jobs\ImportJneReportAwbs;
use App\Models\Customer;
use App\Models\JneReportProfile;
use App\Models\JneShipment;
use App\Models\PickupTask;
use App\Models\ReportJob;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class JneMonitoringController extends Controller
{
    public function index(Request $request): Response
    {
        $this->authorizeAdmin($request);
        $filters = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'account' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(JneShipment::STATUSES)], 'match' => ['nullable', Rule::in(JneShipment::MATCH_STATUSES)],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'], 'customer_match' => ['nullable', Rule::in(JneShipment::MATCH_STATUSES)], 'page' => ['sometimes', 'integer', 'min:1']]);
        $query = JneShipment::query();
        if (! empty($filters['q'])) {
            $query->whereRaw("awb like ? ESCAPE '!'", [str_replace(['!', '%', '_'], ['!!', '!%', '!_'], trim($filters['q'])).'%']);
        }
        if (! empty($filters['account'])) {
            $query->where('customer_account', $filters['account']);
        }
        if (! empty($filters['customer_id'])) {
            $query->where('customer_id', $filters['customer_id']);
        }
        if (! empty($filters['customer_match'])) {
            $query->where('customer_match_status', $filters['customer_match']);
        }
        $summary = (clone $query)->selectRaw('tracking_status, count(*) as total')->groupBy('tracking_status')->pluck('total', 'tracking_status')->map(fn ($total): int => (int) $total);
        if (! empty($filters['status'])) {
            $query->where('tracking_status', $filters['status']);
        }
        if (! empty($filters['match'])) {
            $query->where('match_status', $filters['match']);
        }

        return Inertia::render('jne-monitoring', [
            'shipments' => $query->with(['latestSource:id,status_web,status_pod,consignee_name,shipper_name', 'customer:id,name,customer_code', 'pickup:id,reference,customer_name_snapshot'])->orderByDesc('last_observed_at')->orderByDesc('id')
                ->paginate(50)->withQueryString()->through(fn (JneShipment $shipment): array => [
                    ...$shipment->only(['id', 'awb', 'customer_account', 'tracking_status', 'match_status', 'match_method', 'match_note', 'pickup_task_id', 'customer_id', 'customer_match_status', 'customer_match_note']),
                    'customer_name' => $shipment->customer?->name, 'customer_code' => $shipment->customer?->customer_code, 'shipper_name' => $shipment->latestSource?->shipper_name,
                    'observed_at' => $shipment->last_observed_at?->toIso8601String(), 'status_web' => $shipment->latestSource?->status_web,
                    'status_pod' => $shipment->latestSource?->status_pod, 'consignee_name' => $shipment->latestSource?->consignee_name,
                    'pickup_reference' => $shipment->pickup?->reference,
                ]),
            'summary' => $summary, 'filters' => [...['q' => '', 'account' => '', 'status' => '', 'match' => ''], ...$filters],
            'accounts' => JneShipment::select('customer_account')->distinct()->orderBy('customer_account')->pluck('customer_account'),
            'trackingRefresh' => [
                'active_count' => JneShipment::whereNotIn('tracking_status', ['DELIVERED', 'CANCELLED'])->count(),
                'profile' => JneReportProfile::where('source', 'apex')->where('report_type', 'unresolved')->first()?->only(['id', 'enabled', 'interval_minutes', 'lookback_days', 'next_run_at', 'last_run_at', 'last_error']),
            ],
            'customers' => Customer::orderBy('name')->get(['id', 'name', 'customer_code']),
            'timezone' => config('pickup.timezone'),
        ]);
    }

    public function show(Request $request, int $shipment): Response
    {
        $this->authorizeAdmin($request);
        $record = JneShipment::with(['latestSource', 'customer:id,name,customer_code', 'pickup:id,reference,customer_name_snapshot'])->findOrFail($shipment);
        $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);
        $history = DB::table('jne_shipment_observations as h')->join('jne_report_awbs as a', 'a.id', '=', 'h.jne_report_awb_id')
            ->where('h.jne_shipment_id', $record->id)->select(['h.id', 'h.observed_at', 'h.tracking_status', 'h.changes_current', 'a.status_web', 'a.status_pod', 'a.awb_cancel', 'a.report_job_id', 'a.source_row'])
            ->orderByDesc('h.observed_at')->orderByDesc('h.id')->paginate(50)->withQueryString()
            ->through(fn ($item): array => [...(array) $item, 'observed_at' => CarbonImmutable::parse($item->observed_at, 'UTC')->toIso8601String(), 'changes_current' => (bool) $item->changes_current]);

        return Inertia::render('jne-shipment', [
            'shipment' => [...$record->only(['id', 'awb', 'customer_account', 'tracking_status', 'match_status', 'match_method', 'match_note', 'version', 'pickup_task_id']),
                ...$record->only(['customer_id', 'customer_match_status', 'customer_match_method', 'customer_match_note']),
                'customer_match_candidates' => $record->customer_match_candidates,
                'customer_name' => $record->customer?->name, 'customer_code' => $record->customer?->customer_code,
                'observed_at' => $record->last_observed_at?->toIso8601String(), 'pickup_reference' => $record->pickup?->reference,
                'pickup_customer' => $record->pickup?->customer_name_snapshot, 'source' => $record->latestSource?->only(['report_job_id', 'source_row', 'reference', 'shipper_name', 'consignee_name', 'status_web', 'status_pod', 'awb_cancel', 'raw_data'])],
            'history' => $history,
            'matchHistory' => DB::table('jne_shipment_match_events as e')->leftJoin('users as u', 'u.id', '=', 'e.actor_id')
                ->leftJoin('pickup_tasks as p', 'p.id', '=', 'e.pickup_task_id')->leftJoin('pickup_tasks as old', 'old.id', '=', 'e.previous_pickup_task_id')
                ->where('e.jne_shipment_id', $record->id)->orderByDesc('e.id')->limit(50)
                ->get(['e.id', 'e.method', 'e.match_status', 'e.reason', 'e.created_at', 'u.name as actor_name', 'p.reference as pickup_reference', 'old.reference as previous_pickup_reference']),
            'timezone' => config('pickup.timezone'),
        ]);
    }

    public function match(Request $request, int $shipment, MatchJneShipments $matcher): RedirectResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['pickup_reference' => ['nullable', 'string', 'max:100'], 'version' => ['required', 'integer', 'min:1'], 'reason' => ['required', 'string', 'max:500']]);
        $matcher->manual($request->user(), $shipment, $data['pickup_reference'] ?? null, $data['version'], $data['reason']);

        return to_route('jne-monitoring.show', $shipment);
    }

    public function profiles(Request $request): Response
    {
        $this->authorizeAdmin($request);

        return Inertia::render('jne-profiles', [
            'activeAwbs' => [
                'total' => JneShipment::whereNotIn('tracking_status', ['DELIVERED', 'CANCELLED'])->count(),
                'eligible' => app(QueryActiveJneAwbs::class)->handle(JneReportProfile::where('source', 'apex')->where('report_type', 'unresolved')->value('lookback_days') ?? 60)->distinct()->count('awb'),
            ],
            'profiles' => JneReportProfile::orderBy('customer_account')->get()->map(fn (JneReportProfile $profile): array => [
                ...$profile->only(['id', 'source', 'report_type', 'customer_account', 'national_account', 'label', 'enabled', 'mode', 'lookback_days', 'interval_minutes', 'last_error', 'version']),
                'date_from' => $profile->date_from?->toDateString(), 'date_thru' => $profile->date_thru?->toDateString(),
                'next_run_at' => $profile->next_run_at?->toIso8601String(), 'last_run_at' => $profile->last_run_at?->toIso8601String(),
            ]),
            'issues' => ReportJob::whereNull('hybrid_batch_id')->whereNull('reviewed_at')->where(fn ($query) => $query->whereIn('status', ['FAILED', 'NEEDS_ATTENTION'])->orWhere('import_status', 'FAILED')->orWhere('projection_status', 'FAILED'))
                ->orderByDesc('id')->limit(50)->get(['id', 'source', 'customer_account', 'status', 'error_message', 'import_error', 'projection_error']),
            'timezone' => config('pickup.timezone'),
        ]);
    }

    public function saveProfile(Request $request, ?int $profile = null): RedirectResponse
    {
        $this->authorizeAdmin($request);
        $request->merge(['source' => $request->input('source', 'apex'), 'report_type' => $request->input('report_type', 'apex')]);
        $request->validate(['source' => ['required', 'string', Rule::in(array_keys(ReportJob::SOURCE_SLOTS))]]);
        $kinds = ReportJob::REPORT_TYPES[$request->input('source')];
        $request->validate(['report_type' => ['required', 'string', Rule::in($kinds)]]);
        if ($request->input('report_type') === 'unresolved') {
            $request->merge(['customer_account' => 'AWB_AKTIF', 'mode' => 'rolling', 'date_from' => null, 'date_thru' => null]);
        }
        if ($request->input('source') !== 'apex') {
            $request->merge(['customer_account' => $request->input('source') === 'hybrid' ? 'HYBRID_GABUNGAN' : strtoupper($request->input('source')), 'mode' => 'rolling', 'lookback_days' => 1, 'date_from' => null, 'date_thru' => null]);
        }
        $account = $request->input('customer_account');
        if (is_string($account)) {
            $request->merge(['customer_account' => mb_strtoupper(trim($account))]);
        }
        $data = $request->validate([
            'national_account' => ['sometimes', 'required', Rule::in(['Y', 'N'])],
            'source' => ['required', Rule::in(array_keys(ReportJob::SOURCE_SLOTS))],
            'report_type' => ['required', Rule::in($kinds)],
            'customer_account' => ['required', 'string', 'max:100', 'regex:/^[\pL\pN._\- ]+$/u', Rule::unique('jne_report_profiles')->where('source', $request->input('source'))->where('report_type', $request->input('report_type'))->ignore($profile)],
            'label' => ['nullable', 'string', 'max:150'], 'enabled' => ['required', 'boolean'],
            'mode' => ['required', Rule::in(['rolling', 'fixed'])], 'lookback_days' => ['required', 'integer', 'min:1', 'max:366'],
            'date_from' => ['nullable', 'required_if:mode,fixed', 'date_format:Y-m-d'],
            'date_thru' => ['nullable', 'required_if:mode,fixed', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'interval_minutes' => ['required', 'integer', 'min:5', 'max:1440'], 'version' => [$profile ? 'required' : 'nullable', 'integer', 'min:1'],
        ]);
        if ($data['mode'] === 'fixed' && CarbonImmutable::parse($data['date_from'])->diffInDays(CarbonImmutable::parse($data['date_thru'])) >= config('jne-reports.max_request_days')) {
            throw ValidationException::withMessages(['date_thru' => 'Rentang maksimal 366 hari, termasuk tanggal awal dan akhir.']);
        }
        DB::transaction(function () use ($profile, $data, $request): void {
            $record = $profile ? JneReportProfile::whereKey($profile)->lockForUpdate()->firstOrFail() : new JneReportProfile;
            if ($profile) {
                abort_if($record->version !== $data['version'], 409, 'Sumber report berubah. Muat ulang sebelum menyimpan.');
                abort_if($record->customer_account !== $data['customer_account'], 422, 'Nomor penarikan pada sumber tersimpan tidak dapat diganti.');
                abort_if($record->source !== $data['source'] || $record->report_type !== $data['report_type'], 422, 'Sumber dan jenis report tersimpan tidak dapat diganti. Buat konfigurasi baru.');
            }
            $payload = $data;
            unset($payload['version']);
            $record->fill($payload);
            $record->fill(['created_by' => $record->exists ? $record->created_by : $request->user()->id, 'updated_by' => $request->user()->id,
                'next_run_at' => $data['enabled'] ? now() : null, 'last_error' => null, 'version' => $record->exists ? $record->version + 1 : 1]);
            $record->save();
        });

        return to_route('jne-monitoring.profiles');
    }

    public function bulkProfiles(BulkJneReportProfileRequest $request): RedirectResponse
    {
        $data = $request->validated();
        DB::transaction(function () use ($data, $request): void {
            foreach ($data['accounts'] as $index => $account) {
                $number = mb_strtoupper(trim($account['customer_account']));
                $existing = JneReportProfile::where('source', 'apex')->where('report_type', 'apex')->where('customer_account', $number)->lockForUpdate()->first();
                if ($existing !== null) {
                    if ($existing->national_account !== $account['national_account']) {
                        throw ValidationException::withMessages(["accounts.{$index}.national_account" => "Account {$number} sudah tersimpan dengan National Acc/Cust berbeda. Ubah melalui tombol Atur."]);
                    }

                    continue;
                }
                JneReportProfile::create([
                    ...$account, 'customer_account' => $number, 'source' => 'apex', 'report_type' => 'apex',
                    'label' => null, 'mode' => 'rolling', 'lookback_days' => $data['lookback_days'],
                    'enabled' => $data['enabled'], 'interval_minutes' => $data['interval_minutes'],
                    'next_run_at' => $data['enabled'] ? now() : null,
                    'created_by' => $request->user()->id, 'updated_by' => $request->user()->id,
                ]);
            }
        });

        return to_route('jne-monitoring.profiles');
    }

    public function rebuild(Request $request): RedirectResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['account' => ['nullable', 'string', 'max:100']]);
        $query = ReportJob::where('status', 'COMPLETED')->where('import_status', 'IMPORTED');
        if (! empty($data['account'])) {
            $query->where('customer_account', $data['account']);
        }
        $query->chunkById(100, function ($jobs): void {
            foreach ($jobs as $job) {
                $job->update(['projection_status' => 'QUEUED', 'projection_error' => null]);
                ImportJneReportAwbs::dispatch($job->id);
            }
        });

        return to_route('jne-monitoring.index');
    }

    public function review(Request $request, int $reportJob): RedirectResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['reason' => ['required', 'string', 'max:500'], 'return_to_report' => ['sometimes', 'boolean'], 'return_to_runs' => ['sometimes', 'boolean']]);
        DB::transaction(function () use ($reportJob, $data, $request): void {
            $job = ReportJob::whereKey($reportJob)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($job->status, ['FAILED', 'NEEDS_ATTENTION'], true) || $job->import_status === 'FAILED' || $job->projection_status === 'FAILED', 409);
            $job->update(['reviewed_at' => now(), 'reviewed_by' => $request->user()->id, 'review_note' => $data['reason']]);
        });

        if ($request->boolean('return_to_runs')) {
            return to_route('report-runs.index');
        }

        return $request->boolean('return_to_report') ? to_route('jne-reports.awbs', $reportJob) : to_route('jne-monitoring.profiles');
    }

    public function reconciliation(Request $request, QueryPackageProcessing $processing, BuildJnePickupReconciliation $pop): Response
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $records = $processing->handle(['q' => $data['q'] ?? '']);
        $grouped = DB::query()->fromSub($records, 'p')->select(['id', 'reference', 'customer_name'])
            ->selectRaw('sum(manual_quantity) as declared_successful, sum(received_quantity) as received_quantity, min(case when received_quantity is null then 0 else 1 end) as has_baseline, max(reconciliation_required) as baseline_review')
            ->groupBy('id', 'reference', 'customer_name')->orderByDesc('id')->paginate(30)->withQueryString();
        $popResults = $pop->handle(PickupTask::whereIn('id', $grouped->getCollection()->pluck('id'))->with('proof.revisions')->get());
        $counts = collect($popResults)->map(fn (array $result): int => $result['confirmed_pickup_awbs']);

        $coverage = JneShipment::leftJoin('pickup_tasks as p', 'p.id', '=', 'jne_shipments.pickup_task_id')
            ->selectRaw("count(*) as total, sum(case when match_status = 'MATCHED' and customer_match_status = 'MATCHED' and jne_shipments.customer_id = p.customer_id then 1 else 0 end) as linked")->first();

        return Inertia::render('jne-reconciliation', [
            'linkage' => ['total' => (int) $coverage->getAttribute('total'), 'linked' => (int) $coverage->getAttribute('linked')],
            'pickups' => $grouped->through(fn ($row): array => [...(array) $row, 'declared_successful' => (int) $row->declared_successful,
                'received_quantity' => $row->has_baseline ? (int) $row->received_quantity : null,
                'comparison_ready' => (int) ($counts[$row->id] ?? 0) > 0,
                'pop_reconciliation' => $popResults[$row->id],
                'matched_awbs' => (int) ($counts[$row->id] ?? 0), 'difference' => (int) $row->declared_successful - (int) ($counts[$row->id] ?? 0),
                'state' => ! $row->has_baseline ? 'NO_BASELINE' : ($row->baseline_review ? 'BASELINE_REVIEW' : ((int) $row->declared_successful === (int) ($counts[$row->id] ?? 0) ? 'MATCHED_COUNTS' : 'MISMATCH'))]),
            'filters' => ['q' => $data['q'] ?? ''],
        ]);
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);
    }
}

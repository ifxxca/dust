<?php

namespace App\Http\Controllers;

use App\Actions\Pickup\QueryPackageProcessing;
use App\Actions\Reports\BuildJnePickupReconciliation;
use App\Actions\Reports\ManageJneRefreshPolicy;
use App\Actions\Reports\MatchJneShipments;
use App\Actions\Reports\QueryActiveJneAwbs;
use App\Actions\Reports\QueryJneCollectionWindows;
use App\Actions\Reports\ResolveJneCategories;
use App\Http\Requests\BulkJneReportProfileRequest;
use App\Jobs\ImportJneReportAwbs;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneReportProfile;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class JneMonitoringController extends Controller
{
    public function index(Request $request): Response
    {
        $this->authorizeAdmin($request);
        $filters = $this->shipmentFilters($request);
        $query = $this->shipmentQuery($filters, false);
        $summaryQuery = clone $query;
        if (! empty($filters['status'])) {
            $query->where('tracking_status', $filters['status']);
        }
        $refreshProfile = JneReportProfile::where('source', 'apex')->where('report_type', 'unresolved')->first();
        $refreshPolicy = $refreshProfile ? ManageJneRefreshPolicy::active($refreshProfile) : null;
        $metrics = null;
        $loadMetrics = function () use (&$metrics, $summaryQuery): Collection {
            return $metrics ??= DB::query()->fromSub((clone $summaryQuery)->select([
                'tracking_status', 'customer_match_status', 'match_status', 'category_status', 'customer_id', 'pickup_task_id',
            ]), 's')->leftJoin('pickup_tasks as cp', 'cp.id', '=', 's.pickup_task_id')
                ->selectRaw("s.tracking_status, count(*) as collected,
                    count(case when s.customer_match_status = 'MATCHED' and s.customer_id is not null then 1 end) as customer_matched,
                    count(case when s.customer_match_status = 'MATCHED' and s.match_status = 'MATCHED' and s.customer_id = cp.customer_id then 1 end) as pickup_matched,
                    count(case when s.customer_match_status = 'CANDIDATE' then 1 end) as candidates,
                    count(case when s.customer_match_status = 'CONFLICT' then 1 end) as conflicts,
                    count(case when s.customer_match_status = 'AMBIGUOUS' then 1 end) as ambiguous,
                    count(case when s.customer_match_status = 'UNMATCHED' then 1 end) as unmatched,
                    count(case when s.match_status in ('CONFLICT', 'AMBIGUOUS') then 1 end) as pickup_conflicts,
                    count(case when s.category_status = 'MATCHED' and s.customer_match_status = 'MATCHED' and s.match_status = 'MATCHED' and s.customer_id = cp.customer_id then 1 end) as category_confirmed,
                    count(case when s.category_status <> 'MATCHED' then 1 end) as unclassified")
                ->groupBy('s.tracking_status')->get();
        };
        $selectedMetrics = fn (): Collection => empty($filters['status']) ? $loadMetrics() : $loadMetrics()->where('tracking_status', $filters['status']);

        return Inertia::render('jne-monitoring', [
            'shipments' => fn () => (clone $query)->select(['id', 'awb', 'customer_account', 'tracking_status', 'match_status', 'match_method', 'match_note', 'pickup_task_id', 'customer_id', 'customer_match_status', 'customer_match_note', 'category', 'category_status', 'latest_report_awb_id', 'last_observed_at'])
                ->with(['latestSource:id,entry_at,status_web,status_pod,consignee_name,shipper_name', 'customer:id,name,customer_code', 'pickup:id,reference,customer_name_snapshot'])->orderByDesc('last_observed_at')->orderByDesc('id')
                ->paginate((int) ($filters['per_page'] ?? 20))->withQueryString()->through(fn (JneShipment $shipment): array => [
                    ...$shipment->only(['id', 'awb', 'customer_account', 'tracking_status', 'match_status', 'match_method', 'match_note', 'pickup_task_id', 'customer_id', 'customer_match_status', 'customer_match_note']),
                    'category' => ResolveJneCategories::markersEnabled() ? $shipment->category : null,
                    'category_status' => ResolveJneCategories::markersEnabled() ? $shipment->category_status : 'UNCONFIGURED',
                    'customer_name' => $shipment->customer?->name, 'customer_code' => $shipment->customer?->customer_code, 'shipper_name' => $shipment->latestSource?->shipper_name,
                    'entry_at' => $shipment->latestSource?->entry_at?->toIso8601String(),
                    'observed_at' => $shipment->last_observed_at?->toIso8601String(), 'status_web' => $shipment->latestSource?->status_web,
                    'status_pod' => $shipment->latestSource?->status_pod, 'consignee_name' => $shipment->latestSource?->consignee_name,
                    'pickup_reference' => $shipment->pickup?->reference,
                ]),
            'summary' => fn () => $loadMetrics()->pluck('collected', 'tracking_status')->map(fn ($total): int => (int) $total),
            'filters' => [...['q' => '', 'account' => '', 'status' => '', 'match' => ''], ...$filters],
            'identitySummary' => fn () => collect(['collected', 'customer_matched', 'pickup_matched', 'candidates', 'conflicts', 'ambiguous', 'unmatched'])
                ->mapWithKeys(fn (string $key): array => [$key => (int) $selectedMetrics()->sum($key)]),
            'operationsSummary' => fn () => [
                'source_observations' => DB::table('jne_report_awbs')->whereIn('awb', (clone $query)->select('awb'))->count(),
                'pickup_conflicts' => (int) $selectedMetrics()->sum('pickup_conflicts'),
                'category_confirmed' => ResolveJneCategories::markersEnabled() ? (int) $selectedMetrics()->sum('category_confirmed') : null,
                'unclassified' => ResolveJneCategories::markersEnabled() ? (int) $selectedMetrics()->sum('unclassified') : null,
                'last_report_received_at' => DB::table('jne_shipment_observations')->whereIn('jne_shipment_id', (clone $query)->select('id'))->max('created_at'),
                'global_collection_failures' => ReportJob::whereNull('hybrid_batch_id')->whereNull('reviewed_at')->where(fn ($query) => $query->whereIn('status', ['FAILED', 'NEEDS_ATTENTION'])->orWhere('import_status', 'FAILED')->orWhere('projection_status', 'FAILED'))->count(),
                'global_sertim_awaiting_source' => DB::table('pickup_cashless_awbs as e')->whereNotNull('e.awb')->whereNotExists(fn ($query) => $query->selectRaw('1')->from('jne_shipments as s')->whereColumn('s.awb', 'e.awb'))->count(),
                'gates' => ['checkpoints' => (bool) config('jne-reports.batch_checkpoints_enabled'), 'identity' => (bool) config('jne-reports.evidence_policies_enabled'),
                    'categories' => ResolveJneCategories::markersEnabled(), 'collection' => QueryJneCollectionWindows::enabled(), 'tracking' => (bool) config('jne-reports.tracking_policies_enabled')],
            ],
            'accounts' => fn () => JneShipment::select('customer_account')->distinct()->orderBy('customer_account')->pluck('customer_account'),
            'trackingRefresh' => fn () => [
                'active_count' => $refreshPolicy ? app(QueryActiveJneAwbs::class)->handle($refreshProfile->lookback_days, $refreshPolicy)->count() : JneShipment::whereNotIn('tracking_status', ['DELIVERED', 'CANCELLED'])->count(),
                'due_count' => $refreshProfile ? app(QueryActiveJneAwbs::class)->due($refreshProfile->lookback_days, $refreshProfile->interval_minutes, $refreshPolicy)->count() : null,
                'policy_active' => $refreshPolicy !== null,
                'profile' => $refreshProfile?->only(['id', 'enabled', 'interval_minutes', 'lookback_days', 'next_run_at', 'last_run_at', 'last_error']),
            ],
            'customers' => fn () => Customer::orderBy('name')->get(['id', 'name', 'customer_code']),
            'timezone' => config('pickup.timezone'),
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $this->authorizeAdmin($request);
        $query = $this->shipmentQuery($this->shipmentFilters($request))
            ->with(['customer:id,name,customer_code', 'latestSource:id,entry_at,shipper_name,consignee_name']);
        $selection = $request->validate(['ids' => ['sometimes', 'array', 'min:1', 'max:50'], 'ids.*' => ['required', 'integer', 'min:1', 'distinct']]);
        if (! empty($selection['ids'])) {
            $query->whereIn('id', $selection['ids']);
        }
        $timezone = config('pickup.timezone');

        return response()->streamDownload(function () use ($query, $timezone): void {
            $output = fopen('php://output', 'wb');
            if ($output === false) {
                throw new \RuntimeException('Output ekspor CSV tidak dapat dibuka.');
            }
            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, ['AWB', 'Kode customer', 'Customer', 'Pengirim JNE', 'Status', 'Penerima', 'Tanggal AWB', 'Terakhir diamati', 'Timezone', 'Kategori', 'Status kategori'], ',', '"', '');
            foreach ($query->orderByDesc('last_observed_at')->orderByDesc('id')->lazy(500) as $shipment) {
                $values = [$shipment->awb, $shipment->customer?->customer_code, $shipment->customer?->name,
                    $shipment->latestSource?->shipper_name, $shipment->tracking_status, $shipment->latestSource?->consignee_name,
                    $shipment->latestSource?->entry_at?->setTimezone($timezone)->format('Y-m-d H:i:s'),
                    $shipment->last_observed_at?->setTimezone($timezone)->format('Y-m-d H:i:s'), $timezone, $shipment->category, $shipment->category_status];
                fputcsv($output, array_map(fn ($value): string => preg_match('/^[\s]*[=+@-]/u', (string) $value) ? "'".$value : (string) $value, $values), ',', '"', '');
            }
            fclose($output);
        }, 'pengiriman-jne-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8', 'Cache-Control' => 'private, no-store']);
    }

    /** @return array<string, mixed> */
    private function shipmentFilters(Request $request): array
    {
        return $request->validate([
            'q' => ['nullable', 'string', 'max:100'], 'account' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(JneShipment::STATUSES)], 'match' => ['nullable', Rule::in(JneShipment::MATCH_STATUSES)],
            'category' => ['nullable', Rule::in([...PickupProcessingRecord::CATEGORIES, 'review'])],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'], 'customer_match' => ['nullable', Rule::in(JneShipment::MATCH_STATUSES)],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_thru' => ['nullable', 'date_format:Y-m-d', Rule::when($request->filled('date_from'), ['after_or_equal:date_from'])],
            'per_page' => ['nullable', 'integer', Rule::in([10, 20, 50])], 'page' => ['sometimes', 'integer', 'min:1'],
        ]);
    }

    /** @param array<string, mixed> $filters
     * @return Builder<JneShipment>
     */
    private function shipmentQuery(array $filters, bool $includeStatus = true): Builder
    {
        $query = JneShipment::query();
        if (! empty($filters['category'])) {
            if ($filters['category'] === 'review') {
                $query->where('category_status', '<>', 'MATCHED');
            } else {
                $query->where('category', $filters['category'])->where('category_status', 'MATCHED');
            }
        }
        if (isset($filters['q']) && trim($filters['q']) !== '') {
            $term = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], trim($filters['q']));
            $matches = JneShipment::select('id')->whereRaw("awb like ? ESCAPE '!'", [$term.'%'])
                ->union(JneShipment::select('id')->whereIn('customer_id', Customer::select('id')->whereRaw("name like ? ESCAPE '!'", ['%'.$term.'%'])->orWhereRaw("customer_code like ? ESCAPE '!'", [$term.'%'])))
                ->union(JneShipment::select('id')->whereIn('latest_report_awb_id', JneReportAwb::select('id')->whereRaw("shipper_name like ? ESCAPE '!'", ['%'.$term.'%'])))
                ->union(JneShipment::select('id')->whereIn('latest_report_awb_id', JneReportAwb::select('id')->whereRaw("consignee_name like ? ESCAPE '!'", ['%'.$term.'%'])));
            $query->whereIn('id', DB::query()->fromSub($matches, 'search_matches')->select('id'));
        }
        foreach (['account' => 'customer_account', 'customer_id' => 'customer_id', 'customer_match' => 'customer_match_status', 'match' => 'match_status', ...($includeStatus ? ['status' => 'tracking_status'] : [])] as $filter => $column) {
            if (! empty($filters[$filter])) {
                $query->where($column, $filters[$filter]);
            }
        }
        if (! empty($filters['date_from']) || ! empty($filters['date_thru'])) {
            $query->whereHas('latestSource', function (Builder $source) use ($filters): void {
                if (! empty($filters['date_from'])) {
                    $source->where('entry_at', '>=', CarbonImmutable::parse($filters['date_from'], config('pickup.timezone'))->startOfDay()->utc());
                }
                if (! empty($filters['date_thru'])) {
                    $source->where('entry_at', '<', CarbonImmutable::parse($filters['date_thru'], config('pickup.timezone'))->startOfDay()->addDay()->utc());
                }
            });
        }

        return $query;
    }

    public function show(Request $request, int $shipment): Response
    {
        $this->authorizeAdmin($request);
        $record = JneShipment::with(['latestSource', 'customer:id,name,customer_code', 'pickup:id,reference,customer_name_snapshot'])->withMax('observations as last_report_received_at', 'created_at')->findOrFail($shipment);
        $refreshAttempt = ReportJob::where('source', 'apex')->where('report_type', 'unresolved')->whereJsonContains('parameters->awbs', $record->awb)->latest('id')->first();
        $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);
        $history = DB::table('jne_shipment_observations as h')->join('jne_report_awbs as a', 'a.id', '=', 'h.jne_report_awb_id')
            ->where('h.jne_shipment_id', $record->id)->select(['h.id', 'h.observed_at', 'h.tracking_status', 'h.changes_current', 'a.status_web', 'a.status_pod', 'a.awb_cancel', 'a.report_job_id', 'a.source_row', 'a.shipper_name', 'a.customer_account', 'a.reference'])
            ->orderByDesc('h.observed_at')->orderByDesc('h.id')->paginate(50)->withQueryString()
            ->through(fn ($item): array => [...(array) $item, 'observed_at' => CarbonImmutable::parse($item->observed_at, 'UTC')->toIso8601String(), 'changes_current' => (bool) $item->changes_current]);

        return Inertia::render('jne-shipment', [
            'shipment' => [...$record->only(['id', 'awb', 'customer_account', 'tracking_status', 'match_status', 'match_method', 'match_note', 'version', 'pickup_task_id']),
                'category' => ResolveJneCategories::markersEnabled() ? $record->category : null, 'category_status' => ResolveJneCategories::markersEnabled() ? $record->category_status : 'UNCONFIGURED',
                'category_evidence' => ResolveJneCategories::markersEnabled() ? $record->category_evidence : null,
                ...$record->only(['customer_id', 'customer_match_status', 'customer_match_method', 'customer_match_note']),
                'customer_match_candidates' => $record->customer_match_candidates,
                'customer_name' => $record->customer?->name, 'customer_code' => $record->customer?->customer_code,
                'entry_at' => $record->latestSource?->entry_at?->toIso8601String(),
                'observed_at' => $record->last_observed_at?->toIso8601String(), 'pickup_reference' => $record->pickup?->reference,
                'last_report_received_at' => $record->last_report_received_at?->toIso8601String(),
                'last_refresh_attempt' => $refreshAttempt ? [...$refreshAttempt->only(['id', 'status', 'error_message', 'import_error', 'projection_error']), 'stage' => $refreshAttempt->workflowStage(), 'requested_at' => $refreshAttempt->created_at->toIso8601String()] : null,
                'pickup_customer' => $record->pickup?->customer_name_snapshot, 'source' => $record->latestSource?->only(['report_job_id', 'source_row', 'reference', 'shipper_name', 'consignee_name', 'status_web', 'status_pod', 'awb_cancel', 'raw_data', 'original_customer_code', 'source_evidence'])],
            'history' => $history,
            'matchHistory' => JneShipmentMatchEvent::from('jne_shipment_match_events as e')->leftJoin('users as u', 'u.id', '=', 'e.actor_id')
                ->leftJoin('pickup_tasks as p', 'p.id', '=', 'e.pickup_task_id')->leftJoin('pickup_tasks as old', 'old.id', '=', 'e.previous_pickup_task_id')
                ->where('e.jne_shipment_id', $record->id)->orderByDesc('e.id')->limit(50)
                ->get(['e.id', 'e.method', 'e.match_status', 'e.reason', 'e.evidence', 'e.previous_customer_id', 'e.customer_id', 'e.customer_match_status', 'e.created_at', 'u.name as actor_name', 'p.reference as pickup_reference', 'old.reference as previous_pickup_reference']),
            'decisionPages' => JneShipmentMatchEvent::where('jne_shipment_id', $record->id)->orderByDesc('id')->paginate(50, ['id', 'method', 'actor_id', 'reason', 'evidence', 'created_at'], 'decisions_page')->withQueryString(),
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
            'profiles' => JneReportProfile::where(fn ($query) => $query->where('source', '<>', 'hybrid')->orWhere('customer_account', '<>', 'HYBRID_GABUNGAN'))->orderBy('customer_account')->get()->map(fn (JneReportProfile $profile): array => [
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
            if ($request->input('source') === 'hybrid') {
                $request->validate(['customer_account' => ['required', Rule::in(array_keys(ReportJob::HYBRID_SERVERS))]]);
            }
            $request->merge(['customer_account' => $request->input('source') === 'hybrid' ? $request->input('customer_account') : strtoupper($request->input('source')), 'mode' => 'rolling', 'lookback_days' => 1, 'date_from' => null, 'date_thru' => null]);
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

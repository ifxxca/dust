<?php

namespace App\Http\Controllers;

use App\Actions\Reports\ManageReportJobs;
use App\Http\Requests\StoreReportJobRequest;
use App\Models\JneReportAwb;
use App\Models\JneReportProfile;
use App\Models\ReportJob;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportJobController extends Controller
{
    public function index(Request $request): Response
    {
        $this->authorizeAdmin($request);

        $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);
        $requests = ReportJob::where('source', 'apex')->selectRaw('MAX(id) as id')->groupByRaw('COALESCE(request_key, CAST(id AS CHAR))')
            ->orderByDesc('id')->paginate(20)->withQueryString();
        $heads = ReportJob::whereIn('id', $requests->pluck('id'))->get();
        $jobs = ReportJob::where(function ($query) use ($heads): void {
            $query->whereIn('request_key', $heads->pluck('request_key')->filter())
                ->orWhereIn('id', $heads->whereNull('request_key')->pluck('id'));
        })->orderByDesc('id')->get();

        $partsByRequest = $jobs->groupBy(fn (ReportJob $job): string => $job->request_key ?? (string) $job->id);
        $headsById = $heads->keyBy('id');

        return Inertia::render('jne-reports', [
            'requests' => $requests->through(function (ReportJob $head) use ($partsByRequest, $headsById): array {
                $parts = $partsByRequest->get($headsById[$head->id]->request_key ?? (string) $head->id);

                return ['id' => $head->id, 'created_at' => $parts->min('created_at')->toIso8601String(), 'job_ids' => $parts->pluck('id')->values(),
                    'customer_account' => $parts->first()->customer_account,
                    'date_from' => $parts->min('date_from')->toDateString(), 'date_thru' => $parts->max('date_thru')->toDateString(),
                    'ready_count' => $parts->filter(fn (ReportJob $job): bool => $job->workflowStage() === 'READY')->count(),
                    'stored_count' => $parts->where('status', 'COMPLETED')->count(),
                    'issue_count' => $parts->filter(fn (ReportJob $job): bool => $job->workflowStage() === 'ATTENTION')->count(),
                    'total' => $parts->count()];
            }),
            'sources' => JneReportProfile::where('source', 'apex')->where('report_type', 'apex')->orderBy('label')->orderBy('customer_account')->get(['id', 'customer_account', 'national_account', 'label']),
            'jobs' => $jobs->map(fn (ReportJob $job): array => [
                'id' => $job->id, 'customer_account' => $job->customer_account,
                'date_from' => $job->date_from->toDateString(), 'date_thru' => $job->date_thru->toDateString(),
                'status' => $job->status, 'workflow_stage' => $job->workflowStage(), 'request_key' => $job->request_key, 'attempt_count' => $job->attempt_count,
                'created_at' => $job->created_at->toIso8601String(), 'started_at' => $job->started_at?->toIso8601String(),
                'completed_at' => $job->completed_at?->toIso8601String(), 'error_message' => $job->error_message,
                'file_size' => $job->file_size, 'file_checksum' => $job->file_checksum,
                'lease_expired' => $job->lease_expires_at?->isPast() ?? false,
                'import_status' => $job->import_status, 'imported_awb_count' => $job->imported_awb_count,
                'import_error' => $job->import_error,
                'projection_status' => $job->projection_status, 'projection_error' => $job->projection_error,
            ]),
            'timezone' => config('pickup.timezone'),
            'limits' => [
                'max_days' => config('jne-reports.max_report_days'),
                'max_request_days' => config('jne-reports.max_request_days'),
                'max_awbs' => config('jne-reports.max_awbs'),
            ],
        ]);
    }

    public function store(StoreReportJobRequest $request): RedirectResponse
    {
        $data = $request->safe()->only(['customer_account', 'national_account', 'accounts', 'date_from', 'date_thru']);
        $lastDate = CarbonImmutable::parse($data['date_thru']);
        $maxDays = config('jne-reports.max_report_days');

        DB::transaction(function () use ($data, $lastDate, $maxDays, $request): void {
            $requestKey = (string) Str::uuid();
            $accounts = $data['accounts'] ?? [['customer_account' => $data['customer_account'], 'national_account' => $data['national_account'] ?? 'N']];
            foreach ($accounts as $account) {
                for ($from = CarbonImmutable::parse($data['date_from']); $from->lessThanOrEqualTo($lastDate); $from = $thru->addDay()) {
                    $thru = $from->addDays($maxDays - 1)->min($lastDate);
                    ReportJob::create([
                        'request_key' => $requestKey, 'customer_account' => mb_strtoupper(trim($account['customer_account'])), 'national_account' => $account['national_account'],
                        'date_from' => $from->toDateString(), 'date_thru' => $thru->toDateString(),
                        'report_mode' => config('jne-reports.report_mode'), 'created_by' => $request->user()->id, 'status' => 'QUEUED',
                    ]);
                }
            }
        });

        return to_route('jne-reports.index');
    }

    public function download(Request $request, ReportJob $reportJob): StreamedResponse
    {
        $this->authorizeAdmin($request);
        abort_unless($reportJob->status === 'COMPLETED' && $reportJob->file_path, 404);
        $disk = Storage::disk('jne_reports');
        abort_unless($disk->exists($reportJob->file_path), 404, 'CSV tidak tersedia. Hubungi pengelola penyimpanan.');

        return $disk->download($reportJob->file_path, 'jne-report-'.$reportJob->id.'.csv', [
            'Content-Type' => 'text/csv', 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function recover(Request $request, ManageReportJobs $jobs): RedirectResponse
    {
        $this->authorizeAdmin($request);
        $jobs->recoverExpired();

        return to_route('jne-reports.index');
    }

    public function awbs(Request $request, int $reportJob): Response
    {
        $this->authorizeAdmin($request);
        $job = ReportJob::findOrFail($reportJob);
        $data = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1']]);
        $search = trim($data['q'] ?? '');
        $query = JneReportAwb::where('report_job_id', $job->id);
        if ($search !== '') {
            $query->whereRaw("awb like ? ESCAPE '!'", [str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $search).'%']);
        }

        return Inertia::render('jne-report-awbs', [
            'report' => [
                'id' => $job->id, 'customer_account' => $job->customer_account,
                'date_from' => $job->date_from->toDateString(), 'date_thru' => $job->date_thru->toDateString(),
                'status' => $job->status, 'workflow_stage' => $job->workflowStage(),
                'projection_status' => $job->projection_status, 'projection_error' => $job->projection_error,
                'error_message' => $job->error_message, 'review_note' => $job->review_note,
                'reviewed_at' => $job->reviewed_at?->toIso8601String(), 'import_status' => $job->import_status,
                'imported_awb_count' => $job->imported_awb_count, 'duplicate_awb_count' => $job->duplicate_awb_count,
                'imported_at' => $job->imported_at?->toIso8601String(), 'import_error' => $job->import_error,
            ],
            'awbs' => $query->orderBy('id')->paginate(50)->withQueryString()->through(fn (JneReportAwb $awb): array => $awb->only([
                'id', 'awb', 'customer_account', 'status_web', 'status_pod', 'awb_cancel', 'shipper_name', 'consignee_name', 'source_row',
            ])),
            'filters' => ['q' => $search],
            'timezone' => config('pickup.timezone'),
        ]);
    }

    public function importAwbs(Request $request, int $reportJob, ManageReportJobs $jobs): RedirectResponse
    {
        $this->authorizeAdmin($request);
        $jobs->queueImport($reportJob);

        return to_route('jne-reports.awbs', $reportJob);
    }

    public function project(Request $request, int $reportJob, ManageReportJobs $jobs): RedirectResponse
    {
        $this->authorizeAdmin($request);
        $jobs->queueProjection($reportJob);

        return to_route('jne-reports.awbs', $reportJob);
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);
    }
}

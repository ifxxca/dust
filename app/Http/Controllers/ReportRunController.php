<?php

namespace App\Http\Controllers;

use App\Actions\Reports\ManageReportJobs;
use App\Actions\Reports\QueueScheduledJneReports;
use App\Models\JneReportProfile;
use App\Models\ReportJob;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ReportRunController extends Controller
{
    public function index(Request $request): Response
    {
        $this->authorizeAdmin($request);
        $data = $request->validate([
            'source' => ['nullable', Rule::in(array_keys(ReportJob::SOURCE_SLOTS))],
            'status' => ['nullable', Rule::in(['QUEUED', 'COLLECTING_SOURCES', 'WAITING_APEX', ...ReportJob::ACTIVE_STATUSES, ...ReportJob::TERMINAL_STATUSES])],
            'q' => ['nullable', 'string', 'max:100'], 'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $query = ReportJob::whereNull('hybrid_batch_id');
        foreach (['source', 'status'] as $filter) {
            if (! empty($data[$filter])) {
                $query->where($filter, $data[$filter]);
            }
        }
        if (! empty($data['q'])) {
            $query->whereRaw("customer_account like ? ESCAPE '!'", ['%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $data['q']).'%']);
        }
        $runs = $query->orderByDesc('id')->paginate(20)->withQueryString();
        $events = DB::table('report_job_events')->whereIn('report_job_id', $runs->pluck('id'))->orderBy('id')->get()->groupBy('report_job_id');
        $sources = ReportJob::whereIn('hybrid_batch_id', $runs->pluck('id'))->orderBy('id')->get(['id', 'hybrid_batch_id', 'source', 'report_type', 'status', 'source_row_count', 'awb_count', 'error_message'])->groupBy('hybrid_batch_id');

        return Inertia::render('jne-report-runs', [
            'runs' => $runs->through(fn (ReportJob $job): array => [
                ...$job->only(['id', 'source', 'report_type', 'customer_account', 'jne_report_profile_id', 'status', 'worker_id', 'attempt_count', 'row_count', 'source_row_count', 'awb_count', 'file_size', 'file_checksum', 'error_message', 'review_note', 'import_status', 'import_error', 'projection_error']),
                'workflow_stage' => $job->workflowStage(), 'national_account' => $job->national_account,
                'date_from' => $job->date_from->toDateString(), 'date_thru' => $job->date_thru->toDateString(),
                'created_at' => $job->created_at->toIso8601String(), 'started_at' => $job->started_at?->toIso8601String(),
                'completed_at' => $job->completed_at?->toIso8601String(), 'reviewed_at' => $job->reviewed_at?->toIso8601String(),
                'events' => $events->get($job->id, collect())->map(fn ($event): array => [
                    'id' => $event->id, 'status' => $event->status, 'worker_id' => $event->worker_id,
                    'message' => $event->message, 'created_at' => CarbonImmutable::parse($event->created_at, 'UTC')->toIso8601String(),
                ])->values(),
                'sources' => $sources->get($job->id, collect())->values(),
            ]),
            'profiles' => JneReportProfile::orderBy('source')->orderBy('id')->get(['id', 'source', 'report_type', 'customer_account', 'label']),
            'filters' => ['source' => $data['source'] ?? '', 'status' => $data['status'] ?? '', 'q' => $data['q'] ?? ''],
            'timezone' => config('pickup.timezone'),
            'today' => CarbonImmutable::now('Asia/Jakarta')->toDateString(),
        ]);
    }

    public function store(Request $request, QueueScheduledJneReports $scheduler): RedirectResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['profile_id' => ['required', 'integer', 'exists:jne_report_profiles,id'], 'for_date' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:'.CarbonImmutable::now('Asia/Jakarta')->toDateString()]]);
        if ($scheduler->queueProfile((int) $data['profile_id'], true, $data['for_date'] ?? null) === 0) {
            $profile = JneReportProfile::findOrFail((int) $data['profile_id']);
            throw ValidationException::withMessages(['run' => $profile->last_error ?: 'Report belum dapat dimasukkan ke antrean.']);
        }

        return back();
    }

    public function retrySources(Request $request, int $reportJob, ManageReportJobs $jobs): RedirectResponse
    {
        $this->authorizeAdmin($request);
        $jobs->retryHybridSources($reportJob, $request->user()->id);

        return to_route('report-runs.index');
    }

    public function recover(Request $request, ManageReportJobs $jobs): RedirectResponse
    {
        $this->authorizeAdmin($request);
        $jobs->recoverExpired();

        return to_route('report-runs.index');
    }

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->is_active && $request->user()->role === 'admin_supervisor', 403);
    }
}

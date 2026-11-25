<?php

namespace App\Http\Controllers;

use App\Actions\Reports\AssessJneCollectionProof;
use App\Actions\Reports\ManageReportJobs;
use App\Actions\Reports\ValidateApexAwbReport;
use App\Actions\Reports\ValidateHybridReportCsv;
use App\Actions\Reports\ValidateReportCsv;
use App\Models\ReportJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class InternalReportJobController extends Controller
{
    public function claim(Request $request, ManageReportJobs $jobs): JsonResponse|Response
    {
        $data = $request->validate(['claim_key' => ['required', 'uuid'], 'retry_protocol' => ['sometimes', 'integer', Rule::in([1])]]);
        $job = $jobs->claim($request->header('X-Worker-ID'), $data['claim_key'], $request->attributes->get('report_source', 'apex'), ($data['retry_protocol'] ?? null) === 1);
        if ($job === null) {
            return response()->noContent();
        }

        return response()->json(['data' => [
            'id' => $job->id, 'customer_account' => $job->customer_account, 'national_account' => $job->national_account,
            'source' => $job->source, 'report_type' => $job->report_type,
            'date_from' => $job->date_from->toDateString(), 'date_thru' => $job->date_thru->toDateString(),
            'report_mode' => $job->report_mode, 'parameters' => $job->parameters,
            'batch_checkpoints' => (bool) config('jne-reports.batch_checkpoints_enabled'),
            'automatic_retry' => (bool) config('jne-reports.automatic_retry_enabled') && $job->retry_protocol === 1,
            'attempt_count' => $job->attempt_count,
            'status' => $job->status, 'claim_token' => $job->claim_token,
            'lease_seconds' => config('jne-reports.lease_seconds'), 'max_file_kb' => config('jne-reports.max_file_kb'),
        ]]);
    }

    public function progress(Request $request, int $reportJob, ManageReportJobs $jobs): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(ReportJob::ACTIVE_STATUSES)]]);
        $job = $jobs->progress($reportJob, $request->header('X-Worker-ID'), $request->header('X-Report-Claim', ''), $data['status']);

        return response()->json(['data' => ['id' => $job->id, 'status' => $job->status]]);
    }

    public function upload(Request $request, int $reportJob, ManageReportJobs $jobs, ValidateReportCsv $csv, ValidateApexAwbReport $apex): JsonResponse
    {
        abort_unless($request->attributes->get('report_source') === 'apex', 403);
        $reportJob = ReportJob::findOrFail($reportJob);
        $jobs->assertOwner($reportJob, $request->header('X-Worker-ID'), $request->header('X-Report-Claim', ''), false);
        $data = $request->validate(['collection_evidence' => ['sometimes', 'string', 'json', 'max:16384'], 'file' => ['required', 'file', 'max:'.config('jne-reports.max_file_kb'), 'extensions:csv', 'mimetypes:text/plain,text/csv,text/x-csv,application/csv,application/vnd.ms-excel']]);
        $evidence = app(AssessJneCollectionProof::class)->decode($data['collection_evidence'] ?? null);
        $file = $request->file('file');
        $rowCount = $csv->handle($file, $reportJob->source === 'apex');
        if ($reportJob->source !== 'apex') {
            abort_unless($reportJob->source_file_path !== null, 409, 'CSV Hybrid harus diproses melalui antrean APEX.');
        }
        if ($reportJob->report_mode === 'A') {
            $apex->handle($reportJob, $file);
        }
        $job = $jobs->upload($reportJob->id, $request->header('X-Worker-ID'), $request->header('X-Report-Claim', ''), $file, $rowCount, $evidence);

        return response()->json(['data' => ['id' => $job->id, 'status' => $job->status, 'file_checksum' => $job->file_checksum]]);
    }

    public function uploadSource(Request $request, int $reportJob, ManageReportJobs $jobs, ValidateReportCsv $csv, ValidateHybridReportCsv $hybrid): JsonResponse
    {
        $job = ReportJob::findOrFail($reportJob);
        abort_unless($job->source !== 'apex' && $request->attributes->get('report_source') === $job->source, 403);
        $worker = $request->header('X-Worker-ID');
        $claim = $request->header('X-Report-Claim', '');
        if ($job->source_file_path) {
            abort_unless($job->source_worker_id === $worker && is_string($job->source_claim_token) && $claim !== '' && hash_equals($job->source_claim_token, $claim), 403);
        } else {
            $jobs->assertOwner($job, $worker, $claim);
        }
        $data = $request->validate(['collection_evidence' => ['sometimes', 'string', 'json', 'max:16384'], 'file' => ['required', 'file', 'max:'.config('jne-reports.max_file_kb'), 'extensions:csv', 'mimetypes:text/plain,text/csv,text/x-csv,application/csv,application/vnd.ms-excel']]);
        $evidence = app(AssessJneCollectionProof::class)->decode($data['collection_evidence'] ?? null);
        $file = $request->file('file');
        $rowCount = $csv->handle($file, false);
        $awbs = $hybrid->handle($job, $file);
        $saved = $jobs->uploadSource($job->id, $worker, $claim, $file, $rowCount, $awbs, $evidence);

        return response()->json(['data' => ['id' => $saved->id, 'status' => $saved->status, 'source_saved' => true, 'awb_count' => $saved->awb_count]]);
    }

    public function fail(Request $request, int $reportJob, ManageReportJobs $jobs): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['FAILED', 'NEEDS_ATTENTION', 'NO_DATA'])],
            'error_message' => ['required', 'string', 'max:1000'],
            'http_status' => ['sometimes', 'nullable', 'integer', 'between:100,599'],
            'retry_after' => ['sometimes', 'nullable', 'string', 'max:100'],
            'error_stage' => ['sometimes', 'nullable', Rule::in(['job', 'queue_progress', 'source_upload', 'keep_alive', 'login', 'open_report', 'set_filters', 'view_report', 'reset_report', 'open_download_menu', 'prepare_csv', 'download_csv'])],
            'root_cause' => ['sometimes', 'nullable', Rule::in(['REPORTED_ERROR', 'UNCLASSIFIED', 'TIMEOUT', 'CONNECTION_FAILURE', 'AMBIGUOUS_LOCATOR', 'PAGE_LOADING'])],
        ]);
        $job = $jobs->fail($reportJob, $request->header('X-Worker-ID'), $request->header('X-Report-Claim', ''), $data['status'], $data['error_message'], array_intersect_key($data, array_flip(['http_status', 'retry_after', 'error_stage', 'root_cause'])));

        return response()->json(['data' => ['id' => $job->id, 'status' => $job->status]]);
    }

    public function checkpoint(Request $request, int $reportJob, ManageReportJobs $jobs): JsonResponse
    {
        abort_unless($request->attributes->get('report_source') === 'apex', 403);
        $data = $request->validate([
            'submission_state' => ['required', Rule::in(['uncertain', 'history'])],
            'batch_number' => ['sometimes', 'integer', 'min:1'],
            'history' => ['required_if:submission_state,history', 'array:origin,id,filename,created,submitted_at'],
            'history.origin' => ['required_with:history', 'string', 'max:100'],
            'history.id' => ['required_with:history', 'string', 'max:2048'],
            'history.filename' => ['required_with:history', 'string', 'max:255'],
            'history.created' => ['required_with:history', 'string', 'max:100'],
            'history.submitted_at' => ['required_with:history', 'integer', 'min:1'],
        ]);
        $job = $jobs->checkpoint($reportJob, $request->header('X-Worker-ID'), $request->header('X-Report-Claim', ''), $data);

        return response()->json(['data' => ['id' => $job->id, 'status' => $job->status]]);
    }
}

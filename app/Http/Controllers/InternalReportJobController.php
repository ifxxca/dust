<?php

namespace App\Http\Controllers;

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
        $data = $request->validate(['claim_key' => ['required', 'uuid']]);
        $job = $jobs->claim($request->header('X-Worker-ID'), $data['claim_key'], $request->attributes->get('report_source', 'apex'));
        if ($job === null) {
            return response()->noContent();
        }

        return response()->json(['data' => [
            'id' => $job->id, 'customer_account' => $job->customer_account, 'national_account' => $job->national_account,
            'source' => $job->source, 'report_type' => $job->report_type,
            'date_from' => $job->date_from->toDateString(), 'date_thru' => $job->date_thru->toDateString(),
            'report_mode' => $job->report_mode, 'parameters' => $job->parameters,
            'batch_checkpoints' => (bool) config('jne-reports.batch_checkpoints_enabled'),
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
        $request->validate(['file' => ['required', 'file', 'max:'.config('jne-reports.max_file_kb'), 'extensions:csv', 'mimetypes:text/plain,text/csv,text/x-csv,application/csv,application/vnd.ms-excel']]);
        $file = $request->file('file');
        $rowCount = $csv->handle($file, $reportJob->source === 'apex');
        if ($reportJob->source !== 'apex') {
            abort_unless($reportJob->source_file_path !== null, 409, 'CSV Hybrid harus diproses melalui antrean APEX.');
        }
        if ($reportJob->report_mode === 'A') {
            $apex->handle($reportJob, $file);
        }
        $job = $jobs->upload($reportJob->id, $request->header('X-Worker-ID'), $request->header('X-Report-Claim', ''), $file, $rowCount);

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
        $request->validate(['file' => ['required', 'file', 'max:'.config('jne-reports.max_file_kb'), 'extensions:csv', 'mimetypes:text/plain,text/csv,text/x-csv,application/csv,application/vnd.ms-excel']]);
        $file = $request->file('file');
        $rowCount = $csv->handle($file, false);
        $awbs = $hybrid->handle($job, $file);
        $saved = $jobs->uploadSource($job->id, $worker, $claim, $file, $rowCount, $awbs);

        return response()->json(['data' => ['id' => $saved->id, 'status' => $saved->status, 'source_saved' => true, 'awb_count' => $saved->awb_count]]);
    }

    public function fail(Request $request, int $reportJob, ManageReportJobs $jobs): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['FAILED', 'NEEDS_ATTENTION'])],
            'error_message' => ['required', 'string', 'max:1000'],
        ]);
        $job = $jobs->fail($reportJob, $request->header('X-Worker-ID'), $request->header('X-Report-Claim', ''), $data['status'], $data['error_message']);

        return response()->json(['data' => ['id' => $job->id, 'status' => $job->status]]);
    }
}

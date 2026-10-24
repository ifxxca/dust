<?php

namespace App\Actions\Reports;

use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ManageApexBatches
{
    public function __construct(private ManageReportJobs $jobs, private ValidateReportCsv $csv, private ValidateApexAwbReport $awbs) {}

    /** @return array<string, mixed> */
    public function begin(int $jobId, int $number, string $worker, string $claim, string $key): array
    {
        return DB::transaction(function () use ($jobId, $number, $worker, $claim, $key): array {
            $job = $this->job($jobId);
            $this->jobs->assertOwner($job, $worker, $claim);
            abort_unless(in_array($job->status, ReportJob::ACTIVE_STATUSES, true), 409);
            $this->batchJob($job, $number);
            $row = DB::table('report_job_batches')->where('report_job_id', $jobId)->where('batch_number', $number)->first();
            if ($row?->status === 'SAVED') {
                $bytes = Storage::disk('jne_reports')->get($row->file_path);
                abort_unless(hash_equals($row->file_checksum, hash('sha256', $bytes)), 409, 'Checkpoint rusak; pulihkan file asli sebelum melanjutkan.');

                return ['status' => 'SAVED', 'content_base64' => base64_encode($bytes), 'checksum' => $row->file_checksum];
            }
            abort_if($row?->status === 'STARTED' && $row->start_key !== $key, 409, 'Hasil Process belum pasti. Admin harus memeriksa batch; jangan kirim ulang.');
            DB::table('report_job_batches')->updateOrInsert(['report_job_id' => $jobId, 'batch_number' => $number], ['status' => 'STARTED', 'start_key' => $key, 'updated_at' => now(), 'created_at' => $row->created_at ?? now()]);
            if ($row?->status !== 'STARTED') {
                $job->recordEvent('Batch APEX '.$number.' dimulai; pengulangan setelah gangguan memerlukan pemeriksaan.');
            }

            return ['status' => 'STARTED'];
        }, 3);
    }

    public function save(int $jobId, int $number, string $worker, string $claim, UploadedFile $file): void
    {
        DB::transaction(function () use ($jobId, $number, $worker, $claim, $file): void {
            $job = $this->job($jobId);
            $this->jobs->assertOwner($job, $worker, $claim);
            abort_unless(in_array($job->status, ReportJob::ACTIVE_STATUSES, true), 409);
            $this->store($job, $number, $file);
        }, 3);
    }

    public function review(User $actor, int $jobId, ?int $number, string $reason, ?UploadedFile $file = null): void
    {
        DB::transaction(function () use ($actor, $jobId, $number, $reason, $file): void {
            abort_unless(User::whereKey($actor->id)->where('is_active', true)->where('role', 'admin_supervisor')->lockForUpdate()->exists(), 403);
            abort_unless(trim($reason) !== '', 422, 'Alasan pemeriksaan wajib diisi.');
            $job = $this->job($jobId);
            abort_unless(in_array($job->status, ['FAILED', 'NEEDS_ATTENTION'], true), 409);
            if ($number !== null) {
                $row = DB::table('report_job_batches')->where('report_job_id', $jobId)->where('batch_number', $number)->first();
                abort_unless($row?->status === 'STARTED', 409);
                if ($file) {
                    $this->store($job, $number, $file);
                } else {
                    DB::table('report_job_batches')->where('id', $row->id)->update(['status' => 'PLANNED', 'start_key' => null, 'updated_at' => now()]);
                }
                DB::table('report_job_batches')->where('id', $row->id)->update(['reviewed_by' => $actor->id, 'review_reason' => $reason]);
                $job->recordEvent('Admin #'.$actor->id.' memeriksa batch '.$number.($file ? ': hasil asli dipulihkan. ' : ': memastikan Process belum dikirim. ').$reason);

                return;
            }
            abort_if(DB::table('report_job_batches')->where('report_job_id', $jobId)->where('status', 'STARTED')->exists(), 409, 'Selesaikan batch yang belum pasti dahulu.');
            $job->update(['status' => $job->source_file_path ? 'WAITING_APEX' : 'QUEUED', 'worker_id' => null, 'claim_key' => null, 'claim_token' => null, 'active_slot' => null, 'lease_expires_at' => null, 'error_message' => null, 'reviewed_by' => $actor->id, 'reviewed_at' => now(), 'review_note' => $reason]);
            $job->recordEvent('Admin #'.$actor->id.' melanjutkan APEX dari checkpoint tersimpan. '.$reason);
        }, 3);
    }

    private function job(int $id): ReportJob
    {
        abort_unless(config('jne-reports.batch_checkpoints_enabled'), 409, 'Checkpoint APEX belum diaktifkan pada lingkungan ini.');
        $job = ReportJob::whereKey($id)->lockForUpdate()->firstOrFail();
        abort_unless($job->report_mode === 'A', 409);

        return $job;
    }

    private function batchJob(ReportJob $job, int $number): ReportJob
    {
        $awbs = array_slice($job->parameters['awbs'] ?? [], ($number - 1) * config('jne-reports.max_awbs'), config('jne-reports.max_awbs'));
        abort_unless($number > 0 && $awbs !== [], 422);
        $copy = clone $job;
        $copy->parameters = ['awbs' => $awbs];

        return $copy;
    }

    private function store(ReportJob $job, int $number, UploadedFile $file): void
    {
        $count = $this->csv->handle($file, true);
        $this->awbs->handle($this->batchJob($job, $number), $file);
        $row = DB::table('report_job_batches')->where('report_job_id', $job->id)->where('batch_number', $number)->first();
        abort_unless($row && in_array($row->status, ['STARTED', 'SAVED'], true), 409);
        $checksum = hash_file('sha256', $file->getRealPath());
        abort_unless(is_string($checksum), 422);
        abort_if($row->status === 'SAVED' && $row->file_checksum !== $checksum, 409);
        $path = $file->storeAs('report-jobs/'.$job->id.'/batches', $number.'-'.$checksum.'.csv', 'jne_reports');
        abort_unless(is_string($path), 503);
        DB::table('report_job_batches')->where('id', $row->id)->update(['status' => 'SAVED', 'file_path' => $path, 'file_checksum' => $checksum, 'row_count' => $count, 'updated_at' => now()]);
        if ($row->status !== 'SAVED') {
            $job->recordEvent('Batch APEX '.$number.' tersimpan dan tervalidasi: '.$count.' AWB.');
        }
    }
}

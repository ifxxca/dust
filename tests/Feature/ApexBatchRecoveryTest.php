<?php

use App\Actions\Reports\ManageApexBatches;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

beforeEach(function () {
    Storage::fake('jne_reports');
    config(['jne-reports.batch_checkpoints_enabled' => true, 'jne-reports.max_awbs' => 2, 'jne-reports.worker_token' => str_repeat('checkpoint', 4)]);
});

function checkpointJob(): ReportJob
{
    return ReportJob::factory()->create(['report_mode' => 'A', 'parameters' => ['awbs' => ['001', '002', '003']], 'status' => 'WAITING_REPORT', 'worker_id' => 'jne-report-1', 'claim_token' => 'fixture-claim', 'lease_expires_at' => now()->addMinutes(10)]);
}

function checkpointHeaders(): array
{
    return ['Authorization' => 'Bearer '.config('jne-reports.worker_token'), 'X-Worker-ID' => 'jne-report-1', 'X-Report-Claim' => 'fixture-claim'];
}

test('saved batches survive worker failure and uncertainty cannot silently submit again', function () {
    $job = checkpointJob();
    $batches = app(ManageApexBatches::class);
    $key = (string) Str::uuid();
    $this->postJson(route('internal.report-jobs.batch', [$job, 1]), ['start_key' => $key], checkpointHeaders())->assertOk()->assertJsonPath('data.status', 'STARTED');
    $batches->begin($job->id, 1, 'jne-report-1', 'fixture-claim', $key);
    $csv = "AWB,ID_ACCOUNT\n001,SHARED\n002,OTHER\n";
    $batches->save($job->id, 1, 'jne-report-1', 'fixture-claim', UploadedFile::fake()->createWithContent('part.csv', $csv));
    $batches->begin($job->id, 2, 'jne-report-1', 'fixture-claim', (string) Str::uuid());
    $this->postJson(route('internal.report-jobs.batch', [$job, 2]), ['start_key' => (string) Str::uuid()], checkpointHeaders())->assertConflict();
    $job->update(['status' => 'NEEDS_ATTENTION']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin)->postJson(route('report-runs.apex-recovery', $job), ['reason' => 'Reviewed history', 'confirmed_not_submitted' => true])->assertConflict();
    $this->post(route('report-runs.apex-recovery', $job), ['number' => 2, 'reason' => 'Operator verified no submission', 'confirmed_not_submitted' => true])->assertRedirect();
    $this->post(route('report-runs.apex-recovery', $job), ['reason' => 'Resume successful evidence', 'confirmed_not_submitted' => true])->assertRedirect();
    expect($job->fresh()->status)->toBe('QUEUED');
    expect(DB::table('report_job_batches')->where('batch_number', 1)->value('status'))->toBe('SAVED');
    $job->refresh()->update(['status' => 'RUNNING', 'worker_id' => 'jne-report-1', 'claim_token' => 'new-claim', 'lease_expires_at' => now()->addMinutes(10)]);
    $saved = $batches->begin($job->id, 1, 'jne-report-1', 'new-claim', (string) Str::uuid());
    expect(base64_decode($saved['content_base64']))->toBe($csv);
    expect($saved['checksum'])->toBe(hash('sha256', $csv));
});

test('checkpoint boundaries reject foreign workers wrong AWBs and unauthorized recovery', function () {
    $job = checkpointJob();
    $batches = app(ManageApexBatches::class);
    $batches->begin($job->id, 1, 'jne-report-1', 'fixture-claim', (string) Str::uuid());
    $this->postJson(route('internal.report-jobs.batch', [$job, 1]), ['start_key' => (string) Str::uuid()], [...checkpointHeaders(), 'X-Report-Claim' => 'foreign'])->assertForbidden();
    $this->postJson(route('internal.report-jobs.batch', [$job, 1]), ['file' => UploadedFile::fake()->createWithContent('wrong.csv', "AWB,ID_ACCOUNT\n003,SHARED\n")], checkpointHeaders())->assertUnprocessable();
    $this->actingAs(User::factory()->create(['role' => 'retail_staff']))->postJson(route('report-runs.apex-recovery', $job), ['reason' => 'Not allowed', 'confirmed_not_submitted' => true])->assertForbidden();
    config(['jne-reports.batch_checkpoints_enabled' => false]);
    $this->postJson(route('internal.report-jobs.batch', [$job, 2]), ['start_key' => (string) Str::uuid()], checkpointHeaders())->assertConflict();
});

test('Admin restores an uncertain original result and corrupted saved evidence stops recovery', function () {
    $job = checkpointJob();
    $batches = app(ManageApexBatches::class);
    $batches->begin($job->id, 2, 'jne-report-1', 'fixture-claim', (string) Str::uuid());
    $job->update(['status' => 'NEEDS_ATTENTION']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->post(route('report-runs.apex-recovery', $job), [
        'number' => 2, 'reason' => 'Restored exact result from History APEX', 'file' => UploadedFile::fake()->createWithContent('original.csv', "AWB,ID_ACCOUNT\n003,SHARED\n"),
    ])->assertSessionHasNoErrors()->assertRedirect();
    $this->assertDatabaseHas('report_job_batches', ['report_job_id' => $job->id, 'batch_number' => 2, 'status' => 'SAVED', 'review_reason' => 'Restored exact result from History APEX']);
    $path = DB::table('report_job_batches')->where('report_job_id', $job->id)->value('file_path');
    Storage::disk('jne_reports')->put($path, 'corrupt');
    $job->refresh()->update(['status' => 'RUNNING']);
    $this->postJson(route('internal.report-jobs.batch', [$job, 2]), ['start_key' => (string) Str::uuid()], checkpointHeaders())->assertConflict();
});

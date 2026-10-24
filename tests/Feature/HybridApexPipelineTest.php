<?php

use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\ImportJneReportAwbs;
use App\Models\JneReportProfile;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

beforeEach(function () {
    config(['jne-reports.worker_token' => str_repeat('fixture-token', 4), 'jne-reports.worker_id' => 'jne-report-1']);
});

function pipelineHeaders(string $source, string $claim = ''): array
{
    return ['Authorization' => 'Bearer '.config('jne-reports.worker_token'), 'X-Worker-ID' => $source === 'apex' ? 'jne-report-1' : 'hybrid-'.$source, 'X-Report-Claim' => $claim];
}

function pipelineCsv(string $csv): UploadedFile
{
    return UploadedFile::fake()->createWithContent('report.csv', $csv);
}

function pipelineSource(string $csv = "Cnote No,HO Date\n001,23-OCT-2026 12:00\n002,23-OCT-2026 12:00\n'001,23-OCT-2026 12:00\n"): array
{
    $job = ReportJob::factory()->create(['source' => 'roberto', 'customer_account' => 'ROBERTO', 'report_type' => 'cashless', 'date_from' => '2026-10-23', 'date_thru' => '2026-10-23']);
    $claim = test()->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], pipelineHeaders('roberto'))->assertOk()->json('data.claim_token');
    foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
        test()->postJson(route('internal.report-jobs.progress', $job), ['status' => $status], pipelineHeaders('roberto', $claim))->assertOk();
    }
    test()->postJson(route('internal.report-jobs.source-upload', $job), ['file' => pipelineCsv($csv)], pipelineHeaders('roberto', $claim))->assertOk()->assertJsonPath('data.source_saved', true);

    return [$job->fresh(), $claim, $csv];
}

function pipelineApexClaim(ReportJob $job): string
{
    $data = test()->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], pipelineHeaders('apex'))->assertOk()->assertJsonPath('data.id', $job->id)->assertJsonPath('data.report_mode', 'A')->json('data');
    foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
        test()->postJson(route('internal.report-jobs.progress', $job), ['status' => $status], pipelineHeaders('apex', $data['claim_token']))->assertOk();
    }

    return $data['claim_token'];
}

test('Hybrid AWBs are deduplicated with leading zeros and completed only with an APEX CSV under its real customer accounts', function () {
    Storage::fake('jne_reports');
    Queue::fake([ImportJneReportAwbs::class]);
    [$job] = pipelineSource();
    expect($job->status)->toBe('WAITING_APEX')->and($job->awb_count)->toBe(2)->and($job->source_row_count)->toBe(3)->and($job->parameters['awbs'])->toBe(['001', '002'])->and($job->file_path)->toBeNull();
    Queue::assertNothingPushed();
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], pipelineHeaders('roberto'))->assertNoContent();
    $apexClaim = pipelineApexClaim($job);
    $final = "AWB,ID_ACCOUNT,STATUS_WEB\n001,ACCOUNT1,Delivered\n002,ACCOUNT2,On Progress\n";
    $this->postJson(route('internal.report-jobs.upload', $job), ['file' => pipelineCsv($final)], pipelineHeaders('apex', $apexClaim))->assertOk()->assertJsonPath('data.status', 'COMPLETED');
    Queue::assertPushed(ImportJneReportAwbs::class, fn (ImportJneReportAwbs $queued): bool => $queued->reportJobId === $job->id);
    app(ImportReportAwbs::class)->handle($job->id);
    app(ProjectJneShipments::class)->handle($job->id);
    expect($job->fresh()->workflowStage())->toBe('READY');
    Storage::disk('jne_reports')->assertExists($job->source_file_path);
    expect(Storage::disk('jne_reports')->get($job->fresh()->file_path))->toBe($final);
    $this->assertDatabaseHas('jne_shipments', ['customer_account' => 'ACCOUNT1', 'awb' => '001', 'tracking_status' => 'DELIVERED']);
    $this->assertDatabaseHas('jne_shipments', ['customer_account' => 'ACCOUNT2', 'awb' => '002']);
    $this->assertDatabaseMissing('jne_shipments', ['customer_account' => 'ROBERTO']);
    expect(DB::table('report_job_events')->where('report_job_id', $job->id)->pluck('status')->all())->toBe(['RUNNING', 'WAITING_REPORT', 'DOWNLOADING', 'WAITING_APEX', 'RUNNING', 'WAITING_REPORT', 'DOWNLOADING', 'COMPLETED']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('jne-reports.download', $job))->assertOk()->assertStreamedContent($final);
});

test('source upload retries remain idempotent after the APEX worker has acquired a new lease', function () {
    Storage::fake('jne_reports');
    [$job, $claim, $csv] = pipelineSource();
    pipelineApexClaim($job);
    $this->postJson(route('internal.report-jobs.source-upload', $job), ['file' => pipelineCsv($csv)], pipelineHeaders('roberto', $claim))->assertOk()->assertJsonPath('data.source_saved', true)->assertJsonPath('data.status', 'DOWNLOADING');
    $this->postJson(route('internal.report-jobs.source-upload', $job), ['file' => pipelineCsv(str_replace('002,', '003,', $csv))], pipelineHeaders('roberto', $claim))->assertConflict();
    $this->postJson(route('internal.report-jobs.progress', $job), ['status' => 'DOWNLOADING'], pipelineHeaders('roberto', $claim))->assertForbidden();
    expect($job->fresh()->worker_id)->toBe('jne-report-1')->and($job->fresh()->awb_count)->toBe(2);
});

test('APEX output rejects missing or foreign AWBs and raw Hybrid files cannot be final output', function () {
    Storage::fake('jne_reports');
    [$job, $sourceClaim] = pipelineSource();
    $this->postJson(route('internal.report-jobs.upload', $job), ['file' => pipelineCsv("AWB,ID_ACCOUNT\n001,ACCOUNT1\n")], pipelineHeaders('roberto', $sourceClaim))->assertForbidden();
    $apexClaim = pipelineApexClaim($job);
    foreach (["AWB,ID_ACCOUNT\n001,ACCOUNT1\n", "AWB,ID_ACCOUNT\n001,ACCOUNT1\n999,ACCOUNT2\n", "Cnote No,HO Date\n001,23-OCT-2026 12:00\n"] as $csv) {
        $this->postJson(route('internal.report-jobs.upload', $job), ['file' => pipelineCsv($csv)], pipelineHeaders('apex', $apexClaim))->assertUnprocessable()->assertJsonValidationErrors('file');
    }
    expect($job->fresh()->status)->toBe('DOWNLOADING')->and($job->fresh()->file_path)->toBeNull();
});

test('an empty Hybrid source is recorded without sending an empty upload to APEX', function () {
    Storage::fake('jne_reports');
    [$job] = pipelineSource("Cnote No,HO Date\n");
    expect($job->status)->toBe('NO_DATA')->and($job->awb_count)->toBe(0)->and($job->completed_at)->not->toBeNull()->and($job->file_path)->toBeNull();
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], pipelineHeaders('apex'))->assertNoContent();
});

test('only the matching Hybrid worker may save the source CSV', function () {
    Storage::fake('jne_reports');
    [$job, $claim, $csv] = pipelineSource();
    $this->postJson(route('internal.report-jobs.source-upload', $job), ['file' => pipelineCsv($csv)], pipelineHeaders('nuralamt', $claim))->assertForbidden();
    $this->postJson(route('internal.report-jobs.source-upload', $job), ['file' => pipelineCsv($csv)], pipelineHeaders('apex', $claim))->assertForbidden();
    $this->postJson(route('internal.report-jobs.source-upload', $job), ['file' => pipelineCsv($csv)])->assertUnauthorized();
});

test('a pending APEX conversion blocks duplicate schedules and an APEX failure remains available for review', function () {
    Storage::fake('jne_reports');
    [$job] = pipelineSource();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $profile = JneReportProfile::factory()->create(['source' => 'roberto', 'report_type' => 'cashless', 'customer_account' => 'ROBERTO', 'enabled' => false, 'created_by' => $admin->id, 'updated_by' => $admin->id]);
    $this->actingAs($admin)->post(route('report-runs.store'), ['profile_id' => $profile->id])->assertSessionHasErrors('run');
    $claim = pipelineApexClaim($job);
    $this->postJson(route('internal.report-jobs.fail', $job), ['status' => 'NEEDS_ATTENTION', 'error_message' => 'REPORT_REJECTED: APEX tidak menghasilkan CSV.'], pipelineHeaders('apex', $claim))->assertOk();
    $this->post(route('report-runs.store'), ['profile_id' => $profile->id])->assertSessionHasErrors('run');
    expect($job->fresh()->source_file_path)->not->toBeNull()->and($job->fresh()->file_path)->toBeNull();
    $this->assertDatabaseCount('report_jobs', 1);
});

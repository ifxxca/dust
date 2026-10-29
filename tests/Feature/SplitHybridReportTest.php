<?php

use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\QueueScheduledJneReports;
use App\Jobs\ImportJneReportAwbs;
use App\Models\JneReportProfile;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
    $this->travelTo('2026-10-26 05:00:00 UTC');
    config(['jne-reports.worker_token' => str_repeat('split-token', 4), 'jne-reports.worker_id' => 'jne-report-1']);
});

function splitHybridHeaders(string $source, string $claim = ''): array
{
    return ['Authorization' => 'Bearer '.config('jne-reports.worker_token'), 'X-Worker-ID' => $source === 'apex' ? 'jne-report-1' : 'hybrid-'.$source, 'X-Report-Claim' => $claim];
}

test('each server completes its own APEX result and schedules again while the other server has failed', function (string $failedAccount, string $healthyAccount) {
    Storage::fake('jne_reports');
    Queue::fake([ImportJneReportAwbs::class]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    foreach ([$failedAccount, $healthyAccount] as $account) {
        JneReportProfile::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => $account,
            'enabled' => true, 'next_run_at' => now(), 'created_by' => $admin->id, 'updated_by' => $admin->id]);
    }
    $scheduler = app(QueueScheduledJneReports::class);
    expect($scheduler->handle())->toBe(2);
    $failed = ReportJob::where('source', 'hybrid')->where('customer_account', $failedAccount)->sole();
    $healthy = ReportJob::where('source', 'hybrid')->where('customer_account', $healthyAccount)->sole();
    $healthySources = ReportJob::where('hybrid_batch_id', $healthy->id)->orderBy('id')->get();
    expect($healthySources->pluck('source')->unique()->all())->toBe([ReportJob::HYBRID_SERVERS[$healthyAccount]]);
    expect($healthySources->pluck('report_type')->all())->toBe(['cashless', 'manual']);
    $failedSource = ReportJob::where('hybrid_batch_id', $failed->id)->firstOrFail();
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], splitHybridHeaders($failedSource->source))->assertOk()->json('data.claim_token');
    $this->postJson(route('internal.report-jobs.fail', $failedSource), ['status' => 'FAILED', 'error_message' => 'Server unavailable'], splitHybridHeaders($failedSource->source, $claim))->assertOk();

    foreach ($healthySources as $index => $source) {
        $token = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], splitHybridHeaders($source->source))->assertOk()->assertJsonPath('data.id', $source->id)->json('data.claim_token');
        foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
            $this->postJson(route('internal.report-jobs.progress', $source), ['status' => $status], splitHybridHeaders($source->source, $token))->assertOk();
        }
        $header = $source->report_type === 'cashless' ? 'Cnote No,HO Date' : 'Cnote no,Date';
        $csv = $header."\n001,26-OCT-2026 12:00\n".($index === 1 ? "002,26-OCT-2026 12:00\n" : '');
        $this->postJson(route('internal.report-jobs.source-upload', $source), ['file' => UploadedFile::fake()->createWithContent('source.csv', $csv)], splitHybridHeaders($source->source, $token))->assertOk()->assertJsonPath('data.status', 'SOURCE_SAVED');
        if ($index === 0) {
            expect($healthy->fresh()->status)->toBe('COLLECTING_SOURCES');
            $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], splitHybridHeaders('apex'))->assertNoContent();
        }
    }

    expect($failed->fresh()->status)->toBe('NEEDS_ATTENTION');
    expect($healthy->fresh()->status)->toBe('WAITING_APEX');
    expect(Storage::disk('jne_reports')->get($healthy->fresh()->source_file_path))->toBe("001\r\n002\r\n");
    $token = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], splitHybridHeaders('apex'))->assertOk()
        ->assertJsonPath('data.id', $healthy->id)->assertJsonPath('data.parameters.awbs', ['001', '002'])->json('data.claim_token');
    foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
        $this->postJson(route('internal.report-jobs.progress', $healthy), ['status' => $status], splitHybridHeaders('apex', $token))->assertOk();
    }
    $this->postJson(route('internal.report-jobs.upload', $healthy), ['file' => UploadedFile::fake()->createWithContent('apex.csv', "AWB,ID_ACCOUNT,STATUS_WEB\n001,ACCOUNT1,Delivered\n002,ACCOUNT2,On Progress\n")], splitHybridHeaders('apex', $token))->assertOk();
    Queue::assertPushed(ImportJneReportAwbs::class, 1);
    app(ImportReportAwbs::class)->handle($healthy->id);
    app(ProjectJneShipments::class)->handle($healthy->id);
    expect($healthy->fresh()->workflowStage())->toBe('READY');
    $this->assertDatabaseCount('jne_shipments', 2);
    $this->actingAs($admin)->get(route('report-runs.index', ['source' => 'hybrid']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->has('runs.data', 2)->has('runs.data.0.sources', 2)->has('runs.data.1.sources', 2)
        ->where('runs.data.0.customer_account', $healthyAccount)->where('runs.data.0.workflow_stage', 'READY')
        ->where('runs.data.1.customer_account', $failedAccount)->where('runs.data.1.workflow_stage', 'ATTENTION'));
    expect($scheduler->queueProfile($failed->jne_report_profile_id, true))->toBe(0);
    expect($scheduler->queueProfile($healthy->jne_report_profile_id, true))->toBe(1);
    $checksums = $healthySources->fresh()->pluck('source_file_checksum', 'id')->all();
    $this->actingAs($admin)->post(route('report-runs.retry-sources', $failed))->assertRedirect();
    expect($failedSource->fresh()->status)->toBe('QUEUED');
    expect($healthySources->fresh()->pluck('source_file_checksum', 'id')->all())->toBe($checksums);
    expect($healthy->fresh()->workflowStage())->toBe('READY');
})->with(['PM unavailable' => ['HYBRID_PM', 'HYBRID_PUMAN'], 'Puman unavailable' => ['HYBRID_PUMAN', 'HYBRID_PM']]);

test('admin configures two independent Hybrid server profiles and cannot create the retired four-report flow', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin);
    foreach (['HYBRID_PM' => 15, 'HYBRID_PUMAN' => 30] as $account => $interval) {
        $this->post(route('jne-monitoring.profile-store'), ['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => $account, 'enabled' => false, 'interval_minutes' => $interval])->assertSessionHasNoErrors();
        $this->assertDatabaseHas('jne_report_profiles', ['customer_account' => $account, 'interval_minutes' => $interval, 'enabled' => false]);
    }
    $this->postJson(route('jne-monitoring.profile-store'), ['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => 'HYBRID_GABUNGAN', 'enabled' => true, 'interval_minutes' => 30])->assertUnprocessable()->assertJsonValidationErrors('customer_account');
    $this->assertDatabaseCount('jne_report_profiles', 2);
});

test('migration splits existing schedules while preserving history and existing server configuration', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $legacy = JneReportProfile::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => 'HYBRID_GABUNGAN',
        'enabled' => true, 'interval_minutes' => 23, 'next_run_at' => now()->addMinutes(8), 'created_by' => $admin->id, 'updated_by' => $admin->id]);
    $existing = JneReportProfile::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => 'HYBRID_PUMAN', 'enabled' => false, 'interval_minutes' => 17]);
    $batch = ReportJob::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => 'HYBRID_GABUNGAN', 'jne_report_profile_id' => $legacy->id, 'status' => 'COLLECTING_SOURCES']);
    $snapshot = $batch->fresh()->getRawOriginal();
    $migration = require database_path('migrations/2026_10_26_075429_split_hybrid_profiles_by_server.php');

    $migration->up();

    $this->assertDatabaseHas('jne_report_profiles', ['id' => $legacy->id, 'enabled' => false, 'next_run_at' => null]);
    $this->assertDatabaseHas('jne_report_profiles', ['customer_account' => 'HYBRID_PM', 'enabled' => true, 'interval_minutes' => 23, 'updated_by' => $admin->id]);
    expect(JneReportProfile::where('customer_account', 'HYBRID_PM')->sole()->next_run_at->equalTo($legacy->next_run_at))->toBeTrue();
    $this->assertDatabaseHas('jne_report_profiles', ['id' => $existing->id, 'enabled' => false, 'interval_minutes' => 17]);
    expect($batch->fresh()->getRawOriginal())->toBe($snapshot);
    $this->actingAs($admin)->get(route('jne-monitoring.profiles'))->assertOk()->assertInertia(fn (Assert $page) => $page->has('profiles', 2));
    $this->postJson(route('report-runs.store'), ['profile_id' => $legacy->id])->assertUnprocessable()->assertJsonValidationErrors('profile_id');
});

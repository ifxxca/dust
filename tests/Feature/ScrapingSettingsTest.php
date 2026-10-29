<?php

use App\Actions\Reports\QueueScheduledJneReports;
use App\Jobs\ImportJneReportAwbs;
use App\Models\JneReportProfile;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Symfony\Component\Process\Process;

beforeEach(function () {
    $this->withoutVite();
    $this->travelTo('2026-10-22 16:00:00 UTC');
    config(['pickup.timezone' => 'Asia/Jakarta', 'jne-reports.worker_token' => str_repeat('test-token', 5), 'jne-reports.worker_id' => 'jne-report-1']);
});

function scrapingHeaders(string $source, string $claim = ''): array
{
    return ['Authorization' => 'Bearer '.config('jne-reports.worker_token'), 'X-Worker-ID' => $source === 'apex' ? 'jne-report-1' : 'hybrid-'.$source, 'X-Report-Claim' => $claim];
}

test('admin configures arbitrary minute intervals and separate Hybrid report types without sharing accounts', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin);
    foreach (['roberto', 'nuralamt'] as $source) {
        foreach (['cashless', 'manual'] as $kind) {
            $this->post(route('jne-monitoring.profile-store'), ['source' => $source, 'report_type' => $kind, 'label' => $source.' '.$kind, 'enabled' => false, 'interval_minutes' => $kind === 'cashless' ? 7 : 11])->assertRedirectToRoute('jne-monitoring.profiles')->assertSessionHasNoErrors();
        }
    }
    $this->assertDatabaseCount('jne_report_profiles', 4);
    $this->assertDatabaseHas('jne_report_profiles', ['source' => 'roberto', 'report_type' => 'cashless', 'customer_account' => 'ROBERTO', 'interval_minutes' => 7, 'lookback_days' => 1]);
    $this->post(route('jne-monitoring.profile-store'), ['source' => 'roberto', 'report_type' => 'cashless', 'enabled' => false, 'interval_minutes' => 7])->assertSessionHasErrors('customer_account');
    $this->get(route('jne-monitoring.profiles'))->assertInertia(fn (Assert $page) => $page->has('profiles', 4)->where('profiles.0.source', 'nuralamt'));
});

test('source and report type cannot be changed on an existing configuration and malformed sources are rejected', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $profile = JneReportProfile::factory()->create(['source' => 'roberto', 'report_type' => 'cashless', 'customer_account' => 'ROBERTO']);
    $this->actingAs($admin)->putJson(route('jne-monitoring.profile-update', $profile), ['source' => 'roberto', 'report_type' => 'manual', 'enabled' => true, 'interval_minutes' => 10, 'version' => 1])->assertUnprocessable();
    expect($profile->fresh()->report_type)->toBe('cashless');
    $this->postJson(route('jne-monitoring.profile-store'), ['source' => ['invalid'], 'report_type' => 'manual'])->assertUnprocessable()->assertJsonValidationErrors('source');
});

test('scheduler queues the current WIB day for each Hybrid report once per interval', function () {
    foreach (['roberto', 'nuralamt'] as $source) {
        foreach (['cashless', 'manual'] as $kind) {
            JneReportProfile::factory()->create(['source' => $source, 'report_type' => $kind, 'customer_account' => strtoupper($source), 'enabled' => true, 'interval_minutes' => 7]);
        }
    }

    expect(app(QueueScheduledJneReports::class)->handle())->toBe(4);
    expect(app(QueueScheduledJneReports::class)->handle())->toBe(0);
    $this->assertDatabaseCount('report_jobs', 4);
    expect(ReportJob::get()->every(fn (ReportJob $job): bool => $job->date_from->toDateString() === '2026-10-22' && $job->date_thru->toDateString() === '2026-10-22'))->toBeTrue();
    expect(JneReportProfile::first()->next_run_at->toIso8601String())->toBe('2026-10-22T16:07:00+00:00');
});

test('scheduler delays Hybrid jobs until 00:30 WIB after the midnight reset', function () {
    $this->travelTo('2026-10-22 17:10:00 UTC');
    $profile = JneReportProfile::factory()->create(['source' => 'roberto', 'report_type' => 'cashless', 'enabled' => true]);

    expect(app(QueueScheduledJneReports::class)->handle())->toBe(0);
    expect($profile->fresh()->next_run_at->toIso8601String())->toBe('2026-10-22T17:30:00+00:00');
    $this->assertDatabaseCount('report_jobs', 0);
    $this->travelTo('2026-10-22 17:30:00 UTC');
    expect(app(QueueScheduledJneReports::class)->handle())->toBe(1);
    expect(ReportJob::sole()->date_from->toDateString())->toBe('2026-10-23');
});

test('each worker claims only its source while three sources may run concurrently', function () {
    foreach (['nuralamt', 'roberto', 'apex'] as $source) {
        ReportJob::factory()->count(2)->create(['source' => $source, 'report_type' => $source === 'apex' ? 'apex' : 'cashless', 'customer_account' => strtoupper($source)]);
    }
    foreach (['apex', 'roberto', 'nuralamt'] as $source) {
        $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], scrapingHeaders($source))->assertOk()->assertJsonPath('data.source', $source);
        $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], scrapingHeaders($source))->assertNoContent();
    }
    expect(ReportJob::where('status', 'RUNNING')->count())->toBe(3);
    expect(ReportJob::whereNotNull('active_slot')->pluck('active_slot')->sort()->values()->all())->toBe([1, 2, 3]);
});

test('Hybrid CSV is retained for audit and its AWBs wait for APEX before importing', function () {
    Queue::fake([ImportJneReportAwbs::class]);
    Storage::fake('jne_reports');
    $job = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'cashless', 'date_from' => '2026-10-22', 'date_thru' => '2026-10-22']);
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], scrapingHeaders('roberto'))->assertOk()->json('data.claim_token');
    foreach (['WAITING_REPORT', 'WAITING_REPORT', 'DOWNLOADING'] as $status) {
        $this->postJson(route('internal.report-jobs.progress', $job), ['status' => $status], scrapingHeaders('roberto', $claim))->assertOk();
    }
    $file = UploadedFile::fake()->createWithContent('report.csv', "\"Cnote No\",\"HO Date\"\n\"001\",\"22-OCT-2026 23:00\"\n");
    $this->postJson(route('internal.report-jobs.source-upload', $job), ['file' => $file], scrapingHeaders('roberto', $claim))->assertOk()->assertJsonPath('data.status', 'WAITING_APEX');
    expect($job->fresh()->source_row_count)->toBe(1)->and($job->fresh()->workflowStage())->toBe('WAITING_APEX');
    Storage::disk('jne_reports')->assertExists($job->fresh()->source_file_path);
    Queue::assertNothingPushed();
    expect(DB::table('report_job_events')->where('report_job_id', $job->id)->pluck('status')->all())->toBe(['RUNNING', 'WAITING_REPORT', 'DOWNLOADING', 'WAITING_APEX']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('report-runs.index', ['source' => 'roberto', 'status' => 'WAITING_APEX']))->assertOk()->assertInertia(fn (Assert $page) => $page->component('jne-report-runs')->has('runs.data', 1)->where('runs.data.0.awb_count', 1)->has('runs.data.0.events', 4)->missing('runs.data.0.claim_token')->missing('runs.data.0.source_claim_token')->missing('runs.data.0.source_file_path')->missing('runs.data.0.parameters')->missing('runs.data.0.file_path'));
});

test('Hybrid uploads reject another date or report structure and cannot be completed by a different worker', function () {
    $job = ReportJob::factory()->create(['source' => 'nuralamt', 'report_type' => 'manual', 'date_from' => '2026-10-22', 'date_thru' => '2026-10-22']);
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], scrapingHeaders('nuralamt'))->json('data.claim_token');
    foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
        $this->postJson(route('internal.report-jobs.progress', $job), ['status' => $status], scrapingHeaders('nuralamt', $claim))->assertOk();
    }
    foreach (["\"Cnote no\",\"Date\"\n\"001\",\"21-OCT-2026 12:00\"", "\"Cnote No\",\"HO Date\"\n\"001\",\"22-OCT-2026 12:00\""] as $csv) {
        $this->postJson(route('internal.report-jobs.source-upload', $job), ['file' => UploadedFile::fake()->createWithContent('report.csv', $csv)], scrapingHeaders('nuralamt', $claim))->assertUnprocessable()->assertJsonValidationErrors('file');
    }
    $this->postJson(route('internal.report-jobs.progress', $job), ['status' => 'DOWNLOADING'], scrapingHeaders('roberto', $claim))->assertForbidden();
    expect($job->fresh()->status)->toBe('DOWNLOADING')->and($job->fresh()->file_path)->toBeNull();
});

test('Hybrid stores the full daily report beyond the APEX record limit', function () {
    Storage::fake('jne_reports');
    $job = ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'cashless', 'date_from' => '2026-10-22', 'date_thru' => '2026-10-22']);
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], scrapingHeaders('roberto'))->json('data.claim_token');
    foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
        $this->postJson(route('internal.report-jobs.progress', $job), ['status' => $status], scrapingHeaders('roberto', $claim))->assertOk();
    }
    $csv = "\"Cnote No\",\"HO Date\"\n";
    for ($record = 1; $record <= 6001; $record++) {
        $csv .= '"'.$record.'","22-OCT-2026 12:00"'."\n";
    }
    $this->postJson(route('internal.report-jobs.source-upload', $job), ['file' => UploadedFile::fake()->createWithContent('report.csv', $csv)], scrapingHeaders('roberto', $claim))->assertOk();
    expect($job->fresh()->awb_count)->toBe(6001)->and($job->fresh()->status)->toBe('WAITING_APEX');
});

test('manual run uses a disabled configuration without enabling its schedule and does not duplicate active work', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $profile = JneReportProfile::factory()->create(['source' => 'nuralamt', 'report_type' => 'manual', 'enabled' => false, 'next_run_at' => null]);
    $this->actingAs($admin)->from(route('report-runs.index'))->post(route('report-runs.store'), ['profile_id' => $profile->id])->assertRedirectToRoute('report-runs.index');
    $this->post(route('report-runs.store'), ['profile_id' => $profile->id])->assertSessionHasErrors('run');
    $this->assertDatabaseCount('report_jobs', 1);
    expect($profile->fresh()->enabled)->toBeFalse();
});

test('history is paginated and filtered on the server and limited to active administrators', function () {
    ReportJob::factory()->count(22)->create(['source' => 'apex']);
    ReportJob::factory()->create(['source' => 'roberto', 'report_type' => 'cashless', 'status' => 'FAILED', 'error_message' => 'NETWORK: sumber tidak terjangkau']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('report-runs.index'))->assertInertia(fn (Assert $page) => $page->has('runs.data', 20)->where('runs.total', 23));
    $this->get(route('report-runs.index', ['source' => 'roberto', 'status' => 'FAILED']))->assertInertia(fn (Assert $page) => $page->has('runs.data', 1)->where('runs.data.0.error_message', 'NETWORK: sumber tidak terjangkau'));
    $this->actingAs(User::factory()->create(['role' => 'cs']))->get(route('report-runs.index'))->assertForbidden();
    $this->post(route('report-runs.store'), [])->assertForbidden();
    $this->post(route('report-runs.recover'), [])->assertForbidden();
});

test('Laravel scheduled Hybrid jobs run through the Node worker and real Chromium into private CSV history', function () {
    $root = sys_get_temp_dir().DIRECTORY_SEPARATOR.'scraping_e2e_'.bin2hex(random_bytes(8));
    File::makeDirectory($root, 0700);
    $database = $root.DIRECTORY_SEPARATOR.'database.sqlite';
    touch($database);
    $original = config('database.default');
    config(['database.connections.scraping_e2e' => [...config('database.connections.sqlite'), 'database' => $database], 'database.default' => 'scraping_e2e']);
    $server = null;
    try {
        Artisan::call('migrate', ['--database' => 'scraping_e2e', '--force' => true]);
        $admin = User::factory()->create(['role' => 'admin_supervisor']);
        foreach (['roberto', 'nuralamt'] as $source) {
            foreach (['cashless', 'manual'] as $kind) {
                $profile = JneReportProfile::factory()->create(['source' => $source, 'report_type' => $kind, 'customer_account' => strtoupper($source), 'label' => 'QA '.$source.' '.$kind, 'lookback_days' => 1, 'interval_minutes' => 15, 'enabled' => false, 'next_run_at' => null, 'created_by' => $admin->id, 'updated_by' => $admin->id]);
                ReportJob::factory()->create(['source' => $source, 'report_type' => $kind, 'customer_account' => strtoupper($source), 'jne_report_profile_id' => $profile->id, 'date_from' => '2026-10-22', 'date_thru' => '2026-10-22', 'created_by' => $admin->id]);
            }
        }
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        $address = stream_socket_get_name($socket, false);
        fclose($socket);
        $url = 'http://'.$address;
        $token = str_repeat('fixture-token', 4);
        $server = new Process([PHP_BINARY, '-d', 'extension=pdo_sqlite', '-d', 'extension=sqlite3', '-S', $address, base_path('vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php')], public_path(), [
            'APP_ENV' => 'testing', 'APP_URL' => $url, 'DB_CONNECTION' => 'sqlite', 'DB_DATABASE' => $database, 'DB_URL' => '',
            'SESSION_DRIVER' => 'database', 'SESSION_COOKIE' => 'scraping-e2e-session', 'SESSION_DOMAIN' => '', 'SESSION_SECURE_COOKIE' => 'false',
            'JNE_REPORT_WORKER_TOKEN' => $token, 'JNE_REPORT_WORKER_ID' => 'jne-report-1', 'JNE_REPORT_STORAGE_PATH' => $root.DIRECTORY_SEPARATOR.'reports', 'QUEUE_CONNECTION' => 'sync',
        ]);
        $server->start();
        $deadline = microtime(true) + 10;
        while (@file_get_contents($url.'/up') === false && microtime(true) < $deadline) {
            usleep(100000);
        }
        $runner = new Process(['node', base_path('workers/jne-report/test/hybrid-laravel-flow.mjs')], base_path('workers/jne-report'), ['RETAIL_OPERATIONS_URL' => $url, 'JNE_REPORT_WORKER_TOKEN' => $token,
            'JNE_UI_QA_EMAIL' => getenv('SCRAPING_UI_QA') === '1' ? $admin->email : '', 'JNE_UI_QA_DIR' => base_path('output/scraping-ui'),
        ], null, 90);
        $runner->run();
        expect($runner->isSuccessful())->toBeTrue($runner->getOutput().$runner->getErrorOutput());
        expect($runner->getOutput())->toContain('HYBRID_LARAVEL_FIXTURE_OK');
        expect(ReportJob::where('status', 'COMPLETED')->where('row_count', 2)->count())->toBe(4);
        expect(DB::table('report_job_events')->where('status', 'COMPLETED')->count())->toBe(4);
        $this->assertDatabaseCount('jne_report_awbs', 8);
    } finally {
        $server?->stop();
        config(['database.default' => $original]);
        DB::purge('scraping_e2e');
        if (str_starts_with($root, sys_get_temp_dir().DIRECTORY_SEPARATOR.'scraping_e2e_')) {
            File::deleteDirectory($root);
        }
    }
});

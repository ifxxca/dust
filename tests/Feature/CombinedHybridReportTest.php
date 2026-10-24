<?php

use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ManageReportJobs;
use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\QueueScheduledJneReports;
use App\Jobs\ImportJneReportAwbs;
use App\Models\Customer;
use App\Models\JneReportProfile;
use App\Models\JneShipperAlias;
use App\Models\PickupRecord;
use App\Models\PickupTask;
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
    $this->travelTo('2026-10-23 05:00:00 UTC');
    config(['jne-reports.worker_token' => str_repeat('combined-token', 4), 'jne-reports.worker_id' => 'jne-report-1']);
});

function combinedHeaders(string $source, string $claim = ''): array
{
    return ['Authorization' => 'Bearer '.config('jne-reports.worker_token'), 'X-Worker-ID' => $source === 'apex' ? 'jne-report-1' : 'hybrid-'.$source, 'X-Report-Claim' => $claim];
}

function combinedProfile(bool $enabled = true): JneReportProfile
{
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    return JneReportProfile::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => 'HYBRID_GABUNGAN', 'label' => 'QA Hybrid gabungan', 'enabled' => $enabled, 'interval_minutes' => 7, 'lookback_days' => 1, 'next_run_at' => $enabled ? now() : null, 'created_by' => $admin->id, 'updated_by' => $admin->id]);
}

function combinedBatch(): ReportJob
{
    $profile = combinedProfile();
    expect(app(QueueScheduledJneReports::class)->queueProfile($profile->id))->toBe(1);

    return ReportJob::where('source', 'hybrid')->sole();
}

/** @param list<string> $awbs */
function saveCombinedSource(ReportJob $source, array $awbs): array
{
    $claim = test()->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], combinedHeaders($source->source))->assertOk()->assertJsonPath('data.id', $source->id)->json('data.claim_token');
    foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
        test()->postJson(route('internal.report-jobs.progress', $source), ['status' => $status], combinedHeaders($source->source, $claim))->assertOk();
    }
    $csv = $source->report_type === 'cashless' ? "Cnote No,HO Date\n" : "Cnote no,Date\n";
    foreach ($awbs as $awb) {
        $csv .= $awb.','.strtoupper($source->date_from->format('d-M-Y'))." 12:00\n";
    }
    test()->postJson(route('internal.report-jobs.source-upload', $source), ['file' => UploadedFile::fake()->createWithContent('report.csv', $csv)], combinedHeaders($source->source, $claim))->assertOk()->assertJsonPath('data.status', 'SOURCE_SAVED');

    return [$claim, $csv];
}

test('a combined configuration queues exactly four source reports once per scheduled cycle', function () {
    $profile = combinedProfile();
    expect(app(QueueScheduledJneReports::class)->handle())->toBe(1);
    expect(app(QueueScheduledJneReports::class)->handle())->toBe(0);
    $batch = ReportJob::where('source', 'hybrid')->sole();
    expect($batch->status)->toBe('COLLECTING_SOURCES');
    expect(ReportJob::where('hybrid_batch_id', $batch->id)->get()->map(fn (ReportJob $job): array => [$job->source, $job->report_type])->all())->toBe(ReportJob::HYBRID_PARTS);
    expect(ReportJob::get()->every(fn (ReportJob $job): bool => $job->date_from->toDateString() === '2026-10-23'))->toBeTrue();
    expect($profile->fresh()->next_run_at->toIso8601String())->toBe('2026-10-23T05:07:00+00:00');
    $this->assertDatabaseCount('report_jobs', 5);
});

test('admin saves the combined source and can request yesterday without enabling the schedule', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin)->post(route('jne-monitoring.profile-store'), ['source' => 'hybrid', 'report_type' => 'combined', 'enabled' => false, 'interval_minutes' => 9])->assertSessionHasNoErrors();
    $profile = JneReportProfile::sole();
    expect($profile->customer_account)->toBe('HYBRID_GABUNGAN');
    $this->post(route('report-runs.store'), ['profile_id' => $profile->id, 'for_date' => '2026-10-22'])->assertSessionHasNoErrors();
    expect(ReportJob::get()->every(fn (ReportJob $job): bool => $job->date_from->toDateString() === '2026-10-22'))->toBeTrue();
    expect($profile->fresh()->enabled)->toBeFalse()->and($profile->fresh()->next_run_at)->toBeNull();
    $this->postJson(route('report-runs.store'), ['profile_id' => $profile->id, 'for_date' => '2026-10-24'])->assertUnprocessable()->assertJsonValidationErrors('for_date');
    $this->postJson(route('jne-monitoring.profile-store'), ['source' => 'hybrid', 'report_type' => 'manual'])->assertUnprocessable()->assertJsonValidationErrors('report_type');
});

test('admin retries only failed Hybrid sources and keeps successful snapshots without repeating APEX', function () {
    Storage::fake('jne_reports');
    $batch = combinedBatch();
    $sources = ReportJob::where('hybrid_batch_id', $batch->id)->orderBy('id')->get();
    $failed = $sources->first();
    $token = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], combinedHeaders($failed->source))->assertOk()->json('data.claim_token');
    $this->postJson(route('internal.report-jobs.fail', $failed), ['status' => 'NEEDS_ATTENTION', 'error_message' => 'Temporary download timeout'], combinedHeaders($failed->source, $token))->assertOk();
    foreach ($sources->skip(1) as $index => $source) {
        saveCombinedSource($source, ['000'.($index + 1)]);
    }
    $stored = ReportJob::whereIn('id', $sources->skip(1)->pluck('id'))->pluck('source_file_checksum', 'id')->all();
    $this->actingAs(User::findOrFail($batch->created_by))->post(route('report-runs.retry-sources', $batch))->assertRedirectToRoute('report-runs.index');
    expect($failed->fresh()->status)->toBe('QUEUED');
    expect($batch->fresh()->status)->toBe('COLLECTING_SOURCES');
    expect(ReportJob::whereIn('id', array_keys($stored))->pluck('source_file_checksum', 'id')->all())->toBe($stored);
    $this->assertDatabaseCount('report_jobs', 5);
    saveCombinedSource($failed, ['0099']);
    expect($failed->fresh()->attempt_count)->toBe(2);
    expect($batch->fresh()->status)->toBe('WAITING_APEX');
    expect($batch->fresh()->awb_count)->toBe(4);
    $this->postJson(route('report-runs.retry-sources', $batch))->assertConflict();
    $this->actingAs(User::factory()->create(['role' => 'cs']))->post(route('report-runs.retry-sources', $batch))->assertForbidden();
});

test('all four sources become one unique AWB file and one APEX result is imported into monitoring', function () {
    Storage::fake('jne_reports');
    Queue::fake([ImportJneReportAwbs::class]);
    $batch = combinedBatch();
    $sources = ReportJob::where('hybrid_batch_id', $batch->id)->orderBy('id')->get();
    $awbs = [['001', '002'], ['002', '003'], ['003', '004'], ['004', '001']];
    foreach ($sources as $index => $source) {
        saveCombinedSource($source, $awbs[$index]);
        if ($index < 3) {
            expect($batch->fresh()->status)->toBe('COLLECTING_SOURCES');
            $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], combinedHeaders('apex'))->assertNoContent();
        }
    }
    $batch->refresh();
    expect($batch->status)->toBe('WAITING_APEX')->and($batch->awb_count)->toBe(4)->and($batch->source_row_count)->toBe(8);
    expect(Storage::disk('jne_reports')->get($batch->source_file_path))->toBe("001\r\n002\r\n003\r\n004\r\n");
    Queue::assertNothingPushed();
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], combinedHeaders('apex'))->assertOk()->assertJsonPath('data.id', $batch->id)->assertJsonPath('data.parameters.awbs', ['001', '002', '003', '004'])->json('data.claim_token');
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], combinedHeaders('apex'))->assertNoContent();
    foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
        $this->postJson(route('internal.report-jobs.progress', $batch), ['status' => $status], combinedHeaders('apex', $claim))->assertOk();
    }
    $csv = "AWB,ID_ACCOUNT,STATUS_WEB\n001,ACCOUNT1,Delivered\n002,ACCOUNT2,Delivered\n003,ACCOUNT1,On Progress\n004,ACCOUNT2,On Progress\n";
    $this->postJson(route('internal.report-jobs.upload', $batch), ['file' => UploadedFile::fake()->createWithContent('result.csv', $csv)], combinedHeaders('apex', $claim))->assertOk();
    Queue::assertPushed(ImportJneReportAwbs::class, 1);
    app(ImportReportAwbs::class)->handle($batch->id);
    app(ProjectJneShipments::class)->handle($batch->id);
    expect($batch->fresh()->workflowStage())->toBe('READY');
    $this->assertDatabaseCount('jne_report_awbs', 4);
    $this->assertDatabaseHas('jne_shipments', ['awb' => '001', 'customer_account' => 'ACCOUNT1', 'tracking_status' => 'DELIVERED']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('report-runs.index', ['source' => 'hybrid']))->assertInertia(fn (Assert $page) => $page->has('runs.data', 1)->has('runs.data.0.sources', 4)->where('runs.data.0.workflow_stage', 'READY')->missing('runs.data.0.parameters')->missing('runs.data.0.source_file_path'));
});

test('a failed source blocks the combined upload and preserves completed source files', function () {
    Storage::fake('jne_reports');
    $batch = combinedBatch();
    $sources = ReportJob::where('hybrid_batch_id', $batch->id)->orderBy('id')->get();
    saveCombinedSource($sources[0], ['001']);
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], combinedHeaders('roberto'))->json('data.claim_token');
    $this->postJson(route('internal.report-jobs.fail', $sources[1]), ['status' => 'NEEDS_ATTENTION', 'error_message' => 'HYBRID_DATE: tanggal tidak sesuai.'], combinedHeaders('roberto', $claim))->assertOk();
    saveCombinedSource($sources[2], ['002']);
    saveCombinedSource($sources[3], ['003']);
    expect($batch->fresh()->status)->toBe('NEEDS_ATTENTION')->and($batch->fresh()->source_file_path)->toBeNull();
    Storage::disk('jne_reports')->assertExists($sources[0]->fresh()->source_file_path);
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], combinedHeaders('apex'))->assertNoContent();
});

test('an expired source lease marks the combined cycle for attention without submitting partial AWBs', function () {
    $batch = combinedBatch();
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], combinedHeaders('roberto'))->assertOk();
    $this->travel(6)->minutes();
    expect(app(ManageReportJobs::class)->recoverExpired())->toBe(1);
    expect($batch->fresh()->status)->toBe('NEEDS_ATTENTION');
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], combinedHeaders('apex'))->assertNoContent();
});

test('four empty sources complete without submitting an empty APEX request', function () {
    Storage::fake('jne_reports');
    $batch = combinedBatch();
    foreach (ReportJob::where('hybrid_batch_id', $batch->id)->orderBy('id')->get() as $source) {
        saveCombinedSource($source, []);
    }
    expect($batch->fresh()->status)->toBe('NO_DATA')->and($batch->fresh()->awb_count)->toBe(0);
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], combinedHeaders('apex'))->assertNoContent();
});

test('missing or changed saved Hybrid files block APEX and recover from identical source uploads without recollection', function (bool $missing) {
    Storage::fake('jne_reports');
    $batch = combinedBatch();
    $sources = ReportJob::where('hybrid_batch_id', $batch->id)->orderBy('id')->get();
    $first = $sources->first();
    [$claim, $original] = saveCombinedSource($first, ['0001']);
    $first->refresh();
    if ($missing) {
        Storage::disk('jne_reports')->delete($first->source_file_path);
    } else {
        Storage::disk('jne_reports')->put($first->source_file_path, 'changed source bytes');
    }
    foreach ($sources->skip(1) as $index => $source) {
        saveCombinedSource($source, ['000'.($index + 1)]);
    }

    expect($batch->fresh()->status)->toBe('NEEDS_ATTENTION');
    expect($batch->fresh()->error_message)->toStartWith('HYBRID_SOURCE_INVALID:');
    $this->assertDatabaseCount('report_jobs', 5);
    expect(ReportJob::where('hybrid_batch_id', $batch->id)->pluck('status')->unique()->all())->toBe(['SOURCE_SAVED']);
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], combinedHeaders('apex'))->assertNoContent();
    $this->actingAs(User::findOrFail($batch->created_by))->post(route('report-runs.retry-sources', $batch))->assertRedirect();
    expect($batch->fresh()->status)->toBe('NEEDS_ATTENTION');

    $this->postJson(route('internal.report-jobs.source-upload', $first), ['file' => UploadedFile::fake()->createWithContent('report.csv', $original)], combinedHeaders($first->source, $claim))->assertOk();
    $this->post(route('report-runs.retry-sources', $batch))->assertRedirectToRoute('report-runs.index');

    expect($batch->fresh()->status)->toBe('WAITING_APEX');
    expect($batch->fresh()->error_message)->toBeNull();
    expect(ReportJob::where('hybrid_batch_id', $batch->id)->pluck('attempt_count')->all())->toBe([1, 1, 1, 1]);
    expect(Storage::disk('jne_reports')->get($first->source_file_path))->toBe($original);
    $this->assertDatabaseCount('report_jobs', 5);
})->with(['missing file' => true, 'changed checksum' => false]);

test('the scheduled combined cycle runs four Chromium source downloads through one APEX upload and imports its result', function () {
    $root = sys_get_temp_dir().DIRECTORY_SEPARATOR.'combined_hybrid_e2e_'.bin2hex(random_bytes(8));
    File::makeDirectory($root, 0700);
    $database = $root.DIRECTORY_SEPARATOR.'database.sqlite';
    touch($database);
    $original = config('database.default');
    config(['database.connections.combined_e2e' => [...config('database.connections.sqlite'), 'database' => $database], 'database.default' => 'combined_e2e']);
    $server = null;
    try {
        Artisan::call('migrate', ['--database' => 'combined_e2e', '--force' => true]);
        $profile = combinedProfile(false);
        if (getenv('SCRAPING_UI_QA') === '1') {
            $dashboardCustomer = Customer::factory()->create(['name' => 'QA Dashboard Customer']);
            JneShipperAlias::factory()->create(['customer_id' => $dashboardCustomer->id, 'shipper_name' => 'QA Dashboard Sender']);
            $staff = User::factory()->create(['role' => 'pickup_staff', 'name' => 'Petugas QA']);
            $otherCustomer = Customer::factory()->create(['name' => 'QA Customer Repeat']);
            PickupTask::factory()->create(['customer_id' => $otherCustomer->id, 'scheduled_at' => '2026-10-01 03:00:00']);
            for ($day = 10; $day <= 23; $day++) {
                foreach ([$dashboardCustomer, $otherCustomer] as $index => $customer) {
                    $status = $day > 20 ? ($index === 0 ? 'ASSIGNED' : 'SCHEDULED') : 'PICKED_UP';
                    $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'customer_name_snapshot' => $customer->name, 'assigned_staff_id' => $index === 0 || $day <= 20 ? $staff->id : null,
                        'pickup_type' => $index === 0 ? 'on_demand' : 'regular', 'scheduled_at' => "2026-10-{$day} 03:00:00", 'status' => $status]);
                    if ($status === 'PICKED_UP') {
                        PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id, 'picked_up_at' => "2026-10-{$day} 04:00:00", 'manual_hybrid' => $day % 7 + 2, 'cashless_hybrid' => $day % 5 + 1, 'css_orion' => $day % 4 + 1]);
                    }
                }
            }
        }
        expect(app(QueueScheduledJneReports::class)->queueProfile($profile->id, true, '2026-10-22'))->toBe(1);
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        $address = stream_socket_get_name($socket, false);
        fclose($socket);
        $url = 'http://'.$address;
        $token = str_repeat('combined-token', 4);
        $server = new Process([PHP_BINARY, '-d', 'extension=pdo_sqlite', '-d', 'extension=sqlite3', '-S', $address, base_path('vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php')], public_path(), [
            'APP_ENV' => 'testing', 'APP_URL' => $url, 'DB_CONNECTION' => 'sqlite', 'DB_DATABASE' => $database, 'DB_URL' => '',
            'SESSION_DRIVER' => 'database', 'SESSION_COOKIE' => 'combined-e2e-session', 'SESSION_DOMAIN' => '', 'SESSION_SECURE_COOKIE' => 'false',
            'JNE_REPORT_WORKER_TOKEN' => $token, 'JNE_REPORT_WORKER_ID' => 'jne-report-1', 'JNE_REPORT_STORAGE_PATH' => $root.DIRECTORY_SEPARATOR.'reports', 'QUEUE_CONNECTION' => 'sync',
        ]);
        $server->start();
        $deadline = microtime(true) + 10;
        while (@file_get_contents($url.'/up') === false && microtime(true) < $deadline) {
            usleep(100000);
        }
        $runner = new Process(['node', base_path('workers/jne-report/test/hybrid-laravel-flow.mjs')], base_path('workers/jne-report'), ['RETAIL_OPERATIONS_URL' => $url, 'JNE_REPORT_WORKER_TOKEN' => $token, 'JNE_COMBINED_QA' => '1',
            'JNE_UI_QA_EMAIL' => getenv('SCRAPING_UI_QA') === '1' ? User::findOrFail($profile->created_by)->email : '', 'JNE_UI_QA_DIR' => base_path('output/combined-hybrid-ui'),
        ], null, 90);
        $runner->run();
        expect($runner->isSuccessful())->toBeTrue($runner->getOutput().$runner->getErrorOutput());
        expect($runner->getOutput())->toContain('HYBRID_LARAVEL_FIXTURE_OK');
        $batch = ReportJob::where('source', 'hybrid')->sole();
        expect($batch->status)->toBe('COMPLETED')->and($batch->workflowStage())->toBe('READY')->and($batch->source_row_count)->toBe(8)->and($batch->row_count)->toBe(2)->and($batch->awb_count)->toBe(2);
        expect(ReportJob::where('hybrid_batch_id', $batch->id)->where('status', 'SOURCE_SAVED')->count())->toBe(4);
        $this->assertDatabaseCount('jne_report_awbs', 2);
        $this->assertDatabaseCount('jne_shipments', 2);
        $this->assertDatabaseCount('report_jobs', 5);
    } finally {
        $server?->stop();
        config(['database.default' => $original]);
        DB::purge('combined_e2e');
        if (str_starts_with($root, sys_get_temp_dir().DIRECTORY_SEPARATOR.'combined_hybrid_e2e_')) {
            File::deleteDirectory($root);
        }
    }
});

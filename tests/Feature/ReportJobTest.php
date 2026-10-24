<?php

use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    config(['jne-reports.worker_token' => str_repeat('secret', 8), 'jne-reports.worker_id' => 'jne-report-1']);
});

function reportHeaders(?string $claim = null): array
{
    return [
        'Authorization' => 'Bearer '.config('jne-reports.worker_token'),
        'X-Worker-ID' => 'jne-report-1', 'X-Report-Claim' => $claim ?? '',
    ];
}

function claimReport(ReportJob $job): string
{
    return test()->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], reportHeaders())
        ->assertOk()->assertJsonPath('data.id', $job->id)->json('data.claim_token');
}

function downloadingReport(): array
{
    $job = ReportJob::factory()->create();
    $claim = claimReport($job);
    foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
        test()->postJson(route('internal.report-jobs.progress', $job), ['status' => $status], reportHeaders($claim))->assertOk();
    }

    return [$job, $claim];
}

test('active admin creates queued report using server controlled fields and sees recent jobs', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->post(route('jne-reports.store'), [
        'customer_account' => 'TEST001', 'date_from' => '2026-10-01', 'date_thru' => '2026-10-02',
    ])->assertRedirectToRoute('jne-reports.index');

    $this->assertDatabaseHas('report_jobs', [
        'customer_account' => 'TEST001', 'status' => 'QUEUED', 'report_mode' => 'P', 'created_by' => $admin->id,
    ]);
    $this->get(route('jne-reports.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('jne-reports')->has('jobs', 1)->where('jobs.0.status', 'QUEUED')
        ->where('limits', ['max_days' => 5, 'max_request_days' => 366, 'max_awbs' => 6000])
        ->missing('jobs.0.claim_token')->missing('jobs.0.file_path'));
});

test('non admin roles cannot create reports or access admin history', function (string $role) {
    $user = User::factory()->create(['role' => $role]);

    $this->actingAs($user)->post(route('jne-reports.store'), [])->assertForbidden();
    $this->get(route('jne-reports.index'))->assertForbidden();
    $this->assertDatabaseCount('report_jobs', 0);
})->with(['cs', 'pickup_staff', 'retail_staff']);

test('guests and inactive admins cannot create reports', function () {
    $this->post(route('jne-reports.store'))->assertRedirectToRoute('login');
    $admin = User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]);
    $this->actingAs($admin)->postJson(route('jne-reports.store'), [])->assertForbidden();
    $this->assertDatabaseCount('report_jobs', 0);
});

test('invalid period and privileged payload fields are rejected', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin)->post(route('jne-reports.store'), [
        'customer_account' => 'TEST001', 'date_from' => '2026-10-03', 'date_thru' => '2026-10-02', 'status' => 'COMPLETED',
        'parameters' => ['selector' => 'untrusted'], 'created_by' => 999,
    ])->assertSessionHasErrors(['date_thru', 'status', 'parameters', 'created_by']);
    $this->assertDatabaseCount('report_jobs', 0);
});

test('admin can request up to five inclusive calendar days', function (string $from, string $thru) {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->post(route('jne-reports.store'), [
        'customer_account' => 'TEST001', 'date_from' => $from, 'date_thru' => $thru,
    ])->assertRedirectToRoute('jne-reports.index')->assertSessionHasNoErrors();

    $this->assertDatabaseHas('report_jobs', ['customer_account' => 'TEST001', 'status' => 'QUEUED']);
    $this->assertDatabaseCount('report_jobs', 1);
})->with([
    'one day' => ['2026-10-13', '2026-10-13'],
    'five days' => ['2026-10-13', '2026-10-17'],
    'month boundary' => ['2026-10-30', '2026-11-03'],
    'leap day' => ['2024-02-27', '2024-03-02'],
]);

test('long requested periods create consecutive queued reports of at most five inclusive days', function (string $from, string $thru, array $expected) {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->post(route('jne-reports.store'), [
        'customer_account' => 'TEST001', 'date_from' => $from, 'date_thru' => $thru,
    ])->assertRedirectToRoute('jne-reports.index')->assertSessionHasNoErrors();

    $jobs = ReportJob::orderBy('id')->get();
    expect($jobs->map(fn (ReportJob $job): array => [$job->date_from->toDateString(), $job->date_thru->toDateString()])->all())->toBe($expected);
    foreach ($jobs as $job) {
        expect($job->status)->toBe('QUEUED');
        expect($job->customer_account)->toBe('TEST001');
        expect($job->created_by)->toBe($admin->id);
        expect($job->report_mode)->toBe('P');
    }
})->with([
    'month 1 to 30' => ['2026-10-01', '2026-10-30', [
        ['2026-10-01', '2026-10-05'], ['2026-10-06', '2026-10-10'], ['2026-10-11', '2026-10-15'],
        ['2026-10-16', '2026-10-20'], ['2026-10-21', '2026-10-25'], ['2026-10-26', '2026-10-30'],
    ]],
    'six days' => ['2026-10-13', '2026-10-18', [['2026-10-13', '2026-10-17'], ['2026-10-18', '2026-10-18']]],
    'last day remainder' => ['2026-10-21', '2026-10-31', [['2026-10-21', '2026-10-25'], ['2026-10-26', '2026-10-30'], ['2026-10-31', '2026-10-31']]],
    'year boundary' => ['2026-12-29', '2027-01-04', [['2026-12-29', '2027-01-02'], ['2027-01-03', '2027-01-04']]],
    'leap day' => ['2024-02-26', '2024-03-02', [['2024-02-26', '2024-03-01'], ['2024-03-02', '2024-03-02']]],
]);

test('366 day request creates bounded chunks through the final day', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->post(route('jne-reports.store'), [
        'customer_account' => 'TEST001', 'date_from' => '2024-01-01', 'date_thru' => '2024-12-31',
    ])->assertRedirectToRoute('jne-reports.index')->assertSessionHasNoErrors();

    $this->assertDatabaseCount('report_jobs', 74);
    $last = ReportJob::orderByDesc('id')->firstOrFail();
    expect($last->date_from->toDateString())->toBe('2024-12-31');
    expect($last->date_thru->toDateString())->toBe('2024-12-31');
});

test('range exceeding one request limit returns 422 and creates no report', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->postJson(route('jne-reports.store'), [
        'customer_account' => 'TEST001', 'date_from' => '2024-01-01', 'date_thru' => '2025-01-01',
    ])->assertUnprocessable()->assertJsonValidationErrors([
        'date_thru' => 'Rentang satu permintaan maksimal 366 hari, termasuk tanggal awal dan akhir.',
    ]);

    $this->assertDatabaseCount('report_jobs', 0);
});

test('creation failure rolls back the entire requested range', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    Event::listen('eloquent.created: '.ReportJob::class, function (ReportJob $job): void {
        if ($job->date_from->toDateString() === '2026-10-06') {
            throw new RuntimeException('Report storage unavailable');
        }
    });
    $this->withoutExceptionHandling();

    expect(fn () => $this->actingAs($admin)->post(route('jne-reports.store'), [
        'customer_account' => 'TEST001', 'date_from' => '2026-10-01', 'date_thru' => '2026-10-30',
    ]))->toThrow(RuntimeException::class, 'Report storage unavailable');

    $this->assertDatabaseCount('report_jobs', 0);
});

test('invalid calendar dates return 422 without creating a report', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->postJson(route('jne-reports.store'), [
        'customer_account' => 'TEST001', 'date_from' => '2026-02-30', 'date_thru' => '2026-03-01',
    ])->assertUnprocessable()->assertJsonValidationErrors('date_from');

    $this->assertDatabaseCount('report_jobs', 0);
});

test('worker token is mandatory even for logged in admin', function (?string $token) {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $headers = ['X-Worker-ID' => 'jne-report-1'];
    if ($token !== null) {
        $headers['Authorization'] = 'Bearer '.$token;
    }
    $this->actingAs($admin)->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], $headers)->assertUnauthorized();
    $this->assertDatabaseCount('report_jobs', 0);
})->with([null, 'incorrect']);

test('unconfigured tokens fail closed and wrong worker identity returns 403', function () {
    config(['jne-reports.worker_token' => '']);
    $this->postJson(route('internal.report-jobs.claim'), [], reportHeaders())->assertUnauthorized();
    config(['jne-reports.worker_token' => str_repeat('secret', 8)]);
    $this->postJson(route('internal.report-jobs.claim'), [], [...reportHeaders(), 'X-Worker-ID' => 'other-worker'])->assertForbidden();
});

test('claim is FIFO idempotent and only one job can be active', function () {
    $first = ReportJob::factory()->create();
    $second = ReportJob::factory()->create();
    $key = (string) Str::uuid();

    $response = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => $key], reportHeaders())->assertOk()->assertJsonPath('data.id', $first->id);
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => $key], reportHeaders())
        ->assertOk()->assertJsonPath('data.claim_token', $response->json('data.claim_token'));
    $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], reportHeaders())->assertNoContent();

    expect($first->fresh()->status)->toBe('RUNNING')->and($first->fresh()->attempt_count)->toBe(1);
    expect($second->fresh()->status)->toBe('QUEUED');
});

test('progress rejects skipped backward terminal and unknown status changes', function (string $status, int $expected) {
    $job = ReportJob::factory()->create();
    $claim = claimReport($job);

    $this->postJson(route('internal.report-jobs.progress', $job), ['status' => $status], reportHeaders($claim))->assertStatus($expected);

    expect($job->fresh()->status)->toBe('RUNNING')->and($job->fresh()->completed_at)->toBeNull();
})->with([['DOWNLOADING', 409], ['COMPLETED', 422], ['QUEUED', 422], ['UNKNOWN', 422]]);

test('backward progress is rejected and repeated current progress renews the lease', function () {
    $this->travelTo(now()->startOfSecond());
    $job = ReportJob::factory()->create();
    $claim = claimReport($job);
    $this->postJson(route('internal.report-jobs.progress', $job), ['status' => 'WAITING_REPORT'], reportHeaders($claim))->assertOk();
    $this->travel(30)->seconds();
    $this->postJson(route('internal.report-jobs.progress', $job), ['status' => 'WAITING_REPORT'], reportHeaders($claim))->assertOk();
    expect($job->fresh()->lease_expires_at->equalTo(now()->addSeconds(300)))->toBeTrue();
    $this->postJson(route('internal.report-jobs.progress', $job), ['status' => 'RUNNING'], reportHeaders($claim))->assertConflict();
});

test('every mutation rejects a stale or missing ownership token', function (string $endpoint) {
    $job = ReportJob::factory()->create();
    claimReport($job);
    $data = ['status' => $endpoint === 'fail' ? 'FAILED' : 'WAITING_REPORT', 'error_message' => 'Test failure'];

    $this->postJson(route('internal.report-jobs.'.$endpoint, $job), $data, reportHeaders('different-claim'))->assertForbidden();

    expect($job->fresh()->status)->toBe('RUNNING');
})->with(['progress', 'upload', 'fail']);

test('upload validates CSV extension content size and structure', function (string $name, string $content, ?int $maxKb) {
    Storage::fake('jne_reports');
    [$job, $claim] = downloadingReport();
    if ($maxKb !== null) {
        config(['jne-reports.max_file_kb' => $maxKb]);
    }

    $this->post(route('internal.report-jobs.upload', $job), [
        'file' => UploadedFile::fake()->createWithContent($name, $content),
    ], [...reportHeaders($claim), 'Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('file');

    expect($job->fresh()->status)->toBe('DOWNLOADING')->and($job->fresh()->file_path)->toBeNull();
    expect(Storage::disk('jne_reports')->allFiles())->toBe([]);
})->with([
    'empty' => ['report.csv', '', null],
    'html login page' => ['report.csv', '<html><body>Login required</body></html>', null],
    'json' => ['report.csv', '{"message":"error"}', null],
    'extension' => ['report.txt', "AWB,ID_ACCOUNT\n123,TEST\n", null],
    'broken columns' => ['report.csv', "AWB,ID_ACCOUNT\n123,TEST,EXTRA\n", null],
    'duplicate headers' => ['report.csv', "AWB,AWB\n123,123\n", null],
    'oversized' => ['report.csv', "AWB,ID_ACCOUNT\n".str_repeat("123,TEST\n", 200), 1],
]);

test('CSV with exactly 6000 AWB records completes without counting header blank lines or embedded newlines', function () {
    Storage::fake('jne_reports');
    [$job, $claim] = downloadingReport();
    $csv = "AWB,ID_ACCOUNT,SHIPPER_NAME\n\n".str_repeat("123,TEST,\"Name\ncontinued\"\n", 6000);

    $this->post(route('internal.report-jobs.upload', $job), [
        'file' => UploadedFile::fake()->createWithContent('report.csv', $csv),
    ], reportHeaders($claim))->assertOk()->assertJsonPath('data.status', 'COMPLETED');

    expect($job->fresh()->status)->toBe('COMPLETED');
    Storage::disk('jne_reports')->assertExists($job->fresh()->file_path);
});

test('CSV over 6000 AWB records returns 422 and stores no completed result', function () {
    Storage::fake('jne_reports');
    [$job, $claim] = downloadingReport();
    $csv = "AWB,ID_ACCOUNT\n".str_repeat("123,TEST\n", 6001);

    $this->post(route('internal.report-jobs.upload', $job), [
        'file' => UploadedFile::fake()->createWithContent('report.csv', $csv),
    ], [...reportHeaders($claim), 'Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors([
        'file' => 'CSV melebihi batas 6.000 AWB per proses. Persempit periode lalu buat permintaan baru.',
    ]);

    $this->assertDatabaseHas('report_jobs', ['id' => $job->id, 'status' => 'DOWNLOADING', 'file_path' => null, 'completed_at' => null]);
    expect(Storage::disk('jne_reports')->allFiles())->toBe([]);
});

test('only stored CSV completes a job and identical uploads are idempotent', function () {
    Storage::fake('jne_reports');
    [$job, $claim] = downloadingReport();
    $csv = "AWB,ID_ACCOUNT,STATUS_WEB\nTESTAWB,TEST,Delivered\n";

    $this->post(route('internal.report-jobs.upload', $job), ['file' => UploadedFile::fake()->createWithContent('report.csv', $csv)], reportHeaders($claim))
        ->assertOk()->assertJsonPath('data.status', 'COMPLETED')->assertJsonPath('data.file_checksum', hash('sha256', $csv));
    $this->post(route('internal.report-jobs.upload', $job), ['file' => UploadedFile::fake()->createWithContent('report.csv', $csv)], reportHeaders($claim))->assertOk();

    $stored = $job->fresh();
    expect($stored->status)->toBe('COMPLETED')->and($stored->completed_at)->not->toBeNull()
        ->and($stored->file_size)->toBe(strlen($csv))->and($stored->active_slot)->toBeNull();
    Storage::disk('jne_reports')->assertExists($stored->file_path);
    expect(Storage::disk('jne_reports')->allFiles())->toHaveCount(1);

    $this->post(route('internal.report-jobs.upload', $job), ['file' => UploadedFile::fake()->createWithContent('report.csv', "AWB,ID_ACCOUNT\nOTHER,TEST\n")], reportHeaders($claim))->assertConflict();
    $this->postJson(route('internal.report-jobs.fail', $job), ['status' => 'FAILED', 'error_message' => 'late error'], reportHeaders($claim))->assertConflict();
    expect(Storage::disk('jne_reports')->get($stored->file_path))->toBe($csv);
});

test('upload before downloading cannot complete a job', function () {
    Storage::fake('jne_reports');
    $job = ReportJob::factory()->create();
    $claim = claimReport($job);
    $this->post(route('internal.report-jobs.upload', $job), ['file' => UploadedFile::fake()->createWithContent('report.csv', "AWB,ID_ACCOUNT\n123,TEST\n")], reportHeaders($claim))->assertConflict();
    expect($job->fresh()->status)->toBe('RUNNING');
    expect(Storage::disk('jne_reports')->allFiles())->toBe([]);
});

test('private CSV download permits only active admin', function (string $role) {
    Storage::fake('jne_reports');
    [$job, $claim] = downloadingReport();
    $csv = "AWB,ID_ACCOUNT\n123,TEST\n";
    $this->post(route('internal.report-jobs.upload', $job), ['file' => UploadedFile::fake()->createWithContent('report.csv', $csv)], reportHeaders($claim))->assertOk();
    $user = User::factory()->create(['role' => $role]);

    $response = $this->actingAs($user)->get(route('jne-reports.download', $job));
    if ($role === 'admin_supervisor') {
        $response->assertOk()->assertDownload('jne-report-'.$job->id.'.csv');
        expect($response->streamedContent())->toBe($csv);
    } else {
        $response->assertForbidden();
    }
})->with(User::ROLES);

test('missing or unfinished private CSV cannot be downloaded and guests must login', function () {
    Storage::fake('jne_reports');
    $job = ReportJob::factory()->create();
    $this->get(route('jne-reports.download', $job))->assertRedirectToRoute('login');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin)->get(route('jne-reports.download', $job))->assertNotFound();
    $job->update(['status' => 'COMPLETED', 'file_path' => 'missing.csv']);
    $this->get(route('jne-reports.download', $job))->assertNotFound();
});

test('failed or uncertain jobs record visible errors release the slot and are never completed', function (string $status) {
    $job = ReportJob::factory()->create();
    $claim = claimReport($job);
    $payload = ['status' => $status, 'error_message' => 'HISTORY_AMBIGUOUS: Periksa History JNE.'];

    $this->postJson(route('internal.report-jobs.fail', $job), $payload, reportHeaders($claim))->assertOk();
    $this->postJson(route('internal.report-jobs.fail', $job), $payload, reportHeaders($claim))->assertOk();
    expect($job->fresh()->status)->toBe($status)->and($job->fresh()->error_message)->toBe($payload['error_message'])
        ->and($job->fresh()->completed_at)->toBeNull()->and($job->fresh()->active_slot)->toBeNull();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin)->get(route('jne-reports.index'))->assertInertia(fn (Assert $page) => $page->where('jobs.0.error_message', $payload['error_message']));
})->with(['FAILED', 'NEEDS_ATTENTION']);

test('expired claims require review and old workers cannot update or upload them', function () {
    Storage::fake('jne_reports');
    $job = ReportJob::factory()->create();
    $claim = claimReport($job);
    $this->travel(301)->seconds();

    $this->postJson(route('internal.report-jobs.progress', $job), ['status' => 'WAITING_REPORT'], reportHeaders($claim))->assertConflict();
    $this->artisan('report-jobs:recover')->assertSuccessful();
    expect($job->fresh()->status)->toBe('NEEDS_ATTENTION')->and($job->fresh()->active_slot)->toBeNull();
    $this->post(route('internal.report-jobs.upload', $job), ['file' => UploadedFile::fake()->createWithContent('report.csv', "AWB,ID_ACCOUNT\n123,TEST\n")], reportHeaders($claim))->assertConflict();

    $next = ReportJob::factory()->create();
    claimReport($next);
    expect($job->fresh()->attempt_count)->toBe(1);
});

test('storage failure keeps the job incomplete', function () {
    [$job, $claim] = downloadingReport();
    $disk = Mockery::mock(FilesystemAdapter::class);
    $disk->shouldReceive('putFileAs')->once()->andReturn(false);
    $disk->shouldReceive('delete')->once()->andReturn(true);
    Storage::shouldReceive('disk')->with('jne_reports')->andReturn($disk);

    $this->post(route('internal.report-jobs.upload', $job), [
        'file' => UploadedFile::fake()->createWithContent('report.csv', "AWB,ID_ACCOUNT\n123,TEST\n"),
    ], reportHeaders($claim))->assertServiceUnavailable();

    expect($job->fresh()->status)->toBe('DOWNLOADING')->and($job->fresh()->completed_at)->toBeNull()->and($job->fresh()->file_path)->toBeNull();
});

test('unauthenticated worker mutations do not disclose whether a job exists', function (string $endpoint) {
    $job = ReportJob::factory()->create();

    $this->postJson(route('internal.report-jobs.'.$endpoint, $job), [])->assertUnauthorized();
    $this->postJson(route('internal.report-jobs.'.$endpoint, 999999), [])->assertUnauthorized();
})->with(['progress', 'upload', 'fail']);

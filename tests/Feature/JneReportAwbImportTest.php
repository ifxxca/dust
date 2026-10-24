<?php

use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ManageReportJobs;
use App\Jobs\ImportJneReportAwbs;
use App\Models\JneReportAwb;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

function storedAwbReport(string $csv): ReportJob
{
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'file_checksum' => hash('sha256', $csv), 'file_size' => strlen($csv), 'completed_at' => now()]);
    $job->update(['file_path' => 'report-jobs/'.$job->id.'/report.csv']);
    Storage::disk('jne_reports')->put($job->file_path, $csv);

    return $job;
}

test('import normalizes Excel text preserves long AWB leading zeros and retains CSV statuses', function () {
    Storage::fake('jne_reports');
    $stream = fopen('php://temp', 'w+b');
    fputcsv($stream, ['AWB', 'ID_ACCOUNT', 'STATUS_WEB', 'STATUS_POD', 'AWB_CANCEL', 'SHIPPER_NAME', 'CONSIGNEE_NAME'], ',', '"', '');
    fputcsv($stream, ['="001234567890123456789"', '="TESTACCOUNT"', 'In Transit', 'ON PROCESS', 'Y', "Sender,\nCompany", '<script>alert(1)</script>'], ',', '"', '');
    rewind($stream);
    $job = storedAwbReport(stream_get_contents($stream));
    fclose($stream);

    ImportJneReportAwbs::dispatchSync($job->id);

    $this->assertDatabaseHas('jne_report_awbs', ['report_job_id' => $job->id, 'awb' => '001234567890123456789', 'customer_account' => 'TESTACCOUNT', 'status_web' => 'In Transit', 'status_pod' => 'ON PROCESS', 'awb_cancel' => 'Y', 'shipper_name' => "Sender,\nCompany"]);
    expect($job->fresh()->import_status)->toBe('IMPORTED');
    expect($job->fresh()->imported_awb_count)->toBe(1);
    expect($job->fresh()->imported_at)->not->toBeNull();
    expect($job->fresh()->status)->toBe('COMPLETED');
});

test('repeat import is idempotent and identical duplicate AWBs are counted once', function () {
    Storage::fake('jne_reports');
    $job = storedAwbReport("AWB,ID_ACCOUNT\n001,TESTACCOUNT\n001,TESTACCOUNT\n002,TESTACCOUNT\n");

    ImportJneReportAwbs::dispatchSync($job->id);
    ImportJneReportAwbs::dispatchSync($job->id);

    $this->assertDatabaseCount('jne_report_awbs', 2);
    expect($job->fresh()->imported_awb_count)->toBe(2);
    expect($job->fresh()->duplicate_awb_count)->toBe(1);
});

test('JNE apostrophe text prefix is removed only from identifiers', function () {
    Storage::fake('jne_reports');
    $job = storedAwbReport("AWB,ID_ACCOUNT,SHIPPER_NAME\n'CGK001E,'TESTACCOUNT,'Sender\n");

    ImportJneReportAwbs::dispatchSync($job->id);

    expect($job->fresh()->import_status)->toBe('IMPORTED');
    $this->assertDatabaseHas('jne_report_awbs', ['report_job_id' => $job->id, 'awb' => 'CGK001E', 'customer_account' => 'TESTACCOUNT', 'shipper_name' => "'Sender"]);
});

test('legacy Windows CSV cells import without replacing valid UTF8 or changing the original file', function () {
    Storage::fake('jne_reports');
    $csv = "AWB,ID_ACCOUNT,SHIPPER_NAME,RUNSHEET_COURIER_NAME,PRA_RUNSHEET_NAME\n001,TESTACCOUNT,\"Café 東京\",\"Courier\xA0Name\",\"O\x92Brien\"\n";
    $job = storedAwbReport($csv);

    ImportJneReportAwbs::dispatchSync($job->id);

    expect($job->fresh()->import_status)->toBe('IMPORTED');
    $awb = JneReportAwb::where('report_job_id', $job->id)->sole();
    expect($awb->shipper_name)->toBe('Café 東京');
    expect($awb->raw_data['RUNSHEET_COURIER_NAME'])->toBe("Courier\u{00A0}Name");
    expect($awb->raw_data['PRA_RUNSHEET_NAME'])->toBe('O’Brien');
    expect(Storage::disk('jne_reports')->get($job->file_path))->toBe($csv);
    expect($job->fresh()->file_checksum)->toBe(hash('sha256', $csv));
});

test('6000 distinct AWBs are stored in bounded bulk inserts', function () {
    Storage::fake('jne_reports');
    $csv = "AWB,ID_ACCOUNT\n".implode('', array_map(fn (int $index): string => str_pad((string) $index, 15, '0', STR_PAD_LEFT).",TESTACCOUNT\n", range(1, 6000)));
    $job = storedAwbReport($csv);

    ImportJneReportAwbs::dispatchSync($job->id);

    expect($job->fresh()->import_status)->toBe('IMPORTED');
    expect($job->fresh()->imported_awb_count)->toBe(6000);
    $this->assertDatabaseCount('jne_report_awbs', 6000);
    $this->assertDatabaseHas('jne_report_awbs', ['report_job_id' => $job->id, 'awb' => '000000000006000']);
});

test('database failure rolls back imported rows and exposes only a safe error', function () {
    Storage::fake('jne_reports');
    $job = storedAwbReport("AWB,ID_ACCOUNT\n001,TESTACCOUNT\n");
    Event::listen('eloquent.updating: '.ReportJob::class, function (ReportJob $updating): void {
        if ($updating->import_status === 'IMPORTED') {
            throw new RuntimeException('PRIVATE REPORT CONTENT');
        }
    });

    ImportJneReportAwbs::dispatchSync($job->id);

    expect($job->fresh()->import_status)->toBe('FAILED');
    expect($job->fresh()->import_error)->not->toContain('PRIVATE REPORT CONTENT');
    $this->assertDatabaseCount('jne_report_awbs', 0);
});

test('command imports a stored report without contacting JNE and rejects unknown reports', function () {
    Storage::fake('jne_reports');
    $job = storedAwbReport("AWB,ID_ACCOUNT\n001,TESTACCOUNT\n");

    $this->artisan('jne-reports:import-awbs', ['reportJob' => $job->id, '--sync' => true])->assertSuccessful();

    expect($job->fresh()->import_status)->toBe('IMPORTED');
    $this->assertDatabaseCount('jne_report_awbs', 1);
    $this->artisan('jne-reports:import-awbs', ['reportJob' => 999, '--sync' => true])->assertFailed();
});

test('the same AWB in another report retains both source snapshots', function () {
    Storage::fake('jne_reports');
    $first = storedAwbReport("AWB,ID_ACCOUNT,STATUS_WEB\n001,TESTACCOUNT,Pending\n");
    $second = storedAwbReport("AWB,ID_ACCOUNT,STATUS_WEB\n001,TESTACCOUNT,Delivered\n");

    ImportJneReportAwbs::dispatchSync($first->id);
    ImportJneReportAwbs::dispatchSync($second->id);

    $this->assertDatabaseHas('jne_report_awbs', ['report_job_id' => $first->id, 'awb' => '001', 'status_web' => 'Pending']);
    $this->assertDatabaseHas('jne_report_awbs', ['report_job_id' => $second->id, 'awb' => '001', 'status_web' => 'Delivered']);
});

test('invalid CSV import fails atomically without changing completed download', function (string $csv, string $message) {
    Storage::fake('jne_reports');
    $job = storedAwbReport($csv);

    ImportJneReportAwbs::dispatchSync($job->id);

    expect($job->fresh()->import_status)->toBe('FAILED');
    expect($job->fresh()->import_error)->toContain($message);
    expect($job->fresh()->status)->toBe('COMPLETED');
    expect($job->fresh()->imported_at)->toBeNull();
    $this->assertDatabaseCount('jne_report_awbs', 0);
    Storage::disk('jne_reports')->assertExists($job->file_path);
})->with([
    'missing AWB header' => ["ID,ID_ACCOUNT\n001,TESTACCOUNT\n", 'kolom AWB dan ID_ACCOUNT'],
    'duplicate normalized header' => ["AWB,ID_ACCOUNT,awb\n001,TESTACCOUNT,002\n", 'berulang'],
    'empty AWB after valid row' => ["AWB,ID_ACCOUNT\n001,TESTACCOUNT\n,TESTACCOUNT\n", 'AWB kosong'],
    'wrong account after valid row' => ["AWB,ID_ACCOUNT\n001,TESTACCOUNT\n002,OTHER\n", 'ID_ACCOUNT tidak sesuai'],
    'different duplicate' => ["AWB,ID_ACCOUNT,STATUS_WEB\n001,TESTACCOUNT,Pending\n001,TESTACCOUNT,Delivered\n", 'data berbeda'],
    'broken columns' => ["AWB,ID_ACCOUNT\n001,TESTACCOUNT\n002,TESTACCOUNT,EXTRA\n", 'Struktur kolom'],
    'AWB precision already lost' => ["AWB,ID_ACCOUNT\n1.234E+15,TESTACCOUNT\n", 'formatnya tidak valid'],
    'oversized value' => ["AWB,ID_ACCOUNT,STATUS_WEB\n001,TESTACCOUNT,".str_repeat('x', 256)."\n", 'Nilai kolom STATUS_WEB'],
]);

test('CSV BOM delimiters and header only zero result are supported', function (string $csv, int $count) {
    Storage::fake('jne_reports');
    $job = storedAwbReport($csv);

    ImportJneReportAwbs::dispatchSync($job->id);

    expect($job->fresh()->import_status)->toBe('IMPORTED');
    expect($job->fresh()->imported_awb_count)->toBe($count);
    $this->assertDatabaseCount('jne_report_awbs', $count);
})->with([
    'semicolon with BOM' => ["\xEF\xBB\xBFAWB;ID_ACCOUNT\n001;TESTACCOUNT\n", 1],
    'tab' => ["AWB\tID_ACCOUNT\n001\tTESTACCOUNT\n", 1],
    'no shipments' => ["AWB,ID_ACCOUNT\n", 0],
]);

test('6000 records import and 6001 records fail even if all are identical', function (int $records, string $status, int $stored) {
    Storage::fake('jne_reports');
    $job = storedAwbReport("AWB,ID_ACCOUNT\n".str_repeat("001,TESTACCOUNT\n", $records));

    ImportJneReportAwbs::dispatchSync($job->id);

    expect($job->fresh()->import_status)->toBe($status);
    $this->assertDatabaseCount('jne_report_awbs', $stored);
})->with([[6000, 'IMPORTED', 1], [6001, 'FAILED', 0]]);

test('changed checksum or missing source fails without exposing report contents', function (bool $missing) {
    Storage::fake('jne_reports');
    $job = storedAwbReport("AWB,ID_ACCOUNT\n001,TESTACCOUNT\n");
    if ($missing) {
        Storage::disk('jne_reports')->delete($job->file_path);
    } else {
        Storage::disk('jne_reports')->put($job->file_path, "AWB,ID_ACCOUNT\nPRIVATE-AWB,TESTACCOUNT\n");
    }

    ImportJneReportAwbs::dispatchSync($job->id);

    expect($job->fresh()->import_status)->toBe('FAILED');
    expect($job->fresh()->import_error)->not->toContain('PRIVATE-AWB');
    $this->assertDatabaseCount('jne_report_awbs', 0);
})->with([false, true]);

test('CSV storage automatically queues AWB import after commit', function () {
    Storage::fake('jne_reports');
    $job = ReportJob::factory()->create();
    $manager = app(ManageReportJobs::class);
    $claimed = $manager->claim('jne-report-1', (string) Str::uuid());
    $manager->progress($job->id, 'jne-report-1', $claimed->claim_token, 'WAITING_REPORT');
    $manager->progress($job->id, 'jne-report-1', $claimed->claim_token, 'DOWNLOADING');
    Queue::fake([ImportJneReportAwbs::class]);

    $manager->upload($job->id, 'jne-report-1', $claimed->claim_token, UploadedFile::fake()->createWithContent('report.csv', "AWB,ID_ACCOUNT\n001,TESTACCOUNT\n"));

    Queue::assertPushed(ImportJneReportAwbs::class, fn (ImportJneReportAwbs $queued): bool => $queued->reportJobId === $job->id && $queued->afterCommit === true);
    expect($job->fresh()->status)->toBe('COMPLETED');
    expect($job->fresh()->import_status)->toBe('QUEUED');
    Storage::disk('jne_reports')->assertExists($job->fresh()->file_path);
});

test('admin can queue an existing CSV import and see paginated searchable source isolated results', function () {
    Storage::fake('jne_reports');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $job = storedAwbReport("AWB,ID_ACCOUNT\n001,TESTACCOUNT\n".implode('', array_map(fn (int $index): string => '900'.str_pad((string) $index, 12, '0', STR_PAD_LEFT).",TESTACCOUNT\n", range(1, 51))));
    Queue::fake([ImportJneReportAwbs::class]);

    $this->actingAs($admin)->post(route('jne-reports.import-awbs', $job))->assertRedirectToRoute('jne-reports.awbs', $job->id);

    Queue::assertPushed(ImportJneReportAwbs::class, fn (ImportJneReportAwbs $queued): bool => $queued->reportJobId === $job->id);
    expect($job->fresh()->import_status)->toBe('QUEUED');
    app(ImportReportAwbs::class)->handle($job->id);
    JneReportAwb::factory()->create(['awb' => '001', 'report_job_id' => ReportJob::factory()->create()->id]);
    $this->get(route('jne-reports.awbs', $job))->assertOk()->assertInertia(fn (Assert $page) => $page->component('jne-report-awbs')->has('awbs.data', 50)->where('awbs.total', 52)->where('report.import_status', 'IMPORTED')->missing('report.file_path')->missing('report.claim_token'));
    $this->get(route('jne-reports.awbs', [$job, 'q' => '001']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('awbs.total', 1)->where('awbs.data.0.awb', '001'));
    $this->get(route('jne-reports.awbs', [$job, 'q' => '%']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('awbs.total', 0));
    $this->get(route('jne-reports.awbs', [$job, 'q' => '900_']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('awbs.total', 0));
});

test('non admins cannot read AWB results or request imports even for nonexistent IDs', function (string $role) {
    $user = User::factory()->create(['role' => $role]);
    Queue::fake([ImportJneReportAwbs::class]);

    $this->actingAs($user)->get(route('jne-reports.awbs', 999))->assertForbidden();
    $this->post(route('jne-reports.import-awbs', 999))->assertForbidden();

    Queue::assertNotPushed(ImportJneReportAwbs::class);
})->with(['pickup_staff', 'retail_staff', 'cs']);

test('guests and inactive admins cannot access AWB data', function () {
    $this->get(route('jne-reports.awbs', 999))->assertRedirectToRoute('login');
    $this->post(route('jne-reports.import-awbs', 999))->assertRedirectToRoute('login');
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]))->get(route('jne-reports.awbs', 999))->assertForbidden();
});

test('incomplete CSV rejects import and successful imports are not requeued or downgraded by stale failures', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $pending = ReportJob::factory()->create();
    Queue::fake([ImportJneReportAwbs::class]);

    $this->actingAs($admin)->post(route('jne-reports.import-awbs', $pending))->assertConflict();
    expect($pending->fresh()->import_status)->toBe('NOT_IMPORTED');
    Queue::assertNotPushed(ImportJneReportAwbs::class);

    Storage::fake('jne_reports');
    $job = storedAwbReport("AWB,ID_ACCOUNT\n001,TESTACCOUNT\n");
    app(ImportReportAwbs::class)->handle($job->id);
    $this->post(route('jne-reports.import-awbs', $job))->assertRedirectToRoute('jne-reports.awbs', $job->id);
    (new ImportJneReportAwbs($job->id))->failed(new RuntimeException('secret data'));
    expect($job->fresh()->import_status)->toBe('IMPORTED');
});

test('failed import can be retried from the same restored CSV without duplicate rows', function () {
    Storage::fake('jne_reports');
    $csv = "AWB,ID_ACCOUNT\n001,TESTACCOUNT\n";
    $job = storedAwbReport($csv);
    Storage::disk('jne_reports')->delete($job->file_path);
    ImportJneReportAwbs::dispatchSync($job->id);
    Storage::disk('jne_reports')->put($job->file_path, $csv);

    ImportJneReportAwbs::dispatchSync($job->id);

    expect($job->fresh()->import_status)->toBe('IMPORTED');
    expect($job->fresh()->import_error)->toBeNull();
    $this->assertDatabaseCount('jne_report_awbs', 1);
});

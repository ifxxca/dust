<?php

use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\QueueScheduledJneReports;
use App\Jobs\ImportJneReportAwbs;
use App\Models\JneReportAwb;
use App\Models\JneReportProfile;
use App\Models\JneShipment;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
    $this->travelTo('2026-10-23 05:00:00 UTC');
    config(['jne-reports.worker_token' => str_repeat('active-token', 4), 'jne-reports.worker_id' => 'jne-report-1']);
});

function activeRefreshProfile(): JneReportProfile
{
    return JneReportProfile::factory()->create(['source' => 'apex', 'report_type' => 'unresolved', 'customer_account' => 'AWB_AKTIF', 'enabled' => true, 'lookback_days' => 60, 'interval_minutes' => 30]);
}

test('admin can configure one global active AWB schedule and operators cannot change it', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $payload = ['source' => 'apex', 'report_type' => 'unresolved', 'customer_account' => 'ignored', 'mode' => 'fixed', 'lookback_days' => 60, 'enabled' => false, 'interval_minutes' => 30];

    $this->actingAs($admin)->post(route('jne-monitoring.profile-store'), $payload)->assertSessionHasNoErrors()->assertRedirectToRoute('jne-monitoring.profiles');

    $profile = JneReportProfile::sole();
    expect($profile->customer_account)->toBe('AWB_AKTIF')->and($profile->mode)->toBe('rolling');
    $this->post(route('jne-monitoring.profile-store'), $payload)->assertSessionHasErrors('customer_account');
    $this->get(route('jne-monitoring.profiles'))->assertOk()->assertInertia(fn (Assert $page) => $page->where('activeAwbs.total', 0)->where('profiles.0.report_type', 'unresolved'));
    $this->actingAs(User::factory()->create(['role' => 'sales_counter']))->postJson(route('jne-monitoring.profile-store'), $payload)->assertForbidden();
});

test('active AWBs from every account are deduplicated and filtered by entry age and terminal status', function () {
    $profile = activeRefreshProfile();
    foreach (['IN_TRANSIT', 'EXCEPTION', 'UNKNOWN', 'RETURNED', 'DELIVERED', 'CANCELLED'] as $index => $status) {
        JneShipment::factory()->create(['awb' => '000'.$index, 'tracking_status' => $status]);
    }
    JneShipment::factory()->create(['awb' => '0000', 'customer_account' => 'OTHER_ACCOUNT']);
    $source = JneReportAwb::create(['report_job_id' => ReportJob::factory()->create()->id, 'source_row' => 2, 'awb' => 'OLD', 'customer_account' => 'TESTACCOUNT', 'entry_at' => '2026-01-01']);
    JneShipment::factory()->create(['awb' => 'OLD', 'tracking_status' => 'IN_TRANSIT', 'latest_report_awb_id' => $source->id]);

    expect(app(QueueScheduledJneReports::class)->queueProfile($profile->id))->toBe(1);

    $job = ReportJob::where('report_type', 'unresolved')->sole();
    expect($job->parameters['awbs'])->toBe(['0000', '0001', '0002', '0003'])->and($job->report_mode)->toBe('A')->and($job->awb_count)->toBe(4);
    expect(app(QueueScheduledJneReports::class)->queueProfile($profile->id, true))->toBe(0);
});

test('active refresh batches stay within the APEX limit and empty cycles are recorded without contacting APEX', function () {
    $profile = activeRefreshProfile();
    config(['jne-reports.max_awbs' => 2]);
    JneShipment::factory()->count(3)->create();

    expect(app(QueueScheduledJneReports::class)->queueProfile($profile->id))->toBe(2);
    expect(ReportJob::orderBy('id')->pluck('awb_count')->all())->toBe([2, 1]);
    ReportJob::query()->update(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED']);
    JneShipment::query()->update(['tracking_status' => 'DELIVERED']);

    expect(app(QueueScheduledJneReports::class)->queueProfile($profile->id, true))->toBe(1);
    expect(ReportJob::latest('id')->first()->status)->toBe('NO_DATA');
});

test('active refresh uses the entry date boundary in WIB and includes an unknown entry date', function () {
    $profile = activeRefreshProfile();
    $sourceJob = ReportJob::factory()->create();
    foreach (['BEFORE' => '2026-08-24 16:59:59', 'BOUNDARY' => '2026-08-24 17:00:00', 'NO_DATE' => null] as $awb => $entry) {
        $source = JneReportAwb::create(['report_job_id' => $sourceJob->id, 'source_row' => 2, 'awb' => $awb, 'customer_account' => 'TESTACCOUNT', 'entry_at' => $entry]);
        JneShipment::factory()->create(['awb' => $awb, 'latest_report_awb_id' => $source->id, 'last_observed_at' => now()]);
    }

    app(QueueScheduledJneReports::class)->queueProfile($profile->id);

    expect(ReportJob::where('report_type', 'unresolved')->sole()->parameters['awbs'])->toBe(['BOUNDARY', 'NO_DATE']);
});

test('active refresh validates exact AWBs imports real APEX accounts and stops a delivered AWB in the next cycle', function () {
    Storage::fake('jne_reports');
    Queue::fake([ImportJneReportAwbs::class]);
    $profile = activeRefreshProfile();
    JneShipment::factory()->create(['awb' => '001', 'customer_account' => 'ACCOUNT1', 'tracking_status' => 'IN_TRANSIT']);
    JneShipment::factory()->create(['awb' => '002', 'customer_account' => 'ACCOUNT2']);
    app(QueueScheduledJneReports::class)->queueProfile($profile->id);
    $job = ReportJob::sole();
    $headers = ['Authorization' => 'Bearer '.config('jne-reports.worker_token'), 'X-Worker-ID' => 'jne-report-1'];
    $claim = $this->postJson(route('internal.report-jobs.claim'), ['claim_key' => (string) Str::uuid()], $headers)->assertOk()->assertJsonPath('data.report_mode', 'A')->json('data.claim_token');
    $headers['X-Report-Claim'] = $claim;
    foreach (['WAITING_REPORT', 'DOWNLOADING'] as $status) {
        $this->postJson(route('internal.report-jobs.progress', $job), ['status' => $status], $headers)->assertOk();
    }
    $this->postJson(route('internal.report-jobs.upload', $job), ['file' => UploadedFile::fake()->createWithContent('bad.csv', "AWB,ID_ACCOUNT\nWRONG,ACCOUNT1\n")], $headers)->assertUnprocessable()->assertJsonValidationErrors('file');

    $this->postJson(route('internal.report-jobs.upload', $job), ['file' => UploadedFile::fake()->createWithContent('result.csv', "AWB,ID_ACCOUNT,STATUS_WEB\n001,ACCOUNT1,Delivered\n002,ACCOUNT2,On Progress\n")], $headers)->assertOk();
    app(ImportReportAwbs::class)->handle($job->id);
    app(ProjectJneShipments::class)->handle($job->id);

    expect($job->fresh()->workflowStage())->toBe('READY');
    expect(JneShipment::where('awb', '001')->sole()->tracking_status)->toBe('DELIVERED');
    expect(app(QueueScheduledJneReports::class)->queueProfile($profile->id, true))->toBe(1);
    expect(ReportJob::latest('id')->first()->parameters['awbs'])->toBe(['002']);
    $this->actingAs(User::find($profile->updated_by))->get(route('jne-monitoring.index'))->assertOk()->assertInertia(fn (Assert $page) => $page->where('trackingRefresh.active_count', 1)->where('trackingRefresh.profile.id', $profile->id));
});

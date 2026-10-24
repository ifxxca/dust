<?php

use App\Actions\Reports\MatchJneShipments;
use App\Jobs\ImportJneReportAwbs;
use App\Jobs\SyncJneCustomerMappings;
use App\Models\Customer;
use App\Models\JneMappingRun;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipperAlias;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

test('one date range has one request with all six parts and aggregate progress', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin)->post(route('jne-reports.store'), [
        'customer_account' => 'TESTACCOUNT', 'date_from' => '2026-10-01', 'date_thru' => '2026-10-30',
    ])->assertRedirectToRoute('jne-reports.index');
    $jobs = ReportJob::orderBy('id')->get();
    expect($jobs->pluck('request_key')->unique())->toHaveCount(1);
    expect($jobs->first()->request_key)->not->toBeNull();
    $jobs[0]->update(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED']);
    $jobs[1]->update(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'FAILED']);

    $this->get(route('jne-reports.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->has('requests.data', 1)->has('jobs', 6)->where('requests.total', 1)
        ->where('requests.data.0.total', 6)->where('requests.data.0.ready_count', 1)
        ->where('requests.data.0.stored_count', 2)->where('requests.data.0.issue_count', 1)
        ->where('requests.data.0.date_from', '2026-10-01')->where('requests.data.0.date_thru', '2026-10-30'));
});

test('request pagination includes legacy jobs separately without splitting a multi part request', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    ReportJob::factory()->count(21)->create(['created_by' => $admin->id]);
    ReportJob::factory()->count(6)->create(['created_by' => $admin->id, 'request_key' => (string) Str::uuid()]);

    $this->actingAs($admin)->get(route('jne-reports.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('requests.total', 22)->has('requests.data', 20)->has('jobs', 25)->where('requests.data.0.total', 6));
    $this->get(route('jne-reports.index', ['page' => 2]))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->has('requests.data', 2)->has('jobs', 2));
});

test('CSV completion is separate from monitoring readiness', function (array $attributes, string $stage) {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $job = ReportJob::factory()->create($attributes);
    $this->actingAs($admin)->get(route('jne-reports.awbs', $job))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('report.workflow_stage', $stage)->where('report.status', $attributes['status']));
})->with([
    'stored' => [['status' => 'COMPLETED', 'import_status' => 'NOT_IMPORTED'], 'CSV_STORED'],
    'import pending' => [['status' => 'COMPLETED', 'import_status' => 'QUEUED'], 'PROCESSING'],
    'projection pending' => [['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'QUEUED'], 'PROCESSING'],
    'projection failed' => [['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'FAILED'], 'ATTENTION'],
    'ready' => [['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED'], 'READY'],
]);

test('projection retry reuses stored data and coalesces repeated clicks without creating report jobs', function () {
    Queue::fake([ImportJneReportAwbs::class]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'FAILED', 'projection_error' => 'Old failure']);
    $this->actingAs($admin)->post(route('jne-reports.project', $job))->assertRedirectToRoute('jne-reports.awbs', $job);
    $this->post(route('jne-reports.project', $job))->assertRedirectToRoute('jne-reports.awbs', $job);

    Queue::assertPushed(ImportJneReportAwbs::class, 1);
    $this->assertDatabaseHas('report_jobs', ['id' => $job->id, 'status' => 'COMPLETED', 'projection_status' => 'QUEUED', 'projection_error' => null]);
    $this->assertDatabaseCount('report_jobs', 1);
});

test('projection retry requires an active admin and a completed import', function () {
    Queue::fake([ImportJneReportAwbs::class]);
    $job = ReportJob::factory()->create();
    $this->post(route('jne-reports.project', $job))->assertRedirectToRoute('login');
    $this->actingAs(User::factory()->create(['role' => 'cs']))->post(route('jne-reports.project', $job))->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]))->post(route('jne-reports.project', $job))->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->post(route('jne-reports.project', $job))->assertConflict();
    Queue::assertNothingPushed();
});

test('saving a sender queues scoped reapplication to old AWBs and preserves unrelated and manual decisions', function () {
    Queue::fake([SyncJneCustomerMappings::class]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create();
    $report = ReportJob::factory()->create();
    $source = JneReportAwb::factory()->create(['report_job_id' => $report->id, 'shipper_name' => '  Sender   One  ']);
    $shipment = JneShipment::factory()->create(['latest_report_awb_id' => $source->id]);
    $manual = JneShipment::factory()->create(['latest_report_awb_id' => $source->id, 'match_method' => 'MANUAL']);
    $otherSource = JneReportAwb::factory()->create(['report_job_id' => $report->id, 'source_row' => 3, 'shipper_name' => 'Other sender']);
    $other = JneShipment::factory()->create(['latest_report_awb_id' => $otherSource->id]);

    $this->actingAs($admin)->post(route('jne-shipper-aliases.store'), ['customer_id' => $customer->id, 'shipper_name' => 'Sender One'])->assertRedirect();
    $run = JneMappingRun::sole();
    Queue::assertPushed(SyncJneCustomerMappings::class, fn ($job) => $job->runId === $run->id);
    expect($run->normalized_names)->toBe(['SENDER ONE']);
    (new SyncJneCustomerMappings($run->id))->handle(app(MatchJneShipments::class));
    (new SyncJneCustomerMappings($run->id))->handle(app(MatchJneShipments::class));

    expect($shipment->fresh()->customer_id)->toBe($customer->id);
    expect($shipment->fresh()->customer_match_status)->toBe('MATCHED');
    expect($manual->fresh()->customer_id)->toBeNull();
    expect($manual->fresh()->version)->toBe(1);
    expect($other->fresh()->version)->toBe(1);
    expect($run->fresh()->status)->toBe('COMPLETED');
    expect($run->fresh()->affected_count)->toBe(1);
});

test('disabling a conflicting sender reapplies all customers sharing that name', function () {
    Queue::fake([SyncJneCustomerMappings::class]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $correct = JneShipperAlias::factory()->create(['shipper_name' => 'Shared Name']);
    $incorrect = JneShipperAlias::factory()->create(['shipper_name' => 'Shared Name']);
    $source = JneReportAwb::factory()->create(['shipper_name' => 'Shared Name']);
    $shipment = JneShipment::factory()->create(['latest_report_awb_id' => $source->id, 'customer_match_status' => 'AMBIGUOUS']);
    $this->actingAs($admin)->put(route('jne-shipper-aliases.update', $incorrect), ['is_active' => false, 'version' => 1])->assertRedirect();
    $run = JneMappingRun::sole();
    (new SyncJneCustomerMappings($run->id))->handle(app(MatchJneShipments::class));

    expect($shipment->fresh()->customer_id)->toBe($correct->customer_id);
    expect($shipment->fresh()->customer_match_status)->toBe('MATCHED');
    Queue::assertPushed(SyncJneCustomerMappings::class, 1);
});

test('mapping runs process bounded chunks and resume without double counting', function () {
    Queue::fake([SyncJneCustomerMappings::class]);
    JneShipment::factory()->count(201)->create();
    $run = JneMappingRun::factory()->create(['upper_id' => JneShipment::max('id')]);
    $job = new SyncJneCustomerMappings($run->id);
    $job->handle(app(MatchJneShipments::class));
    expect($run->fresh()->status)->toBe('RUNNING');
    expect($run->fresh()->last_id)->toBe(200);
    Queue::assertPushed(SyncJneCustomerMappings::class, 1);
    $job->handle(app(MatchJneShipments::class));
    expect($run->fresh()->status)->toBe('COMPLETED');
    expect($run->fresh()->last_id)->toBe(201);
});

test('failed mapping application is visible and can resume only by an active admin', function () {
    Queue::fake([SyncJneCustomerMappings::class]);
    $run = JneMappingRun::factory()->create(['status' => 'RUNNING', 'last_id' => 12, 'upper_id' => 20]);
    (new SyncJneCustomerMappings($run->id))->failed(new RuntimeException('Private data must not be exposed'));
    expect($run->fresh()->status)->toBe('FAILED');
    expect($run->fresh()->error_message)->not->toContain('Private data');
    $this->post(route('jne-shipper-aliases.retry-sync', $run))->assertRedirectToRoute('login');
    $this->actingAs(User::factory()->create(['role' => 'cs']))->post(route('jne-shipper-aliases.retry-sync', $run))->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('jne-shipper-aliases.index'))->assertInertia(fn (Assert $page) => $page->where('mappingRuns.0.status', 'FAILED'));
    $this->post(route('jne-shipper-aliases.retry-sync', $run))->assertRedirect();
    $this->post(route('jne-shipper-aliases.retry-sync', $run))->assertRedirect();
    expect($run->fresh()->last_id)->toBe(12);
    expect($run->fresh()->status)->toBe('QUEUED');
    Queue::assertPushed(SyncJneCustomerMappings::class, 1);
});

test('report examination stays in report context without turning failure into success', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $job = ReportJob::factory()->create(['status' => 'NEEDS_ATTENTION']);
    $this->actingAs($admin)->post(route('jne-monitoring.review-report', $job), ['reason' => 'History sudah diperiksa.', 'return_to_report' => true])->assertRedirectToRoute('jne-reports.awbs', $job);
    expect($job->fresh()->status)->toBe('NEEDS_ATTENTION');
    expect($job->fresh()->reviewed_by)->toBe($admin->id);
    $this->get(route('jne-reports.awbs', $job))->assertInertia(fn (Assert $page) => $page->where('report.review_note', 'History sudah diperiksa.')->where('report.workflow_stage', 'ATTENTION'));
});

test('monitoring retry actually projects the stored CSV without duplicating AWBs or observations', function () {
    Storage::fake('jne_reports');
    $csv = "AWB,ID_ACCOUNT,STATUS_WEB,SHIPPER_NAME,EXTRA_COLUMN\n001234,TESTACCOUNT,DELIVERED,Sender,Original value\n";
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'file_path' => 'flow/report.csv', 'file_checksum' => hash('sha256', $csv)]);
    Storage::disk('jne_reports')->put($job->file_path, $csv);
    ImportJneReportAwbs::dispatchSync($job->id);
    $job->refresh()->update(['projection_status' => 'FAILED', 'projection_error' => 'Processing interrupted']);
    Queue::fake([ImportJneReportAwbs::class]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin)->post(route('jne-reports.project', $job))->assertRedirectToRoute('jne-reports.awbs', $job);
    Queue::assertPushed(ImportJneReportAwbs::class, 1);
    app()->call([new ImportJneReportAwbs($job->id), 'handle']);

    expect($job->fresh()->workflowStage())->toBe('READY');
    expect(JneReportAwb::sole()->raw_data['EXTRA_COLUMN'])->toBe('Original value');
    expect(JneShipment::sole()->awb)->toBe('001234');
    $this->assertDatabaseCount('report_jobs', 1);
    $this->assertDatabaseCount('jne_shipment_observations', 1);
});

test('CSV alias import queues reapplication and older failures remain accessible through pagination', function () {
    Queue::fake([SyncJneCustomerMappings::class]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    Customer::factory()->create(['customer_code' => '00100', 'name' => 'Customer A']);
    $file = UploadedFile::fake()->createWithContent('aliases.csv', "SHIPPER_NAME,KODE,NAMA_CUSTOMER\nSender A,00100,Customer A\n");
    $this->actingAs($admin)->post(route('jne-shipper-aliases.import'), ['file' => $file])->assertRedirect()->assertSessionHasNoErrors();
    Queue::assertPushed(SyncJneCustomerMappings::class, 1);
    $old = JneMappingRun::sole();
    $old->update(['status' => 'FAILED']);
    JneMappingRun::factory()->count(5)->create(['status' => 'COMPLETED']);
    $this->get(route('jne-shipper-aliases.index', ['mapping_page' => 2]))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('mappingPagination.total', 6)->where('mappingPagination.current_page', 2)->where('mappingRuns.0.id', $old->id)->where('mappingRuns.0.status', 'FAILED'));
});

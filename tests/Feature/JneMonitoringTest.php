<?php

use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\ImportJneReportAwbs;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneReportProfile;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\JneShipmentObservation;
use App\Models\JneShipperAlias;
use App\Models\PickupProcessingRecord;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    config(['jne-reports.source_timezone' => 'Asia/Jakarta']);
    $this->withoutVite();
});

function monitoringReport(array $overrides = [], string $account = 'TESTACCOUNT'): ReportJob
{
    $cells = array_merge(['AWB' => "'001234567890123456789", 'ID_ACCOUNT' => $account, 'STATUS_WEB' => 'SHIPMENT RECEIVED AT [OFFICE]', 'STATUS_POD' => '', 'AWB_CANCEL' => '',
        'SHIPPER_NAME' => 'Sender', 'CONSIGNEE_NAME' => 'Recipient', 'NOREF' => '', 'TGL_ENTRY' => '13-OCT-2026 08:00',
        'TGL_UPDATE_STATUS_POD' => '20-OCT-2026 08:00', 'TGL_TARIK_REPORT' => '20-OCT-2026 08:00', 'EXTRA_COLUMN' => '="Pure Text"'], $overrides);
    $stream = fopen('php://temp', 'w+b');
    fputcsv($stream, array_keys($cells), ',', '"', '');
    fputcsv($stream, array_values($cells), ',', '"', '');
    rewind($stream);
    $csv = stream_get_contents($stream);
    fclose($stream);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'customer_account' => $account, 'file_checksum' => hash('sha256', $csv), 'completed_at' => '2026-10-21 00:00:00']);
    $job->update(['file_path' => 'report-jobs/'.$job->id.'/report.csv']);
    Storage::disk('jne_reports')->put($job->file_path, $csv);
    ImportJneReportAwbs::dispatchSync($job->id);

    return $job->fresh();
}

test('all CSV columns remain intact and repeat projection creates one shipment and observation', function () {
    Storage::fake('jne_reports');
    $report = monitoringReport();

    ImportJneReportAwbs::dispatchSync($report->id);

    expect($report->projection_status)->toBe('PROJECTED');
    $source = JneReportAwb::sole();
    expect($source->raw_data['EXTRA_COLUMN'])->toBe('="Pure Text"');
    expect($source->raw_data['AWB'])->toBe("'001234567890123456789");
    expect($source->awb)->toBe('001234567890123456789');
    expect($source->entry_at->toIso8601String())->toBe('2026-10-13T01:00:00+00:00');
    $this->assertDatabaseCount('jne_shipments', 1);
    $this->assertDatabaseCount('jne_shipment_observations', 1);
    expect(JneShipment::sole()->tracking_status)->toBe('IN_TRANSIT');
});

test('older out of order report is audited but cannot overwrite newer current status', function () {
    Storage::fake('jne_reports');
    $new = monitoringReport(['TGL_TARIK_REPORT' => '20-OCT-2026 10:00', 'STATUS_WEB' => 'DELIVERED TO [TEST RECIPIENT]']);
    $old = monitoringReport(['TGL_TARIK_REPORT' => '19-OCT-2026 10:00']);

    $shipment = JneShipment::sole();

    expect($shipment->tracking_status)->toBe('DELIVERED');
    expect($shipment->latest_report_job_id)->toBe($new->id);
    $this->assertDatabaseCount('jne_shipment_observations', 2);
    expect(JneShipmentObservation::where('jne_report_awb_id', JneReportAwb::where('report_job_id', $old->id)->value('id'))->value('changes_current'))->toBeFalse();
});

test('one AWB across accounts retains one shipment and unknown statuses are not treated as delivered', function () {
    Storage::fake('jne_reports');
    monitoringReport(['STATUS_WEB' => 'Error On Push', 'STATUS_POD' => 'Success']);
    expect(JneShipment::sole()->tracking_status)->toBe('UNKNOWN');
    monitoringReport(['STATUS_WEB' => 'DELIVERED'], 'OTHERACCOUNT');

    $this->assertDatabaseCount('jne_shipments', 1);
    $this->assertDatabaseCount('jne_shipment_observations', 2);
    expect(JneReportAwb::orderBy('id')->pluck('customer_account')->all())->toBe(['TESTACCOUNT', 'OTHERACCOUNT']);
    expect(JneShipment::sole()->tracking_status)->toBe('DELIVERED');
});

test('known source statuses classify conservatively and cancellation takes priority', function (string $web, string $pod, string $cancel, string $expected) {
    $source = JneReportAwb::factory()->make(['status_web' => $web, 'status_pod' => $pod, 'awb_cancel' => $cancel]);

    expect(app(ProjectJneShipments::class)->classify($source))->toBe($expected);
})->with([
    ['DELIVERED TO [TEST]', 'Success', 'Y', 'CANCELLED'], ['DELIVERED TO [TEST]', 'Success', '', 'DELIVERED'],
    ['UNDELIVERED', 'Undel', '', 'EXCEPTION'], ['RETURNED TO SHIPPER', '', '', 'RETURNED'],
    ['WITH DELIVERY COURIER [OFFICE]', '', '', 'IN_TRANSIT'], ['Unexpected code', 'Success', '', 'UNKNOWN'],
]);

test('legacy import is enriched without changing existing source record IDs or CSV', function () {
    Storage::fake('jne_reports');
    $job = monitoringReport();
    $source = JneReportAwb::sole();
    $source->update(['raw_data' => null, 'reference' => null, 'observed_at' => null]);
    $checksum = hash('sha256', Storage::disk('jne_reports')->get($job->file_path));

    ImportJneReportAwbs::dispatchSync($job->id);

    expect(JneReportAwb::sole()->id)->toBe($source->id);
    expect(JneReportAwb::sole()->raw_data['EXTRA_COLUMN'])->toBe('="Pure Text"');
    expect(hash('sha256', Storage::disk('jne_reports')->get($job->file_path)))->toBe($checksum);
    $this->assertDatabaseCount('jne_shipment_observations', 1);
});

test('unique exact reference and mapped customer automatically link finalized pickup', function () {
    Storage::fake('jne_reports');
    $customer = Customer::factory()->create();
    JneReportProfile::factory()->create(['customer_account' => 'TESTACCOUNT', 'customer_id' => $customer->id]);
    JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => 'Sender']);
    $task = PickupTask::factory()->create(['customer_id' => $customer->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    PickupProcessingRecord::factory()->create(['pickup_task_id' => $task->id, 'external_reference' => 'ORDER-001']);

    monitoringReport(['NOREF' => 'ORDER-001']);

    expect(JneShipment::sole()->pickup_task_id)->toBe($task->id);
    expect(JneShipment::sole()->match_status)->toBe('MATCHED');
    expect(JneShipmentMatchEvent::sole()->method)->toBe('REFERENCE');
});

test('missing mapping duplicate reference and wrong customer require review instead of guessing', function () {
    Storage::fake('jne_reports');
    $customer = Customer::factory()->create();
    $tasks = PickupTask::factory()->count(2)->create(['customer_id' => $customer->id]);
    foreach ($tasks as $task) {
        PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
        PickupProcessingRecord::factory()->create(['pickup_task_id' => $task->id, 'external_reference' => 'DUPLICATE']);
    }
    $report = monitoringReport(['NOREF' => 'DUPLICATE']);
    expect(JneShipment::sole()->match_status)->toBe('UNMATCHED');
    $profile = JneReportProfile::factory()->create(['customer_account' => 'TESTACCOUNT', 'customer_id' => Customer::factory()->create()->id]);
    ImportJneReportAwbs::dispatchSync($report->id);
    expect(JneShipment::sole()->match_status)->toBe('UNMATCHED');

    $profile->update(['customer_id' => $customer->id]);
    JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => 'Sender']);
    ImportJneReportAwbs::dispatchSync($report->id);

    expect(JneShipment::sole()->match_status)->toBe('AMBIGUOUS');
    expect(JneShipment::sole()->pickup_task_id)->toBeNull();
});

test('superseded processing references are not used for automatic association', function () {
    Storage::fake('jne_reports');
    $customer = Customer::factory()->create();
    JneReportProfile::factory()->create(['customer_account' => 'TESTACCOUNT', 'customer_id' => $customer->id]);
    JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => 'Sender']);
    $task = PickupTask::factory()->create(['customer_id' => $customer->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    PickupProcessingRecord::factory()->create(['pickup_task_id' => $task->id, 'external_reference' => 'OLD', 'revision' => 1]);
    PickupProcessingRecord::factory()->create(['pickup_task_id' => $task->id, 'external_reference' => 'NEW', 'revision' => 2]);

    monitoringReport(['NOREF' => 'OLD']);

    expect(JneShipment::sole()->match_status)->toBe('UNMATCHED');
});

test('manual decisions are audited preserve existing operations and resist automatic overwrite or stale revision', function () {
    Storage::fake('jne_reports');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create();
    JneReportProfile::factory()->create(['customer_account' => 'TESTACCOUNT', 'customer_id' => $customer->id]);
    JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => 'Sender']);
    $task = PickupTask::factory()->create(['customer_id' => $customer->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    monitoringReport();
    $shipment = JneShipment::sole();

    $this->actingAs($admin)->post(route('jne-monitoring.match', $shipment->id), ['pickup_reference' => $task->reference, 'version' => $shipment->version, 'reason' => 'Dicocokkan dengan dokumen operasional.'])->assertRedirectToRoute('jne-monitoring.show', $shipment->id);

    expect($shipment->fresh()->match_method)->toBe('MANUAL');
    expect($shipment->fresh()->pickup_task_id)->toBe($task->id);
    $this->assertDatabaseHas('jne_shipment_match_events', ['actor_id' => $admin->id, 'reason' => 'Dicocokkan dengan dokumen operasional.']);
    $this->post(route('jne-monitoring.match', $shipment->id), ['pickup_reference' => null, 'version' => $shipment->version, 'reason' => 'Stale'])->assertConflict();
    monitoringReport(['NOREF' => 'DIFFERENT', 'TGL_TARIK_REPORT' => '20-OCT-2026 11:00']);
    expect($shipment->fresh()->pickup_task_id)->toBe($task->id);
    expect($task->fresh()->status)->toBe('SCHEDULED');
    expect($task->fresh()->version)->toBe(1);
});

test('admin can browse monitoring source history raw fields and reconciliation', function () {
    Storage::fake('jne_reports');
    $report = monitoringReport();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $shipment = JneShipment::sole();

    $this->actingAs($admin)->get(route('jne-monitoring.index'))->assertOk()->assertInertia(fn (Assert $page) => $page->component('jne-monitoring')->where('shipments.total', 1)->where('summary.IN_TRANSIT', 1));
    $this->get(route('jne-monitoring.show', $shipment->id))->assertOk()->assertInertia(fn (Assert $page) => $page->component('jne-shipment')->where('shipment.source.raw_data.EXTRA_COLUMN', '="Pure Text"')->has('history.data', 1)->missing('shipment.source.file_path'));
    $this->get(route('jne-monitoring.index', ['q' => '%']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('shipments.total', 0));
    $this->get(route('jne-monitoring.profiles'))->assertOk()->assertInertia(fn (Assert $page) => $page->component('jne-profiles'));
    $this->get(route('jne-monitoring.reconciliation'))->assertOk()->assertInertia(fn (Assert $page) => $page->component('jne-reconciliation')->where('linkage.linked', 0));
});

test('monitoring endpoints reject ordinary users even for missing resource IDs', function (string $role) {
    $this->actingAs(User::factory()->create(['role' => $role]));
    foreach (['jne-monitoring.index', 'jne-monitoring.profiles', 'jne-monitoring.reconciliation'] as $route) {
        $this->get(route($route))->assertForbidden();
    }
    $this->get(route('jne-monitoring.show', 999))->assertForbidden();
    $this->post(route('jne-monitoring.match', 999), [])->assertForbidden();
    $this->post(route('jne-monitoring.profile-store'), [])->assertForbidden();
    $this->put(route('jne-monitoring.profile-update', 999), [])->assertForbidden();
    $this->post(route('jne-monitoring.rebuild'), [])->assertForbidden();
    $this->post(route('jne-monitoring.review-report', 999), [])->assertForbidden();
})->with(['cs', 'pickup_staff', 'retail_staff']);

test('rebuild queues existing imports without creating new JNE report requests', function () {
    Storage::fake('jne_reports');
    $report = monitoringReport();
    Queue::fake([ImportJneReportAwbs::class]);

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->post(route('jne-monitoring.rebuild'), ['account' => 'TESTACCOUNT'])->assertRedirectToRoute('jne-monitoring.index');

    Queue::assertPushed(ImportJneReportAwbs::class, fn (ImportJneReportAwbs $job): bool => $job->reportJobId === $report->id);
    $this->assertDatabaseCount('report_jobs', 1);
});

test('unchanged newer observations remain in history without falsely reporting a status change', function () {
    Storage::fake('jne_reports');
    monitoringReport(['TGL_TARIK_REPORT' => '20-OCT-2026 09:00']);
    $new = monitoringReport(['TGL_TARIK_REPORT' => '20-OCT-2026 10:00']);

    expect(JneShipment::sole()->latest_report_job_id)->toBe($new->id);
    expect(JneShipmentObservation::where('changes_current', true)->count())->toBe(1);
    $this->assertDatabaseCount('jne_shipment_observations', 2);
});

test('automatic conflicting reference never silently replaces a previous pickup', function () {
    Storage::fake('jne_reports');
    $customer = Customer::factory()->create();
    JneReportProfile::factory()->create(['customer_account' => 'TESTACCOUNT', 'customer_id' => $customer->id]);
    JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => 'Sender']);
    $tasks = PickupTask::factory()->count(2)->create(['customer_id' => $customer->id]);
    foreach ($tasks as $task) {
        PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    }
    monitoringReport(['NOREF' => $tasks[0]->reference, 'TGL_TARIK_REPORT' => '20-OCT-2026 09:00']);

    monitoringReport(['NOREF' => $tasks[1]->reference, 'TGL_TARIK_REPORT' => '20-OCT-2026 10:00']);

    expect(JneShipment::sole()->pickup_task_id)->toBe($tasks[0]->id);
    expect(JneShipment::sole()->match_status)->toBe('AMBIGUOUS');
    $this->assertDatabaseCount('jne_shipment_match_events', 2);
});

test('manual unlink remains authoritative after another reference match is available', function () {
    Storage::fake('jne_reports');
    $customer = Customer::factory()->create();
    JneReportProfile::factory()->create(['customer_account' => 'TESTACCOUNT', 'customer_id' => $customer->id]);
    JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => 'Sender']);
    $task = PickupTask::factory()->create(['customer_id' => $customer->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $report = monitoringReport(['NOREF' => $task->reference]);
    $shipment = JneShipment::sole();

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->post(route('jne-monitoring.match', $shipment->id), ['pickup_reference' => null, 'version' => $shipment->version, 'reason' => 'Hubungan belum terbukti; lepaskan sementara.'])->assertRedirect();
    ImportJneReportAwbs::dispatchSync($report->id);

    expect($shipment->fresh()->pickup_task_id)->toBeNull();
    expect($shipment->fresh()->match_method)->toBe('MANUAL');
});

test('manual matching rejects wrong customer or non finalized pickup and requires audit reason', function () {
    Storage::fake('jne_reports');
    $customer = Customer::factory()->create();
    JneReportProfile::factory()->create(['customer_account' => 'TESTACCOUNT', 'customer_id' => $customer->id]);
    JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => 'Sender']);
    monitoringReport();
    $shipment = JneShipment::sole();
    $wrong = PickupTask::factory()->create();
    PickupRecord::factory()->create(['pickup_task_id' => $wrong->id]);
    $pending = PickupTask::factory()->create(['customer_id' => $customer->id]);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']));

    $this->postJson(route('jne-monitoring.match', $shipment->id), ['pickup_reference' => $wrong->reference, 'version' => $shipment->version, 'reason' => 'Review'])->assertUnprocessable()->assertJsonValidationErrors('pickup_reference');
    $this->postJson(route('jne-monitoring.match', $shipment->id), ['pickup_reference' => $pending->reference, 'version' => $shipment->version, 'reason' => 'Review'])->assertUnprocessable()->assertJsonValidationErrors('pickup_reference');
    $this->postJson(route('jne-monitoring.match', $shipment->id), ['pickup_reference' => null, 'version' => $shipment->version, 'reason' => ''])->assertUnprocessable()->assertJsonValidationErrors('reason');

    expect($shipment->fresh()->pickup_task_id)->toBeNull();
    $this->assertDatabaseCount('jne_shipment_match_events', 0);
});

test('reconciliation compares distinct linked AWBs without treating missing retail baseline as resolved', function () {
    Storage::fake('jne_reports');
    $customer = Customer::factory()->create();
    $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => 1, 'cashless_hybrid' => 0, 'css_orion' => 0]);
    PickupProcessingRecord::factory()->create(['pickup_task_id' => $task->id, 'successful_quantity' => 1]);
    JneReportProfile::factory()->create(['customer_account' => 'TESTACCOUNT', 'customer_id' => $customer->id]);
    JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => 'Sender']);
    monitoringReport(['NOREF' => $task->reference]);
    monitoringReport(['NOREF' => $task->reference, 'TGL_TARIK_REPORT' => '20-OCT-2026 10:00']);

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('jne-monitoring.reconciliation', ['q' => $task->reference]))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->where('linkage', ['total' => 1, 'linked' => 1])->where('pickups.total', 1)->where('pickups.data.0.comparison_ready', true)->where('pickups.data.0.matched_awbs', 1)->where('pickups.data.0.declared_successful', 1)->where('pickups.data.0.difference', 0)->where('pickups.data.0.state', 'NO_BASELINE'));
});

test('guest and inactive admin cannot browse monitoring data', function () {
    $this->get(route('jne-monitoring.index'))->assertRedirectToRoute('login');
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]))->get(route('jne-monitoring.index'))->assertForbidden();
});

test('legacy enrichment failure remains visible without downgrading completed CSV import', function () {
    Storage::fake('jne_reports');
    $report = monitoringReport();
    JneReportAwb::where('report_job_id', $report->id)->update(['raw_data' => null]);
    $report->update(['projection_status' => 'NOT_PROJECTED']);
    Storage::disk('jne_reports')->delete($report->file_path);

    $this->artisan('jne-monitoring:rebuild', ['--sync' => true, '--account' => 'TESTACCOUNT'])->assertFailed();

    expect($report->fresh()->import_status)->toBe('IMPORTED');
    expect($report->fresh()->projection_status)->toBe('FAILED');
    expect($report->fresh()->projection_error)->not->toBeNull();
});

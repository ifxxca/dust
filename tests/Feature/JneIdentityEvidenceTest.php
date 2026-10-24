<?php

use App\Actions\Reports\MatchJneShipments;
use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\QueueJneCustomerMappings;
use App\Jobs\SyncJneCustomerMappings;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\JneShipperAlias;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\Queue;

function identityEvidenceSource(string $name, string $awb = '00001', array $attributes = []): JneReportAwb
{
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    $source = JneReportAwb::factory()->create([...['report_job_id' => $job->id, 'awb' => $awb, 'shipper_name' => $name], ...$attributes]);
    app(ProjectJneShipments::class)->handle($job->id);

    return $source;
}

test('a sender typo produces explainable candidates without confirming customer or pickup', function (string $name) {
    $customer = Customer::factory()->create(['name' => 'Vanny Songket', 'customer_code' => '4000']);
    JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => 'Vanny Songket']);
    $source = identityEvidenceSource($name);

    $shipment = JneShipment::sole();

    expect($shipment->customer_match_status)->toBe('CANDIDATE');
    expect($shipment->customer_match_candidates[0]['customer_id'])->toBe($customer->id);
    expect($shipment->customer_match_candidates[0]['registered_name'])->toBe('Vanny Songket');
    expect($shipment->customer_id)->toBeNull();
    expect($shipment->pickup_task_id)->toBeNull();
    expect($source->fresh()->shipper_name)->toBe($name);
})->with(['Vany Songket', 'Vanny Sngket', 'Vanny-Songket']);

test('sparse tracking reports preserve earlier verified identity and pickup evidence', function () {
    $this->travelTo('2026-10-24 12:00:00 UTC');
    $customer = Customer::factory()->create();
    $alias = JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => 'Known Sender']);
    $task = PickupTask::factory()->create(['customer_id' => $customer->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $original = identityEvidenceSource('Known Sender', attributes: ['reference' => $task->reference, 'observed_at' => now()->subHour(), 'status_web' => 'IN TRANSIT', 'status_pod' => '']);

    $refresh = identityEvidenceSource('', attributes: ['observed_at' => now(), 'status_web' => 'DELIVERED']);

    $this->assertDatabaseHas('jne_shipments', ['awb' => '00001', 'customer_id' => $customer->id, 'pickup_task_id' => $task->id, 'customer_match_status' => 'MATCHED', 'match_status' => 'MATCHED', 'latest_report_awb_id' => $refresh->id, 'tracking_status' => 'DELIVERED']);
    expect(JneShipmentMatchEvent::first()->evidence)->toContain(['source_id' => $original->id, 'alias_id' => $alias->id, 'customer_id' => $customer->id]);
});

test('conflicting verified owners across source accounts remain unresolved even when the conflict arrives late', function () {
    $this->travelTo('2026-10-24 12:00:00 UTC');
    JneShipperAlias::factory()->create(['shipper_name' => 'One Owner']);
    JneShipperAlias::factory()->create(['shipper_name' => 'Other Owner']);
    $latest = identityEvidenceSource('One Owner', attributes: ['customer_account' => 'SHARED', 'observed_at' => now()]);

    identityEvidenceSource('Other Owner', attributes: ['customer_account' => 'OTHER', 'observed_at' => now()->subDay()]);

    $shipment = JneShipment::sole();
    expect($shipment->customer_match_status)->toBe('CONFLICT');
    expect($shipment->match_status)->toBe('CONFLICT');
    expect($shipment->customer_id)->toBeNull();
    expect($shipment->latest_report_awb_id)->toBe($latest->id);
    $this->assertDatabaseCount('jne_shipments', 1);
});

test('marketplace names cannot establish ownership even if a global sender mapping exists', function (string $name) {
    JneShipperAlias::factory()->create(['shipper_name' => $name]);

    identityEvidenceSource($name);

    expect(JneShipment::sole()->customer_id)->toBeNull();
    expect(JneShipment::sole()->customer_match_status)->toBe('UNMATCHED');
})->with(['Shopee International', 'Tokopedia']);

test('alias correction re-evaluates historical evidence after a sparse tracking snapshot', function () {
    Queue::fake([SyncJneCustomerMappings::class]);
    $this->travelTo('2026-10-24 12:00:00 UTC');
    $alias = JneShipperAlias::factory()->create(['shipper_name' => 'Known Sender']);
    identityEvidenceSource('Known Sender', attributes: ['observed_at' => now()->subHour()]);
    identityEvidenceSource('', attributes: ['observed_at' => now()]);
    $alias->update(['is_active' => false]);
    $replacement = JneShipperAlias::factory()->create(['shipper_name' => 'Known Sender']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $run = app(QueueJneCustomerMappings::class)->handle(['KNOWN SENDER'], $admin->id);

    (new SyncJneCustomerMappings($run->id))->handle(app(MatchJneShipments::class));

    expect(JneShipment::sole()->customer_id)->toBe($replacement->customer_id);
    expect($run->fresh()->affected_count)->toBe(1);
    Queue::assertPushed(SyncJneCustomerMappings::class, 1);
});

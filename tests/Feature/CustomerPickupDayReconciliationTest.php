<?php

use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\QueryPickupAutomation;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Jobs\ReconcilePickupProcessingJob;
use App\Models\Customer;
use App\Models\JneShipment;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupPendingItem;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-10-26 08:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    Queue::fake();
    Storage::fake('jne_reports');
    Storage::fake('local');
});

/** @param array{admin: User, customer: Customer, task: PickupTask} $fixture */
function customerDaySecondPickup(array $fixture, int $manual = 2, int $orion = 0, string $at = '2026-10-26 10:00:00'): PickupTask
{
    $task = PickupTask::factory()->create(['customer_id' => $fixture['customer']->id, 'customer_name_snapshot' => 'Vanny', 'status' => 'PICKED_UP', 'scheduled_at' => $at]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => $manual, 'cashless_hybrid' => 0, 'css_orion' => $orion, 'picked_up_at' => $at]);
    $session = app(CreateSession::class)->handle($fixture['admin'], [$task->id], (string) Str::uuid());
    app(VerifyItem::class)->handle($fixture['admin'], $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => $manual, 'cashless_hybrid' => 0, 'css_orion' => $orion]);

    return $task;
}

test('two books compile once per customer day and balance category counts without moving existing ownership', function () {
    $fixture = pickupAutomationFixture(2, 0);
    $second = customerDaySecondPickup($fixture);
    importPickupAutomationReport($fixture, 4, 0);
    $rows = JneShipment::orderBy('id')->get();
    foreach ($rows as $i => $row) {
        $row->update(['pickup_task_id' => $i < 3 ? $fixture['task']->id : $second->id, 'match_status' => 'MATCHED', 'match_method' => 'MANUAL']);
    }
    $before = JneShipment::orderBy('id')->pluck('pickup_task_id')->all();

    app(ReconcilePickupProcessing::class)->handle($second->id);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    $group = PickupCustomerReconciliation::sole();
    expect($group->status)->toBe('DONE')->and($group->pickup_count)->toBe(2);
    expect($group->categories['manual_hybrid'])->toMatchArray(['expected' => 4, 'confirmed' => 4, 'shortfall' => 0, 'excess' => 0]);
    expect(JneShipment::orderBy('id')->pluck('pickup_task_id')->all())->toBe($before);
    expect(PickupProcessingReconciliation::whereNotNull('locked_at')->count())->toBe(2);
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
    $this->assertDatabaseCount('pickup_awb_manifest_items', 4);
    $this->assertDatabaseCount('pickup_customer_reconciliation_events', 1);
    expect(PickupAwbManifest::sole()->snapshot['pickup_task_ids'])->toBe([$fixture['task']->id, $second->id]);
    expect((new ReconcilePickupProcessingJob($second->id))->uniqueId())->toBe((new ReconcilePickupProcessingJob($fixture['task']->id))->uniqueId());
    $monitor = app(QueryPickupAutomation::class)->handle(['date_from' => '2026-10-26', 'date_to' => '2026-10-26']);
    expect($monitor['rows']->total())->toBe(1)->and($monitor['summary']['done'])->toBe(1);
    $this->actingAs($fixture['admin'])->getJson(route('pickup-automation.show', ['task' => $second, 'view' => 'customer_day']))
        ->assertOk()->assertJsonPath('customer_day.pickup_count', 2)->assertJsonPath('reconciliation.status', 'DONE')->assertJsonPath('shipments.total', 4);
});

test('equal daily totals still require each category to match', function () {
    $fixture = pickupAutomationFixture(2, 1);
    customerDaySecondPickup($fixture, 2, 1);
    importPickupAutomationReport($fixture, 5, 1);

    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    $group = PickupCustomerReconciliation::sole();
    expect($group->status)->toBe('REVIEW');
    expect($group->categories['manual_hybrid']['excess'])->toBe(1);
    expect($group->categories['css_orion']['shortfall'])->toBe(1);
    $this->assertDatabaseCount('pickup_awb_manifests', 0);
});

test('staff or book searches select the whole customer day and pagination counts groups', function () {
    $fixture = pickupAutomationFixture(2, 0);
    $second = customerDaySecondPickup($fixture);
    $staff = User::factory()->create(['role' => 'pickup_staff', 'is_active' => true]);
    $second->update(['assigned_staff_id' => $staff->id]);
    importPickupAutomationReport($fixture, 4, 0);
    app(ReconcilePickupProcessing::class)->handle($second->id);

    $data = app(QueryPickupAutomation::class)->handle(['q' => $second->reference, 'staff_id' => $staff->id, 'date_from' => '2026-10-26', 'date_to' => '2026-10-26', 'per_page' => 10]);

    expect($data['rows']->total())->toBe(1);
    expect($data['rows']->items()[0]['pickup_count'])->toBe(2);
    expect($data['rows']->items()[0]['categories']['manual_hybrid']['expected'])->toBe(4);
    $this->actingAs($fixture['admin'])->getJson(route('pickup-automation.show', ['task' => $fixture['task'], 'view' => 'pickup', 'member_task' => $second->id]))
        ->assertOk()->assertJsonPath('task.id', $second->id)->assertJsonPath('selected_task_id', $fixture['task']->id);
    $foreign = PickupTask::factory()->create();
    $this->getJson(route('pickup-automation.show', ['task' => $fixture['task'], 'view' => 'pickup', 'member_task' => $foreign->id]))->assertNotFound();
});

test('retail day boundaries merge 0459 next morning and separate 0500 and other customers', function () {
    $fixture = pickupAutomationFixture(2, 0);
    customerDaySecondPickup($fixture, 2, 0, '2026-10-26 21:59:00');
    customerDaySecondPickup($fixture, 2, 0, '2026-10-26 22:00:00');
    $other = PickupTask::factory()->create(['status' => 'PICKED_UP', 'scheduled_at' => now()]);
    PickupRecord::factory()->create(['pickup_task_id' => $other->id]);

    $data = app(QueryPickupAutomation::class)->handle(['date_from' => '2026-10-26', 'date_to' => '2026-10-27']);

    expect($data['rows']->total())->toBe(3);
    $rows = collect($data['rows']->items());
    expect($rows->firstWhere('pickup_count', 2)['business_date'])->toBe('2026-10-26');
});

test('a newly scheduled pickup invalidates the completed daily view until it is verified', function () {
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 2, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    PickupTask::factory()->create(['customer_id' => $fixture['customer']->id, 'status' => 'SCHEDULED', 'scheduled_at' => now()->addHour()]);

    $data = app(QueryPickupAutomation::class)->handle(['date_from' => '2026-10-26', 'date_to' => '2026-10-26']);

    expect($data['rows']->items()[0]['automation_status'])->toBe('NOT_EVALUATED');
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    expect(PickupCustomerReconciliation::sole()->status)->toBe('AWAITING_VERIFICATION');
    expect(PickupAwbManifest::sole()->status)->toBe('SUPERSEDED');
});

test('uncertain delivery on the shared document blocks corrections from every member book', function () {
    $fixture = pickupAutomationFixture(2, 0);
    $second = customerDaySecondPickup($fixture);
    importPickupAutomationReport($fixture, 4, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $manifest = PickupAwbManifest::sole();
    $manifest->update(['status' => 'READY']);
    PickupAwbDelivery::factory()->create(['pickup_awb_manifest_id' => $manifest->id, 'status' => 'UNKNOWN']);
    $result = PickupProcessingReconciliation::where('pickup_task_id', $second->id)->sole();

    $this->actingAs($fixture['admin'])->postJson(route('pickup-automation.review', $second),
        ['action' => 'UNLOCK', 'expected_version' => $result->input_version, 'reason' => 'Pemeriksaan ulang bucket customer'])->assertConflict();

    expect($manifest->fresh()->status)->toBe('READY');
    expect($result->fresh()->locked_at)->not->toBeNull();
    $this->assertDatabaseCount('pickup_awb_review_events', 0);
});

test('older unresolved pending prevents silently feeding an unassigned daily pool', function () {
    $fixture = pickupAutomationFixture(2, 0);
    customerDaySecondPickup($fixture);
    $older = customerDaySecondPickup($fixture, 2, 0, '2026-10-25 08:00:00');
    PickupPendingItem::factory()->create(['pickup_task_id' => $older->id, 'category' => 'manual_hybrid', 'status' => 'PENDING']);
    importPickupAutomationReport($fixture, 4, 0);

    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    expect(PickupCustomerReconciliation::sole()->status)->toBe('REVIEW');
    expect(JneShipment::whereNotNull('pickup_task_id')->count())->toBe(0);
    $this->assertDatabaseCount('pickup_awb_manifests', 0);
});

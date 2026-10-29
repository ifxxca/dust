<?php

use App\Actions\Pickup\RecordCashlessAwb;
use App\Actions\Reports\BuildJnePickupReconciliation;
use App\Actions\Reports\ProjectJneShipments;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipperAlias;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

function popScenario(int $cashless = 3, int $css = 100, int $scanned = 3): PickupTask
{
    $customer = Customer::factory()->create(['name' => 'Vanny Songket', 'customer_code' => '4000']);
    JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => 'Vanny Songket']);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'customer_name_snapshot' => $customer->name, 'assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED', 'execution_started_at' => now()]);
    for ($index = 1; $index <= $scanned; $index++) {
        app(RecordCashlessAwb::class)->handle($staff, $task->id, ['awb' => 'CASH'.str_pad((string) $index, 3, '0', STR_PAD_LEFT), 'submission_key' => (string) Str::uuid()]);
    }
    $task->update(['status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id, 'manual_hybrid' => 0, 'cashless_hybrid' => $cashless, 'css_orion' => $css]);

    return $task;
}

function popSource(PickupTask $task, int $cashless, int $css = 0): void
{
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    for ($index = 1; $index <= $cashless; $index++) {
        JneReportAwb::factory()->create(['report_job_id' => $job->id, 'customer_account' => 'SHARED',
            'awb' => 'CASH'.str_pad((string) $index, 3, '0', STR_PAD_LEFT), 'shipper_name' => 'Shopee International']);
    }
    for ($index = 1; $index <= $css; $index++) {
        JneReportAwb::factory()->create(['report_job_id' => $job->id, 'customer_account' => 'SHARED', 'awb' => 'CSS01'.str_pad((string) $index, 4, '0', STR_PAD_LEFT),
            'shipper_name' => 'Vanny Songket', 'reference' => $task->reference]);
    }
    app(ProjectJneShipments::class)->handle($job->id);
}

test('Vanny 100 plus 3 distinguishes verified cashless identity from 100 still unproven category assignments', function () {
    $this->withoutVite();
    $task = popScenario();
    popSource($task, 3, 100);

    $result = app(BuildJnePickupReconciliation::class)->handle(new Collection([$task]))[$task->id];

    expect($result['confirmed_pickup_awbs'])->toBe(103);
    expect($result['category_confirmed_awbs'])->toBe(3);
    expect($result['unclassified_awbs'])->toBe(100);
    expect($result['categories']['manual_hybrid']['expected_quantity'])->toBe(0);
    expect($result['categories']['cashless_hybrid']['expected_quantity'])->toBe(3);
    expect($result['categories']['cashless_hybrid']['confirmed_awbs'])->toBe(3);
    expect($result['categories']['css_orion']['expected_quantity'])->toBe(100);
    expect($result['categories']['css_orion']['confirmed_awbs'])->toBe(0);
    expect($result['categories']['css_orion']['state'])->toBe('CATEGORY_EVIDENCE_REQUIRED');
    expect($result['reconciled'])->toBeFalse();
    expect($result['collection_complete'])->toBeFalse();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('jne-monitoring.reconciliation', ['q' => $task->reference]))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('pickups.data.0.pop_reconciliation.unclassified_awbs', 100)
            ->where('pickups.data.0.pop_reconciliation.categories.cashless_hybrid.confirmed_awbs', 3)
            ->where('pickups.data.0.pop_reconciliation.categories.css_orion.missing_quantity', null));
});

test('late reports and repeated observations update provisional cashless coverage without duplicating AWBs', function () {
    $task = popScenario(css: 0);
    popSource($task, 2);
    $before = app(BuildJnePickupReconciliation::class)->handle(new Collection([$task]))[$task->id];
    expect($before['categories']['cashless_hybrid']['shortfall_quantity'])->toBe(1);
    expect($before['categories']['cashless_hybrid']['missing_quantity'])->toBeNull();

    popSource($task, 3);

    $after = app(BuildJnePickupReconciliation::class)->handle(new Collection([$task]))[$task->id];
    expect($after['categories']['cashless_hybrid']['confirmed_awbs'])->toBe(3);
    expect($after['categories']['cashless_hybrid']['shortfall_quantity'])->toBe(0);
    expect($after['reconciled'])->toBeFalse();
    $this->assertDatabaseCount('jne_shipments', 3);
    $this->assertDatabaseCount('jne_shipment_observations', 5);
});

test('excess cashless evidence and revised POP use current expectations without rewriting the finalized original', function () {
    $task = popScenario(css: 0, scanned: 4);
    popSource($task, 4);
    $result = app(BuildJnePickupReconciliation::class)->handle(new Collection([$task]))[$task->id];
    expect($result['categories']['cashless_hybrid']['excess_quantity'])->toBe(1);
    expect($result['categories']['cashless_hybrid']['state'])->toBe('EXCESS');
    $proof = $task->proof()->first();
    $proof->revisions()->create(['revision' => 1, 'values' => ['cashless_hybrid' => 5], 'actor_id' => User::factory()->create(['role' => 'admin_supervisor'])->id, 'reason' => 'Actual POP correction reviewed']);

    $result = app(BuildJnePickupReconciliation::class)->handle(PickupTask::whereKey($task->id)->get())[$task->id];

    expect($result['categories']['cashless_hybrid']['expected_quantity'])->toBe(5);
    expect($result['categories']['cashless_hybrid']['shortfall_quantity'])->toBe(1);
    expect($proof->fresh()->cashless_hybrid)->toBe(3);
});

test('matched totals with ambiguous or wrong customer ownership cannot count as confirmed pickup identity', function () {
    $task = popScenario(cashless: 0, css: 2, scanned: 0);
    JneShipment::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id, 'match_status' => 'MATCHED', 'customer_match_status' => 'AMBIGUOUS']);
    JneShipment::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => Customer::factory()->create()->id, 'match_status' => 'MATCHED', 'customer_match_status' => 'MATCHED']);

    $result = app(BuildJnePickupReconciliation::class)->handle(new Collection([$task]))[$task->id];

    expect($result['confirmed_pickup_awbs'])->toBe(0);
    expect($result['categories']['css_orion']['confirmed_awbs'])->toBe(0);
    expect($result['reconciled'])->toBeFalse();
});

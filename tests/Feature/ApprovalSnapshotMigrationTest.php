<?php

use App\Actions\Pickup\ManageReconciliationWorkspace;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupTask;
use Illuminate\Support\Facades\DB;

test('approval snapshot migration preserves existing reconciliation quantities locks and audit history', function () {
    $this->travelTo('2026-10-26 12:00:00 UTC');
    $migration = require database_path('migrations/2026_11_13_025019_add_approval_snapshot_to_pickup_customer_reconciliations.php');
    $migration->down();
    $group = PickupCustomerReconciliation::factory()->create([
        'status' => 'DONE', 'revision' => 7, 'pickup_count' => 1, 'locked_at' => now(),
        'categories' => ['manual_hybrid' => ['expected' => 2, 'confirmed' => 2]],
        'evidence' => ['pickup_task_ids' => [1], 'unit' => 'AWB'],
    ]);
    $legacy = $group->fresh()->getAttributes();
    $event = ['status' => 'DONE', 'categories' => $group->categories];
    DB::table('pickup_customer_reconciliation_events')->insert([
        'customer_reconciliation_id' => $group->id, 'revision' => 7,
        'snapshot' => json_encode($event, JSON_THROW_ON_ERROR), 'created_at' => now(),
    ]);
    expect(app(ManageReconciliationWorkspace::class)->lock(null, PickupTask::findOrFail($group->anchor_task_id),
        ['action' => 'LOCK', 'expected_revision' => 7], automatic: true))->toBe(['action' => 'PENDING_SCHEMA']);
    expect($group->fresh()->getAttributes())->toBe($legacy);

    $migration->up();

    expect($group->fresh()->getAttributes())->toBe([...$legacy, 'approval_snapshot' => null, 'post_lock_change' => null]);
    $this->assertDatabaseCount('pickup_customer_reconciliations', 1);
    $this->assertDatabaseCount('pickup_customer_reconciliation_events', 1);
    expect(json_decode(DB::table('pickup_customer_reconciliation_events')->sole()->snapshot, true, flags: JSON_THROW_ON_ERROR))->toBe($event);
});

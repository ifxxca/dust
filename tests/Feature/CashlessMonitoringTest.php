<?php

use App\Models\CashlessEntryBatch;
use App\Models\PickupCashlessAwb;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
    Queue::fake();
    $this->travelTo(now()->setDate(2026, 11, 16)->setTime(5, 0));
});

/** @return array{PickupCashlessAwb, CashlessEntryBatch|null} */
function monitoringCashlessRecord(User $staff, ?string $itemStatus = null, string $batchStatus = 'QUEUED', bool $approved = false): array
{
    $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'customer_name_snapshot' => 'Vanny Songket']);
    $record = PickupCashlessAwb::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id, 'created_by' => $staff->id]);
    if ($itemStatus === null) {
        return [$record, null];
    }
    $batch = CashlessEntryBatch::factory()->create(['pickup_task_id' => $task->id, 'created_by' => $staff->id,
        'status' => $batchStatus, 'approved_at' => $approved ? now() : null, 'ho_number' => 'HO-'.$record->id]);
    $batch->items()->create(['pickup_cashless_awb_id' => $record->id, 'awb' => $record->awb, 'status' => $itemStatus, 'message' => 'Respons uji Hybrid']);

    return [$record, $batch];
}

test('monitor classifies the latest item without treating unapproved or historical entry as success', function (?string $item, string $batch, bool $approved, string $state) {
    $user = User::factory()->create(['role' => 'admin_supervisor']);
    [$record] = monitoringCashlessRecord($user, $item, $batch, $approved);

    $this->actingAs($user)->get(route('cashless-monitoring.index'))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('cashless-monitoring')->has('monitor.rows.data', 1)
            ->where('monitor.rows.data.0.awb', $record->awb)->where('monitor.rows.data.0.state', $state)
            ->missing('monitor.rows.data.0.claim_key')->missing('monitor.rows.data.0.claim_token_hash')->missing('monitor.rows.data.0.verification'));
})->with([
    'recorded only' => [null, 'QUEUED', false, 'registered'],
    'queued' => ['PENDING', 'QUEUED', false, 'queued'],
    'missing account' => ['PENDING', 'WAITING_ACCOUNT', false, 'queued'],
    'entering' => ['IN_FLIGHT', 'ENTERING', false, 'processing'],
    'accepted not approved' => ['ACCEPTED', 'APPROVING', false, 'approval'],
    'done without approval' => ['ACCEPTED', 'DONE', false, 'approval'],
    'fully approved' => ['ACCEPTED', 'DONE', true, 'success'],
    'accepted in partial approval' => ['ACCEPTED', 'PARTIAL', true, 'success'],
    'rejected in partial approval' => ['NOT_FOUND', 'PARTIAL', true, 'failed'],
    'previously entered' => ['PREVIOUSLY_ENTERED', 'PARTIAL', true, 'attention'],
    'unknown outcome' => ['UNKNOWN', 'UNKNOWN', false, 'attention'],
    'worker failure' => ['PENDING', 'FAILED', false, 'failed'],
]);

test('new retry supersedes failure and corrected AWBs never inherit old success', function () {
    $user = User::factory()->create(['role' => 'admin_supervisor']);
    [$record, $old] = monitoringCashlessRecord($user, 'NOT_FOUND', 'FAILED');
    $retry = CashlessEntryBatch::factory()->create(['pickup_task_id' => $record->pickup_task_id, 'created_by' => $user->id, 'status' => 'QUEUED']);
    $retry->items()->create(['pickup_cashless_awb_id' => $record->id, 'awb' => $record->awb, 'status' => 'PENDING']);
    $this->actingAs($user)->get(route('cashless-monitoring.index'))->assertInertia(fn (Assert $page) => $page
        ->has('monitor.rows.data', 1)->where('monitor.rows.data.0.batch_id', $retry->id)->where('monitor.rows.data.0.state', 'queued'));
    $retry->items()->update(['status' => 'ACCEPTED']);
    $retry->update(['status' => 'DONE', 'approved_at' => now()]);
    $record->update(['awb' => 'TG99999999999']);
    $this->get(route('cashless-monitoring.index'))->assertInertia(fn (Assert $page) => $page->where('monitor.rows.data.0.state', 'attention'));
    expect($old->fresh()->status)->toBe('FAILED');
});

test('staff monitoring follows existing pickup visibility and inactive users cannot enter', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $other = User::factory()->create(['role' => 'pickup_staff']);
    [$own] = monitoringCashlessRecord($staff);
    monitoringCashlessRecord($other);
    $this->actingAs($staff)->get(route('cashless-monitoring.index'))->assertInertia(fn (Assert $page) => $page
        ->has('monitor.rows.data', 1)->where('monitor.rows.data.0.id', $own->id));
    $staff->update(['is_active' => false]);
    $this->get(route('cashless-monitoring.index'))->assertForbidden();
});

test('filters search AWB customer pickup and HO and retain pending records with no batch', function () {
    $user = User::factory()->create(['role' => 'admin_supervisor']);
    [$record, $batch] = monitoringCashlessRecord($user, 'ACCEPTED', 'DONE', true);
    monitoringCashlessRecord($user);
    $batch->update(['source' => 'nuralamt']);
    foreach ([$record->awb, 'Vanny', 'HO-'.$record->id, PickupTask::find($record->pickup_task_id)->reference] as $search) {
        $this->actingAs($user)->get(route('cashless-monitoring.index', ['q' => $search, 'state' => 'success', 'source' => 'nuralamt']))
            ->assertInertia(fn (Assert $page) => $page->where('monitor.rows.total', 1)->where('monitor.rows.data.0.id', $record->id));
    }
    $this->get(route('cashless-monitoring.index', ['state' => 'registered']))->assertInertia(fn (Assert $page) => $page->where('monitor.rows.total', 1));
    $this->get(route('cashless-monitoring.index', ['q' => 'NOT-EXISTING']))->assertInertia(fn (Assert $page) => $page->where('monitor.rows.total', 0));
});

test('scan date uses WIB boundaries and pagination stays bounded', function () {
    $user = User::factory()->create(['role' => 'admin_supervisor']);
    [$inside] = monitoringCashlessRecord($user);
    $inside->update(['created_at' => '2026-11-15 17:00:00']);
    [$outside] = monitoringCashlessRecord($user);
    $outside->update(['created_at' => '2026-11-16 17:00:00']);
    $this->actingAs($user)->get(route('cashless-monitoring.index', ['date_from' => '2026-11-16', 'date_to' => '2026-11-16']))
        ->assertInertia(fn (Assert $page) => $page->has('monitor.rows.data', 1)->where('monitor.rows.data.0.id', $inside->id));
    PickupCashlessAwb::factory()->count(11)->create(['pickup_task_id' => $inside->pickup_task_id, 'customer_id' => $inside->customer_id, 'created_by' => $user->id]);
    $this->get(route('cashless-monitoring.index', ['per_page' => 10, 'page' => 2, 'date_from' => '2026-11-16', 'date_to' => '2026-11-17']))
        ->assertInertia(fn (Assert $page) => $page->has('monitor.rows.data', 3)->where('monitor.rows.total', 13)->where('monitor.rows.current_page', 2));
    $this->get(route('cashless-monitoring.index', ['per_page' => 1000]))->assertSessionHasErrors('per_page');
    $this->get(route('cashless-monitoring.index', ['date_from' => '2026-11-17', 'date_to' => '2026-11-16']))->assertSessionHasErrors('date_to');
});

test('monitoring is read only and guest access is protected', function () {
    $this->get(route('cashless-monitoring.index'))->assertRedirectToRoute('login');
    $user = User::factory()->create(['role' => 'cs']);
    [, $batch] = monitoringCashlessRecord($user, 'PENDING');
    $this->actingAs($user)->get(route('cashless-monitoring.index'))->assertOk();
    expect($batch->fresh()->status)->toBe('QUEUED');
    Queue::assertNothingPushed();
    $this->assertDatabaseCount('cashless_entry_events', 0);
});

test('approval on a different pickup or customer is never reported as successful', function (string $conflict) {
    $user = User::factory()->create(['role' => 'admin_supervisor']);
    [$record, $batch] = monitoringCashlessRecord($user, 'ACCEPTED', 'DONE', true);
    $other = PickupTask::factory()->create(['assigned_staff_id' => $user->id]);
    if ($conflict === 'pickup') {
        $batch->update(['pickup_task_id' => $other->id]);
    } else {
        $record->update(['customer_id' => $other->customer_id]);
    }
    $this->actingAs($user)->get(route('cashless-monitoring.index'))->assertInertia(fn (Assert $page) => $page
        ->where('monitor.rows.data.0.state', 'attention'));
})->with(['pickup', 'customer']);

test('removed cashless evidence is not shown as a current scan', function () {
    $user = User::factory()->create(['role' => 'admin_supervisor']);
    [$record] = monitoringCashlessRecord($user, 'ACCEPTED', 'DONE', true);
    $record->update(['awb' => null]);
    $this->actingAs($user)->get(route('cashless-monitoring.index'))->assertInertia(fn (Assert $page) => $page->where('monitor.rows.total', 0));
});

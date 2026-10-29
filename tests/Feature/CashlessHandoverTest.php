<?php

use App\Actions\Pickup\RecordCashlessHandover;
use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\ReconcilePickupProcessingJob;
use App\Models\HandoverSession;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\PickupCashlessAwb;
use App\Models\PickupCashlessAwbEvent;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

function cashlessHandoverBook(string $role = 'pickup_staff'): array
{
    $staff = User::factory()->create(['role' => $role]);
    $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'PICKED_UP', 'execution_started_at' => now()->subHour()]);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id, 'cashless_hybrid' => 2]);

    return [$staff, $task, $proof];
}

test('staff save a batch after pickup finalization with audit evidence and no invented JNE data', function () {
    [$staff, $task, $proof] = cashlessHandoverBook();
    $original = $proof->fresh()->getAttributes();
    $payload = ['submission_key' => (string) Str::uuid(), 'awbs' => ['tg001', 'CM002'], 'customer_id' => 999999];

    $this->actingAs($staff)->post(route('cashless-handover.store', $task), $payload)
        ->assertRedirectToRoute('cashless-handover.index', ['task' => $task->id]);

    $this->assertDatabaseHas('pickup_cashless_awbs', ['awb' => 'TG001', 'original_awb' => 'tg001', 'customer_id' => $task->customer_id, 'pickup_task_id' => $task->id, 'created_by' => $staff->id]);
    $this->assertDatabaseCount('pickup_cashless_awbs', 2);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 2);
    $this->assertDatabaseCount('jne_shipments', 0);
    $after = $proof->fresh()->getAttributes();
    ksort($original);
    ksort($after);
    expect($after)->toBe($original);
    expect(PickupCashlessAwbEvent::first()->affected_results['batch_submission_key'])->toBe($payload['submission_key']);
    $this->postJson(route('api.cashless-awbs.store', $task), ['awb' => 'TG003', 'submission_key' => (string) Str::uuid()])->assertForbidden();
});

test('batch retries do not duplicate AWBs or events and a reused key cannot change its payload', function () {
    [$staff, $task] = cashlessHandoverBook();
    $payload = ['submission_key' => (string) Str::uuid(), 'awbs' => ['TG001', 'CM002']];
    $this->actingAs($staff)->post(route('cashless-handover.store', $task), $payload)->assertRedirect();
    $this->post(route('cashless-handover.store', $task), $payload)->assertRedirect();
    $this->postJson(route('cashless-handover.store', $task), [...$payload, 'awbs' => ['TG003']])->assertConflict();
    $this->assertDatabaseCount('pickup_cashless_awbs', 2);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 2);
});

test('duplicate scans are rejected after normalization without partially saving a batch', function () {
    [$staff, $task] = cashlessHandoverBook();
    $this->actingAs($staff)->postJson(route('cashless-handover.store', $task), ['submission_key' => (string) Str::uuid(), 'awbs' => ['TGNEW', 'tg001', 'TG001']])
        ->assertUnprocessable()->assertJsonValidationErrors(['awbs.1', 'awbs.2']);
    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
});

test('a claimed AWB cannot be saved again in this or another pickup and the entire batch rolls back', function (bool $samePickup) {
    [$staff, $task] = cashlessHandoverBook();
    $owner = $samePickup ? $task : PickupTask::factory()->create();
    PickupCashlessAwb::factory()->create(['pickup_task_id' => $owner->id, 'awb' => 'TGCLAIMED']);
    $this->actingAs($staff)->postJson(route('cashless-handover.store', $task), ['submission_key' => (string) Str::uuid(), 'awbs' => ['TGNEW', 'TGCLAIMED']])
        ->assertUnprocessable()->assertJsonValidationErrors('awbs');
    $this->assertDatabaseCount('pickup_cashless_awbs', 1);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 0);
})->with([true, false]);

test('a shipment owned by another pickup cannot be claimed through cashless handover', function () {
    [$staff, $task] = cashlessHandoverBook();
    $other = PickupTask::factory()->create();
    JneShipment::factory()->create(['awb' => 'TGOWNED', 'pickup_task_id' => $other->id]);
    $this->actingAs($staff)->postJson(route('cashless-handover.store', $task), ['submission_key' => (string) Str::uuid(), 'awbs' => ['TGNEW', 'TGOWNED']])
        ->assertUnprocessable()->assertJsonValidationErrors('awbs');
    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
    $this->assertDatabaseHas('jne_shipments', ['awb' => 'TGOWNED', 'pickup_task_id' => $other->id]);
});

test('invalid entries and manual prefixes are rejected', function (array $awbs, string $field) {
    [$staff, $task] = cashlessHandoverBook();
    $this->actingAs($staff)->postJson(route('cashless-handover.store', $task), ['submission_key' => (string) Str::uuid(), 'awbs' => $awbs])
        ->assertUnprocessable()->assertJsonValidationErrors($field);
    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
})->with([
    'empty' => [[], 'awbs'], 'invalid characters' => [['TG 001'], 'awbs.0'],
    'manual 0101' => [['010150075649226'], 'awbs.0'], 'manual 0166' => [['016660047940726'], 'awbs.0'],
    'too large' => [array_fill(0, 501, 'TG001'), 'awbs'],
]);

test('known Manual and Orion categories cannot be overwritten by scanning', function (string $category) {
    [$staff, $task] = cashlessHandoverBook();
    JneShipment::factory()->create(['awb' => 'OTHER123', 'pickup_task_id' => null, 'category' => $category, 'category_status' => 'MATCHED']);
    $this->actingAs($staff)->postJson(route('cashless-handover.store', $task), ['submission_key' => (string) Str::uuid(), 'awbs' => ['OTHER123']])
        ->assertUnprocessable()->assertJsonValidationErrors('awbs');
    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
})->with(['manual_hybrid', 'css_orion']);

test('only the active assigned executing user can hand over cashless', function (string $role, bool $active, bool $assigned, bool $allowed) {
    [$owner, $task] = cashlessHandoverBook();
    $actor = $assigned ? $owner : User::factory()->create();
    $actor->update(['role' => $role, 'is_active' => $active]);
    expect($actor->can('handoverCashlessAwb', $task))->toBe($allowed);
})->with([
    ['pickup_staff', true, true, true], ['retail_staff', true, true, true], ['admin_supervisor', true, true, true],
    ['cs', true, true, false], ['pickup_staff', false, true, false], ['pickup_staff', true, false, false], ['admin_supervisor', true, false, false],
]);

test('unstarted cancelled or closed books reject writes at HTTP and action boundaries', function (string $state) {
    [$staff, $task, $proof] = cashlessHandoverBook();
    if ($state === 'unstarted') {
        $task->update(['status' => 'ASSIGNED', 'execution_started_at' => null]);
    }
    if ($state === 'cancelled') {
        $task->update(['status' => 'CANCELLED']);
    }
    if ($state === 'closed') {
        $session = HandoverSession::factory()->create(['status' => 'CLOSED', 'sertim_closed_at' => now()]);
        $session->items()->create(['pickup_task_id' => $task->id, 'pickup_record_id' => $proof->id]);
    }
    if ($state === 'locked') {
        PickupProcessingReconciliation::factory()->create(['pickup_task_id' => $task->id, 'status' => 'DONE', 'locked_at' => now()]);
    }
    $data = ['submission_key' => (string) Str::uuid(), 'awbs' => ['TG001']];
    $this->actingAs($staff)->postJson(route('cashless-handover.store', $task), $data)->assertForbidden();
    expect(fn () => app(RecordCashlessHandover::class)->handle($staff, $task->id, $data))->toThrow(AuthorizationException::class);
    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
})->with(['unstarted', 'cancelled', 'closed', 'locked']);

test('cashless handover lists only own books and hides another user selected book', function () {
    $this->withoutVite();
    [$staff, $task] = cashlessHandoverBook();
    [, $other] = cashlessHandoverBook();
    $this->actingAs($staff)->get(route('cashless-handover.index', ['task' => $task->id]))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('cashless-handover')->has('tasks.data', 1)->where('tasks.data.0.id', $task->id)
        ->where('selected.id', $task->id)->where('selected.can_record', true)->where('selected.target', 2));
    $this->get(route('cashless-handover.index', ['task' => $other->id]))->assertNotFound();
    $this->postJson(route('cashless-handover.store', $other), ['submission_key' => (string) Str::uuid(), 'awbs' => ['TG001']])->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'cs']))->get(route('cashless-handover.index'))->assertForbidden();
});

test('pickup searching is paginated and operational date includes the next morning until five', function () {
    $this->withoutVite();
    [$staff, $task] = cashlessHandoverBook();
    $task->update(['scheduled_at' => '2026-10-06 21:59:00', 'reference' => 'MATCH-GLAMNOIRE']);
    $task->proof()->update(['picked_up_at' => '2026-10-06 21:59:00']);
    PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED', 'scheduled_at' => '2026-10-06 22:00:00', 'reference' => 'MATCH-NEXT']);
    $this->actingAs($staff)->get(route('cashless-handover.index', ['q' => 'MATCH', 'date' => '2026-10-06']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->has('tasks.data', 1)->where('tasks.data.0.id', $task->id)->where('filters.date', '2026-10-06'));
});

test('cashless handover connects an existing source to the pickup and queues its reconciliation', function () {
    [$staff, $task] = cashlessHandoverBook();
    $job = ReportJob::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED']);
    JneReportAwb::factory()->create(['report_job_id' => $job->id, 'awb' => 'TG001', 'shipper_name' => 'MARKETPLACE', 'customer_account' => 'SHARED', 'reference' => null, 'entry_at' => $task->proof->picked_up_at]);
    app(ProjectJneShipments::class)->handle($job->id);
    Queue::fake([ReconcilePickupProcessingJob::class]);
    config(['pickup.automation.enabled' => true, 'jne-reports.category_markers_enabled' => true]);
    $this->actingAs($staff)->post(route('cashless-handover.store', $task), ['submission_key' => (string) Str::uuid(), 'awbs' => ['TG001']])->assertRedirect();
    $this->assertDatabaseHas('jne_shipments', ['awb' => 'TG001', 'customer_id' => $task->customer_id, 'pickup_task_id' => $task->id, 'customer_match_status' => 'MATCHED', 'match_status' => 'MATCHED', 'category' => 'cashless_hybrid']);
    Queue::assertPushed(ReconcilePickupProcessingJob::class, fn ($job) => $job->taskId === $task->id);
});

test('cashless handover guests are redirected to login', function () {
    $this->get(route('cashless-handover.index'))->assertRedirectToRoute('login');
});

test('the maximum batch is inserted and audited without one save request per AWB', function () {
    [$staff, $task] = cashlessHandoverBook();
    $awbs = array_map(fn (int $number): string => 'TGBULK'.$number, range(1, 500));
    DB::enableQueryLog();
    try {
        $this->actingAs($staff)->post(route('cashless-handover.store', $task), ['submission_key' => (string) Str::uuid(), 'awbs' => $awbs])->assertRedirect();
        $queries = count(DB::getQueryLog());
    } finally {
        DB::disableQueryLog();
        DB::flushQueryLog();
    }
    $this->assertDatabaseCount('pickup_cashless_awbs', 500);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 500);
    $this->assertDatabaseCount('jne_shipments', 0);
    expect($queries)->toBeLessThan(60);
});

<?php

use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\CorrectPickupRecord;
use App\Actions\Pickup\PickupResultPeriod;
use App\Models\PickupProcessingRecord;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\PickupVisit;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-20 05:00:00', 'Asia/Jakarta'));
});

test('the operational default and quick presets change at 0500 Jakarta independently of app timezone', function (string $time, string $date, string $yesterday, string $weekFrom) {
    config(['app.timezone' => 'America/New_York', 'pickup.timezone' => 'America/New_York']);
    $this->travelTo(CarbonImmutable::parse($time, 'Asia/Jakarta'));
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->get(route('pickup-results.index'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('filters.date_from', $date)->where('filters.date_to', $date)->where('filters.date_basis', 'pickup')
        ->where('operations.presets.yesterday.date_from', $yesterday)->where('operations.presets.week.date_from', $weekFrom));
    expect(PickupResultPeriod::start('2026-10-19')->utc()->toIso8601String())->toBe('2026-10-18T22:00:00+00:00');
})->with([
    ['2026-10-20 04:30:00', '2026-10-19', '2026-10-18', '2026-10-13'],
    ['2026-10-20 04:59:59.999999', '2026-10-19', '2026-10-18', '2026-10-13'],
    ['2026-10-20 05:00:00', '2026-10-20', '2026-10-19', '2026-10-14'],
]);

test('cross midnight collection keeps the actual pickup day even with a different schedule and later POP finalization', function (string $monitoring) {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['scheduled_at' => '2026-10-20 03:00:00', 'status' => 'PICKED_UP']);
    PickupVisit::factory()->create(['pickup_task_id' => $task->id, 'started_at' => '2026-10-19 16:50:00', 'recorded_at' => '2026-10-19 18:00:00', 'outcome' => 'COLLECTED']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'picked_up_at' => '2026-10-19 18:00:00', 'finalized_at' => '2026-10-20 00:00:00', 'manual_hybrid' => 8, 'cashless_hybrid' => 0]);

    $filters = ['monitoring' => $monitoring, 'date_from' => '2026-10-19', 'date_to' => '2026-10-19'];
    $this->actingAs($admin)->get(route('pickup-results.index', $filters))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('operations.activity.scheduled', 1)->where('operations.activity.visited', 1)->where('operations.activity.pop_quantity', 8)
        ->where($monitoring === 'pickup' ? 'pickups.total' : 'processing.summary.pickup_count', 1));
    $this->get(route('pickup-results.index', ['monitoring' => $monitoring]))->assertInertia(fn (Assert $page) => $page->where('operations.activity.scheduled', 0)->where('operations.backlog.waiting_handover', 1));
    $this->getJson(route('pickup-results.quick', [$task, 'view' => 'pickup']))->assertOk()->assertJsonPath('result.operational_date', '2026-10-19')->assertJsonPath('result.period_source', 'PICKUP');
    $csv = $this->get(route('pickup-results.export', $filters))->assertOk()->streamedContent();
    expect(substr_count($csv, "\n"))->toBe(2);
    expect($csv)->toContain('2026-10-20 01:00:00 +07:00')->toContain('2026-10-20 07:00:00 +07:00')->toContain('2026-10-19');
})->with(['pickup', 'processing']);

test('unvisited plans use schedule while visits use actual timestamps and missing completed timestamps are not substituted', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $planned = PickupTask::factory()->create(['scheduled_at' => '2026-10-19 22:00:00']);
    $oldPlan = PickupTask::factory()->create(['scheduled_at' => '2026-10-18 22:00:00']);
    $empty = PickupTask::factory()->create(['scheduled_at' => '2026-10-18 03:00:00', 'status' => 'NO_PACKAGES']);
    PickupVisit::factory()->create(['pickup_task_id' => $empty->id, 'started_at' => '2026-10-19 21:55:00', 'recorded_at' => '2026-10-19 22:01:00', 'outcome' => 'NO_PACKAGES']);
    $inProgress = PickupTask::factory()->create(['scheduled_at' => '2026-10-18 03:00:00', 'status' => 'ASSIGNED']);
    PickupVisit::factory()->create(['pickup_task_id' => $inProgress->id, 'started_at' => '2026-10-19 22:00:00']);
    $missing = PickupTask::factory()->create(['scheduled_at' => '2026-10-19 22:00:00', 'status' => 'PICKED_UP']);

    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('summary.total', 3)->where('operations.activity.visited', 2)->where('summary.pop_final', 0)->where('queues.not_visited', 2));
    $this->getJson(route('pickup-results.quick', [$planned, 'view' => 'pickup']))->assertOk()->assertJsonPath('result.period_source', 'SCHEDULE')->assertJsonPath('result.operational_date', '2026-10-20');
    $this->getJson(route('pickup-results.quick', [$missing, 'view' => 'pickup']))->assertOk()->assertJsonPath('result.period_source', 'UNAVAILABLE')->assertJsonPath('result.operational_date', null);
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'scope' => 'backlog', 'pickup_queue' => 'not_visited']))->assertInertia(fn (Assert $page) => $page->where('pickups.total', 1)->where('pickups.data.0.id', $oldPlan->id));
});

test('handover one or three days later preserves the original pickup group partial session verification discrepancy and manual provenance', function (int $days) {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $tasks = PickupTask::factory()->count(2)->create(['scheduled_at' => '2026-10-19 02:00:00', 'status' => 'PICKED_UP']);
    foreach ($tasks as $task) {
        PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'picked_up_at' => '2026-10-19 02:00:00', 'finalized_at' => '2026-10-19 02:10:00', 'manual_hybrid' => 5, 'cashless_hybrid' => 0]);
    }
    $later = CarbonImmutable::parse('2026-10-19 02:00:00', 'UTC')->addDays($days);
    $this->travelTo($later);
    $session = app(CreateSession::class)->handle($admin, $tasks->modelKeys(), (string) Str::uuid());
    $item = $session->items()->where('pickup_task_id', $tasks[0]->id)->sole();
    app(VerifyItem::class)->handle($admin, $session->id, $item->id, ['expected_version' => 1, 'manual_hybrid' => 6, 'cashless_hybrid' => 0, 'css_orion' => 0, 'discrepancy_notes' => 'Lebih satu paket']);
    PickupProcessingRecord::factory()->create(['pickup_task_id' => $tasks[0]->id, 'actor_id' => $admin->id, 'successful_quantity' => 3, 'failed_quantity' => 1, 'unknown_quantity' => 1, 'received_quantity' => 6, 'handover_revision' => 0]);

    $filters = ['date_from' => '2026-10-19', 'date_to' => '2026-10-19'];
    $this->actingAs($admin)->get(route('pickup-results.index', [...$filters, 'monitoring' => 'pickup']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('summary.total', 2)->where('summary.pop_final', 2)->where('summary.unverified', 1)->where('summary.verified', 1)->where('summary.discrepancy', 1)
        ->where('operations.activity.received_quantity', 6)->where('operations.activity.pop_quantity', 10));
    $this->get(route('pickup-results.index', [...$filters, 'monitoring' => 'processing']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('processing.summary.pickup_count', 2)->where('processing.summary.pop_quantity', 10)->where('processing.summary.received_quantity', 6)
        ->where('processing.summary.manual_quantity', 3)->where('processing.summary.failed_quantity', 1)->where('processing.summary.unknown_outcome_quantity', 1)
        ->where('processing.summary.unconfirmed_quantity', 11)->where('processing.summary.confirmed_quantity', null));
    $this->get(route('pickup-results.index', ['monitoring' => 'processing']))->assertInertia(fn (Assert $page) => $page
        ->where('processing.summary.pickup_count', 0)->where('operations.activity.received_quantity', 0)->where('operations.backlog.unconfirmed_quantity', 11)->where('operations.backlog.waiting_verification', 1));
    $this->getJson(route('pickup-results.quick', [$tasks[0], 'view' => 'pickup']))->assertOk()->assertJsonPath('result.subsequent_handover', true)
        ->assertJsonPath('result.operational_date', '2026-10-19')->assertJsonPath('result.handed_over_at', $later->toIso8601String());
    $this->getJson(route('pickup-results.quick', $tasks[0]))->assertOk()->assertJsonPath('result.subsequent_handover', true)->assertJsonPath('processing.summary.confirmed_quantity', null);
    $this->get(route('pickup-results.show', $tasks[0]))->assertOk()->assertInertia(fn (Assert $page) => $page->where('result.subsequent_handover', true)->where('result.operational_date', '2026-10-19'));
    foreach (['pickup', 'processing'] as $monitoring) {
        $csv = $this->get(route('pickup-results.export', [...$filters, 'monitoring' => $monitoring]))->assertOk()->streamedContent();
        expect(substr_count($csv, "\n"))->toBe(3);
        expect($csv)->toContain($tasks[0]->reference)->toContain($tasks[1]->reference)->toContain('Dicatat Manual')->toContain('Tidak tersedia');
    }
    $this->assertDatabaseCount('pickup_tasks', 2);
    $this->assertDatabaseCount('pickup_records', 2);
    $this->assertDatabaseCount('handover_items', 2);
})->with([1, 3]);

test('POP correction after the pickup day changes latest quantities without moving pickup history or processing declarations', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['scheduled_at' => '2026-10-19 02:00:00', 'status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'picked_up_at' => '2026-10-19 02:00:00', 'finalized_at' => '2026-10-19 03:00:00', 'manual_hybrid' => 5, 'cashless_hybrid' => 0]);
    PickupProcessingRecord::factory()->create(['pickup_task_id' => $task->id, 'actor_id' => $admin->id, 'successful_quantity' => 3, 'received_quantity' => null]);
    app(CorrectPickupRecord::class)->handle($admin, $task->id, ['expected_version' => $task->version, 'manual_hybrid' => 7, 'cashless_hybrid' => 0, 'css_orion' => 0, 'contact' => $proof->contact, 'reason' => 'Perbaikan jumlah tercatat']);

    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'processing', 'date_from' => '2026-10-19', 'date_to' => '2026-10-19']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('processing.summary.pickup_count', 1)->where('processing.summary.pop_quantity', 7)->where('processing.summary.manual_quantity', 3)->where('processing.summary.confirmed_quantity', null)
        ->where('processing.rows.data.0.reconciliation_required', 1));
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup']))->assertInertia(fn (Assert $page) => $page->where('summary.total', 0));
    $this->get(route('pickup-results.show', $task))->assertOk()->assertInertia(fn (Assert $page) => $page->where('result.operational_date', '2026-10-19')->where('result.total_packages', 7)->where('task.proof.original.manual_hybrid', 5));
    $this->assertDatabaseCount('pickup_record_revisions', 1);
    $this->assertDatabaseHas('pickup_task_events', ['pickup_task_id' => $task->id, 'action' => 'proof_corrected', 'actor_id' => $admin->id]);
});

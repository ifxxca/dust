<?php

use App\Actions\Handover\CorrectVerification;
use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Models\PickupProcessingRecord;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\PickupVisit;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-19 05:00:00', 'UTC'));
});

function dailyReceipt(User $admin, string $scheduledAt, string $receivedAt, int $quantity): PickupTask
{
    $task = PickupTask::factory()->create(['scheduled_at' => $scheduledAt, 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => $quantity, 'cashless_hybrid' => 0, 'css_orion' => 0, 'finalized_at' => $scheduledAt, 'picked_up_at' => $scheduledAt]);
    $session = app(CreateSession::class)->handle($admin, [$task->id], (string) Str::uuid());
    app(VerifyItem::class)->handle($admin, $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => $quantity, 'cashless_hybrid' => 0, 'css_orion' => 0]);
    $session->items()->sole()->update(['verified_at' => $receivedAt]);

    return $task;
}

test('blank periods default server side to the current Jakarta operational day', function (string $monitoring) {
    config(['pickup.timezone' => 'America/New_York']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    foreach (['2026-10-18 21:59:59.999999', '2026-10-18 22:00:00', '2026-10-19 21:59:59.999999', '2026-10-19 22:00:00'] as $at) {
        $task = PickupTask::factory()->create(['scheduled_at' => $at, 'status' => 'PICKED_UP']);
        PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => 1, 'cashless_hybrid' => 0, 'picked_up_at' => $at]);
    }
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => $monitoring, 'date_from' => '', 'date_to' => '']))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('filters.date_from', '2026-10-19')->where('filters.date_to', '2026-10-19')->where('timezone', 'Asia/Jakarta')
            ->where('operations.activity.scheduled', 2)->where($monitoring === 'processing' ? 'processing.rows.total' : 'pickups.total', 2)
            ->where('operations.presets.yesterday.date_from', '2026-10-18')->where('operations.presets.week.date_from', '2026-10-13'));
    $csv = $this->get(route('pickup-results.export', ['monitoring' => $monitoring]))->assertOk()->streamedContent();
    expect(substr_count($csv, "\n"))->toBe(3);
    expect($csv)->toContain('2026-10-19')->toContain('Asia/Jakarta');
})->with(['pickup', 'processing']);

test('the default switches operational days exactly at 0500 WIB', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-18 21:00:00']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-18 23:00:00']);
    $this->travelTo(CarbonImmutable::parse('2026-10-18 21:59:59', 'UTC'));
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup']))->assertInertia(fn (Assert $page) => $page->where('filters.date_from', '2026-10-18')->where('summary.total', 1));
    $this->travelTo(CarbonImmutable::parse('2026-10-18 22:00:00', 'UTC'));
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup']))->assertInertia(fn (Assert $page) => $page->where('filters.date_from', '2026-10-19')->where('summary.total', 1));
});

test('pagination freezes the server default dates in links for both monitoring views', function (string $monitoring) {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $tasks = PickupTask::factory()->count(11)->create(['scheduled_at' => '2026-10-19 03:00:00', 'status' => 'PICKED_UP']);
    foreach ($tasks as $task) {
        PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'cashless_hybrid' => 0]);
    }
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => $monitoring, 'per_page' => 10]))->assertInertia(fn (Assert $page) => $page
        ->where(($monitoring === 'processing' ? 'processing.rows' : 'pickups').'.next_page_url', fn ($url) => str_contains($url, 'date_from=2026-10-19') && str_contains($url, 'date_to=2026-10-19') && str_contains($url, 'date_basis=pickup')));
})->with(['pickup', 'processing']);

test('historical ranges yesterday and a single supplied day are preserved in links and exports', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $old = PickupTask::factory()->create(['scheduled_at' => '2026-09-12 03:00:00']);
    PickupTask::factory()->count(11)->create(['scheduled_at' => '2026-10-18 03:00:00']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-19 03:00:00']);
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup', 'date_from' => '2026-10-18', 'date_to' => '2026-10-18', 'per_page' => 10]))->assertInertia(fn (Assert $page) => $page->where('summary.total', 11)->where('pickups.next_page_url', fn ($url) => str_contains($url, 'date_from=2026-10-18') && str_contains($url, 'date_to=2026-10-18')));
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'date_from' => '2026-09-01', 'date_to' => '2026-09-30']))->assertInertia(fn (Assert $page) => $page->where('summary.total', 1)->where('pickups.data.0.id', $old->id));
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'date_to' => '2026-09-12']))->assertInertia(fn (Assert $page) => $page->where('filters.date_from', '2026-09-12')->where('summary.total', 1));
    $csv = $this->get(route('pickup-results.export', ['date_from' => '2026-09-01', 'date_to' => '2026-09-30']))->assertOk()->streamedContent();
    expect(substr_count($csv, "\n"))->toBe(2);
    expect($csv)->toContain($old->reference)->toContain('2026-09-01,2026-09-30');
});

test('late Retail verification never moves an earlier actual pickup into the selected day', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $old = dailyReceipt($admin, '2026-10-17 03:00:00', '2026-10-19 03:00:00', 10);
    $today = dailyReceipt($admin, '2026-10-19 03:00:00', '2026-10-19 04:00:00', 7);
    $today->update(['scheduled_at' => '2026-10-17 03:00:00']);
    foreach (['pickup', 'processing'] as $monitoring) {
        foreach (['schedule', 'visit', 'received', 'processing_recorded', 'pickup'] as $basis) {
            $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => $monitoring, 'date_basis' => $basis]))->assertOk()
                ->assertInertia(fn (Assert $page) => $page->where('filters.date_basis', 'pickup')->where('operations.activity.scheduled', 1)
                    ->where('operations.activity.received_quantity', 7)->where('operations.backlog.unconfirmed_quantity', 10)
                    ->where($monitoring === 'pickup' ? 'pickups.data.0.id' : 'processing.rows.data.0.id', $today->id));
        }
        $csv = $this->get(route('pickup-results.export', ['monitoring' => $monitoring, 'date_basis' => 'received']))->assertOk()->streamedContent();
        expect($csv)->toContain($today->reference)->not->toContain($old->reference);
        expect($csv)->toContain('pickup,2026-10-19,2026-10-19,daily');
    }
});

test('yesterday receipts recorded successful today contribute to manual activity separately from todays received cohort and backlog', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $old = dailyReceipt($admin, '2026-10-17 03:00:00', '2026-10-18 03:00:00', 10);
    $today = dailyReceipt($admin, '2026-10-19 03:00:00', '2026-10-19 04:00:00', 5);
    PickupProcessingRecord::factory()->create(['pickup_task_id' => $old->id, 'actor_id' => $admin->id, 'successful_quantity' => 4, 'received_quantity' => 10, 'created_at' => '2026-10-18 04:00:00']);
    PickupProcessingRecord::factory()->create(['pickup_task_id' => $old->id, 'actor_id' => $admin->id, 'revision' => 2, 'successful_quantity' => 7, 'received_quantity' => 10, 'created_at' => '2026-10-19 04:00:00']);
    PickupProcessingRecord::factory()->create(['pickup_task_id' => $today->id, 'actor_id' => $admin->id, 'successful_quantity' => 2, 'received_quantity' => 5, 'created_at' => '2026-10-19 04:00:00']);
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup']))->assertInertia(fn (Assert $page) => $page->where('operations.activity.received_quantity', 5)->where('operations.activity.manual_success_change', 5)
        ->where('operations.activity.received_cohort_manual_remaining', 3)->where('operations.activity.confirmed_processed_quantity', null)
        ->where('operations.backlog.unconfirmed_quantity', 10)->where('operations.backlog.manual_remaining_quantity', 3));
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'date_basis' => 'processing_recorded']))->assertInertia(fn (Assert $page) => $page->where('processing.rows.total', 1)->where('processing.summary.manual_quantity', 2)->where('processing.summary.confirmed_quantity', null));
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'scope' => 'backlog']))->assertInertia(fn (Assert $page) => $page->where('processing.rows.total', 1)->where('processing.rows.data.0.id', $old->id));
});

test('backlog crosses periods includes pending physical work and is not hidden by an empty daily status filter', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['scheduled_at' => '2026-10-17 03:00:00', 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'finalized_at' => '2026-10-18 03:00:00', 'picked_up_at' => '2026-10-17 03:00:00']);
    $pending = PickupTask::factory()->create(['scheduled_at' => '2026-10-17 03:00:00', 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $pending->id, 'finalized_at' => '2026-10-18 03:00:00', 'picked_up_at' => '2026-10-17 03:00:00']);
    app(CreateSession::class)->handle($admin, [$pending->id], (string) Str::uuid());
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup', 'verification_status' => 'verified']))->assertInertia(fn (Assert $page) => $page->where('summary.total', 0)->where('operations.backlog.waiting_handover', 1)->where('operations.backlog.waiting_verification', 1));
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'date_from' => '2026-09-01', 'date_to' => '2026-09-01']))->assertInertia(fn (Assert $page) => $page->where('summary.total', 0)->where('operations.backlog.waiting_handover', 1)->where('operations.backlog.waiting_verification', 1));
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'scope' => 'backlog']))->assertInertia(fn (Assert $page) => $page->where('pickups.total', 2));
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'customer' => 'nothing matches']))->assertInertia(fn (Assert $page) => $page->where('operations.backlog.waiting_handover', 0));
});

test('manual downward corrections produce negative recording deltas without fabricating failed attempts', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = dailyReceipt($admin, '2026-10-17 03:00:00', '2026-10-18 03:00:00', 10);
    PickupProcessingRecord::factory()->create(['pickup_task_id' => $task->id, 'actor_id' => $admin->id, 'successful_quantity' => 8, 'failed_quantity' => 2, 'created_at' => '2026-10-18 04:00:00']);
    PickupProcessingRecord::factory()->create(['pickup_task_id' => $task->id, 'actor_id' => $admin->id, 'revision' => 2, 'successful_quantity' => 6, 'failed_quantity' => 0, 'unknown_quantity' => 2, 'created_at' => '2026-10-18 22:00:00']);
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup']))->assertInertia(fn (Assert $page) => $page->where('operations.activity.manual_success_change', -2)->where('operations.activity.manual_failed_change', -2)->where('operations.activity.manual_unknown_change', 2)->where('operations.activity.recording_count', 1)->where('operations.backlog.reconciliation_count', 1));
});

test('empty daily data has zero operational activity and unavailable external throughput', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'processing']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('processing.rows.total', 0)
        ->where('operations.activity.scheduled', 0)->where('operations.activity.received_quantity', 0)->where('operations.activity.manual_success_change', 0)
        ->where('operations.activity.confirmed_processed_quantity', null)->where('operations.backlog.unconfirmed_quantity', 0));
    $csv = $this->get(route('pickup-results.export', ['monitoring' => 'processing']))->assertOk()->streamedContent();
    expect(substr_count($csv, "\n"))->toBe(1);
});

test('Retail corrections retain the actual pickup day and date reports use operational pickup days', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = dailyReceipt($admin, '2026-09-10 03:00:00', '2026-10-18 03:00:00', 10);
    $item = $task->handoverItem()->sole();
    app(CorrectVerification::class)->handle($admin, $item->handover_session_id, $item->id, ['expected_version' => 2, 'reason' => 'Hitung ulang penerimaan', 'manual_hybrid' => 12, 'cashless_hybrid' => 0, 'css_orion' => 0, 'discrepancy_notes' => 'Lebih dua']);
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup']))->assertInertia(fn (Assert $page) => $page->where('operations.activity.received_quantity', 0)->where('operations.backlog.unconfirmed_quantity', 12));
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'date_basis' => 'received', 'date_from' => '2026-09-10', 'date_to' => '2026-09-10', 'group_by' => 'date']))
        ->assertInertia(fn (Assert $page) => $page->where('summary.total', 1)->where('report.data.0.label', '2026-09-10')->where('report.data.0.total', 1));
    $csv = $this->get(route('pickup-results.export', ['scope' => 'backlog']))->assertOk()->streamedContent();
    expect(substr_count($csv, "\n"))->toBe(2);
    expect($csv)->toContain($task->reference)->toContain('backlog');
});

test('manual recording timestamps do not split categories or move the original pickup day', function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-20 04:00:00', 'UTC'));
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = dailyReceipt($admin, '2026-10-17 03:00:00', '2026-10-18 03:00:00', 10);
    PickupProcessingRecord::factory()->create(['pickup_task_id' => $task->id, 'actor_id' => $admin->id, 'successful_quantity' => 2, 'created_at' => '2026-10-18 22:00:00']);
    PickupProcessingRecord::factory()->create(['pickup_task_id' => $task->id, 'actor_id' => $admin->id, 'category' => 'css_orion', 'successful_quantity' => 1, 'created_at' => '2026-10-18 21:59:59']);
    PickupProcessingRecord::factory()->create(['pickup_task_id' => $task->id, 'actor_id' => $admin->id, 'revision' => 2, 'successful_quantity' => 3, 'created_at' => '2026-10-19 22:00:00']);
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'processing', 'date_basis' => 'processing_recorded', 'date_from' => '2026-10-19', 'date_to' => '2026-10-19']))
        ->assertInertia(fn (Assert $page) => $page->where('processing.rows.total', 0)->where('processing.summary.manual_quantity', 0)->where('operations.activity.manual_success_change', 2));
    $filters = ['monitoring' => 'processing', 'date_basis' => 'processing_recorded', 'date_from' => '2026-10-17', 'date_to' => '2026-10-17'];
    $this->get(route('pickup-results.index', $filters))->assertInertia(fn (Assert $page) => $page->where('processing.rows.total', 2)->where('processing.summary.manual_quantity', 4)->where('processing.summary.confirmed_quantity', null));
    $csv = $this->get(route('pickup-results.export', $filters))->assertOk()->streamedContent();
    expect(substr_count($csv, "\n"))->toBe(3);
    expect($csv)->toContain('manual_hybrid')->toContain('css_orion,');
});

test('POP pickup time remains authoritative even when legacy data contains later visits', function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-21 04:00:00', 'UTC'));
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['scheduled_at' => '2026-10-17 03:00:00', 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'picked_up_at' => '2026-10-19 01:00:00']);
    foreach (['2026-10-18 17:00:00', '2026-10-19 04:00:00', '2026-10-20 04:00:00'] as $startedAt) {
        PickupVisit::factory()->create(['pickup_task_id' => $task->id, 'started_at' => $startedAt]);
    }
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup', 'date_basis' => 'visit', 'date_from' => '2026-10-19', 'date_to' => '2026-10-19']))
        ->assertInertia(fn (Assert $page) => $page->where('summary.total', 1)->where('operations.activity.visited', 1)->where('pickups.data.0.period_at', '2026-10-19T01:00:00+00:00')->where('pickups.data.0.operational_date', '2026-10-19'));
});

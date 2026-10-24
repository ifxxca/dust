<?php

use App\Models\Customer;
use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
    config(['pickup.timezone' => 'Asia/Jakarta']);
    $this->travelTo('2026-10-24 05:00:00 UTC');
});

test('main dashboard counts final corrected packages once and uses actual pickup dates ahead of planned dates', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $customer = Customer::factory()->create();
    $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'assigned_staff_id' => $staff->id, 'scheduled_at' => '2026-10-11 01:00:00', 'status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'picked_up_at' => '2026-10-12 22:00:00', 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0]);
    $proof->revisions()->create(['revision' => 1, 'actor_id' => $admin->id, 'reason' => 'Koreksi paket', 'values' => ['manual_hybrid' => 10, 'cashless_hybrid' => 4, 'css_orion' => 1]]);
    PickupTask::factory()->create(['customer_id' => $customer->id, 'assigned_staff_id' => $staff->id, 'scheduled_at' => '2026-10-13 01:00:00', 'status' => 'ASSIGNED']);
    PickupTask::factory()->create(['customer_id' => $customer->id, 'assigned_staff_id' => $staff->id, 'scheduled_at' => '2026-10-13 02:00:00', 'status' => 'ASSIGNED']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-13 22:00:00']);
    PickupTask::factory()->create(['scheduled_at' => '2026-10-12 21:59:59']);

    $this->actingAs($admin)->get(route('dashboard', ['date_from' => '2026-10-13', 'date_thru' => '2026-10-13']))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('overview.summary.tasks', 3)->where('overview.summary.customers', 1)
            ->where('overview.summary.packages', 15)->where('overview.summary.picked_up', 1)->where('overview.summary.attention', 3)
            ->where('overview.categories.0.value', 10)->where('overview.categories.1.value', 4)->where('overview.categories.2.value', 1)
            ->where('overview.daily.0.date', '2026-10-13')->where('overview.daily.0.tasks', 3)->where('overview.daily.0.packages', 15)
            ->where('overview.team.0.tasks', 3)->where('overview.team.0.picked_up', 1)->where('overview.team.0.rate', 33.3)
            ->where('overview.customerCohorts.new', 0)->where('overview.customerCohorts.returning', 1));
});

test('latest handover correction drives attention and a task with multiple issues is counted once', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP', 'scheduled_at' => '2026-10-13 02:00:00']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'picked_up_at' => '2026-10-13 02:00:00']);
    $session = HandoverSession::factory()->create(['status' => 'CLOSED']);
    $item = $session->items()->create(['pickup_task_id' => $task->id, 'pickup_record_id' => $proof->id, 'status' => 'VERIFIED', 'verified_pickup_revision' => 0]);
    $item->revisions()->create(['revision' => 1, 'pickup_revision' => 0, 'actor_id' => $admin->id, 'reason' => 'Selisih', 'values' => ['status' => 'DISCREPANCY']]);
    $this->actingAs($admin)->get(route('dashboard', ['date_from' => '2026-10-13', 'date_thru' => '2026-10-13']))
        ->assertInertia(fn (Assert $page) => $page->where('overview.summary.attention', 1)->where('overview.summary.discrepancies', 1)
            ->has('overview.attention', 1)->where('overview.attention.0.reason', 'Selisih penerimaan'));
});

test('daily activity and the today preset respect the five AM operational boundary', function () {
    $this->travelTo('2026-10-13 21:59:59 UTC');
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'picked_up_at' => now(), 'manual_hybrid' => 5, 'cashless_hybrid' => 0]);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('dashboard', ['date_from' => '2026-10-13', 'date_thru' => '2026-10-14']))
        ->assertInertia(fn (Assert $page) => $page->where('overview.operational_date', '2026-10-13')
            ->where('overview.summary.packages', 5)->where('overview.daily.0.packages', 5)->where('overview.daily.1.packages', 0));
});

test('period comparisons are equal in length and empty data never fabricates a growth percentage', function () {
    PickupTask::factory()->create(['scheduled_at' => '2026-10-12 01:00:00']);
    PickupTask::factory()->count(2)->create(['scheduled_at' => '2026-10-13 01:00:00']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin)->get(route('dashboard', ['date_from' => '2026-10-13', 'date_thru' => '2026-10-13']))
        ->assertInertia(fn (Assert $page) => $page->where('overview.previousPeriod.date_from', '2026-10-12')->where('overview.previousPeriod.date_thru', '2026-10-12')
            ->where('overview.summary.changes.tasks', 100)->where('overview.summary.changes.packages', null));
    $this->get(route('dashboard', ['date_from' => '2026-10-20', 'date_thru' => '2026-10-21']))
        ->assertInertia(fn (Assert $page) => $page->where('overview.summary.tasks', 0)->where('overview.summary.completion_rate', null)
            ->where('overview.summary.changes.tasks', null)->has('overview.daily', 2)->where('overview.daily.0.packages', 0));
});

test('only active pickup managers receive analytics and JNE data stays restricted to admins', function () {
    foreach (['pickup_staff', 'retail_staff'] as $role) {
        $this->actingAs(User::factory()->create(['role' => $role]))->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page->where('overview', null));
    }
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]))->get(route('dashboard'))->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'cs']))->get(route('dashboard'))->assertInertia(fn (Assert $page) => $page->where('overview.tracking', null)->has('overview.daily', 30));
    $this->getJson(route('dashboard', ['date_from' => '2026-10-14', 'date_thru' => '2026-10-13']))->assertUnprocessable()->assertJsonValidationErrors(['date_thru']);
    $this->getJson(route('dashboard', ['date_from' => '2026-01-01', 'date_thru' => '2026-10-24']))->assertUnprocessable()->assertJsonValidationErrors(['date_thru']);
});

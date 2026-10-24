<?php

use App\Models\Customer;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\PickupVisit;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-19 05:00:00', 'UTC'));
});

test('grouped reports use the same filtered population and completion definitions', function (string $group) {
    config(['pickup.timezone' => 'Asia/Jakarta']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $staff = User::factory()->create(['role' => 'pickup_staff', 'name' => 'Petugas Laporan']);
    $customer = Customer::factory()->create(['name' => 'Toko Laporan']);
    $tasks = PickupTask::factory()->state(['scheduled_at' => now()])->count(3)->create(['scheduled_at' => '2026-10-18 22:30:00', 'customer_id' => $customer->id, 'customer_name_snapshot' => 'Toko Laporan', 'assigned_staff_id' => $staff->id]);
    $tasks[0]->update(['status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $tasks[0]->id]);
    $tasks[1]->update(['status' => 'NO_PACKAGES']);
    PickupVisit::factory()->create(['pickup_task_id' => $tasks[1]->id, 'outcome' => 'NO_PACKAGES', 'recorded_at' => now()]);
    PickupTask::factory()->state(['scheduled_at' => now()])->create(['customer_name_snapshot' => 'Di luar filter']);
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup', 'group_by' => $group, 'customer' => 'Toko Laporan', 'date_from' => '2026-10-19', 'date_to' => '2026-10-19']))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->where('summary.total', 3)->where('summary.pop_final', 1)->where('summary.incomplete', 1)->where('summary.waiting_handover', 1)
        ->where('pickups', null)->has('report.data', 1)->where('report.data.0.total', 3)->where('report.data.0.pop_final', 1)->where('report.data.0.incomplete', 1)->where('report.data.0.waiting_handover', 1)
        ->where('report.data.0.label', match ($group) {
            'date' => '2026-10-19', 'staff' => 'Petugas Laporan', 'customer' => 'Toko Laporan'
        }));
})->with(['date', 'staff', 'customer']);

test('date reports paginate Jakarta operational days and include empty days independently of app timezone', function () {
    config(['pickup.timezone' => 'America/New_York']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    PickupTask::factory()->state(['scheduled_at' => now()])->create(['scheduled_at' => '2026-10-31 22:30:00']);
    PickupTask::factory()->state(['scheduled_at' => now()])->create(['scheduled_at' => '2026-11-01 16:30:00']);
    PickupTask::factory()->state(['scheduled_at' => now()])->create(['scheduled_at' => '2026-11-21 22:30:00']);
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup', 'date_from' => '2026-11-01', 'date_to' => '2026-11-22', 'group_by' => 'date', 'per_page' => 10, 'page' => 3]))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('report.total', 22)->has('report.data', 2)->where('report.data.0.label', '2026-11-02')->where('report.data.0.total', 0)->where('report.data.1.label', '2026-11-01')->where('report.data.1.total', 2));
});

test('CSV respects filters, protects spreadsheet formulas, omits evidence and formats local timestamps', function () {
    config(['pickup.timezone' => 'Asia/Jakarta']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->state(['scheduled_at' => now()])->create(['scheduled_at' => '2026-10-18 22:00:00', 'customer_name_snapshot' => '=HYPERLINK("https://invalid.test")']);
    PickupTask::factory()->state(['scheduled_at' => now()])->create(['scheduled_at' => '2026-10-18 21:59:59']);
    $response = $this->actingAs($admin)->get(route('pickup-results.export', ['date_from' => '2026-10-19', 'date_to' => '2026-10-19']))->assertOk()
        ->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
    $csv = $response->streamedContent();
    expect($csv)->toStartWith("\xEF\xBB\xBF")->toContain($task->reference)->toContain('2026-10-19 05:00:00 +07:00')->toContain('Asia/Jakarta')->toContain("'=HYPERLINK")->not->toContain('pickup-evidence')->not->toContain('contact_snapshot');
    expect(substr_count($csv, "\n"))->toBe(2);
});

test('CSV streams multiple bounded chunks and ignores list pagination without omitting records', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create();
    PickupTask::factory()->state(['scheduled_at' => now()])->count(1001)->create(['created_by' => $admin->id, 'customer_id' => $customer->id, 'customer_name_snapshot' => 'Export Banyak']);
    $this->actingAs($admin);
    DB::enableQueryLog();
    $response = $this->get(route('pickup-results.export', ['customer' => 'Export Banyak', 'page' => 3, 'per_page' => 10]))->assertOk();
    $csv = $response->streamedContent();
    $chunks = collect(DB::getQueryLog())->filter(fn ($entry) => str_contains($entry['query'], 'limit 500'))->count();
    DB::disableQueryLog();
    expect(substr_count($csv, "\n"))->toBe(1002);
    expect($chunks)->toBe(3);
});

test('exports and reports reject unauthorized roles and invalid grouping', function () {
    $this->get(route('pickup-results.export'))->assertRedirect(route('login'));
    $actor = User::factory()->create(['role' => 'retail_staff']);
    $this->actingAs($actor)->get(route('pickup-results.export'))->assertForbidden();
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'group_by' => 'staff']))->assertForbidden();
    $actor->update(['role' => 'admin_supervisor']);
    $this->getJson(route('pickup-results.index', ['monitoring' => 'pickup', 'group_by' => 'password']))->assertUnprocessable();
});

test('empty reports and out of range date pages do not leak unrelated pickups', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    PickupTask::factory()->state(['scheduled_at' => now()])->create();
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup', 'group_by' => 'date', 'q' => 'nothing-matches']))
        ->assertInertia(fn (Assert $page) => $page->where('summary.total', 0)->has('report.data', 0));
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'group_by' => 'date', 'page' => 100]))->assertInertia(fn (Assert $page) => $page->has('report.data', 0));
});

test('customer report keeps one group when historical pickup snapshots use different names', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create(['name' => 'Nama Customer Kini']);
    PickupTask::factory()->state(['scheduled_at' => now()])->create(['customer_id' => $customer->id, 'customer_name_snapshot' => 'Nama Customer Lama']);
    PickupTask::factory()->state(['scheduled_at' => now()])->create(['customer_id' => $customer->id, 'customer_name_snapshot' => 'Nama Customer Kini']);
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup', 'group_by' => 'customer']))
        ->assertInertia(fn (Assert $page) => $page->has('report.data', 1)->where('report.data.0.label', 'Nama Customer Kini')->where('report.data.0.total', 2));
});

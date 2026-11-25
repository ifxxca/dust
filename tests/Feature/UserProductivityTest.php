<?php

use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
});

/** @param array<string, mixed> $source
 * @param  array<string, mixed>  $shipment
 */
function productivityShipment(?string $staff = 'STAFF01', string $category = 'manual_hybrid', array $source = [], array $shipment = []): JneShipment
{
    $row = JneReportAwb::factory()->create(['entry_at' => '2026-11-18 03:00:00', 'raw_data' => ['USER_CONNOTE' => $staff], ...$source]);

    return JneShipment::factory()->create(['awb' => $row->awb, 'latest_report_awb_id' => $row->id, 'latest_report_job_id' => $row->report_job_id,
        'category' => $category, 'category_status' => 'MATCHED', ...$shipment]);
}

test('productivity counts unique latest AWBs across three categories and calculates weighted entry SLA', function () {
    $employee = User::factory()->create(['name' => 'Petugas Satu', 'hybrid_username' => 'staff01']);
    foreach (['manual_hybrid', 'manual_hybrid', 'cashless_hybrid', 'cashless_hybrid', 'cashless_hybrid', 'css_orion'] as $category) {
        $shipment = productivityShipment(' staff01 ', $category);
    }
    JneReportAwb::factory()->create(['awb' => $shipment->awb, 'entry_at' => '2026-11-18 03:00:00', 'raw_data' => ['USER_CONNOTE' => 'HISTORICAL']]);
    productivityShipment('OTHER', 'css_orion');

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('user-productivity', ['date_from' => '2026-11-18']))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('user-productivity')->has('productivity.rows', 2)
            ->where('productivity.rows.0.name', $employee->name)->where('productivity.rows.0.staff', 'STAFF01')
            ->where('productivity.rows.0.manual', 2)->where('productivity.rows.0.cashless', 3)->where('productivity.rows.0.orion', 1)
            ->where('productivity.rows.0.total', 6)->where('productivity.rows.0.estimated_seconds', 360)
            ->where('productivity.rows.0.productivity_percent', 1.4)->where('productivity.totals.total', 7)
            ->where('productivity.capacity_seconds', 25200)->where('filters.date_thru', '2026-11-18'));
});

test('productivity applies configurable SLA and every day in the selected period without capping percentages', function () {
    foreach (range(1, 15) as $entry) {
        productivityShipment();
    }

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('user-productivity', ['date_from' => '2026-11-18', 'date_thru' => '2026-11-19', 'manual_seconds' => 3600]))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('productivity.days', 2)->where('productivity.capacity_seconds', 50400)
            ->where('productivity.rows.0.estimated_seconds', 54000)->where('productivity.rows.0.productivity_percent', 107.1));
});

test('productivity keeps missing staff and unverified categories visible without inventing a percentage', function () {
    productivityShipment(null, 'cashless_hybrid');
    productivityShipment('STAFF01', 'manual_hybrid', shipment: ['category_status' => 'CONFLICT']);
    productivityShipment('STAFF01', 'css_orion', shipment: ['category_status' => 'UNMATCHED']);
    productivityShipment();

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('user-productivity', ['date_from' => '2026-11-18']))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->has('productivity.rows', 2)
            ->where('productivity.rows.0.manual', 1)->where('productivity.rows.0.orion', 0)
            ->where('productivity.rows.0.total', 3)->where('productivity.rows.0.unclassified', 2)
            ->where('productivity.rows.0.productivity_percent', null)->where('productivity.rows.1.name', 'Tanpa petugas entry')
            ->where('productivity.rows.1.productivity_percent', null)
            ->where('productivity.totals.missing_staff', 1)->where('productivity.totals.unclassified', 2));
});

test('productivity uses the 0500 Jakarta operational boundaries and never substitutes import time', function () {
    foreach (['2026-11-17 21:59:59', '2026-11-17 22:00:00', '2026-11-18 21:59:59', '2026-11-18 22:00:00', null] as $entry) {
        productivityShipment(source: ['entry_at' => $entry]);
    }

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('user-productivity', ['date_from' => '2026-11-18']))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('productivity.totals.total', 2));
});

test('productivity defaults to the current operational date before 0500', function () {
    $this->travelTo('2026-11-18 21:30:00 UTC');

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('user-productivity'))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('filters.date_from', '2026-11-18')->where('filters.date_thru', '2026-11-18')
            ->where('productivity.rows', [])->where('productivity.totals.total', 0));
});

test('productivity searches names and source users literally without changing the denominator', function (string $query, int $total) {
    User::factory()->create(['name' => 'Nama Petugas', 'hybrid_username' => 'STAFF01']);
    productivityShipment();
    productivityShipment('OTHER');

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('user-productivity', ['date_from' => '2026-11-18', 'q' => $query]))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('productivity.totals.total', $total)->where('productivity.capacity_seconds', 25200));
})->with(['name' => ['nama petugas', 1], 'user' => ['staff01', 1], 'literal wildcard' => ['%', 0], 'literal SQL' => ["' OR 1=1 --", 0]]);

test('productivity rejects invalid dates periods and SLA values', function (array $input, string $field) {
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('user-productivity', ['date_from' => '2026-11-18', ...$input]))->assertSessionHasErrors($field);
})->with([
    'invalid date' => [['date_from' => '2026-02-30'], 'date_from'],
    'reversed range' => [['date_thru' => '2026-11-17'], 'date_thru'],
    'too long' => [['date_thru' => '2027-02-19'], 'date_thru'],
    'zero SLA' => [['manual_seconds' => 0], 'manual_seconds'],
    'fractional SLA' => [['cashless_seconds' => 1.5], 'cashless_seconds'],
    'excessive SLA' => [['orion_seconds' => 3601], 'orion_seconds'],
]);

test('productivity is restricted to active supervisors', function (string $role, bool $active) {
    $this->actingAs(User::factory()->create(['role' => $role, 'is_active' => $active]))->get(route('user-productivity'))->assertForbidden();
})->with([['cs', true], ['pickup_staff', true], ['retail_staff', true], ['admin_supervisor', false]]);

test('productivity redirects guests to login', function () {
    $this->get(route('user-productivity'))->assertRedirect(route('login'));
});

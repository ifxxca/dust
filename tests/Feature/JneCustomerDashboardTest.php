<?php

use App\Actions\Reports\ExtractJneAwbMetrics;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ResolveJneDestinationNames;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

function dashboardShipment(?Customer $customer, array $source = [], array $shipment = []): JneShipment
{
    $row = JneReportAwb::factory()->create([
        'entry_at' => '2026-10-21 17:00:00', 'service' => 'REG', 'destination' => 'BDO10000',
        'amount_cents' => 1000050, 'weight_grams' => 1500, 'quantity' => 1, 'metrics_version' => 1,
        ...$source,
    ]);

    return JneShipment::factory()->create([
        'customer_id' => $customer?->id, 'customer_match_status' => $customer ? 'MATCHED' : 'UNMATCHED',
        'awb' => $row->awb, 'customer_account' => $row->customer_account,
        'latest_report_awb_id' => $row->id, 'latest_report_job_id' => $row->report_job_id,
        'last_observed_at' => '2026-10-23 00:00:00', 'tracking_status' => 'DELIVERED', ...$shipment,
    ]);
}

test('customer dashboard counts latest shipments once and uses local entry dates for every metric', function () {
    $customer = Customer::factory()->create();
    $first = dashboardShipment($customer);
    JneReportAwb::factory()->create(['awb' => $first->awb, 'customer_account' => $first->customer_account, 'entry_at' => '2026-10-21 17:00:00', 'amount_cents' => 99999999]);
    dashboardShipment($customer, ['entry_at' => '2026-10-22 16:59:59', 'amount_cents' => 2000025, 'service' => 'YES', 'weight_grams' => 2000], ['tracking_status' => 'IN_TRANSIT']);
    dashboardShipment($customer, ['entry_at' => '2026-10-22 17:00:00']);
    dashboardShipment($customer, ['entry_at' => null]);
    dashboardShipment(Customer::factory()->create(), ['amount_cents' => 99000000]);

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('jne-monitoring.customer-dashboard', ['customer_id' => $customer->id, 'date_from' => '2026-10-22', 'date_thru' => '2026-10-22']))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('jne-customer-dashboard')
            ->where('summary.shipments', 2)->where('summary.amount', 30000.75)->where('summary.average_amount', 15000.38)
            ->where('summary.weight_kg', 3.5)->where('summary.delivered', 1)->where('summary.active', 1)->where('summary.undated', 1)
            ->where('daily.0.date', '2026-10-22')->where('daily.0.shipments', 2)->where('daily.0.amount', 30000.75)
            ->where('destinations.0.shipments', 2)->has('services', 2)->has('shipments.data', 2)
            ->where('selectedCustomer.id', $customer->id)->missing('shipments.data.0.raw_data'));
});

test('missing and ambiguous mapping remain visible and missing amounts are distinct from zero', function () {
    dashboardShipment(Customer::factory()->create());
    dashboardShipment(null, ['amount_cents' => null, 'service' => null, 'destination' => null], ['customer_match_status' => 'AMBIGUOUS']);
    dashboardShipment(null, ['amount_cents' => 0, 'service' => 'YES']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $period = ['date_from' => '2026-10-22', 'date_thru' => '2026-10-23'];
    $this->actingAs($admin)->get(route('jne-monitoring.customer-dashboard', [...$period, 'mapping' => 'unmapped']))
        ->assertInertia(fn (Assert $page) => $page->where('summary.shipments', 2)->where('summary.unmapped', 2)->where('summary.ambiguous', 1)
            ->where('summary.amount', 0)->where('summary.amount_known', 1)->where('daily.1.shipments', 0)->where('daily.1.amount', 0));
    $this->get(route('jne-monitoring.customer-dashboard', [...$period, 'mapping' => 'ambiguous']))
        ->assertInertia(fn (Assert $page) => $page->where('summary.shipments', 1)->where('summary.amount', null)->where('daily.0.amount', null));
    $this->get(route('jne-monitoring.customer-dashboard', [...$period, 'service' => 'YES', 'status' => 'DELIVERED', 'destination' => 'BDO10000']))
        ->assertInertia(fn (Assert $page) => $page->where('summary.shipments', 1)->where('services.0.label', 'YES'));
});

test('empty dashboard has a complete zero filled calendar and honest unavailable amount', function () {
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('jne-monitoring.customer-dashboard', ['date_from' => '2026-10-22', 'date_thru' => '2026-10-23']))
        ->assertInertia(fn (Assert $page) => $page->where('summary.shipments', 0)->where('summary.amount', null)
            ->has('daily', 2)->where('daily.0.shipments', 0)->where('daily.1.shipments', 0)->has('shipments.data', 0));
});

test('dashboard requires an active admin and validates its customer and bounded date range', function () {
    $this->get(route('jne-monitoring.customer-dashboard'))->assertRedirectToRoute('login');
    $this->actingAs(User::factory()->create(['role' => 'cs']))->get(route('jne-monitoring.customer-dashboard'))->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]))->get(route('jne-monitoring.customer-dashboard'))->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->getJson(route('jne-monitoring.customer-dashboard', [
        'customer_id' => 999999, 'date_from' => '2026-10-24', 'date_thru' => '2026-10-22', 'mapping' => 'invalid',
    ]))->assertUnprocessable()->assertJsonValidationErrors(['customer_id', 'date_thru', 'mapping']);
    $this->getJson(route('jne-monitoring.customer-dashboard', ['date_from' => '2025-01-01', 'date_thru' => '2026-10-23']))
        ->assertUnprocessable()->assertJsonValidationErrors(['date_thru']);
});

test('new CSV imports extract metrics while preserving the original APEX cells and file', function () {
    Storage::fake('jne_reports');
    $csv = "AWB,ID_ACCOUNT,SERVICE,DEST,AMOUNT,WEIGHT,QTY,TGL_ENTRY\n001,TESTACCOUNT,REG,BDO10000,10000.50,1.25,2,22-OCT-2026 00:00\n";
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'file_path' => 'metrics.csv', 'file_checksum' => hash('sha256', $csv)]);
    Storage::disk('jne_reports')->put('metrics.csv', $csv);
    app(ImportReportAwbs::class)->handle($job->id);
    $row = JneReportAwb::sole();
    expect($row->amount_cents)->toBe(1000050);
    expect($row->weight_grams)->toBe(1250);
    expect($row->quantity)->toBe(2);
    expect($row->service)->toBe('REG');
    expect($row->raw_data['AMOUNT'])->toBe('10000.50');
    expect(Storage::disk('jne_reports')->get('metrics.csv'))->toBe($csv);
});

test('legacy metric backfill is repeatable without changing source records or observation timestamps', function () {
    $row = JneReportAwb::factory()->create(['raw_data' => ['AMOUNT' => '="10000.50"', 'SERVICE' => ' reg ', 'DEST' => 'bdo10000', 'WEIGHT' => '1.125', 'QTY' => '2']]);
    $before = $row->only(['id', 'raw_data', 'updated_at', 'observed_at']);
    $this->artisan('jne-reports:backfill-metrics')->expectsOutput('1 stored APEX row(s) enriched.')->assertSuccessful();
    $row->refresh();
    expect($row->only(array_keys($before)))->toEqual($before);
    expect($row->amount_cents)->toBe(1000050);
    expect($row->weight_grams)->toBe(1125);
    expect($row->service)->toBe('REG');
    $this->artisan('jne-reports:backfill-metrics')->expectsOutput('0 stored APEX row(s) enriched.')->assertSuccessful();
    $this->assertDatabaseCount('jne_report_awbs', 1);
});

test('noncanonical amounts remain unavailable instead of guessing separators or silently counting them as zero', function (mixed $amount) {
    expect(app(ExtractJneAwbMetrics::class)->handle(['AMOUNT' => $amount])['amount_cents'])->toBeNull();
})->with(['', '10,000', '10.000,50', '-100', '1e5', 'NaN', null, 'structured cell' => [['100']]]);

test('AWB server groups preserve leading zeroes separate both CSS prefixes and filter all dashboard totals', function () {
    $customer = Customer::factory()->create();
    foreach (['01010001', '01660001', 'CGKEC0001', 'CSS010001', 'OTHER0101001'] as $awb) {
        dashboardShipment($customer, ['awb' => $awb, 'destination' => 'CKR10020', 'destination_name' => 'TAMBUN SELATAN-CIKARANG']);
    }
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']));
    $period = ['date_from' => '2026-10-22', 'date_thru' => '2026-10-22', 'customer_id' => $customer->id];
    foreach (['pm' => [1, 10000.5], 'puman' => [1, 10000.5], 'css_orion' => [2, 20001], 'other' => [1, 10000.5]] as $server => [$count, $amount]) {
        $this->get(route('jne-monitoring.customer-dashboard', [...$period, 'server' => $server]))
            ->assertInertia(fn (Assert $page) => $page->where('summary.shipments', $count)->where('summary.amount', $amount)
                ->has('servers', 4)->where('servers.0.shipments', 1)->where('servers.2.shipments', 2)
                ->where('shipments.data.0.server', $server)->where('destinations.0.key', 'CKR10020')
                ->where('destinations.0.label', 'Tambun Selatan-Cikarang')->where('summary.destination_named', $count));
    }
});

test('destination references keep every observed location and never invent names for unknown codes', function () {
    JneReportAwb::factory()->create(['destination' => 'CKR10020', 'destination_name' => 'CIKARANG-KAB.BEKASI']);
    JneReportAwb::factory()->create(['destination' => 'CKR10020', 'destination_name' => 'TAMBUN SELATAN-CIKARANG']);
    JneReportAwb::factory()->create(['destination' => 'CKR10020', 'destination_name' => 'TAMBUN SELATAN-CIKARANG']);
    JneReportAwb::factory()->create(['destination' => 'UNKNOWN100', 'destination_name' => null]);
    $names = app(ResolveJneDestinationNames::class)->handle();
    expect($names['CKR10020'])->toBe(['name' => 'Cikarang-Kab. Bekasi / Tambun Selatan-Cikarang', 'ambiguous' => true]);
    expect($names)->not->toHaveKey('UNKNOWN100');
});

test('pending ages use local calendar days and exclude terminal shipments while filtering the detail list', function () {
    $this->travelTo('2026-10-24 05:00:00 UTC');
    foreach (['2026-10-22 01:00:00', '2026-10-21 01:00:00', '2026-10-17 01:00:00', '2026-10-10 01:00:00'] as $date) {
        dashboardShipment(null, ['entry_at' => $date], ['tracking_status' => 'IN_TRANSIT']);
    }
    dashboardShipment(null, ['entry_at' => '2026-10-01 01:00:00']);
    dashboardShipment(null, ['entry_at' => '2026-10-01 01:00:00'], ['tracking_status' => 'RETURNED']);
    $period = ['date_from' => '2026-10-01', 'date_thru' => '2026-10-24'];
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('jne-monitoring.customer-dashboard', $period))
        ->assertInertia(fn (Assert $page) => $page->where('summary.active', 4)->where('summary.active_7_plus', 2)->where('summary.oldest_active_days', 14)
            ->where('summary.returned', 1)->where('ages.0.shipments', 1)->where('ages.1.shipments', 1)->where('ages.2.shipments', 1)->where('ages.3.shipments', 1));
    $this->get(route('jne-monitoring.customer-dashboard', [...$period, 'age' => '7_plus']))
        ->assertInertia(fn (Assert $page) => $page->where('summary.shipments', 2)->has('shipments.data', 2)->where('summary.delivered', 0));
    $this->get(route('jne-monitoring.customer-dashboard', [...$period, 'age' => '14_plus']))
        ->assertInertia(fn (Assert $page) => $page->where('summary.shipments', 1)->has('shipments.data', 1));
});

test('period comparison keeps the same customer and server and averages only valid delivery durations', function () {
    $customer = Customer::factory()->create();
    dashboardShipment($customer, ['awb' => '01010001', 'entry_at' => '2026-10-21 17:00:00', 'delivered_at' => '2026-10-22 17:00:00', 'amount_cents' => 1000000]);
    dashboardShipment($customer, ['awb' => '01010002', 'entry_at' => '2026-10-21 18:00:00', 'delivered_at' => '2026-10-20 17:00:00', 'amount_cents' => 1000000]);
    dashboardShipment($customer, ['awb' => '01010003', 'entry_at' => '2026-10-20 17:00:00', 'amount_cents' => 1000000]);
    dashboardShipment($customer, ['awb' => '01660004', 'entry_at' => '2026-10-20 17:00:00']);
    dashboardShipment(Customer::factory()->create(), ['awb' => '01010005', 'entry_at' => '2026-10-20 17:00:00']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('jne-monitoring.customer-dashboard', ['customer_id' => $customer->id, 'server' => 'pm', 'date_from' => '2026-10-22', 'date_thru' => '2026-10-22']))
        ->assertInertia(fn (Assert $page) => $page->where('summary.delivery_known', 1)->where('summary.average_delivery_hours', 24)
            ->where('comparison.date_from', '2026-10-21')->where('comparison.date_thru', '2026-10-21')->where('comparison.shipments', 1)
            ->where('comparison.shipment_change_percent', 100)->where('comparison.amount_change_percent', 100));
});

test('delivery metrics extract region and time without treating transit locations as destinations', function () {
    $metrics = app(ExtractJneAwbMetrics::class);
    $delivered = $metrics->handle(['STATUS_WEB' => 'DELIVERED TO [PENERIMA | 23-10-2026 08:30 | TAMBUN SELATAN-CIKARANG ]', 'ETD' => '2']);
    expect($delivered['destination_name'])->toBe('TAMBUN SELATAN-CIKARANG');
    expect($delivered['delivered_at'])->toBe('2026-10-23 01:30:00');
    expect($delivered['etd_days'])->toBe(2);
    $transit = $metrics->handle(['STATUS_WEB' => 'RECEIVED AT [JAKARTA]', 'ETD' => 'N/A']);
    expect($transit['destination_name'])->toBeNull();
    expect($transit['delivered_at'])->toBeNull();
    expect($transit['etd_days'])->toBeNull();
    expect($metrics->handle(['STATUS_WEB' => 'DELIVERED TO [PENERIMA | 31-02-2026 08:30 | JAKARTA ]'])['delivered_at'])->toBeNull();
});

test('amount growth is unavailable when either comparison period has incomplete amount coverage', function () {
    dashboardShipment(null, ['entry_at' => '2026-10-20 17:00:00', 'amount_cents' => 1000000]);
    dashboardShipment(null, ['entry_at' => '2026-10-20 18:00:00', 'amount_cents' => null]);
    dashboardShipment(null, ['entry_at' => '2026-10-21 17:00:00', 'amount_cents' => 2000000]);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('jne-monitoring.customer-dashboard', ['date_from' => '2026-10-22', 'date_thru' => '2026-10-22']))
        ->assertInertia(fn (Assert $page) => $page->where('comparison.amount_known', 1)->where('comparison.shipments', 2)
            ->where('comparison.amount', 10000)->where('comparison.amount_complete', false)->where('comparison.amount_change_percent', null));
});

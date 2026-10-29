<?php

use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneReportProfile;
use App\Models\JneShipment;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
    config(['pickup.timezone' => 'Asia/Jakarta']);
});

function workspaceShipment(array $shipment = [], array $source = []): JneShipment
{
    $entry = JneReportAwb::factory()->create($source);

    return JneShipment::factory()->create([
        'awb' => $entry->awb, 'latest_report_awb_id' => $entry->id,
        'latest_report_job_id' => $entry->report_job_id, ...$shipment,
    ]);
}

test('shipment search finds customer sender recipient and literal AWB prefixes', function (string $field) {
    $customer = Customer::factory()->create(['name' => $field === 'customer' ? 'Toko Needle' : 'Toko Lain', 'customer_code' => $field === 'code' ? '601NEEDLE' : '4000']);
    $matched = workspaceShipment(['customer_id' => $customer->id], [
        'awb' => $field === 'awb' ? 'NEEDLE0001' : '016660000000001',
        'shipper_name' => $field === 'shipper' ? '4000 Needle' : 'Pengirim',
        'consignee_name' => $field === 'recipient' ? 'Ibu Needle' : 'Penerima',
    ]);
    workspaceShipment([], ['shipper_name' => 'Pengirim lain', 'consignee_name' => 'Penerima lain']);

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('jne-monitoring.index', ['q' => $field === 'code' ? '601NEEDLE' : 'Needle']))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('shipments.total', 1)->where('shipments.data.0.id', $matched->id));
})->with(['customer', 'code', 'shipper', 'recipient', 'awb']);

test('search treats percent underscore and escape characters literally', function () {
    $matched = workspaceShipment([], ['shipper_name' => 'Toko 100%_!']);
    workspaceShipment([], ['shipper_name' => 'Toko 100ABC']);

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('jne-monitoring.index', ['q' => '100%_!']))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('shipments.total', 1)->where('shipments.data.0.id', $matched->id));
});

test('search deduplicates overlapping matches and excludes old source evidence and other filter scopes', function () {
    $customer = Customer::factory()->create(['name' => 'Needle Shop', 'customer_code' => 'NEEDLE']);
    $matched = workspaceShipment(['customer_id' => $customer->id, 'tracking_status' => 'IN_TRANSIT'], [
        'awb' => 'NEEDLE001', 'shipper_name' => 'Needle Sender', 'consignee_name' => 'Needle Recipient',
    ]);
    workspaceShipment(['customer_id' => $customer->id, 'tracking_status' => 'DELIVERED']);
    $oldMatch = workspaceShipment([], ['shipper_name' => 'Current sender', 'consignee_name' => 'Current recipient']);
    JneReportAwb::factory()->create(['awb' => $oldMatch->awb, 'shipper_name' => 'Needle old sender']);

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('jne-monitoring.index', ['q' => 'Needle', 'status' => 'IN_TRANSIT']))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('shipments.total', 1)
            ->where('shipments.data.0.id', $matched->id)->where('identitySummary.collected', 1)
            ->where('summary.IN_TRANSIT', 1)->where('summary.DELIVERED', 1)
            ->where('operationsSummary.source_observations', 1));
});

test('shipment pagination loads requested rows without recalculating unrelated page summaries', function () {
    $customer = Customer::factory()->create();
    $pickup = PickupTask::factory()->create(['customer_id' => $customer->id]);
    for ($index = 0; $index < 11; $index++) {
        workspaceShipment(['customer_id' => $customer->id, 'pickup_task_id' => $pickup->id]);
    }
    JneReportProfile::factory()->create(['source' => 'apex', 'report_type' => 'unresolved']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']));
    $version = $this->get(route('jne-monitoring.index'))->assertOk()->inertiaPage()['version'];

    DB::enableQueryLog();
    try {
        $response = $this->withHeaders([
            'X-Inertia' => 'true', 'X-Inertia-Version' => $version, 'X-Inertia-Partial-Component' => 'jne-monitoring',
            'X-Inertia-Partial-Data' => 'shipments,filters',
        ])->get(route('jne-monitoring.index', ['per_page' => 10, 'page' => 2]));
        $queryCount = count(DB::getQueryLog());
    } finally {
        DB::disableQueryLog();
        DB::flushQueryLog();
    }

    $response->assertOk()->assertJsonPath('props.shipments.total', 11)->assertJsonPath('props.shipments.current_page', 2)
        ->assertJsonCount(1, 'props.shipments.data')->assertJsonPath('props.shipments.data.0.customer_name', $customer->name)
        ->assertJsonPath('props.shipments.data.0.pickup_reference', $pickup->reference)
        ->assertJsonMissingPath('props.summary')->assertJsonMissingPath('props.identitySummary')
        ->assertJsonMissingPath('props.operationsSummary')->assertJsonMissingPath('props.trackingRefresh')
        ->assertJsonMissingPath('props.customers')->assertJsonMissingPath('props.accounts');
    expect($queryCount)->toBeLessThanOrEqual(8);
});

test('AWB date filters use inclusive WIB days and leave unrelated statuses in the status summary', function () {
    $first = workspaceShipment(['tracking_status' => 'IN_TRANSIT'], ['entry_at' => '2026-10-26 17:00:00']);
    $last = workspaceShipment(['tracking_status' => 'DELIVERED'], ['entry_at' => '2026-10-27 16:59:59']);
    foreach (['2026-10-26 16:59:59', '2026-10-27 17:00:00', null] as $date) {
        workspaceShipment([], ['entry_at' => $date]);
    }
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']));
    $range = ['date_from' => '2026-10-27', 'date_thru' => '2026-10-27'];

    $this->get(route('jne-monitoring.index', $range))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('shipments.total', 2)
            ->where('shipments.data', fn ($rows) => collect($rows)->pluck('id')->sort()->values()->all() === [$first->id, $last->id]));
    $this->get(route('jne-monitoring.index', [...$range, 'status' => 'DELIVERED']))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('shipments.total', 1)->where('shipments.data.0.id', $last->id)
            ->where('summary.DELIVERED', 1)->where('summary.IN_TRANSIT', 1));
});

test('invalid date ranges and unsupported page sizes return field errors', function (array $filters, string $field) {
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->getJson(route('jne-monitoring.index', $filters))->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    'reversed dates' => [['date_from' => '2026-10-27', 'date_thru' => '2026-10-26'], 'date_thru'],
    'invalid date' => [['date_from' => '2026-02-31'], 'date_from'],
    'unbounded page' => [['per_page' => 10000], 'per_page'],
]);

test('shipment pagination honours the selected size', function () {
    JneShipment::factory()->count(21)->create();

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('jne-monitoring.index', ['per_page' => 10, 'page' => 2]))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('shipments.total', 21)->where('shipments.per_page', 10)
            ->where('shipments.current_page', 2)->has('shipments.data', 10));
});

test('CSV exports all matching pages with the same date and status filters and neutralises spreadsheet formulas', function () {
    $customer = Customer::factory()->create(['name' => '=1+1', 'customer_code' => '00']);
    for ($index = 1; $index <= 21; $index++) {
        workspaceShipment(['customer_id' => $customer->id, 'tracking_status' => 'IN_TRANSIT'], ['awb' => '000EXPORT'.str_pad((string) $index, 3, '0', STR_PAD_LEFT), 'entry_at' => '2026-10-27 02:46:00']);
    }
    workspaceShipment(['customer_id' => $customer->id, 'tracking_status' => 'DELIVERED'], ['entry_at' => '2026-10-27 02:46:00']);
    workspaceShipment(['customer_id' => $customer->id, 'tracking_status' => 'IN_TRANSIT'], ['entry_at' => '2026-10-25 02:46:00']);

    $response = $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('jne-monitoring.export', ['customer_id' => $customer->id, 'status' => 'IN_TRANSIT', 'date_from' => '2026-10-27', 'date_thru' => '2026-10-27', 'per_page' => 10, 'page' => 2]))
        ->assertOk()->assertHeader('content-type', 'text/csv; charset=UTF-8');
    $lines = preg_split('/\r?\n/', trim($response->streamedContent()));
    expect($lines)->toHaveCount(22);
    $first = str_getcsv($lines[1], ',', '"', '');
    expect($first[2])->toBe("'=1+1");
    expect($first[6])->toBe('2026-10-27 09:46:00');
    expect($first[8])->toBe('Asia/Jakarta');
});

test('CSV selection remains restricted by the applied filters', function () {
    $included = workspaceShipment(['tracking_status' => 'IN_TRANSIT']);
    $excluded = workspaceShipment(['tracking_status' => 'DELIVERED']);

    $response = $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->get(route('jne-monitoring.export', ['ids' => [$included->id, $excluded->id], 'status' => 'IN_TRANSIT']))->assertOk();
    $csv = $response->streamedContent();
    expect($csv)->toContain($included->awb)->not->toContain($excluded->awb);
});

test('shipment CSV export requires an active administrator', function () {
    $this->get(route('jne-monitoring.export'))->assertRedirectToRoute('login');
    $this->actingAs(User::factory()->create(['role' => 'retail_staff']))->get(route('jne-monitoring.export'))->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]))->get(route('jne-monitoring.export'))->assertForbidden();
});

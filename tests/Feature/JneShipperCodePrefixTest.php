<?php

use App\Actions\Reports\MatchJneShipments;
use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\SyncJneCustomerMappings;
use App\Models\Customer;
use App\Models\JneCustomerCodeAlias;
use App\Models\JneMappingRun;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\JneShipperAlias;
use App\Models\JneSourceContract;
use App\Models\PickupTask;
use App\Models\ReportJob;

beforeEach(function () {
    config(['jne-reports.evidence_policies_enabled' => true, 'pickup.automation.enabled' => false]);
});

test('stored reports map exact shipper code tokens while preserving leading zeroes and original evidence', function (string $shipper, string $expectedCode) {
    $customers = collect(['00', '01', '1', '601', '204B'])->mapWithKeys(fn (string $code): array => [$code => Customer::factory()->create(['customer_code' => $code])]);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    $source = JneReportAwb::factory()->create(['report_job_id' => $job->id, 'shipper_name' => $shipper, 'raw_data' => ['SHIPPER_NAME' => $shipper]]);

    app(ProjectJneShipments::class)->handle($job->id);

    $this->assertDatabaseHas('jne_shipments', ['awb' => $source->awb, 'customer_id' => $customers[$expectedCode]->id, 'customer_match_status' => 'MATCHED', 'customer_match_method' => 'SHIPPER_CODE_PREFIX', 'pickup_task_id' => null]);
    expect($source->fresh()->shipper_name)->toBe($shipper);
    expect($source->fresh()->raw_data)->toBe(['SHIPPER_NAME' => $shipper]);
    expect(JneShipmentMatchEvent::sole()->evidence)->toContain(['source_id' => $source->id, 'method' => 'SHIPPER_CODE_PREFIX', 'column' => 'SHIPPER_NAME', 'original_value' => $shipper, 'original_code' => $expectedCode, 'registered_code' => $expectedCode, 'customer_id' => $customers[$expectedCode]->id]);
})->with([
    'walk in PM Supriyanto' => ['00 SUPRIYANTO', '00'],
    'walk in PM Slamet' => ['00 BPK SLAMET', '00'],
    'walk in PSG' => ['01 JOHN; JHONY AND PARTNERS', '01'],
    'single digit differs from leading zero' => ['1 BAPAK HAFIZ', '1'],
    'different sender name shares customer code' => ['601 LOLIETAGALLERY', '601'],
    'registered letter suffix' => ['204B SENDER', '204B'],
    'whitespace' => ["  00\tRONI  ", '00'],
]);

test('shipper prefixes never use partial codes or infer an unregistered owner', function (string $shipper) {
    Customer::factory()->create(['customer_code' => '00']);
    Customer::factory()->create(['customer_code' => '01']);
    Customer::factory()->create(['customer_code' => '601']);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    $source = JneReportAwb::factory()->create(['report_job_id' => $job->id, 'shipper_name' => $shipper]);

    app(ProjectJneShipments::class)->handle($job->id);

    $this->assertDatabaseHas('jne_shipments', ['awb' => $source->awb, 'customer_id' => null, 'pickup_task_id' => null]);
})->with(['unregistered leading zero' => '001 JOHN', 'partial number' => '6010 SENDER', 'missing separator' => '00RONI', 'code after name' => 'RONI 00', 'embedded code' => 'TOKO601 SENDER', 'unknown code' => '999999 SENDER']);

test('inactive customer codes and unverified code aliases cannot establish prefix ownership', function () {
    Customer::factory()->create(['customer_code' => '00', 'is_active' => false]);
    JneCustomerCodeAlias::factory()->create(['code' => '01', 'is_active' => true, 'verified_at' => null]);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    foreach (['00 RONI', '01 JOHN'] as $index => $name) {
        JneReportAwb::factory()->create(['report_job_id' => $job->id, 'source_row' => $index + 2, 'shipper_name' => $name]);
    }

    app(ProjectJneShipments::class)->handle($job->id);

    expect(JneShipment::whereNotNull('customer_id')->count())->toBe(0);
});

test('a conflicting sender alias or source column leaves the owner for review', function (bool $columnConflict) {
    Customer::factory()->create(['customer_code' => '00']);
    $second = Customer::factory()->create(['customer_code' => '01']);
    if ($columnConflict) {
        JneSourceContract::factory()->create(['definition' => ['customer_code_column' => 'RETAIL_CODE'], 'active_key' => JneSourceContract::key('apex', 'apex'), 'verified_at' => now()]);
    } else {
        JneShipperAlias::factory()->create(['customer_id' => $second->id, 'shipper_name' => '00 RONI']);
    }
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    JneReportAwb::factory()->create(['report_job_id' => $job->id, 'shipper_name' => '00 RONI', 'raw_data' => $columnConflict ? ['RETAIL_CODE' => '01'] : []]);

    app(ProjectJneShipments::class)->handle($job->id);

    expect(JneShipment::sole()->customer_id)->toBeNull();
    expect(JneShipment::sole()->customer_match_status)->toBe('CONFLICT');
})->with(['registered sender' => false, 'verified source column' => true]);

test('prefix mapping respects the code evidence switch', function () {
    config(['jne-reports.evidence_policies_enabled' => false]);
    Customer::factory()->create(['customer_code' => '00']);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    JneReportAwb::factory()->create(['report_job_id' => $job->id, 'shipper_name' => '00 RONI']);

    app(ProjectJneShipments::class)->handle($job->id);

    expect(JneShipment::sole()->customer_id)->toBeNull();
});

test('source column and shipper code evidence agree without losing provenance', function (string $columnCode, string $shipperCode, string $method) {
    $customer = Customer::factory()->create(['customer_code' => '00']);
    JneSourceContract::factory()->create(['definition' => ['customer_code_column' => 'RETAIL_CODE'], 'active_key' => JneSourceContract::key('apex', 'apex'), 'verified_at' => now()]);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    JneReportAwb::factory()->create(['report_job_id' => $job->id, 'shipper_name' => $shipperCode.' SENDER', 'raw_data' => ['RETAIL_CODE' => $columnCode]]);

    app(ProjectJneShipments::class)->handle($job->id);

    expect(JneShipment::sole()->customer_id)->toBe($customer->id);
    expect(JneShipment::sole()->customer_match_method)->toBe($method);
})->with([
    'both match' => ['00', '00', 'CUSTOMER_CODE'],
    'column matches' => ['00', '999999', 'CUSTOMER_CODE'],
    'prefix matches' => ['999999', '00', 'SHIPPER_CODE_PREFIX'],
]);

test('prefix recognition preserves a manually assigned customer and pickup', function () {
    Customer::factory()->create(['customer_code' => '00']);
    $owner = Customer::factory()->create(['customer_code' => '01']);
    $pickup = PickupTask::factory()->create(['customer_id' => $owner->id]);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    $source = JneReportAwb::factory()->create(['report_job_id' => $job->id, 'shipper_name' => '00 RONI']);
    $shipment = JneShipment::factory()->create(['awb' => $source->awb, 'customer_id' => $owner->id, 'pickup_task_id' => $pickup->id, 'customer_match_status' => 'MATCHED', 'match_status' => 'MATCHED', 'match_method' => 'MANUAL']);

    app(ProjectJneShipments::class)->handle($job->id);

    $this->assertDatabaseHas('jne_shipments', ['id' => $shipment->id, 'customer_id' => $owner->id, 'pickup_task_id' => $pickup->id, 'match_method' => 'MANUAL']);
});

test('reprojection repairs an existing unmapped shipment idempotently', function () {
    $customer = Customer::factory()->create(['customer_code' => '00']);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    $source = JneReportAwb::factory()->create(['report_job_id' => $job->id, 'shipper_name' => '00 SUPRIYANTO']);
    $shipment = JneShipment::factory()->create(['awb' => $source->awb, 'customer_match_status' => 'UNMATCHED']);

    app(ProjectJneShipments::class)->handle($job->id);
    $version = $shipment->fresh()->version;
    app(ProjectJneShipments::class)->handle($job->id);

    $this->assertDatabaseCount('jne_shipments', 1);
    $this->assertDatabaseCount('jne_shipment_match_events', 1);
    $this->assertDatabaseHas('jne_shipments', ['id' => $shipment->id, 'customer_id' => $customer->id, 'version' => $version]);
});

test('registered sender suffix codes map changed names to their base customer', function (string $registered, string $shipper) {
    $customer = Customer::factory()->create(['customer_code' => '864']);
    $alias = JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => $registered, 'version' => 1]);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    $source = JneReportAwb::factory()->create(['report_job_id' => $job->id, 'shipper_name' => $shipper]);

    app(ProjectJneShipments::class)->handle($job->id);

    $shipment = JneShipment::sole();
    expect($shipment->customer_id)->toBe($customer->id);
    expect($shipment->customer_match_method)->toBe('SHIPPER_ALIAS_CODE');
    expect($shipment->customer_match_status)->toBe('MATCHED');
    expect(JneShipmentMatchEvent::sole()->evidence)->toContain([
        'source_id' => $source->id, 'method' => 'SHIPPER_CODE_PREFIX', 'column' => 'SHIPPER_NAME',
        'original_value' => $shipper, 'original_code' => explode(' ', $shipper, 2)[0],
        'shipper_alias_id' => $alias->id, 'shipper_alias_version' => $alias->version,
        'registered_name' => $registered, 'registered_code' => '864', 'customer_id' => $customer->id,
    ]);
})->with([
    '864A reordered company name' => ['864A PT LAUTAN REJEKI LUAS', '864A LAUTAN REJEKI PT'],
    '864B different registered name' => ['864B PT KREASI PANEN JAYA', '864B LAUTAN REJEKI LUAS PT'],
]);

test('sender suffix inference excludes unsupported aliases', function (array $attributes, string $code, string $shipper) {
    $customer = Customer::factory()->create(['customer_code' => $code]);
    JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => '864A REGISTERED NAME', ...$attributes]);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    JneReportAwb::factory()->create(['report_job_id' => $job->id, 'shipper_name' => $shipper, 'customer_account' => 'OTHER', 'entry_at' => '2026-10-27 03:00:00']);

    app(ProjectJneShipments::class)->handle($job->id);

    expect(JneShipment::sole()->customer_id)->toBeNull();
})->with([
    'unregistered suffix' => [[], '864', '864D OTHER NAME'],
    'inactive alias' => [['is_active' => false], '864', '864A OTHER NAME'],
    'different base customer' => [[], '865', '864A OTHER NAME'],
    'account scope' => [['account_scope' => 'SPECIFIC', 'verified_at' => '2026-10-01'], '864', '864A OTHER NAME'],
    'expired alias' => [['valid_thru' => '2026-10-26', 'verified_at' => '2026-10-01'], '864', '864A OTHER NAME'],
    'missing separator' => [[], '864', '864AOTHER NAME'],
]);

test('registered suffix evidence never overrides a different exact customer code', function () {
    $base = Customer::factory()->create(['customer_code' => '864']);
    Customer::factory()->create(['customer_code' => '864A']);
    JneShipperAlias::factory()->create(['customer_id' => $base->id, 'shipper_name' => '864A BASE CUSTOMER']);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    JneReportAwb::factory()->create(['report_job_id' => $job->id, 'shipper_name' => '864A OTHER NAME']);

    app(ProjectJneShipments::class)->handle($job->id);

    expect(JneShipment::sole()->customer_id)->toBeNull();
    expect(JneShipment::sole()->customer_match_status)->toBe('CONFLICT');
});

test('alias activation and deactivation reapply all names sharing its registered suffix code', function () {
    $customer = Customer::factory()->create(['customer_code' => '864']);
    $alias = JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => '864A REGISTERED NAME', 'is_active' => false]);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    JneReportAwb::factory()->create(['report_job_id' => $job->id, 'shipper_name' => '864A CHANGED NAME']);
    app(ProjectJneShipments::class)->handle($job->id);
    $shipment = JneShipment::sole();
    expect($shipment->customer_id)->toBeNull();

    $alias->update(['is_active' => true]);
    $run = JneMappingRun::factory()->create(['normalized_names' => [$alias->normalized_name], 'upper_id' => $shipment->id]);
    (new SyncJneCustomerMappings($run->id))->handle(app(MatchJneShipments::class));
    expect($shipment->fresh()->customer_id)->toBe($customer->id);
    expect($run->fresh()->status)->toBe('COMPLETED');

    $alias->update(['is_active' => false]);
    $run = JneMappingRun::factory()->create(['normalized_names' => [$alias->normalized_name], 'upper_id' => $shipment->id]);
    (new SyncJneCustomerMappings($run->id))->handle(app(MatchJneShipments::class));
    expect($shipment->fresh()->customer_id)->toBeNull();
    expect($run->fresh()->affected_count)->toBe(1);
});

test('sender suffix aliases never assign an inactive customer', function () {
    $customer = Customer::factory()->create(['customer_code' => '864', 'is_active' => false]);
    JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => '864A REGISTERED NAME']);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    JneReportAwb::factory()->create(['report_job_id' => $job->id, 'shipper_name' => '864A CHANGED NAME']);

    app(ProjectJneShipments::class)->handle($job->id);

    expect(JneShipment::sole()->customer_id)->toBeNull();
});

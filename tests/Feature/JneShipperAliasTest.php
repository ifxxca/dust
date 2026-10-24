<?php

use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\ImportJneReportAwbs;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneReportProfile;
use App\Models\JneShipment;
use App\Models\JneShipperAlias;
use App\Models\PickupProcessingRecord;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
});

function createShipperAlias(JneReportProfile $profile, Customer $customer, string $name, bool $active = true): JneShipperAlias
{
    return JneShipperAlias::factory()->create(['jne_report_profile_id' => $profile->id, 'customer_id' => $customer->id, 'shipper_name' => $name,
        'normalized_name' => JneShipperAlias::normalize($name), 'alias_key' => hash('sha256', JneShipperAlias::normalize($name)), 'is_active' => $active]);
}

function projectAliasSource(JneReportProfile $profile, string $name, string $reference = ''): JneShipment
{
    $report = ReportJob::factory()->create(['customer_account' => $profile->customer_account, 'status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    $source = JneReportAwb::factory()->create(['report_job_id' => $report->id, 'customer_account' => $profile->customer_account, 'shipper_name' => $name,
        'reference' => $reference, 'observed_at' => now()]);
    app(ProjectJneShipments::class)->handle($report->id);

    return JneShipment::where('latest_report_awb_id', $source->id)->sole();
}

test('one customer has many aliases and a shared account resolves each AWB independently', function () {
    $profile = JneReportProfile::factory()->create(['customer_mapping_mode' => 'SHIPPER_NAME']);
    $house = Customer::factory()->create(['customer_code' => '102', 'name' => 'HOUSE OF SALE']);
    $other = Customer::factory()->create();
    createShipperAlias($profile, $house, '102 ANITA');
    createShipperAlias($profile, $house, '102 LALA');
    createShipperAlias($profile, $other, '104 BRIAN');
    $anita = projectAliasSource($profile, "  102\t anita  ");
    expect($anita->customer_id)->toBe($house->id);
    expect(projectAliasSource($profile, '102 LALA')->customer_id)->toBe($house->id);
    expect(projectAliasSource($profile, '104 BRIAN')->customer_id)->toBe($other->id);
    expect($anita->customer_match_status)->toBe('MATCHED');
    expect($anita->customer_match_method)->toBe('SHIPPER_NAME');
    expect($anita->match_status)->toBe('UNMATCHED');
    expect($anita->pickup_task_id)->toBeNull();
    expect($anita->latestSource->shipper_name)->toBe("  102\t anita  ");
});

test('ambiguous aliases never choose a customer or pickup even with a unique reference', function () {
    $profile = JneReportProfile::factory()->create(['customer_mapping_mode' => 'SHIPPER_NAME']);
    $customer = Customer::factory()->create();
    createShipperAlias($profile, $customer, '152 YULI');
    createShipperAlias($profile, Customer::factory()->create(), '152 YULI ');
    $task = PickupTask::factory()->create(['customer_id' => $customer->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $shipment = projectAliasSource($profile, '152 YULI', $task->reference);
    expect($shipment->customer_match_status)->toBe('AMBIGUOUS');
    expect($shipment->customer_id)->toBeNull();
    expect($shipment->match_status)->toBe('AMBIGUOUS');
    expect($shipment->pickup_task_id)->toBeNull();
});

test('unknown names do not fall back to profile customer or guess from code prefix', function (string $name) {
    $customer = Customer::factory()->create();
    $profile = JneReportProfile::factory()->create(['customer_mapping_mode' => 'SHIPPER_NAME', 'customer_id' => $customer->id]);
    createShipperAlias($profile, $customer, '102 ANITA');
    $shipment = projectAliasSource($profile, $name);
    expect($shipment->customer_id)->toBeNull();
    expect($shipment->customer_match_status)->toBe('UNMATCHED');
})->with(['102 ANITAA', '102', '102_ANITA', '']);

test('customer names work across report sources while inactive mappings are not selected', function () {
    $profile = JneReportProfile::factory()->create(['customer_mapping_mode' => 'SHIPPER_NAME']);
    $otherProfile = JneReportProfile::factory()->create(['customer_account' => 'SECOND', 'customer_mapping_mode' => 'SHIPPER_NAME']);
    $customer = Customer::factory()->create();
    createShipperAlias($otherProfile, $customer, 'SAME NAME');
    expect(projectAliasSource($profile, 'SAME NAME')->customer_id)->toBe($customer->id);
    createShipperAlias($profile, Customer::factory()->create(), 'DISABLED ALIAS', false);
    createShipperAlias($profile, Customer::factory()->create(['is_active' => false]), 'DISABLED CUSTOMER');
    foreach (['DISABLED ALIAS', 'DISABLED CUSTOMER'] as $name) {
        expect(projectAliasSource($profile, $name)->customer_match_status)->toBe('UNMATCHED');
    }
});

test('same reference across customers only links pickup of resolved customer', function () {
    $profile = JneReportProfile::factory()->create(['customer_mapping_mode' => 'SHIPPER_NAME']);
    $customers = Customer::factory()->count(2)->create();
    $tasks = [];
    foreach ($customers as $index => $customer) {
        createShipperAlias($profile, $customer, 'CUSTOMER '.$index);
        $task = PickupTask::factory()->create(['customer_id' => $customer->id]);
        PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
        PickupProcessingRecord::factory()->create(['pickup_task_id' => $task->id, 'external_reference' => 'SAME-ORDER']);
        $tasks[] = $task;
    }
    $shipment = projectAliasSource($profile, 'CUSTOMER 1', 'SAME-ORDER');
    expect($shipment->pickup_task_id)->toBe($tasks[1]->id);
    expect($shipment->customer_id)->toBe($customers[1]->id);
});

test('resolving alias conflict rebuilds existing projections without duplicate observations', function () {
    $profile = JneReportProfile::factory()->create(['customer_mapping_mode' => 'SHIPPER_NAME']);
    $customer = Customer::factory()->create();
    createShipperAlias($profile, $customer, 'SENDER');
    $conflict = createShipperAlias($profile, Customer::factory()->create(), 'SENDER');
    $shipment = projectAliasSource($profile, 'SENDER');
    $conflict->update(['is_active' => false]);
    app(ProjectJneShipments::class)->handle($shipment->latest_report_job_id);
    expect($shipment->fresh()->customer_id)->toBe($customer->id);
    expect($shipment->fresh()->customer_match_status)->toBe('MATCHED');
    $this->assertDatabaseCount('jne_shipments', 1);
    $this->assertDatabaseCount('jne_shipment_observations', 1);
});

test('alias remapping cannot silently move customer on a linked pickup', function () {
    $profile = JneReportProfile::factory()->create(['customer_mapping_mode' => 'SHIPPER_NAME']);
    $customer = Customer::factory()->create();
    $alias = createShipperAlias($profile, $customer, 'SENDER');
    $task = PickupTask::factory()->create(['customer_id' => $customer->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $shipment = projectAliasSource($profile, 'SENDER', $task->reference);
    $alias->update(['is_active' => false]);
    createShipperAlias($profile, Customer::factory()->create(), 'SENDER');
    app(ProjectJneShipments::class)->handle($shipment->latest_report_job_id);
    expect($shipment->fresh()->customer_id)->toBe($customer->id);
    expect($shipment->fresh()->customer_match_status)->toBe('AMBIGUOUS');
    expect($shipment->fresh()->pickup_task_id)->toBe($task->id);
    expect($shipment->fresh()->match_status)->toBe('AMBIGUOUS');
    expect($task->fresh()->version)->toBe(1);
});

test('manual matching rejects other customer and unresolved shared account alias', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $profile = JneReportProfile::factory()->create(['customer_mapping_mode' => 'SHIPPER_NAME']);
    createShipperAlias($profile, Customer::factory()->create(), 'KNOWN');
    $task = PickupTask::factory()->create();
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    foreach (['KNOWN', 'UNKNOWN'] as $name) {
        $shipment = projectAliasSource($profile, $name);
        $this->actingAs($admin)->postJson(route('jne-monitoring.match', $shipment->id), ['pickup_reference' => $task->reference, 'version' => $shipment->version, 'reason' => 'Review'])
            ->assertUnprocessable()->assertJsonValidationErrors('pickup_reference');
    }
});

test('admin creates many aliases and same customer normalized duplicate is rejected', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $profile = JneReportProfile::factory()->create();
    $customer = Customer::factory()->create();
    $data = ['jne_report_profile_id' => $profile->id, 'customer_id' => $customer->id, 'shipper_name' => '102 ANITA'];
    $this->actingAs($admin)->post(route('jne-shipper-aliases.store'), $data)->assertRedirect();
    $this->post(route('jne-shipper-aliases.store'), [...$data, 'shipper_name' => '102 LALA'])->assertRedirect();
    $this->postJson(route('jne-shipper-aliases.store'), [...$data, 'shipper_name' => '  102  anita  '])->assertUnprocessable()->assertJsonValidationErrors('shipper_name');
    $this->assertDatabaseCount('jne_shipper_aliases', 2);
    $this->assertDatabaseHas('jne_shipper_aliases', ['normalized_name' => '102 ANITA', 'created_by' => $admin->id]);
});

test('alias activation checks optimistic version and preserves disabled records', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $alias = JneShipperAlias::factory()->create();
    $this->actingAs($admin)->put(route('jne-shipper-aliases.update', $alias->id), ['is_active' => false, 'version' => 1])->assertRedirect();
    $this->put(route('jne-shipper-aliases.update', $alias->id), ['is_active' => true, 'version' => 1])->assertConflict();
    expect($alias->fresh()->is_active)->toBeFalse();
    expect($alias->fresh()->updated_by)->toBe($admin->id);
});

test('CSV imports idempotently preserving leading zero and letter codes', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $profile = JneReportProfile::factory()->create();
    Customer::factory()->create(['customer_code' => '00102', 'name' => 'HOUSE OF SALE']);
    Customer::factory()->create(['customer_code' => '204B', 'name' => 'OTHER']);
    $csv = "\xEF\xBB\xBFSHIPPER_NAME,KODE,NAMA_CUSTOMER\n102 ANITA,00102,HOUSE OF SALE\n102 LALA,00102,HOUSE OF SALE\nSENDER,204B,OTHER\n";
    foreach ([1, 2] as $run) {
        $this->actingAs($admin)->post(route('jne-shipper-aliases.import'), ['jne_report_profile_id' => $profile->id, 'file' => UploadedFile::fake()->createWithContent('aliases.csv', $csv)])
            ->assertRedirect()->assertSessionHas('jne_alias_import.inserted', $run === 1 ? 3 : 0);
    }
    $this->assertDatabaseCount('jne_shipper_aliases', 3);
});

test('CSV rejects invalid rows without partial import', function (string $row) {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $profile = JneReportProfile::factory()->create();
    Customer::factory()->create(['customer_code' => '102', 'name' => 'HOUSE OF SALE']);
    $csv = "SHIPPER_NAME,KODE,NAMA_CUSTOMER\nVALID,102,HOUSE OF SALE\n".$row."\n";
    $this->actingAs($admin)->postJson(route('jne-shipper-aliases.import'), ['jne_report_profile_id' => $profile->id, 'file' => UploadedFile::fake()->createWithContent('aliases.csv', $csv)])
        ->assertUnprocessable()->assertJsonValidationErrors('file');
    $this->assertDatabaseCount('jne_shipper_aliases', 0);
})->with(['unknown code' => 'UNKNOWN,999,UNKNOWN', 'mismatched name' => 'NAME,102,WRONG CUSTOMER', 'Excel error' => 'NAME,102,#N/A', 'blank alias' => ',102,HOUSE OF SALE', 'extra column' => 'NAME,102,HOUSE OF SALE,EXTRA']);

test('CSV imports conflicts for review and does not reactivate disabled aliases', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $profile = JneReportProfile::factory()->create();
    $one = Customer::factory()->create(['customer_code' => '152', 'name' => 'ONE']);
    Customer::factory()->create(['customer_code' => '204', 'name' => 'TWO']);
    createShipperAlias($profile, $one, 'DISABLED', false);
    $csv = "SHIPPER_NAME;KODE;NAMA_CUSTOMER\n152 YULI;152;ONE\n152 YULI ;204;TWO\nDISABLED;152;ONE\n";
    $this->actingAs($admin)->post(route('jne-shipper-aliases.import'), ['jne_report_profile_id' => $profile->id, 'file' => UploadedFile::fake()->createWithContent('aliases.csv', $csv)])->assertRedirect();
    expect(JneShipperAlias::where('shipper_name', 'DISABLED')->sole()->is_active)->toBeFalse();
    $this->get(route('jne-shipper-aliases.index', ['conflicts' => 1]))->assertOk()->assertInertia(fn (Assert $page) => $page->component('jne-shipper-aliases')->has('aliases.data', 2));
});

test('guest and non admin cannot read or mutate alias mappings', function () {
    $this->get(route('jne-shipper-aliases.index'))->assertRedirectToRoute('login');
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']));
    $this->get(route('jne-shipper-aliases.index'))->assertForbidden();
    $this->post(route('jne-shipper-aliases.store'), [])->assertForbidden();
    $this->put(route('jne-shipper-aliases.update', 999), [])->assertForbidden();
    $this->post(route('jne-shipper-aliases.import'), [])->assertForbidden();
    $this->assertDatabaseCount('jne_shipper_aliases', 0);
});

test('report source saves its label and cannot define shipment ownership', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create();
    $this->actingAs($admin)->post(route('jne-monitoring.profile-store'), ['customer_account' => 'SHARED', 'label' => 'Report gabungan', 'customer_mapping_mode' => 'SHIPPER_NAME',
        'customer_id' => $customer->id, 'enabled' => false, 'mode' => 'rolling', 'lookback_days' => 30, 'interval_minutes' => 360])->assertRedirect();
    expect(JneReportProfile::sole()->label)->toBe('Report gabungan');
    expect(JneReportProfile::sole()->customer_id)->toBeNull();
    expect(JneReportProfile::sole()->enabled)->toBeFalse();
});

test('monitoring filters customer independently from pickup', function () {
    $profile = JneReportProfile::factory()->create(['customer_mapping_mode' => 'SHIPPER_NAME']);
    $customer = Customer::factory()->create();
    createShipperAlias($profile, $customer, 'KNOWN');
    $shipment = projectAliasSource($profile, 'KNOWN');
    projectAliasSource($profile, 'UNKNOWN');
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('jne-monitoring.index', ['customer_id' => $customer->id]))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->has('shipments.data', 1)->where('shipments.data.0.id', $shipment->id)->where('shipments.data.0.customer_name', $customer->name));
});

test('AWB CSV import resolves alias while preserving all original data', function () {
    Storage::fake('jne_reports');
    $profile = JneReportProfile::factory()->create(['customer_account' => 'TESTACCOUNT', 'customer_mapping_mode' => 'SHIPPER_NAME']);
    $customer = Customer::factory()->create();
    createShipperAlias($profile, $customer, '102 ANITA');
    $csv = "AWB,ID_ACCOUNT,SHIPPER_NAME,EXTRA_COLUMN\n001234,TESTACCOUNT,102 ANITA,Original Value\n";
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'file_path' => 'test/report.csv', 'file_checksum' => hash('sha256', $csv), 'completed_at' => now()]);
    Storage::disk('jne_reports')->put($job->file_path, $csv);
    ImportJneReportAwbs::dispatchSync($job->id);
    expect($job->fresh()->projection_status)->toBe('PROJECTED');
    expect(JneShipment::sole()->customer_id)->toBe($customer->id);
    expect(JneReportAwb::sole()->raw_data['EXTRA_COLUMN'])->toBe('Original Value');
    expect(Storage::disk('jne_reports')->get($job->file_path))->toBe($csv);
});

test('legacy pickup association retains its customer when first alias projection disagrees', function () {
    $original = Customer::factory()->create();
    $profile = JneReportProfile::factory()->create(['customer_mapping_mode' => 'ACCOUNT', 'customer_id' => $original->id]);
    $task = PickupTask::factory()->create(['customer_id' => $original->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $shipment = projectAliasSource($profile, 'SENDER', $task->reference);
    $shipment->update(['pickup_task_id' => $task->id, 'match_status' => 'MATCHED', 'customer_id' => null, 'customer_match_status' => 'UNMATCHED']);
    $profile->update(['customer_mapping_mode' => 'SHIPPER_NAME']);
    createShipperAlias($profile, Customer::factory()->create(), 'SENDER');
    app(ProjectJneShipments::class)->handle($shipment->latest_report_job_id);
    expect($shipment->fresh()->customer_id)->toBe($original->id);
    expect($shipment->fresh()->customer_match_status)->toBe('AMBIGUOUS');
    expect($shipment->fresh()->pickup_task_id)->toBe($task->id);
});

test('manual association survives alias edits and automatic reprocessing', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $profile = JneReportProfile::factory()->create(['customer_mapping_mode' => 'SHIPPER_NAME']);
    $customer = Customer::factory()->create();
    $alias = createShipperAlias($profile, $customer, 'SENDER');
    $task = PickupTask::factory()->create(['customer_id' => $customer->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $shipment = projectAliasSource($profile, 'SENDER');
    $this->actingAs($admin)->post(route('jne-monitoring.match', $shipment->id), ['pickup_reference' => $task->reference, 'version' => $shipment->version, 'reason' => 'Dokumen pickup telah diperiksa.'])->assertRedirect();
    $alias->update(['is_active' => false]);
    app(ProjectJneShipments::class)->handle($shipment->latest_report_job_id);
    expect($shipment->fresh()->customer_id)->toBe($customer->id);
    expect($shipment->fresh()->pickup_task_id)->toBe($task->id);
    expect($shipment->fresh()->match_method)->toBe('MANUAL');
});

test('inactive admin cannot manage aliases', function () {
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]));
    $this->get(route('jne-shipper-aliases.index'))->assertForbidden();
    $this->post(route('jne-shipper-aliases.store'), [])->assertForbidden();
});

test('alias CSV rejects wrong extension size header and row limit', function (string $case) {
    $profile = JneReportProfile::factory()->create();
    $file = match ($case) {
        'extension' => UploadedFile::fake()->createWithContent('aliases.xlsx', "SHIPPER_NAME,KODE,NAMA_CUSTOMER\nS,1,N\n"),
        'size' => UploadedFile::fake()->create('aliases.csv', 5121, 'text/csv'),
        'header' => UploadedFile::fake()->createWithContent('aliases.csv', "SHIPPER_NAME,KODE,WRONG\nS,1,N\n"),
        'row limit' => UploadedFile::fake()->createWithContent('aliases.csv', "SHIPPER_NAME,KODE,NAMA_CUSTOMER\n".str_repeat("S,1,N\n", 10001)),
    };
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->postJson(route('jne-shipper-aliases.import'), ['jne_report_profile_id' => $profile->id, 'file' => $file])
        ->assertUnprocessable()->assertJsonValidationErrors('file');
    $this->assertDatabaseCount('jne_shipper_aliases', 0);
})->with(['extension', 'size', 'header', 'row limit']);

test('alias search treats wildcard characters literally', function () {
    $profile = JneReportProfile::factory()->create();
    $customer = Customer::factory()->create();
    createShipperAlias($profile, $customer, 'SENDER_100%');
    createShipperAlias($profile, $customer, 'SENDERX100ABC');
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('jne-shipper-aliases.index', ['customer_id' => $customer->id, 'alias_q' => '_100%']))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->has('aliases.data', 1)->where('aliases.data.0.shipper_name', 'SENDER_100%'));
});

test('customer can receive names without any JNE report source', function () {
    $customer = Customer::factory()->create(['customer_code' => '100', 'name' => 'PT A']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->post(route('jne-shipper-aliases.store'), ['customer_id' => $customer->id, 'shipper_name' => 'TOKO A'])
        ->assertRedirect();
    $this->assertDatabaseCount('jne_report_profiles', 0);
    expect(JneShipperAlias::sole()->customer_id)->toBe($customer->id);
    expect(JneShipperAlias::sole()->jne_report_profile_id)->toBeNull();
    $this->get(route('jne-shipper-aliases.index', ['customer_id' => $customer->id]))->assertInertia(fn (Assert $page) => $page
        ->where('selectedCustomer.customer_code', '100')->has('aliases.data', 1)->where('directory.data.0.alias_count', 1)->missing('profiles'));
});

test('CSV import requires only customer codes and no report source selection', function () {
    Customer::factory()->create(['customer_code' => '100', 'name' => 'PT A']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->post(route('jne-shipper-aliases.import'), [
        'file' => UploadedFile::fake()->createWithContent('names.csv', "SHIPPER_NAME,KODE,NAMA_CUSTOMER\nTOKO A,100,PT A\n")])->assertRedirect();
    $this->assertDatabaseCount('jne_shipper_aliases', 1);
    $this->assertDatabaseCount('jne_report_profiles', 0);
});

test('report number and label cannot select an owner when a name belongs to another customer', function () {
    $sourceOwner = Customer::factory()->create(['customer_code' => '100', 'name' => 'PT A']);
    $actualOwner = Customer::factory()->create(['customer_code' => '101', 'name' => 'PT B']);
    $profile = JneReportProfile::factory()->create(['customer_account' => 'SOURCE', 'label' => 'PT A report', 'customer_id' => $sourceOwner->id, 'customer_mapping_mode' => 'ACCOUNT']);
    JneShipperAlias::factory()->create(['customer_id' => $actualOwner->id, 'shipper_name' => 'TOKO B']);
    expect(projectAliasSource($profile, 'TOKO B')->customer_id)->toBe($actualOwner->id);
    expect(projectAliasSource($profile, 'UNRECOGNIZED')->customer_id)->toBeNull();
});

test('same name for different customer codes remains ambiguous across source numbers', function () {
    $one = JneReportProfile::factory()->create(['customer_account' => 'SOURCE-A']);
    $two = JneReportProfile::factory()->create(['customer_account' => 'SOURCE-B']);
    createShipperAlias($one, Customer::factory()->create(), 'SAME SENDER');
    createShipperAlias($two, Customer::factory()->create(), 'SAME SENDER');
    expect(projectAliasSource($one, 'SAME SENDER')->customer_match_status)->toBe('AMBIGUOUS');
    expect(projectAliasSource($two, 'SAME SENDER')->customer_match_status)->toBe('AMBIGUOUS');
});

test('source directory remains independent from customers and customer search preserves string codes', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    Customer::factory()->create(['customer_code' => '00100', 'name' => 'PT A']);
    Customer::factory()->create(['customer_code' => '101', 'name' => 'PT B']);
    $this->actingAs($admin)->get(route('jne-shipper-aliases.index', ['q' => '00100']))->assertInertia(fn (Assert $page) => $page
        ->has('directory.data', 1)->where('directory.data.0.customer_code', '00100')->where('directory.data.0.alias_count', 0));
    $this->post(route('jne-monitoring.profile-store'), ['customer_account' => 'REPORTNUMBER', 'label' => 'Report gabungan', 'enabled' => false, 'mode' => 'rolling', 'lookback_days' => 30, 'interval_minutes' => 360])->assertRedirect();
    $this->get(route('jne-reports.index'))->assertInertia(fn (Assert $page) => $page->where('sources.0.label', 'Report gabungan'));
    $this->assertDatabaseCount('customers', 2);
    $this->assertDatabaseCount('jne_shipper_aliases', 0);
});

test('duplicate directory names are grouped once and do not imply stored AWBs need an owner', function () {
    $one = Customer::factory()->create();
    $two = Customer::factory()->create();
    JneShipperAlias::factory()->create(['customer_id' => $one->id, 'shipper_name' => 'SAME NAME']);
    JneShipperAlias::factory()->create(['customer_id' => $two->id, 'shipper_name' => 'same name ']);
    JneShipment::factory()->create(['customer_id' => $one->id, 'customer_match_status' => 'MATCHED']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('jne-shipper-aliases.index', ['conflicts' => 1]))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->where('stats.conflicts', 1)->where('ownership.total', 1)->where('ownership.recognized', 1)
        ->where('ownership.ambiguous', 0)->where('ownership.unmatched', 0)->has('conflictGroups.data', 1)->where('conflictGroups.data.0.name', 'SAME NAME')
        ->has('conflictGroups.data.0.customers', 2));
    $this->assertDatabaseHas('jne_shipper_aliases', ['customer_id' => $one->id, 'is_active' => true]);
    $this->assertDatabaseHas('jne_shipper_aliases', ['customer_id' => $two->id, 'is_active' => true]);
});

test('actual AWBs needing ownership are counted separately from directory conflicts', function () {
    JneShipment::factory()->create(['customer_match_status' => 'MATCHED']);
    JneShipment::factory()->count(2)->create(['customer_match_status' => 'AMBIGUOUS']);
    JneShipment::factory()->create(['customer_match_status' => 'UNMATCHED']);
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->get(route('jne-shipper-aliases.index'))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->where('stats.conflicts', 0)->where('ownership.total', 4)
        ->where('ownership.recognized', 1)->where('ownership.ambiguous', 2)->where('ownership.unmatched', 1)->where('conflictGroups', null));
});

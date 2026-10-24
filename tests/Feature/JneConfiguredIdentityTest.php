<?php

use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\SyncJneCustomerMappings;
use App\Models\Customer;
use App\Models\JneCustomerCodeAlias;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipperAlias;
use App\Models\JneSourceContract;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;

beforeEach(function () {
    $this->withoutVite();
});

function verifiedCodeContract(): JneSourceContract
{
    config(['jne-reports.evidence_policies_enabled' => true]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    return JneSourceContract::factory()->create(['definition' => ['customer_code_column' => 'RETAIL_CODE_FIXTURE'],
        'active_key' => JneSourceContract::key('apex', 'apex'), 'verified_by' => $admin->id, 'verified_at' => now()]);
}

function configuredCodeShipment(string $awb, ?string $code, array $fields = []): JneShipment
{
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    JneReportAwb::factory()->create(['report_job_id' => $job->id, 'awb' => $awb, 'customer_account' => 'SHARED',
        'shipper_name' => 'Tokopedia', 'raw_data' => $code === null ? [] : ['RETAIL_CODE_FIXTURE' => $code], ...$fields]);
    app(ProjectJneShipments::class)->handle($job->id);

    return JneShipment::where('awb', $awb)->sole();
}

test('registered 4000 codes and verified 4000A 4000B aliases resolve independently inside a shared account', function () {
    verifiedCodeContract();
    $vanny = Customer::factory()->create(['name' => 'Vanny Songket', 'customer_code' => '4000']);
    $other = Customer::factory()->create(['customer_code' => '5000']);
    foreach (['4000A', '4000B'] as $code) {
        JneCustomerCodeAlias::factory()->create(['customer_id' => $vanny->id, 'code' => $code, 'is_active' => true, 'verified_by' => User::factory(), 'verified_at' => now()]);
    }
    foreach (['4000', '4000A', '4000B'] as $index => $code) {
        $shipment = configuredCodeShipment('CODE'.$index, $code);
        expect($shipment->customer_id)->toBe($vanny->id)->and($shipment->customer_match_status)->toBe('MATCHED');
        expect($shipment->pickup_task_id)->toBeNull();
    }
    expect(configuredCodeShipment('OTHER', '5000')->customer_id)->toBe($other->id);
    expect(configuredCodeShipment('ACCOUNT_ONLY', null)->customer_id)->toBeNull();
    $typo = configuredCodeShipment('TYPO', '400O');
    expect($typo->customer_id)->toBeNull()->and($typo->customer_match_status)->toBe('CANDIDATE');
    expect(array_column($typo->customer_match_candidates, 'customer_id'))->toContain($vanny->id);
    expect(JneReportAwb::where('awb', 'TYPO')->sole()->raw_data['RETAIL_CODE_FIXTURE'])->toBe('400O');
    expect(configuredCodeShipment('PREFIX', '4000C')->customer_id)->toBeNull();
    $aliasTypo = configuredCodeShipment('ALIAS_TYPO', '400OB');
    expect($aliasTypo->customer_id)->toBeNull()->and($aliasTypo->customer_match_status)->toBe('CANDIDATE');
    expect(array_column($aliasTypo->customer_match_candidates, 'customer_id'))->toContain($vanny->id);
});

test('exact code aliases and registered shippers cannot silently override contradictory owners', function () {
    verifiedCodeContract();
    $one = Customer::factory()->create(['customer_code' => '4000']);
    $two = Customer::factory()->create(['customer_code' => '5000']);
    JneShipperAlias::factory()->create(['customer_id' => $two->id, 'shipper_name' => 'Another owner']);
    $shipment = configuredCodeShipment('CONFLICT', '4000', ['shipper_name' => 'Another owner']);
    expect($shipment->customer_id)->toBeNull()->and($shipment->customer_match_status)->toBe('CONFLICT');
    foreach ([$one, $two] as $customer) {
        JneCustomerCodeAlias::factory()->create(['customer_id' => $customer->id, 'code' => '6000A', 'is_active' => true, 'verified_at' => now(), 'verified_by' => User::factory()]);
    }
    expect(configuredCodeShipment('DUPLICATE_CODE', '6000A')->customer_match_status)->toBe('CONFLICT');
});

test('verified shipper and code alias scopes require the exact account and known entry period', function () {
    verifiedCodeContract();
    $customer = Customer::factory()->create(['customer_code' => '4000']);
    $scope = ['customer_id' => $customer->id, 'account_scope' => 'SHARED', 'valid_from' => '2026-10-01', 'valid_thru' => '2026-10-31', 'is_active' => true, 'verified_at' => now(), 'verified_by' => User::factory()];
    JneShipperAlias::factory()->create([...$scope, 'shipper_name' => 'Scoped Dropship']);
    JneCustomerCodeAlias::factory()->create([...$scope, 'code' => '4000A']);
    expect(configuredCodeShipment('VALID', '4000A', ['entry_at' => '2026-10-10 00:00:00', 'shipper_name' => 'Scoped Dropship'])->customer_id)->toBe($customer->id);
    foreach ([['customer_account' => 'OTHER', 'entry_at' => '2026-10-10'], ['entry_at' => null], ['entry_at' => '2026-11-01']] as $index => $fields) {
        expect(configuredCodeShipment('OUTSIDE'.$index, '4000A', ['shipper_name' => 'Scoped Dropship', ...$fields])->customer_id)->toBeNull();
    }
});

test('Admin stores audited drafts while activation remains gated and corrections reapply safely', function () {
    Queue::fake([SyncJneCustomerMappings::class]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $payload = ['kind' => 'contract', 'source' => 'apex', 'report_type' => 'apex', 'definition' => ['customer_code_column' => null], 'reason' => 'UAT contract draft', 'verified' => false];
    $this->actingAs($admin)->post(route('jne-evidence.store'), $payload)->assertSessionHasNoErrors()->assertRedirect();
    expect(JneSourceContract::sole()->active_key)->toBeNull();
    $this->postJson(route('jne-evidence.store'), [...$payload, 'verified' => true])->assertConflict();
    $this->actingAs(User::factory()->create(['role' => 'retail_staff']))->postJson(route('jne-evidence.store'), $payload)->assertForbidden();
    config(['jne-reports.evidence_policies_enabled' => true]);
    $customer = Customer::factory()->create(['customer_code' => '4000']);
    $this->actingAs($admin)->post(route('jne-evidence.store'), ['kind' => 'code_alias', 'customer_id' => $customer->id, 'code' => '4000A', 'reason' => 'Verified synthetic registry', 'verified' => true])->assertSessionHasNoErrors()->assertRedirect();
    $alias = JneCustomerCodeAlias::sole();
    $this->postJson(route('jne-evidence.disable'), ['kind' => 'code_alias', 'id' => $alias->id, 'version' => 9, 'reason' => 'Stale'])->assertConflict();
    $this->post(route('jne-evidence.disable'), ['kind' => 'code_alias', 'id' => $alias->id, 'version' => 1, 'reason' => 'Verified mapping was corrected'])->assertRedirect();
    expect($alias->fresh()->is_active)->toBeFalse()->and($alias->fresh()->version)->toBe(2);
    expect(DB::table('jne_evidence_rule_events')->where('kind', 'code_alias')->count())->toBe(2);
    Queue::assertPushed(SyncJneCustomerMappings::class, 2);
});

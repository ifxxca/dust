<?php

use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\ResolveJneCustomers;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneReportProfile;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\PickupCustomerReconciliation;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->withoutVite();
    $this->travelTo('2026-11-26 09:00:00 UTC');
    config(['jne-reports.evidence_policies_enabled' => true]);
});

test('verified accounts resolve multiple accounts to one active customer without shipper codes', function () {
    $customer = Customer::factory()->create();
    $job = ReportJob::factory()->create(['source' => 'apex']);
    $rows = collect();
    foreach (['20110700', '20110701'] as $account) {
        JneReportProfile::factory()->create(['source' => 'apex', 'report_type' => 'apex', 'customer_account' => $account,
            'customer_mapping_mode' => 'ACCOUNT_VERIFIED', 'customer_id' => $customer->id, 'enabled' => false]);
        $rows->push(JneReportAwb::factory()->create(['report_job_id' => $job->id, 'customer_account' => $account, 'shipper_name' => 'CLARINDOTAMA PERDANA PT']));
    }

    $result = app(ResolveJneCustomers::class)->handle($rows);

    foreach ($rows as $row) {
        expect($result[$row->id])->toMatchArray(['customer_id' => $customer->id, 'status' => 'MATCHED', 'method' => 'ACCOUNT']);
        expect($result[$row->id]['evidence'])->toContainEqual(expectAccountEvidence($row));
    }
});

/** @return array<string, mixed> */
function expectAccountEvidence(JneReportAwb $row): array
{
    $profile = JneReportProfile::where('customer_account', $row->customer_account)->sole();

    return ['source_id' => $row->id, 'method' => 'ACCOUNT', 'column' => 'ID_ACCOUNT', 'account' => $row->customer_account,
        'profile_id' => $profile->id, 'profile_version' => $profile->version, 'customer_id' => $profile->customer_id];
}

test('unconfirmed inactive and wrong source accounts never establish customer ownership', function (string $mode, bool $active, string $source) {
    $customer = Customer::factory()->create(['is_active' => $active]);
    JneReportProfile::factory()->create(['customer_account' => '10561800', 'customer_id' => $customer->id, 'customer_mapping_mode' => $mode]);
    $job = ReportJob::factory()->create(['source' => $source, 'report_type' => $source === 'apex' ? 'apex' : 'combined']);
    $row = JneReportAwb::factory()->create(['report_job_id' => $job->id, 'customer_account' => '10561800', 'shipper_name' => 'UNKNOWN SENDER']);

    $result = app(ResolveJneCustomers::class)->handle(collect([$row]))[$row->id];

    expect($result)->toMatchArray(['customer_id' => null, 'status' => 'UNMATCHED']);
})->with([['ACCOUNT', true, 'apex'], ['SHIPPER_NAME', true, 'apex'], ['ACCOUNT_VERIFIED', false, 'apex'], ['ACCOUNT_VERIFIED', true, 'hybrid']]);

test('account ownership conflicting with a registered customer code requires review', function () {
    $owner = Customer::factory()->create();
    Customer::factory()->create(['customer_code' => '201', 'is_active' => true]);
    JneReportProfile::factory()->create(['customer_account' => '10561800', 'customer_id' => $owner->id, 'customer_mapping_mode' => 'ACCOUNT_VERIFIED']);
    $row = JneReportAwb::factory()->create(['customer_account' => '10561800', 'shipper_name' => '201 OTHER CUSTOMER']);

    $result = app(ResolveJneCustomers::class)->handle(collect([$row]))[$row->id];

    expect($result)->toMatchArray(['status' => 'CONFLICT', 'customer_id' => null]);
    expect($result['evidence'])->toContainEqual(expectAccountEvidence($row));
});

test('administrator configures account matching through existing profile version checks without starting collection', function () {
    Http::preventStrayRequests();
    Queue::fake();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create(['is_active' => true]);
    $profile = JneReportProfile::factory()->create(['customer_account' => '10561800', 'enabled' => false]);
    $payload = [...$profile->only(['source', 'report_type', 'customer_account', 'enabled', 'mode', 'lookback_days', 'date_from', 'date_thru', 'interval_minutes', 'version']),
        'customer_mapping_mode' => 'ACCOUNT_VERIFIED', 'customer_id' => $customer->id];

    $this->actingAs($admin)->put(route('jne-monitoring.profile-update', $profile), $payload)->assertRedirectToRoute('jne-monitoring.profiles');
    expect($profile->fresh())->customer_id->toBe($customer->id)->customer_mapping_mode->toBe('ACCOUNT_VERIFIED')->enabled->toBeFalse();
    $this->putJson(route('jne-monitoring.profile-update', $profile), $payload)->assertConflict();
    $this->get(route('jne-monitoring.profiles'))->assertInertia(fn (Assert $page) => $page
        ->where('profiles.0.customer.name', $customer->name)->where('profiles.0.customer_mapping_mode', 'ACCOUNT_VERIFIED'));
    Queue::assertNothingPushed();
    Http::assertNothingSent();
});

test('account matching requires an active owner and remains administrator only', function () {
    $profile = JneReportProfile::factory()->create(['enabled' => false]);
    $payload = [...$profile->only(['source', 'report_type', 'customer_account', 'enabled', 'mode', 'lookback_days', 'date_from', 'date_thru', 'interval_minutes', 'version']),
        'customer_mapping_mode' => 'ACCOUNT_VERIFIED', 'customer_id' => null];
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->putJson(route('jne-monitoring.profile-update', $profile), $payload)->assertUnprocessable()->assertJsonValidationErrors('customer_id');
    $inactive = Customer::factory()->create(['is_active' => false]);
    $this->putJson(route('jne-monitoring.profile-update', $profile), [...$payload, 'customer_id' => $inactive->id])
        ->assertUnprocessable()->assertJsonValidationErrors('customer_id');
    $this->actingAs(User::factory()->create(['role' => 'retail_staff']))
        ->putJson(route('jne-monitoring.profile-update', $profile), $payload)->assertForbidden();
    expect($profile->fresh()->customer_id)->toBeNull();
});

test('account owner cannot be configured on a shared Hybrid or active AWB collection profile', function (string $source, string $type, string $account) {
    $profile = JneReportProfile::factory()->create(['source' => $source, 'report_type' => $type, 'customer_account' => $account, 'enabled' => false]);
    $customer = Customer::factory()->create(['is_active' => true]);
    $payload = [...$profile->only(['source', 'report_type', 'customer_account', 'enabled', 'mode', 'lookback_days', 'date_from', 'date_thru', 'interval_minutes', 'version']),
        'customer_mapping_mode' => 'ACCOUNT_VERIFIED', 'customer_id' => $customer->id];

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))
        ->putJson(route('jne-monitoring.profile-update', $profile), $payload)->assertUnprocessable()->assertJsonValidationErrors('customer_mapping_mode');
    expect($profile->fresh()->customer_id)->toBeNull();
})->with([['hybrid', 'combined', 'HYBRID_PM'], ['apex', 'unresolved', 'AWB_AKTIF']]);

test('account based Orion import matches verified pickup and auto locks idempotently without a shipper code', function () {
    Queue::fake();
    Notification::fake();
    Storage::fake('local');
    Storage::fake('jne_reports');
    config(['pickup.automation.enabled' => false, 'pickup.automation.auto_lock' => true, 'pickup.automation.send_enabled' => false,
        'jne-reports.category_reconciliation_enabled' => true]);
    $fixture = pickupAutomationFixture(0, 1);
    $proof = $fixture['task']->proof->getAttributes();
    JneReportProfile::factory()->create(['customer_account' => 'SIM_AUTO_ACCOUNT', 'customer_id' => $fixture['customer']->id, 'customer_mapping_mode' => 'ACCOUNT_VERIFIED']);
    $csv = "AWB,ID_ACCOUNT,SHIPPER_NAME,STATUS_WEB,TGL_ENTRY,PROCESS_TYPE\nORIONSIM001,SIM_AUTO_ACCOUNT,ASIAN PACK CHEM PT,ON PROCESS,2026-11-26 16:00:00,ORION\n";
    Storage::disk('jne_reports')->put('account-simulation.csv', $csv);
    $job = ReportJob::factory()->create(['customer_account' => 'SIM_AUTO_ACCOUNT', 'status' => 'COMPLETED', 'date_from' => '2026-11-26', 'date_thru' => '2026-11-26',
        'file_path' => 'account-simulation.csv', 'file_checksum' => hash('sha256', $csv), 'row_count' => 1, 'started_at' => now(), 'completed_at' => now(),
        'parameters' => ['collection_evidence' => pickupAutomationCollectionEvidence('2026-11-26', '2026-11-26', 1)]]);
    app(ImportReportAwbs::class)->handle($job->id);
    app(ProjectJneShipments::class)->handle($job->id);
    $shipment = JneShipment::sole();
    expect($shipment)->customer_id->toBe($fixture['customer']->id)->pickup_task_id->toBe($fixture['task']->id)
        ->customer_match_status->toBe('MATCHED')->category->toBe('css_orion');
    expect(JneShipmentMatchEvent::where('jne_shipment_id', $shipment->id)->where('method', 'CUSTOMER_CODE_DATE')->first()?->evidence)->toBeArray();
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $snapshot = PickupCustomerReconciliation::sole()->approval_snapshot;
    expect($snapshot['event'])->toBe('AUTO_LOCK');
    app(ProjectJneShipments::class)->handle($job->id);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    expect(PickupCustomerReconciliation::sole()->approval_snapshot)->toBe($snapshot);
    expect($fixture['task']->proof->fresh()->getAttributes())->toBe($proof);
    $this->assertDatabaseCount('jne_shipments', 1);
});

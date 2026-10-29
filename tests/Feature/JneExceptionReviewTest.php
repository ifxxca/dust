<?php

use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\ReevaluateJneAwbs;
use App\Actions\Reports\ReviewJneExceptions;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipperAlias;
use App\Models\PickupCashlessAwb;
use App\Models\ReportJob;
use App\Models\User;

beforeEach(function () {
    $this->withoutVite();
    config(['jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
});

function reviewFixture(): array
{
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create();
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    foreach (['REVIEW1', 'REVIEW2'] as $awb) {
        JneReportAwb::factory()->create(['report_job_id' => $job->id, 'awb' => $awb, 'shipper_name' => 'Unknown verified label', 'reference' => null, 'entry_at' => null, 'raw_data' => [], 'customer_account' => 'SHARED']);
    }
    app(ProjectJneShipments::class)->handle($job->id);
    $rows = JneShipment::orderBy('id')->get();
    $payload = ['items' => $rows->map(fn ($row) => $row->only(['id', 'version']))->all(), 'group_key' => ReviewJneExceptions::groupKey($rows->first()),
        'action' => 'CONFIRM', 'customer_id' => $customer->id, 'category' => null, 'pickup_reference' => null, 'reason' => 'Original labels reviewed against authoritative customer record'];

    return [$admin, $customer, $rows, $payload];
}

test('equivalent batch review is audited without creating permanent aliases and survives unchanged replay', function () {
    [$admin, $customer, $rows, $payload] = reviewFixture();
    $this->actingAs($admin)->get(route('jne-exceptions.index'))->assertOk();
    $this->post(route('jne-exceptions.store'), $payload)->assertRedirect()->assertSessionHasNoErrors();
    expect(JneShipment::where('customer_match_status', 'MATCHED')->count())->toBe(2);
    expect(JneShipperAlias::count())->toBe(0);
    $this->assertDatabaseHas('jne_shipment_match_events', ['method' => 'REVIEW', 'actor_id' => $admin->id, 'reason' => $payload['reason']]);
    app(ReevaluateJneAwbs::class)->handle($rows->pluck('awb')->all());
    expect($rows->first()->fresh()->customer_id)->toBe($customer->id)->and($rows->first()->fresh()->customer_match_status)->toBe('MATCHED');
    $this->postJson(route('jne-exceptions.store'), $payload)->assertConflict();
    JneShipperAlias::factory()->create(['shipper_name' => 'Unknown verified label', 'customer_id' => Customer::factory()]);
    app(ReevaluateJneAwbs::class)->handle($rows->pluck('awb')->all());
    expect($rows->first()->fresh()->customer_match_status)->toBe('CONFLICT')->and($rows->first()->fresh()->customer_id)->toBe($customer->id);
});

test('review rejects unauthorized mixed stale and contrary Sertim decisions atomically', function () {
    [$admin, $customer, $rows, $payload] = reviewFixture();
    $this->actingAs(User::factory()->create(['role' => 'retail_staff']))->postJson(route('jne-exceptions.store'), $payload)->assertForbidden();
    $rows->last()->sources()->first()->update(['customer_account' => 'OTHER']);
    $this->actingAs($admin)->postJson(route('jne-exceptions.store'), $payload)->assertConflict();
    expect(JneShipment::where('customer_match_status', 'MATCHED')->count())->toBe(0);
    $first = $rows->first();
    PickupCashlessAwb::factory()->create(['awb' => $first->awb, 'customer_id' => Customer::factory()]);
    $first->unsetRelation('cashlessClaim');
    $this->postJson(route('jne-exceptions.store'), [...$payload, 'items' => [$payload['items'][0]], 'group_key' => ReviewJneExceptions::groupKey($first)])->assertConflict();
    expect($first->fresh()->customer_id)->toBeNull();
});

test('review category corrections and release preserve all original source cells', function () {
    [$admin, $customer, $rows, $payload] = reviewFixture();
    $this->actingAs($admin)->post(route('jne-exceptions.store'), [...$payload, 'category' => 'css_orion'])->assertRedirect();
    expect($rows->first()->fresh()->category)->toBe('css_orion');
    $row = $rows->first()->fresh();
    $this->post(route('jne-exceptions.store'), ['items' => [$row->only(['id', 'version'])], 'group_key' => ReviewJneExceptions::groupKey($row), 'action' => 'RELEASE', 'reason' => 'Decision retracted after label inspection'])->assertRedirect();
    expect($row->fresh()->customer_id)->toBeNull()->and($row->fresh()->category_status)->toBe('UNMATCHED');
    expect($row->sources()->first()->shipper_name)->toBe('Unknown verified label');
});

<?php

use App\Actions\Pickup\RecordCashlessAwb;
use App\Actions\Reports\BuildJnePickupReconciliation;
use App\Actions\Reports\ManageJneCollectionWindow;
use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\QueryJneCollectionWindows;
use App\Actions\Reports\ResolveJneCategories;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneSourceContract;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->withoutVite();
    config(['jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true, 'jne-reports.collection_attestation_enabled' => true]);
});

function categoryFixture(): array
{
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create(['name' => 'Vanny Songket', 'customer_code' => '4000']);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED', 'execution_started_at' => now()]);
    foreach (range(1, 3) as $index) {
        app(RecordCashlessAwb::class)->handle($staff, $task->id, ['awb' => 'CASH'.$index, 'submission_key' => (string) Str::uuid()]);
    }
    $task->update(['status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => 0, 'cashless_hybrid' => 3, 'css_orion' => 100]);
    $contract = JneSourceContract::factory()->create(['active_key' => JneSourceContract::key('apex', 'apex'), 'verified_at' => now(), 'verified_by' => $admin->id,
        'definition' => ['customer_code_column' => 'RETAIL_CODE_FIXTURE', 'category_column' => 'POP_KIND_FIXTURE', 'category_values' => ['CSS' => 'css_orion'], 'collection_requirements' => ['apex:apex']]]);
    $job = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED']);
    foreach (range(1, 103) as $index) {
        JneReportAwb::factory()->create(['report_job_id' => $job->id, 'awb' => $index <= 3 ? 'CASH'.$index : 'CSS'.$index, 'shipper_name' => 'Tokopedia',
            'reference' => $index <= 3 ? null : $task->reference, 'customer_account' => 'SHARED', 'raw_data' => $index <= 3 ? [] : ['RETAIL_CODE_FIXTURE' => '4000', 'POP_KIND_FIXTURE' => 'CSS']]);
    }
    app(ProjectJneShipments::class)->handle($job->id);

    return [$admin, $task->fresh(), $contract, $job];
}

function collectionPayload(JneSourceContract $contract, ReportJob $job, int $version = 0): array
{
    return ['status' => 'COMPLETE', 'expected_version' => $version, 'submission_key' => (string) Str::uuid(), 'reason' => 'Synthetic full report scope verified',
        'contract_id' => $contract->id, 'report_job_ids' => [$job->id], 'cutoff_at' => now()->subMinute()->toIso8601String(), 'confirmed_scope' => true];
}

test('Vanny 0 manual 3 cashless 100 CSS needs independent identity category and external completeness evidence', function () {
    [$admin, $task, $contract, $job] = categoryFixture();
    $result = app(BuildJnePickupReconciliation::class)->handle(PickupTask::whereKey($task->id)->get())[$task->id];
    expect($result['confirmed_pickup_awbs'])->toBe(103)->and($result['category_confirmed_awbs'])->toBe(103)->and($result['reconciled'])->toBeFalse();
    expect($result['categories']['css_orion']['confirmed_awbs'])->toBe(100)->and($result['categories']['cashless_hybrid']['confirmed_awbs'])->toBe(3);
    $payload = collectionPayload($contract, $job);
    $this->actingAs($admin)->post(route('jne-collections.store', $task), $payload)->assertRedirect()->assertSessionHasNoErrors();
    $this->post(route('jne-collections.store', $task), $payload)->assertRedirect();
    expect(DB::table('jne_reconciliation_events')->count())->toBe(1);
    $result = app(BuildJnePickupReconciliation::class)->handle(PickupTask::whereKey($task->id)->get())[$task->id];
    expect($result['reconciled'])->toBeTrue()->and($result['categories']['manual_hybrid']['confirmed_awbs'])->toBe(0);
    expect($task->proof->cashless_hybrid)->toBe(3)->and($task->proof->css_orion)->toBe(100);
    $this->get(route('jne-collections.show', $task))->assertOk();
});

test('late observations invalidate attestation without changing finalized POP', function () {
    $old = ReportJob::factory()->create(['status' => 'COMPLETED', 'import_status' => 'IMPORTED']);
    [$admin, $task, $contract, $job] = categoryFixture();
    app(ManageJneCollectionWindow::class)->handle($admin, $task->id, collectionPayload($contract, $job));
    JneReportAwb::factory()->create(['report_job_id' => $old->id, 'awb' => 'LATE_UNKNOWN', 'shipper_name' => 'Tokopedia', 'reference' => null, 'raw_data' => []]);
    app(ProjectJneShipments::class)->handle($old->id);
    $result = app(QueryJneCollectionWindows::class)->handle(collect([$task]))[$task->id];
    expect($result['complete'])->toBeFalse()->and($result['status'])->toBe('REVIEW')->and($task->proof->css_orion)->toBe(100);
});

test('equal confirmed totals with an additional uncertain retained pickup pointer remain under review', function () {
    [$admin, $task, $contract, $job] = categoryFixture();
    JneShipment::factory()->create(['pickup_task_id' => $task->id, 'customer_id' => $task->customer_id, 'customer_match_status' => 'CONFLICT', 'match_status' => 'CONFLICT']);
    app(ManageJneCollectionWindow::class)->handle($admin, $task->id, collectionPayload($contract, $job));
    $result = app(BuildJnePickupReconciliation::class)->handle(PickupTask::whereKey($task->id)->get())[$task->id];
    expect($result['category_confirmed_awbs'])->toBe(103)->and($result['reconciled'])->toBeFalse()->and($result['categories']['css_orion']['state'])->toBe('REVIEW');
});

test('contradictory verified categories cannot reconcile equal counts', function () {
    [$admin, $task, $contract, $job] = categoryFixture();
    $contract->update(['definition' => [...$contract->definition, 'hybrid_categories' => ['roberto:manual' => 'manual_hybrid', 'nuralamt:cashless' => 'cashless_hybrid']]]);
    JneReportAwb::where('awb', 'CSS4')->firstOrFail()->update(['source_evidence' => ['hybrid_origins' => [
        ['source' => 'roberto', 'report_type' => 'manual', 'report_job_id' => 1, 'checksum' => 'a'],
        ['source' => 'nuralamt', 'report_type' => 'cashless', 'report_job_id' => 2, 'checksum' => 'b'],
    ]]]);
    app(ResolveJneCategories::class)->handle(JneShipment::where('awb', 'CSS4')->get());
    expect(JneShipment::where('awb', 'CSS4')->sole()->category_status)->toBe('CONFLICT');
    app(ManageJneCollectionWindow::class)->handle($admin, $task->id, collectionPayload($contract, $job));
    $result = app(BuildJnePickupReconciliation::class)->handle(PickupTask::whereKey($task->id)->get())[$task->id];
    expect($result['reconciled'])->toBeFalse()->and($result['categories']['css_orion']['missing_quantity'])->toBeNull();
});

test('attestation rejects staff failed reports stale versions and unverified configuration', function () {
    [$admin, $task, $contract, $job] = categoryFixture();
    $payload = collectionPayload($contract, $job);
    $this->actingAs(User::factory()->create(['role' => 'retail_staff']))->postJson(route('jne-collections.store', $task), $payload)->assertForbidden();
    $this->actingAs($admin)->postJson(route('jne-collections.store', $task), [...$payload, 'expected_version' => 9])->assertConflict();
    $job->update(['projection_status' => 'FAILED']);
    $this->postJson(route('jne-collections.store', $task), $payload)->assertConflict();
    $job->update(['projection_status' => 'PROJECTED']);
    $contract->update(['definition' => ['collection_requirements' => ['hybrid:combined']]]);
    $this->postJson(route('jne-collections.store', $task), $payload)->assertUnprocessable();
    config(['jne-reports.collection_attestation_enabled' => false]);
    $this->postJson(route('jne-collections.store', $task), $payload)->assertConflict();
});

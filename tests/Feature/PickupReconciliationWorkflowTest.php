<?php

use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\QueryPickupAutomation;
use App\Actions\Pickup\QueryReconciliationWorkspace;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Pickup\ReviewPickupAwbs;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-10-26 12:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'pickup.automation.auto_lock' => false, 'pickup.automation.send_enabled' => false,
        'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    Queue::fake();
    Mail::fake();
    Storage::fake('jne_reports');
    Storage::fake('local');
});

function workflowSelection(PickupTask $task, array $items, string $action): array
{
    $workspace = app(QueryReconciliationWorkspace::class)->handle($task);
    $member = $workspace['members'][0];
    $version = DB::table('pickup_processing_reconciliations')->where('pickup_task_id', $task->id)->value('input_version');

    return ['action' => $action, 'expected_revision' => $workspace['version'], 'expected_version' => $version,
        'target_task_id' => $member['id'], 'reason' => 'Identitas dan bukti sumber dikonfirmasi oleh Admin.', 'items' => $items];
}

function workflowTarget(array $fixture, int $quantity = 2): PickupTask
{
    $customer = Customer::factory()->create(['customer_code' => '5000']);
    $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'status' => 'PICKED_UP', 'scheduled_at' => now()]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => $quantity, 'cashless_hybrid' => 0, 'css_orion' => 0]);
    $session = app(CreateSession::class)->handle($fixture['admin'], [$task->id], (string) Str::uuid());
    app(VerifyItem::class)->handle($fixture['admin'], $session->id, $session->items()->sole()->id,
        ['expected_version' => 1, 'manual_hybrid' => $quantity, 'cashless_hybrid' => 0, 'css_orion' => 0]);
    app(ReconcilePickupProcessing::class)->handle($task->id);

    return $task;
}

test('quantity shortages and excess remain actionable without source coverage and never finalize', function (int $actual, string $status, string $discrepancy) {
    $fixture = pickupAutomationFixture(6, 0);
    importPickupAutomationReport($fixture, $actual, 0);
    $fixture['contract']->update(['definition' => [...$fixture['contract']->definition, 'collection_mode' => 'unverified']]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    $this->actingAs($fixture['admin'])->getJson(route('reconciliation-workspace.show', $fixture['task']))
        ->assertOk()->assertJsonPath('quantity_status', $status)->assertJsonPath('eligible', false)
        ->assertJsonPath('status', 'IN_REVIEW')->assertJsonPath('categories.manual_hybrid.status', 'DISCREPANCY')
        ->assertJsonFragment(['type' => $discrepancy]);
    expect(PickupCustomerReconciliation::sole()->approval_snapshot)->toBeNull();
    $this->assertDatabaseCount('pickup_awb_manifests', 0);
    Mail::assertNothingSent();
})->with(['shortage' => [5, 'SHORTAGE', 'MISSING'], 'excess' => [7, 'EXCESS', 'EXCESS']]);

test('unassigned pool finds recipients and customers without including already allocated AWBs', function () {
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 1, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $source = JneReportAwb::factory()->create(['report_job_id' => $fixture['job']->id ?? ReportJob::sole()->id,
        'shipper_name' => 'PENGIRIM POOL', 'consignee_name' => 'PENERIMA KHUSUS', 'entry_at' => now(), 'customer_account' => 'POOL_ACCOUNT']);
    $unassigned = JneShipment::factory()->create(['awb' => $source->awb, 'pickup_task_id' => null, 'customer_id' => $fixture['customer']->id,
        'latest_report_awb_id' => $source->id, 'latest_report_job_id' => $source->report_job_id, 'customer_account' => 'POOL_ACCOUNT']);

    $this->actingAs($fixture['admin']);
    foreach (['PENERIMA KHUSUS', $fixture['customer']->name, '4000', 'POOL_ACCOUNT'] as $term) {
        $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'unassigned', 'q' => $term]))
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $unassigned->id);
    }
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $fixture['task'], 'mode' => 'included']))->assertOk()->assertJsonPath('total', 1);
});

test('global unique AWB accounting preserves other pickup allocations and uses operational date boundaries', function () {
    $fixture = pickupAutomationFixture(30, 0);
    importPickupAutomationReport($fixture, 30, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $other = PickupTask::factory()->create();
    $report = ReportJob::factory()->create(['customer_account' => 'OTHER_ACCOUNT', 'status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED']);
    foreach (range(1, 970) as $number) {
        $source = JneReportAwb::factory()->create(['report_job_id' => $report->id, 'source_row' => $number,
            'awb' => 'GLOBAL'.$number, 'entry_at' => '2026-10-26 21:59:59']);
        JneShipment::factory()->create(['awb' => $source->awb, 'pickup_task_id' => $number <= 900 ? $other->id : null,
            'customer_id' => $number <= 900 ? $other->customer_id : null, 'category' => 'manual_hybrid',
            'latest_report_awb_id' => $source->id, 'latest_report_job_id' => $report->id]);
    }
    $outOfDay = JneReportAwb::factory()->create(['report_job_id' => $report->id, 'source_row' => 971, 'entry_at' => '2026-10-26 22:00:00']);
    JneShipment::factory()->create(['awb' => $outOfDay->awb, 'pickup_task_id' => null, 'latest_report_awb_id' => $outOfDay->id]);

    $result = app(QueryPickupAutomation::class)->handle(['date_from' => '2026-10-26', 'date_to' => '2026-10-26', 'date_basis' => 'pickup', 'category' => 'manual_hybrid', 'q' => '4000']);

    expect($result['pool_summary'])->toMatchArray(['total' => 1000, 'allocated' => 930, 'unassigned' => 70]);
    expect($result['allocation_summary'])->toMatchArray(['total' => 1, 'pickup_books' => 1, 'matched' => 1]);
    expect($result['rows']->items()[0])->toMatchArray(['expected_quantity' => 30, 'allocated_quantity' => 30, 'difference' => 0, 'quantity_status' => 'MATCHED']);
});

test('batch reassign atomically corrects both books then auto locks without changing finalized POP', function () {
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 4, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $target = workflowTarget($fixture);
    $items = JneShipment::orderBy('id')->limit(2)->get()->map->only(['id', 'version'])->all();
    $proofs = PickupRecord::orderBy('id')->get()->map->getAttributes()->all();
    $body = workflowSelection($target, $items, 'REASSIGN');
    $this->actingAs($fixture['admin']);
    $preview = $this->postJson(route('reconciliation-workspace.preview', $target), $body)->assertOk()->assertJsonPath('allowed', true);
    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->count())->toBe(4);
    config(['pickup.automation.auto_lock' => true]);

    $this->postJson(route('reconciliation-workspace.apply', $target), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertOk();

    expect(JneShipment::where('pickup_task_id', $target->id)->count())->toBe(2)
        ->and(JneShipment::where('pickup_task_id', $fixture['task']->id)->count())->toBe(2)
        ->and(PickupCustomerReconciliation::whereNotNull('approval_snapshot')->count())->toBe(2)
        ->and(PickupRecord::orderBy('id')->get()->map->getAttributes()->all())->toBe($proofs);
    $this->assertDatabaseCount('pickup_awb_review_events', 4);
    $this->assertDatabaseCount('jne_report_awbs', 4);
    $this->postJson(route('reconciliation-workspace.apply', $target), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertConflict();
    Mail::assertNothingSent();
});

test('reassign rejects stale source state locked books and staff without partial ownership changes', function (string $condition) {
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 4, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $target = workflowTarget($fixture);
    $items = JneShipment::orderBy('id')->limit(2)->get()->map->only(['id', 'version'])->all();
    $body = workflowSelection($target, $items, 'REASSIGN');
    $this->actingAs($fixture['admin']);
    $preview = $this->postJson(route('reconciliation-workspace.preview', $target), $body)->assertOk()->assertJsonPath('allowed', true);
    if ($condition === 'stale') {
        DB::table('pickup_processing_reconciliations')->where('pickup_task_id', $fixture['task']->id)->increment('input_version');
    } elseif ($condition === 'locked') {
        DB::table('pickup_processing_reconciliations')->where('pickup_task_id', $fixture['task']->id)->update(['locked_at' => now()]);
    } else {
        $this->actingAs(User::factory()->create(['role' => 'pickup_staff']));
    }

    $this->postJson(route('reconciliation-workspace.apply', $target), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertStatus($condition === 'staff' ? 403 : 409);

    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->count())->toBe(4)->and(JneShipment::where('pickup_task_id', $target->id)->count())->toBe(0);
    $this->assertDatabaseCount('pickup_awb_review_events', 0);
})->with(['stale', 'locked', 'staff']);

test('batch take out spans multiple books in the same customer day and preserves source evidence', function () {
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 6, 0);
    $second = PickupTask::factory()->create(['customer_id' => $fixture['customer']->id, 'status' => 'PICKED_UP', 'scheduled_at' => now()]);
    PickupRecord::factory()->create(['pickup_task_id' => $second->id, 'manual_hybrid' => 2, 'cashless_hybrid' => 0, 'css_orion' => 0]);
    $session = app(CreateSession::class)->handle($fixture['admin'], [$second->id], (string) Str::uuid());
    app(VerifyItem::class)->handle($fixture['admin'], $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => 2, 'cashless_hybrid' => 0, 'css_orion' => 0]);
    $shipments = JneShipment::orderBy('id')->get();
    foreach ($shipments->slice(3) as $shipment) {
        $shipment->update(['pickup_task_id' => $second->id]);
    }
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $items = [$shipments[0]->fresh()->only(['id', 'version']), $shipments[3]->fresh()->only(['id', 'version'])];
    $body = workflowSelection($fixture['task'], $items, 'REMOVE');
    $proofs = PickupRecord::orderBy('id')->get()->map->getAttributes()->all();
    $this->actingAs($fixture['admin']);
    $preview = $this->postJson(route('reconciliation-workspace.preview', $fixture['task']), $body)->assertOk()->assertJsonPath('allowed', true);

    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertOk();

    expect(JneShipment::whereNull('pickup_task_id')->count())->toBe(2)
        ->and(JneShipment::where('pickup_task_id', $second->id)->count())->toBe(2)
        ->and(JneShipment::where('pickup_task_id', $fixture['task']->id)->count())->toBe(2)
        ->and(PickupRecord::orderBy('id')->get()->map->getAttributes()->all())->toBe($proofs);
    $this->assertDatabaseCount('jne_report_awbs', 6);
    $this->assertDatabaseCount('pickup_awb_review_events', 2);
});

test('a failed second reassign rolls back the complete batch including the first move and audit', function () {
    $fixture = pickupAutomationFixture(2, 0);
    importPickupAutomationReport($fixture, 4, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $target = workflowTarget($fixture);
    $items = JneShipment::orderBy('id')->limit(2)->get()->map->only(['id', 'version'])->all();
    $body = workflowSelection($target, $items, 'REASSIGN');
    $this->actingAs($fixture['admin']);
    $preview = $this->postJson(route('reconciliation-workspace.preview', $target), $body)->assertOk()->assertJsonPath('allowed', true);
    $review = app(ReviewPickupAwbs::class);
    $calls = 0;
    $mock = Mockery::mock(ReviewPickupAwbs::class);
    $mock->shouldReceive('handle')->andReturnUsing(function (...$arguments) use ($review, &$calls) {
        if (++$calls === 3) {
            throw new RuntimeException('Simulated storage failure during the second move.');
        }

        return $review->handle(...$arguments);
    });
    app()->instance(ReviewPickupAwbs::class, $mock);

    $this->postJson(route('reconciliation-workspace.apply', $target), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertServerError();

    expect(JneShipment::where('pickup_task_id', $fixture['task']->id)->count())->toBe(4)->and(JneShipment::where('pickup_task_id', $target->id)->count())->toBe(0);
    $this->assertDatabaseCount('pickup_awb_review_events', 0);
    $this->assertDatabaseCount('pickup_awb_exclusions', 0);
});

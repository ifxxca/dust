<?php

use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\QueryReconciliationWorkspace;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Jobs\DeliverPickupAwbManifestJob;
use App\Models\Customer;
use App\Models\JneShipment;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Database\Seeders\PickupCherryPickingSimulationSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

/** @return array<string, mixed> */
function cherryPickingSimulationDecision(PickupTask $task, JneShipment $shipment, string $action): array
{
    $workspace = app(QueryReconciliationWorkspace::class)->handle($task);

    return ['action' => $action, 'expected_revision' => $workspace['version'],
        'expected_version' => PickupProcessingReconciliation::where('pickup_task_id', $task->id)->value('input_version'),
        'target_task_id' => $task->id, 'items' => [$shipment->fresh()->only(['id', 'version'])],
        'reason' => 'SIMULASI 02-11-2026: label penerima membuktikan AWB milik pickup 09, kode customer report salah menunjuk pickup 10.'];
}

test('November second ten pickup simulation recovers a shortage and excess through audited take out and take from the pool', function () {
    expect(app()->environment())->toBe('testing');
    expect(config('database.default'))->toBe('sqlite');
    expect(config('database.connections.sqlite.database'))->toBe(':memory:');
    $this->travelTo('2026-11-02 03:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'pickup.automation.auto_lock' => true, 'pickup.automation.send_enabled' => false,
        'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true,
        'jne-reports.category_markers_enabled' => false, 'jne-reports.source_timezone' => 'Asia/Jakarta']);
    Http::preventStrayRequests();
    Mail::fake();
    Notification::fake();
    Queue::fake();
    Storage::fake('jne_reports');
    Storage::fake('local');

    $fixture = pickupAutomationFixture(5, 0);
    $fixture['customer']->update(['name' => '[SIM CP] Customer 01']);
    $fixture['task']->update(['reference' => 'SIM-CP-20261102-01', 'customer_name_snapshot' => $fixture['customer']->name]);
    $tasks = [1 => $fixture['task']];
    $customers = [1 => $fixture['customer']];
    foreach (range(2, 10) as $number) {
        $customer = Customer::factory()->create(['customer_code' => sprintf('70%02d', $number), 'name' => sprintf('[SIM CP] Customer %02d', $number), 'created_by' => $fixture['admin']->id, 'is_active' => true]);
        $task = PickupTask::factory()->create(['reference' => sprintf('SIM-CP-20261102-%02d', $number), 'customer_id' => $customer->id,
            'customer_name_snapshot' => $customer->name, 'scheduled_at' => now(), 'status' => 'PICKED_UP', 'created_by' => $fixture['admin']->id]);
        PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $fixture['task']->proof->staff_id, 'manual_hybrid' => 5, 'cashless_hybrid' => 0, 'css_orion' => 0]);
        $session = app(CreateSession::class)->handle($fixture['admin'], [$task->id], (string) Str::uuid());
        app(VerifyItem::class)->handle($fixture['admin'], $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => 5, 'cashless_hybrid' => 0, 'css_orion' => 0]);
        $tasks[$number] = $task;
        $customers[$number] = $customer;
    }
    $proofs = PickupRecord::orderBy('id')->get()->map->getAttributes()->all();
    $handoverQuantities = DB::table('handover_items')->orderBy('id')->get(['id', 'manual_hybrid', 'cashless_hybrid', 'css_orion'])->map(fn (object $row): array => (array) $row)->all();

    $this->travelTo('2026-11-02 05:00:00 UTC');
    $stream = fopen('php://temp', 'w+b');
    fputcsv($stream, ['AWB', 'ID_ACCOUNT', 'CUSTOMER_CODE', 'SHIPPER_NAME', 'CONSIGNEE_NAME', 'STATUS_WEB', 'STATUS_POD', 'AWB_CANCEL', 'NOREF', 'TGL_ENTRY', 'PROCESS_TYPE', 'QTY'], ',', '"', '');
    $awbNumber = 0;
    foreach ($customers as $number => $customer) {
        $count = $number === 9 ? 4 : 5;
        foreach (range(1, $count) as $parcel) {
            fputcsv($stream, [sprintf('010120261102%03d', ++$awbNumber), 'SIM_AUTO_ACCOUNT', $customer->customer_code, $customer->customer_code.' '.$customer->name,
                sprintf('SIM Customer %02d Penerima %02d', $number, $parcel), 'ON PROCESS', '', 'N', '', '2026-11-02 10:30:00', 'MANUAL', 1], ',', '"', '');
        }
    }
    $misattributedAwb = sprintf('010120261102%03d', ++$awbNumber);
    fputcsv($stream, [$misattributedAwb, 'SIM_AUTO_ACCOUNT', $customers[10]->customer_code, $customers[10]->customer_code.' [SIM CP] Customer 09',
        'SIM Customer 09 Penerima Salah Kode', 'ON PROCESS', '', 'N', '', '2026-11-02 10:30:00', 'MANUAL', 1], ',', '"', '');
    rewind($stream);
    $csv = stream_get_contents($stream);
    fclose($stream);
    $path = 'simulations/cherry-picking-20261102.csv';
    Storage::disk('jne_reports')->put($path, $csv);
    $job = ReportJob::factory()->create(['customer_account' => 'SIM_AUTO_ACCOUNT', 'date_from' => '2026-11-02', 'date_thru' => '2026-11-02',
        'created_by' => $fixture['admin']->id, 'status' => 'COMPLETED', 'file_path' => $path, 'file_checksum' => hash('sha256', $csv), 'row_count' => 50,
        'started_at' => now(), 'completed_at' => now(), 'parameters' => ['synthetic' => true, 'collection_evidence' => pickupAutomationCollectionEvidence('2026-11-02', '2026-11-02', 50)]]);
    app(ImportReportAwbs::class)->handle($job->id);
    app(ProjectJneShipments::class)->handle($job->id);
    foreach ($tasks as $task) {
        app(ReconcilePickupProcessing::class)->handle($task->id);
    }

    $this->actingAs($fixture['admin']);
    foreach (array_slice($tasks, 0, 8) as $task) {
        $this->getJson(route('reconciliation-workspace.show', $task))->assertOk()->assertJsonPath('header.business_date', '2026-11-02')
            ->assertJsonPath('status', 'LOCKED')->assertJsonPath('metrics.expected', 5)->assertJsonPath('metrics.matched', 5);
        $this->getJson(route('reconciliation-workspace.awbs', ['task' => $task, 'mode' => 'exceptions']))->assertOk()->assertJsonPath('total', 0);
    }
    $this->getJson(route('reconciliation-workspace.show', $tasks[9]))->assertOk()->assertJsonPath('quantity_status', 'SHORTAGE')
        ->assertJsonPath('metrics.expected', 5)->assertJsonPath('metrics.observed', 4)->assertJsonPath('metrics.missing', 1);
    $this->getJson(route('reconciliation-workspace.show', $tasks[10]))->assertOk()->assertJsonPath('quantity_status', 'EXCESS')
        ->assertJsonPath('metrics.expected', 5)->assertJsonPath('metrics.observed', 6)->assertJsonPath('metrics.excess', 1);
    expect(PickupCustomerReconciliation::whereNotNull('approval_snapshot')->count())->toBe(8);
    $originalSnapshots = PickupCustomerReconciliation::whereNotNull('approval_snapshot')->get()->mapWithKeys(fn (PickupCustomerReconciliation $group): array => [$group->id => $group->approval_snapshot])->all();
    $wrong = JneShipment::where('awb', $misattributedAwb)->sole();
    expect($wrong->pickup_task_id)->toBe($tasks[10]->id);
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $tasks[9], 'mode' => 'unassigned', 'q' => $wrong->awb]))->assertOk()->assertJsonPath('total', 0);
    $invalidTake = cherryPickingSimulationDecision($tasks[9], $wrong, 'ADD');
    $invalidPreview = $this->postJson(route('reconciliation-workspace.preview', $tasks[9]), $invalidTake)->assertOk()->assertJsonPath('allowed', false);
    $this->postJson(route('reconciliation-workspace.apply', $tasks[9]), [...$invalidTake, 'preview_hash' => $invalidPreview->json('preview_hash')])->assertConflict();
    $this->assertDatabaseCount('pickup_awb_review_events', 0);

    $remove = cherryPickingSimulationDecision($tasks[10], $wrong, 'REMOVE');
    $preview = $this->postJson(route('reconciliation-workspace.preview', $tasks[10]), $remove)->assertOk()->assertJsonPath('allowed', true);
    expect($wrong->refresh()->pickup_task_id)->toBe($tasks[10]->id);
    $this->postJson(route('reconciliation-workspace.apply', $tasks[10]), [...$remove, 'preview_hash' => $preview->json('preview_hash')])->assertOk()->assertJsonPath('applied', true);
    expect($wrong->refresh()->pickup_task_id)->toBeNull();
    expect(PickupCustomerReconciliation::whereNotNull('approval_snapshot')->count())->toBe(9);
    $this->getJson(route('reconciliation-workspace.show', $tasks[10]))->assertOk()->assertJsonPath('status', 'LOCKED')->assertJsonPath('metrics.matched', 5);
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $tasks[9], 'mode' => 'unassigned', 'q' => $wrong->awb]))->assertOk()
        ->assertJsonPath('total', 1)->assertJsonPath('data.0.awb', $misattributedAwb)->assertJsonPath('data.0.consignee_name', 'SIM Customer 09 Penerima Salah Kode');

    $add = cherryPickingSimulationDecision($tasks[9], $wrong, 'ADD');
    $preview = $this->postJson(route('reconciliation-workspace.preview', $tasks[9]), $add)->assertOk()->assertJsonPath('allowed', true);
    $this->postJson(route('reconciliation-workspace.apply', $tasks[9]), [...$add, 'preview_hash' => str_repeat('0', 64)])->assertConflict();
    expect($wrong->refresh()->pickup_task_id)->toBeNull();
    $this->postJson(route('reconciliation-workspace.apply', $tasks[9]), [...$add, 'preview_hash' => $preview->json('preview_hash')])->assertOk()->assertJsonPath('applied', true);
    expect($wrong->refresh()->pickup_task_id)->toBe($tasks[9]->id)->and($wrong->customer_id)->toBe($customers[9]->id);
    $this->postJson(route('reconciliation-workspace.apply', $tasks[9]), [...$add, 'preview_hash' => $preview->json('preview_hash')])->assertConflict();

    foreach ($tasks as $task) {
        $this->getJson(route('reconciliation-workspace.show', $task))->assertOk()->assertJsonPath('status', 'LOCKED')
            ->assertJsonPath('metrics.expected', 5)->assertJsonPath('metrics.matched', 5)->assertJsonPath('metrics.missing', 0)->assertJsonPath('metrics.excess', 0);
        expect(JneShipment::where('pickup_task_id', $task->id)->count())->toBe(5);
    }
    foreach ($originalSnapshots as $id => $snapshot) {
        expect(PickupCustomerReconciliation::findOrFail($id)->approval_snapshot)->toBe($snapshot);
    }
    expect(JneShipment::whereNull('pickup_task_id')->count())->toBe(0);
    expect(PickupRecord::orderBy('id')->get()->map->getAttributes()->all())->toBe($proofs);
    expect(DB::table('handover_items')->orderBy('id')->get(['id', 'manual_hybrid', 'cashless_hybrid', 'css_orion'])->map(fn (object $row): array => (array) $row)->all())->toBe($handoverQuantities);
    expect(DB::table('pickup_customer_reconciliation_events')->get()->filter(fn (object $event): bool => (json_decode($event->snapshot, true)['event'] ?? null) === 'AUTO_LOCK'))->toHaveCount(10);
    $this->assertDatabaseCount('pickup_tasks', 10);
    $this->assertDatabaseCount('jne_shipments', 50);
    $this->assertDatabaseCount('jne_report_awbs', 50);
    $this->assertDatabaseCount('pickup_awb_review_events', 2);
    Mail::assertNothingSent();
    Notification::assertNothingSent();
    Http::assertNothingSent();
    Queue::assertNotPushed(DeliverPickupAwbManifestJob::class);
});

test('web simulation seeder leaves eight locked pickups and two actionable cases and preserves repeated visits', function () {
    $this->travelTo('2026-11-18 03:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'pickup.automation.auto_lock' => true, 'pickup.automation.send_enabled' => false,
        'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true, 'jne-reports.category_markers_enabled' => false]);
    Queue::fake();
    Mail::fake();
    Http::preventStrayRequests();
    Storage::fake('jne_reports');
    Storage::fake('local');

    $this->seed(PickupCherryPickingSimulationSeeder::class);

    $this->assertDatabaseCount('pickup_tasks', 10);
    $this->assertDatabaseCount('jne_shipments', 50);
    expect(PickupCustomerReconciliation::whereNotNull('approval_snapshot')->count())->toBe(8);
    $admin = User::where('email', 'simulasi@example.test')->sole();
    $this->post(route('login.store'), ['email' => $admin->email, 'password' => 'Simulasi-2026!'])->assertRedirect();
    $this->assertAuthenticatedAs($admin);
    $short = PickupTask::where('reference', 'SIM-CP-20261102-09')->sole();
    $excess = PickupTask::where('reference', 'SIM-CP-20261102-10')->sole();
    $this->getJson(route('reconciliation-workspace.show', $short))->assertOk()->assertJsonPath('quantity_status', 'SHORTAGE')->assertJsonPath('metrics.missing', 1);
    $this->getJson(route('reconciliation-workspace.show', $excess))->assertOk()->assertJsonPath('quantity_status', 'EXCESS')->assertJsonPath('metrics.excess', 1);
    $wrong = JneShipment::where('awb', '010120261102050')->sole();
    $body = cherryPickingSimulationDecision($excess, $wrong, 'REMOVE');
    $preview = $this->postJson(route('reconciliation-workspace.preview', $excess), $body)->assertOk()->assertJsonPath('allowed', true);
    $this->postJson(route('reconciliation-workspace.apply', $excess), [...$body, 'preview_hash' => $preview->json('preview_hash')])->assertOk();
    $this->seed(PickupCherryPickingSimulationSeeder::class);
    expect($wrong->refresh()->pickup_task_id)->toBeNull();
    expect(PickupCustomerReconciliation::whereNotNull('approval_snapshot')->count())->toBe(9);
    $this->assertDatabaseCount('pickup_awb_review_events', 1);
    Mail::assertNothingSent();
    Http::assertNothingSent();
});

test('ten wrongly coded AWBs can move through the pool in two atomic batches and immediately reconcile both books', function () {
    $this->travelTo('2026-11-18 03:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'pickup.automation.auto_lock' => true, 'pickup.automation.send_enabled' => false,
        'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true, 'jne-reports.category_markers_enabled' => false]);
    Queue::fake();
    Mail::fake();
    Http::preventStrayRequests();
    Storage::fake('jne_reports');
    Storage::fake('local');
    app(PickupCherryPickingSimulationSeeder::class)->run(10);

    $short = PickupTask::where('reference', 'SIM-CP-20261102-09')->sole();
    $excess = PickupTask::where('reference', 'SIM-CP-20261102-10')->sole();
    $admin = User::where('email', 'simulasi@example.test')->sole();
    $wrong = JneShipment::where('awb', '>=', '010120261102050')->orderBy('awb')->get();
    expect($wrong)->toHaveCount(10);
    $proofs = PickupRecord::orderBy('id')->get()->map->getAttributes()->all();
    $quantities = DB::table('handover_items')->orderBy('id')->get(['id', 'manual_hybrid', 'cashless_hybrid', 'css_orion'])->all();
    $snapshots = PickupCustomerReconciliation::whereNotNull('approval_snapshot')->get()->mapWithKeys(fn (PickupCustomerReconciliation $group): array => [$group->id => $group->approval_snapshot])->all();
    $this->actingAs($admin);
    $this->getJson(route('reconciliation-workspace.show', $short))->assertOk()->assertJsonPath('metrics.expected', 14)->assertJsonPath('metrics.missing', 10);
    $this->getJson(route('reconciliation-workspace.show', $excess))->assertOk()->assertJsonPath('metrics.observed', 15)->assertJsonPath('metrics.excess', 10);
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $excess, 'mode' => 'included', 'q' => 'Salah Kode']))->assertOk()->assertJsonPath('total', 10);

    $remove = [...cherryPickingSimulationDecision($excess, $wrong->first(), 'REMOVE'), 'items' => $wrong->map->only(['id', 'version'])->all()];
    $preview = $this->postJson(route('reconciliation-workspace.preview', $excess), $remove)->assertOk()->assertJsonPath('allowed', true)->assertJsonCount(10, 'items');
    expect(JneShipment::where('pickup_task_id', $excess->id)->count())->toBe(15);
    $this->postJson(route('reconciliation-workspace.apply', $excess), [...$remove, 'preview_hash' => $preview->json('preview_hash')])->assertOk();
    $this->getJson(route('reconciliation-workspace.show', $excess))->assertOk()->assertJsonPath('status', 'LOCKED')->assertJsonPath('metrics.observed', 5)->assertJsonPath('metrics.excess', 0);
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $short, 'mode' => 'unassigned', 'q' => 'Salah Kode']))->assertOk()->assertJsonPath('total', 10);
    $this->assertDatabaseCount('pickup_awb_review_events', 10);

    $add = [...cherryPickingSimulationDecision($short, $wrong->first(), 'ADD'), 'items' => $wrong->fresh()->map->only(['id', 'version'])->all()];
    $preview = $this->postJson(route('reconciliation-workspace.preview', $short), $add)->assertOk()->assertJsonPath('allowed', true)->assertJsonCount(10, 'items');
    $this->postJson(route('reconciliation-workspace.apply', $short), [...$add, 'preview_hash' => $preview->json('preview_hash')])->assertOk();
    $this->getJson(route('reconciliation-workspace.show', $short))->assertOk()->assertJsonPath('status', 'LOCKED')->assertJsonPath('metrics.expected', 14)
        ->assertJsonPath('metrics.observed', 14)->assertJsonPath('metrics.missing', 0)->assertJsonPath('metrics.excess', 0);
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $short, 'mode' => 'snapshot']))->assertOk()->assertJsonPath('total', 14);
    $this->getJson(route('reconciliation-workspace.awbs', ['task' => $short, 'mode' => 'unassigned']))->assertOk()->assertJsonPath('total', 0);
    $this->postJson(route('reconciliation-workspace.apply', $short), [...$add, 'preview_hash' => $preview->json('preview_hash')])->assertConflict();
    expect(PickupCustomerReconciliation::whereNotNull('approval_snapshot')->count())->toBe(10);
    expect(PickupRecord::orderBy('id')->get()->map->getAttributes()->all())->toBe($proofs);
    expect(DB::table('handover_items')->orderBy('id')->get(['id', 'manual_hybrid', 'cashless_hybrid', 'css_orion'])->all())->toEqual($quantities);
    foreach ($snapshots as $id => $snapshot) {
        expect(PickupCustomerReconciliation::findOrFail($id)->approval_snapshot)->toBe($snapshot);
    }
    $this->assertDatabaseCount('pickup_awb_review_events', 20);
    Mail::assertNothingSent();
    Http::assertNothingSent();
});

test('web simulation seeder refuses unsafe environments and database targets before creating records', function (string $environment, string $connection, string $database) {
    app()->instance('env', $environment);
    config(['database.default' => $connection, 'database.connections.sqlite.database' => $database]);

    expect(fn () => app(PickupCherryPickingSimulationSeeder::class)->run())->toThrow(RuntimeException::class, 'database SQLite cherry-picking terisolasi');

    config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
    $this->assertDatabaseCount('users', 0);
    $this->assertDatabaseCount('pickup_tasks', 0);
})->with([
    ['production', 'sqlite', ':memory:'],
    ['local', 'sqlite', ':memory:'],
    ['testing', 'mysql', ':memory:'],
    ['local', 'sqlite', 'database/database.sqlite'],
]);

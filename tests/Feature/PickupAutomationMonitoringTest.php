<?php

use App\Actions\Pickup\QueryPickupAutomation;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Jobs\DeliverPickupAwbManifestJob;
use App\Jobs\ReconcilePickupProcessingJob;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Database\Seeders\PickupAutomationSimulationSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-10-26 08:00:00 UTC');
    config(['jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true, 'pickup.automation.enabled' => false]);
    Queue::fake();
    Storage::fake('jne_reports');
    Storage::fake('local');
    $this->fixture = pickupAutomationFixture();
    importPickupAutomationReport($this->fixture, 1, 1);
    app(ReconcilePickupProcessing::class)->handle($this->fixture['task']->id);
});

test('admin monitoring filters one pickup per row and exposes category shortfall', function () {
    $this->actingAs($this->fixture['admin'])->get(route('pickup-automation.index', ['q' => '4000', 'automation_status' => 'PARTIAL']))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->component('rekonsiliasi-resi')->has('automation.rows.data', 1)
        ->where('automation.rows.data.0.automation_status', 'PARTIAL')->where('automation.rows.data.0.categories.manual_hybrid.shortfall', 1));
    $this->get(route('pickup-automation.index', ['automation_status' => 'DONE']))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->has('automation.rows.data', 0));
});

test('status cards keep context totals while category and case-group filters change the working list', function () {
    $this->seed(PickupAutomationSimulationSeeder::class);
    $this->actingAs($this->fixture['admin'])->get(route('pickup-automation.index', ['q' => 'SIM-AUTO', 'reconciliation_group' => 'review']))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->where('automation.rows.total', 2)->where('automation.summary.total', 7)->where('automation.summary.review', 2)->where('automation.summary.waiting', 3)->where('automation.summary.done', 2));
    $this->get(route('pickup-automation.index', ['q' => 'SIM-AUTO', 'category' => 'css_orion']))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->where('automation.rows.total', 2)->where('automation.summary.total', 2));
    $this->getJson(route('pickup-automation.index', ['reconciliation_group' => 'invented']))->assertUnprocessable();
});

test('CSV exports every filtered pickup or only selected rows and escapes customer formula text', function () {
    $task = $this->fixture['task'];
    $task->update(['customer_name_snapshot' => '=SUM(1,1)']);
    $other = PickupTask::factory()->create(['scheduled_at' => now(), 'status' => 'PICKED_UP', 'customer_name_snapshot' => 'Outside selection']);
    PickupRecord::factory()->create(['pickup_task_id' => $other->id]);
    $this->actingAs($this->fixture['admin']);
    $csv = $this->get(route('pickup-automation.export', ['selected_ids' => [$task->id]]))->assertOk()->assertDownload()->streamedContent();
    $rows = array_map(fn (string $line): array => str_getcsv($line, ',', '"', ''), array_filter(explode("\n", trim($csv))));
    expect($rows)->toHaveCount(2);
    expect($rows[1][0])->toBe($task->reference);
    expect($rows[1][1])->toBe("'=SUM(1,1)");
    expect($rows[1][7])->toBe('2');
    expect($rows[1][8])->toBe('1');
    $filtered = $this->get(route('pickup-automation.export', ['q' => 'Outside selection', 'selected_ids' => [$task->id]]))->assertOk()->streamedContent();
    expect($filtered)->not->toContain($task->reference);
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff', 'is_active' => true]))->get(route('pickup-automation.export'))->assertForbidden();
});

test('deep linked detail returns real pickup milestones and selected pickup state', function () {
    $task = $this->fixture['task'];
    $this->actingAs($this->fixture['admin'])->get(route('pickup-automation.index', ['quick_pickup' => $task->id]))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('selectedPickup', $task->id)->missing('filters.quick_pickup'));
    $response = $this->getJson(route('pickup-automation.show', $task))->assertOk()->assertJsonPath('context.customer_code', '4000')->assertJsonPath('context.staff_name', null);
    expect($response->json('context.visited_at'))->not->toBeNull();
    expect($response->json('context.finalized_at'))->not->toBeNull();
    expect($response->json('context.imported_at'))->not->toBeNull();
});

test('matched pickup keeps uncertain delivery visible in its list and detail regardless of document pagination', function () {
    importPickupAutomationReport($this->fixture);
    app(ReconcilePickupProcessing::class)->handle($this->fixture['task']->id);
    $manifest = PickupAwbManifest::sole();
    $manifest->update(['status' => 'READY']);
    PickupAwbDelivery::factory()->create(['pickup_awb_manifest_id' => $manifest->id, 'status' => 'UNKNOWN', 'last_error' => 'Provider belum mengonfirmasi penerimaan.']);

    $this->actingAs($this->fixture['admin'])->get(route('pickup-automation.index', ['reconciliation_group' => 'review']))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('automation.rows.data.0.automation_status', 'DONE')->where('automation.rows.data.0.reconciliation_group', 'review'));
    $this->getJson(route('pickup-automation.show', ['task' => $this->fixture['task'], 'manifest_page' => 2]))->assertOk()
        ->assertJsonPath('reconciliation.status', 'DONE')->assertJsonPath('delivery_attention', 'Provider belum mengonfirmasi penerimaan.')
        ->assertJsonCount(0, 'manifests.data');
    Queue::assertNotPushed(DeliverPickupAwbManifestJob::class);
});

test('pickup landing page opens pickup monitoring while legacy automation links preserve their filters', function () {
    $this->actingAs($this->fixture['admin'])->get(route('pickup-results.index'))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('pickup-results')->where('filters.monitoring', 'pickup')->missing('automation')->missing('processing'));
    $response = $this->get(route('pickup-results.index', ['monitoring' => 'automation', 'q' => '4000', 'automation_status' => 'PARTIAL', 'page' => 2]))->assertRedirect();
    expect(parse_url($response->headers->get('Location'), PHP_URL_PATH))->toBe('/rekonsiliasi-resi');
    parse_str(parse_url($response->headers->get('Location'), PHP_URL_QUERY), $query);
    expect($query)->toMatchArray(['q' => '4000', 'automation_status' => 'PARTIAL', 'page' => '2', 'date_from' => '2026-10-26', 'date_to' => '2026-10-26', 'date_basis' => 'pickup'])->not->toHaveKey('monitoring');
});

test('dedicated reconciliation page retains the active admin access boundary', function () {
    $this->get(route('pickup-automation.index'))->assertRedirect(route('login'));
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff', 'is_active' => true]))->get(route('pickup-automation.index'))->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]))->get(route('pickup-automation.index'))->assertForbidden();
});

test('detail and preference endpoints enforce role permissions and revision conflicts', function () {
    $task = $this->fixture['task'];
    $staff = User::factory()->create(['role' => 'pickup_staff', 'is_active' => true]);
    $this->actingAs($staff)->getJson(route('pickup-automation.show', $task))->assertForbidden();
    $this->post(route('pickup-automation.preference', $task), ['enabled' => true, 'recipient' => 'vanny@example.test', 'expected_revision' => 0, 'reason' => 'Konfirmasi customer'])->assertForbidden();
    $this->actingAs($this->fixture['admin'])->getJson(route('pickup-automation.show', $task))->assertOk()->assertJsonPath('reconciliation.status', 'PARTIAL');
    $this->post(route('pickup-automation.preference', $task), ['enabled' => true, 'recipient' => 'Vanny@example.test', 'expected_revision' => 0, 'reason' => 'Konfirmasi customer'])->assertRedirect();
    $this->assertDatabaseHas('customer_awb_delivery_preferences', ['customer_id' => $task->customer_id, 'recipient' => 'vanny@example.test', 'revision' => 1]);
    $this->assertDatabaseCount('customer_awb_delivery_preference_events', 1);
    $this->post(route('pickup-automation.preference', $task), ['enabled' => false, 'expected_revision' => 0, 'reason' => 'Tab lama'])->assertConflict();
});

test('preference validates destination and never accepts a blank enabled recipient', function () {
    $this->actingAs($this->fixture['admin'])->post(route('pickup-automation.preference', $this->fixture['task']), ['enabled' => true, 'recipient' => '', 'expected_revision' => 0, 'reason' => 'Aktivasi'])->assertSessionHasErrors('recipient');
    $this->assertDatabaseCount('customer_awb_delivery_preferences', 0);
});

test('download checks ownership and stored checksum', function () {
    importPickupAutomationReport($this->fixture);
    app(ReconcilePickupProcessing::class)->handle($this->fixture['task']->id);
    $manifest = PickupAwbManifest::sole();
    Storage::disk('local')->put('private/resi.pdf', '%PDF-fixture');
    $manifest->update(['pdf_path' => 'private/resi.pdf', 'checksums' => ['pdf' => hash('sha256', '%PDF-fixture')]]);
    $url = route('pickup-automation.download', ['task' => $this->fixture['task'], 'manifest' => $manifest, 'format' => 'pdf']);
    $this->actingAs($this->fixture['admin'])->get($url)->assertOk()->assertDownload();
    Storage::disk('local')->put('private/resi.pdf', 'changed');
    $this->get($url)->assertConflict();
    $foreign = PickupTask::factory()->create();
    $this->get(route('pickup-automation.download', ['task' => $foreign, 'manifest' => $manifest, 'format' => 'pdf']))->assertNotFound();
});

test('dirty pickup is swept even before its five minute fallback is due', function () {
    config(['pickup.automation.enabled' => true]);
    $result = PickupProcessingReconciliation::sole();
    $result->update(['input_version' => 1, 'evaluated_input_version' => 0, 'next_evaluation_at' => now()->addMinutes(5)]);
    $this->artisan('pickups:queue-automation')->assertSuccessful();
    Queue::assertPushed(ReconcilePickupProcessingJob::class, fn ($job) => $job->taskId === $this->fixture['task']->id);
});

test('task creation before a finalized POP does not trigger reconciliation', function () {
    config(['pickup.automation.enabled' => true]);
    $task = PickupTask::factory()->create();
    Queue::assertNotPushed(ReconcilePickupProcessingJob::class, fn ($job) => $job->taskId === $task->id);
    expect(app(ReconcilePickupProcessing::class)->handle($task->id)->status)->toBe('AWAITING_VERIFICATION');
});

test('recovery records an expired send as unknown without queuing another attempt', function () {
    $manifest = PickupAwbManifest::factory()->create(['pickup_task_id' => $this->fixture['task']->id]);
    $delivery = PickupAwbDelivery::factory()->create(['pickup_awb_manifest_id' => $manifest->id, 'status' => 'SENDING', 'started_at' => now()->subMinutes(6)]);
    DB::table('pickup_awb_delivery_attempts')->insert(['pickup_awb_delivery_id' => $delivery->id, 'status' => 'SENDING', 'started_at' => now()->subMinutes(6)]);
    config(['pickup.automation.enabled' => true]);
    $this->artisan('pickups:queue-automation', ['--recover' => true])->assertSuccessful();
    expect($delivery->fresh()->status)->toBe('UNKNOWN');
    $this->assertDatabaseHas('pickup_awb_delivery_attempts', ['pickup_awb_delivery_id' => $delivery->id, 'status' => 'UNKNOWN']);
    Queue::assertNotPushed(DeliverPickupAwbManifestJob::class);
});

test('simulation seeding is repeatable and uses a separate synthetic source', function () {
    $this->seed(PickupAutomationSimulationSeeder::class);
    $this->seed(PickupAutomationSimulationSeeder::class);
    expect(PickupTask::where('reference', 'like', 'SIM-AUTO-%')->count())->toBe(7);
    $this->assertDatabaseHas('report_jobs', ['source' => 'simulation', 'report_type' => 'pickup', 'imported_awb_count' => 671]);
    expect(PickupProcessingReconciliation::where('status', 'DONE')->count())->toBe(2);
    expect(PickupAwbManifest::count())->toBe(2);
});

test('reconciliation accepts a twenty four day range and counts AWBs without loading each source and pickup model', function () {
    $tasks = collect();
    $counts = [
        'manual_hybrid' => ['expected' => 1, 'confirmed' => 1],
        'cashless_hybrid' => ['expected' => 0, 'confirmed' => 0],
        'css_orion' => ['expected' => 0, 'confirmed' => 0],
    ];
    foreach (['2026-09-30 22:00:00', '2026-10-23 22:00:00'] as $pickedUpAt) {
        $task = PickupTask::factory()->create(['status' => 'PICKED_UP']);
        PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'picked_up_at' => $pickedUpAt]);
        PickupProcessingReconciliation::factory()->create(['pickup_task_id' => $task->id, 'status' => 'DONE', 'categories' => $counts]);
        $tasks->push($task);
    }
    $createAwb = function (PickupTask $task, string $entryAt, array $overrides = []): void {
        $source = JneReportAwb::factory()->create(['entry_at' => $entryAt, 'raw_data' => ['EXTRA' => str_repeat('large original source', 100)]]);
        JneShipment::factory()->create(['awb' => $source->awb, 'latest_report_awb_id' => $source->id,
            'customer_id' => $task->customer_id, 'pickup_task_id' => $task->id, 'match_status' => 'MATCHED', 'customer_match_status' => 'MATCHED',
            'category_status' => 'MATCHED', 'tracking_status' => 'IN_TRANSIT', ...$overrides]);
    };
    $createAwb($tasks[0], '2026-09-30 22:00:00');
    $createAwb($tasks[1], '2026-10-24 21:59:00');
    $createAwb($tasks[0], '2026-09-30 21:59:00');
    $createAwb($tasks[1], '2026-10-24 22:00:00');
    $createAwb($tasks[1], '2026-10-24 12:00:00', ['tracking_status' => 'CANCELLED']);
    $createAwb($tasks[1], '2026-10-24 12:00:00', ['customer_id' => $this->fixture['customer']->id]);
    $createAwb($tasks[1], '2026-10-24 12:00:00', ['category_status' => 'CONFLICT']);
    $filters = ['date_from' => '2026-10-01', 'date_to' => '2026-10-24', 'scope' => 'daily'];
    $this->actingAs($this->fixture['admin'])->get(route('pickup-automation.index', $filters))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('filters.date_from', '2026-10-01')->where('filters.date_to', '2026-10-24')
            ->where('automation.rows.total', 2)->where('automation.processing.regular_processed', 2)->where('automation.processing.regular_target', 2));
    $queries = [];
    DB::listen(function ($event) use (&$queries): void {
        $queries[] = $event->sql;
    });

    $result = app(QueryPickupAutomation::class)->handle($filters);

    expect($result['processing']['regular_processed'])->toBe(2);
    expect(count($queries))->toBeLessThanOrEqual(8);
});

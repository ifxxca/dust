<?php

use App\Actions\Handover\CorrectVerification;
use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Models\Customer;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-19 05:00:00', 'UTC'));
});

function processingFixture(): array
{
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->state(['scheduled_at' => now()])->create(['status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => 10, 'cashless_hybrid' => 4, 'css_orion' => 2]);
    $session = app(CreateSession::class)->handle($admin, [$task->id], (string) Str::uuid());
    app(VerifyItem::class)->handle($admin, $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => 12, 'cashless_hybrid' => 3, 'css_orion' => 2, 'discrepancy_notes' => 'Hitung fisik']);

    return [$admin, $task, $session];
}

test('processing foundation separates POP and Retail from unavailable external confirmation', function () {
    [$admin, $task] = processingFixture();
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'processing']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('pickup-results')->where('processing.summary.pop_quantity', 16)->where('processing.summary.received_quantity', 17)
        ->where('processing.summary.confirmed_quantity', null)->where('processing.summary.manual_quantity', 0)->where('processing.summary.pending_quantity', 0)
        ->where('processing.summary.failed_quantity', 0)->where('processing.summary.unconfirmed_quantity', 17)->where('processing.summary.attention_count', 0)
        ->has('processing.rows.data', 3)->where('processing.rows.data.0.processing_status', 'NOT_RECORDED'));
    $this->get(route('pickup-results.show', $task))->assertInertia(fn (Assert $page) => $page->has('processing.rows', 3)->has('processing.latest', 0)->where('processing.can_record', true));
});

test('POP without Retail is unconfirmed and not a pending or failed processing attempt', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->state(['scheduled_at' => now()])->create(['status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'processing', 'category' => 'manual_hybrid']))
        ->assertInertia(fn (Assert $page) => $page->where('processing.summary.pop_quantity', 2)->where('processing.summary.received_quantity', 0)
            ->where('processing.summary.unverified_categories', 1)->where('processing.summary.unconfirmed_quantity', 2)
            ->where('processing.rows.data.0.received_quantity', null)->where('processing.rows.data.0.processing_status', 'NOT_RECORDED'));
});

function processingPayload(array $override = []): array
{
    return array_replace(['category' => 'manual_hybrid', 'system' => 'JNE_HYBRID', 'expected_revision' => 0, 'expected_pickup_revision' => 0, 'expected_handover_revision' => 0, 'submission_key' => (string) Str::uuid(), 'successful_quantity' => 5, 'failed_quantity' => 1, 'pending_quantity' => 2, 'unknown_quantity' => 0, 'external_reference' => 'batch-1', 'reason' => 'Bukti input dicatat Admin'], $override);
}

test('manual recording is auditable idempotent and never external confirmation', function () {
    [$admin, $task, $session] = processingFixture();
    $payload = processingPayload();
    $this->actingAs($admin)->postJson(route('api.tasks.processing', $task), $payload)->assertOk()->assertJsonPath('data.provenance', 'MANUAL')->assertJsonPath('data.externally_confirmed', false);
    $this->postJson(route('api.tasks.processing', $task), $payload)->assertOk()->assertJsonPath('data.revision', 1);
    $this->assertDatabaseCount('pickup_processing_records', 1);
    $this->assertDatabaseHas('pickup_task_events', ['pickup_task_id' => $task->id, 'action' => 'processing_recorded', 'actor_id' => $admin->id]);
    expect($task->fresh()->status)->toBe('PICKED_UP');
    expect($task->proof->fresh()->manual_hybrid)->toBe(10);
    expect($session->fresh()->version)->toBe(2);
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'category' => 'manual_hybrid']))->assertInertia(fn (Assert $page) => $page->where('processing.summary.manual_quantity', 5)->where('processing.summary.failed_quantity', 1)->where('processing.summary.pending_quantity', 2)->where('processing.summary.confirmed_quantity', null)->where('processing.summary.unconfirmed_quantity', 12)->where('processing.rows.data.0.not_recorded_quantity', 4));
    $this->postJson(route('api.tasks.processing', $task), array_replace($payload, ['successful_quantity' => 6]))->assertConflict();
});

test('corrections replace contribution preserve originals and reject concurrent stale revisions', function () {
    [$admin, $task] = processingFixture();
    $this->actingAs($admin)->postJson(route('api.tasks.processing', $task), processingPayload())->assertOk();
    $this->postJson(route('api.tasks.processing', $task), processingPayload(['expected_revision' => 1, 'successful_quantity' => 7, 'failed_quantity' => 0, 'reason' => 'Hitung ulang input']))->assertOk();
    $this->postJson(route('api.tasks.processing', $task), processingPayload(['expected_revision' => 1]))->assertConflict();
    $this->assertDatabaseCount('pickup_processing_records', 2);
    $this->assertDatabaseHas('pickup_processing_records', ['revision' => 1, 'successful_quantity' => 5]);
    $this->assertDatabaseHas('pickup_processing_records', ['revision' => 2, 'successful_quantity' => 7, 'reason' => 'Hitung ulang input']);
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'category' => 'manual_hybrid']))->assertInertia(fn (Assert $page) => $page->where('processing.summary.manual_quantity', 7)->where('processing.summary.failed_quantity', 0));
    $this->get(route('pickup-results.show', $task))->assertInertia(fn (Assert $page) => $page->has('processing.latest', 1)->has('processing.history.data', 2)->where('processing.history.data.0.previous_successful', 5));
    $this->assertDatabaseHas('pickup_task_events', ['action' => 'processing_corrected', 'actor_id' => $admin->id]);
});

test('over received declarations and unknown outcomes are retained and flagged without capping', function () {
    [$admin, $task] = processingFixture();
    $this->actingAs($admin)->postJson(route('api.tasks.processing', $task), processingPayload(['successful_quantity' => 15, 'failed_quantity' => 0, 'pending_quantity' => 0, 'unknown_quantity' => 2]))->assertOk();
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'reconciliation' => 'yes']))->assertInertia(fn (Assert $page) => $page->where('processing.summary.manual_quantity', 15)->where('processing.summary.unknown_outcome_quantity', 2)->where('processing.summary.failed_quantity', 0)->where('processing.summary.attention_count', 1)->where('processing.rows.data.0.processing_status', 'RECONCILIATION_REQUIRED'));
});

test('duplicate references are detected across active snapshots while older replacement references do not double count', function () {
    [$admin, $task] = processingFixture();
    $this->actingAs($admin)->postJson(route('api.tasks.processing', $task), processingPayload(['successful_quantity' => 1, 'pending_quantity' => 0, 'failed_quantity' => 0]))->assertOk();
    $this->postJson(route('api.tasks.processing', $task), processingPayload(['category' => 'css_orion', 'successful_quantity' => 1, 'pending_quantity' => 0, 'failed_quantity' => 0, 'external_reference' => ' BATCH-1 ']))->assertOk();
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'reconciliation' => 'yes']))->assertInertia(fn (Assert $page) => $page->where('processing.summary.category_count', 2)->where('processing.rows.data.0.duplicate_reference', 1));
    $this->postJson(route('api.tasks.processing', $task), processingPayload(['category' => 'css_orion', 'expected_revision' => 1, 'successful_quantity' => 1, 'pending_quantity' => 0, 'failed_quantity' => 0, 'external_reference' => 'batch-2']))->assertOk();
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'reconciliation' => 'yes']))->assertInertia(fn (Assert $page) => $page->where('processing.summary.category_count', 0));
});

test('two systems never duplicate category baselines and require checking aggregate allocation', function () {
    [$admin, $task] = processingFixture();
    $this->actingAs($admin)->postJson(route('api.tasks.processing', $task), processingPayload(['successful_quantity' => 2, 'pending_quantity' => 0, 'failed_quantity' => 0, 'external_reference' => 'REF-A']))->assertOk();
    $this->postJson(route('api.tasks.processing', $task), processingPayload(['system' => 'MYORION', 'successful_quantity' => 3, 'pending_quantity' => 0, 'failed_quantity' => 0, 'external_reference' => 'REF-B']))->assertOk();
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'processing_system' => 'MYORION']))
        ->assertInertia(fn (Assert $page) => $page->where('processing.summary.pop_quantity', 10)->where('processing.summary.received_quantity', 12)->where('processing.summary.manual_quantity', 5)->has('processing.rows.data', 1)->where('processing.rows.data.0.reconciliation_required', 1));
});

test('changed POP and Retail baselines reject stale writes and flag previously recorded evidence', function () {
    [$admin, $task, $session] = processingFixture();
    $this->actingAs($admin)->postJson(route('api.tasks.processing', $task), processingPayload())->assertOk();
    $task->proof->revisions()->create(['revision' => 1, 'values' => ['manual_hybrid' => 11], 'actor_id' => $admin->id, 'reason' => 'Revisi POP']);
    $this->postJson(route('api.tasks.processing', $task), processingPayload(['expected_revision' => 1]))->assertConflict();
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'category' => 'manual_hybrid']))->assertInertia(fn (Assert $page) => $page->where('processing.rows.data.0.baseline_changed', 1));
    app(CorrectVerification::class)->handle($admin, $session->id, $session->items()->sole()->id, ['expected_version' => 2, 'manual_hybrid' => 11, 'cashless_hybrid' => 3, 'css_orion' => 2, 'discrepancy_notes' => 'Koreksi fisik', 'reason' => 'Hitung ulang']);
    $this->postJson(route('api.tasks.processing', $task), processingPayload(['expected_revision' => 1, 'expected_pickup_revision' => 1]))->assertConflict();
});

test('manual processing rejects negative invalid categories and forged confirmation provenance', function (array $invalid) {
    [$admin, $task] = processingFixture();
    $this->actingAs($admin)->postJson(route('api.tasks.processing', $task), processingPayload($invalid))->assertUnprocessable();
    $this->assertDatabaseCount('pickup_processing_records', 0);
})->with(array_map(fn (array $invalid) => [$invalid], [['successful_quantity' => -1], ['failed_quantity' => '1.5'], ['unknown_quantity' => 1000001], ['reason' => ''], ['category' => 'other'], ['system' => 'guessed'], ['source' => 'EXTERNAL'], ['status' => 'SUCCESS'], ['actor_id' => 1], ['confirmed_at' => '2026-10-19']]));

test('only active admins can record or amend package processing', function (string $role, bool $active) {
    [, $task] = processingFixture();
    $actor = User::factory()->create(['role' => $role, 'is_active' => $active]);
    $this->actingAs($actor)->postJson(route('api.tasks.processing', $task), processingPayload())->assertForbidden();
    $this->assertDatabaseCount('pickup_processing_records', 0);
})->with([['pickup_staff', true], ['retail_staff', true], ['cs', true], ['admin_supervisor', false]]);

test('known pending and unknown manual outcomes remain distinct from system confirmed success', function (int $pending, int $unknown, string $status) {
    [$admin, $task] = processingFixture();
    $this->actingAs($admin)->postJson(route('api.tasks.processing', $task), processingPayload(['successful_quantity' => 2, 'failed_quantity' => 0, 'pending_quantity' => $pending, 'unknown_quantity' => $unknown]))->assertOk();
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'processing_status' => $status, 'provenance' => 'MANUAL']))
        ->assertInertia(fn (Assert $page) => $page->where('processing.summary.category_count', 1)->where('processing.summary.confirmed_quantity', null)->where('processing.summary.failed_quantity', 0));
})->with([[2, 0, 'PENDING'], [0, 2, 'UNKNOWN'], [0, 0, 'MANUAL_RECORDED']]);

test('manual records before Retail verification are accepted as unconfirmed evidence for reconciliation', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->state(['scheduled_at' => now()])->create(['status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $this->actingAs($admin)->postJson(route('api.tasks.processing', $task), processingPayload(['expected_handover_revision' => null]))->assertOk();
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'category' => 'manual_hybrid']))->assertInertia(fn (Assert $page) => $page->where('processing.rows.data.0.received_quantity', null)->where('processing.rows.data.0.reconciliation_required', 1));
    $unfinalized = PickupTask::factory()->state(['scheduled_at' => now()])->create();
    $this->postJson(route('api.tasks.processing', $unfinalized), processingPayload(['expected_handover_revision' => null]))->assertConflict();
});

test('processing CSV matches category-filtered metrics and old CSV keeps one row per pickup', function () {
    [$admin, $task] = processingFixture();
    $this->actingAs($admin)->postJson(route('api.tasks.processing', $task), processingPayload())->assertOk();
    $response = $this->get(route('pickup-results.export', ['monitoring' => 'processing', 'category' => 'manual_hybrid', 'processing_system' => 'JNE_HYBRID', 'provenance' => 'MANUAL']))->assertOk();
    $stream = fopen('php://temp', 'r+');
    fwrite($stream, substr($response->streamedContent(), 3));
    rewind($stream);
    $header = fgetcsv($stream, escape: '');
    $values = array_combine($header, fgetcsv($stream, escape: ''));
    fclose($stream);
    expect($values['pop_quantity'])->toBe('10');
    expect($values['received_quantity'])->toBe('12');
    expect($values['manual_quantity'])->toBe('5');
    expect($values['confirmed_quantity'])->toBe('');
    expect($values['unconfirmed_quantity'])->toBe('12');
    expect($values['processing_source'])->toBe('Dicatat Manual');
    expect($values['external_confirmation_available'])->toBe('Tidak tersedia');
    $original = $this->get(route('pickup-results.export', ['reference' => $task->reference]))->assertOk()->streamedContent();
    expect(substr_count($original, "\n"))->toBe(2);
    expect($original)->toContain('manual_recorded_quantity')->toContain('received_manual_hybrid')->toContain('Dicatat Manual');
});

test('filter combinations pagination and sorting retain authoritative processing aggregates', function () {
    [$admin, $task] = processingFixture();
    $this->actingAs($admin)->postJson(route('api.tasks.processing', $task), processingPayload())->assertOk();
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'reference' => $task->reference, 'category' => 'manual_hybrid', 'reconciliation' => 'no', 'provenance' => 'MANUAL', 'processing_system' => 'JNE_HYBRID', 'processing_status' => 'FAILED', 'processing_sort' => 'manual_quantity', 'direction' => 'asc', 'per_page' => 10]))
        ->assertInertia(fn (Assert $page) => $page->where('processing.rows.total', 1)->where('processing.summary.manual_quantity', 5)->where('processing.rows.data.0.id', $task->id));
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'provenance' => 'EXTERNAL']))->assertInertia(fn (Assert $page) => $page->where('processing.rows.total', 0)->where('processing.summary.confirmed_quantity', null));
    $this->getJson(route('pickup-results.index', ['monitoring' => 'processing', 'processing_sort' => 'password']))->assertUnprocessable();
});

test('history pagination keeps only current snapshots in monitoring and never loses prior evidence', function () {
    [$admin, $task] = processingFixture();
    $this->actingAs($admin);
    for ($revision = 0; $revision < 23; $revision++) {
        $this->postJson(route('api.tasks.processing', $task), processingPayload(['expected_revision' => $revision, 'successful_quantity' => $revision, 'failed_quantity' => 0, 'pending_quantity' => 0]))->assertOk();
    }
    $this->get(route('pickup-results.show', [$task, 'tab' => 'processing', 'processing_page' => 2]))->assertInertia(fn (Assert $page) => $page->where('processing.history.total', 23)->has('processing.history.data', 3)->where('processing.latest.0.revision', 23));
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'category' => 'manual_hybrid']))->assertInertia(fn (Assert $page) => $page->where('processing.summary.manual_quantity', 22));
});

test('large processing exports stream category rows with bounded queries instead of loading entire frontend data', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create();
    $tasks = PickupTask::factory()->state(['scheduled_at' => now()])->count(351)->create(['status' => 'PICKED_UP', 'customer_id' => $customer->id, 'created_by' => $admin->id, 'customer_name_snapshot' => 'Processing Scale']);
    foreach ($tasks as $task) {
        PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $admin->id, 'css_orion' => 1]);
    }
    $this->actingAs($admin);
    DB::enableQueryLog();
    $start = hrtime(true);
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'per_page' => 10]))->assertInertia(fn (Assert $page) => $page->where('processing.rows.total', 1053)->has('processing.rows.data', 10)->where('processing.summary.pop_quantity', 1404));
    $small = count(DB::getQueryLog());
    DB::flushQueryLog();
    $this->get(route('pickup-results.index', ['monitoring' => 'processing', 'per_page' => 50]))->assertInertia(fn (Assert $page) => $page->has('processing.rows.data', 50));
    expect(count(DB::getQueryLog()))->toBe($small);
    DB::flushQueryLog();
    $csv = $this->get(route('pickup-results.export', ['monitoring' => 'processing']))->assertOk()->streamedContent();
    $chunks = collect(DB::getQueryLog())->filter(fn ($entry) => str_contains($entry['query'], 'limit 500'))->count();
    DB::disableQueryLog();
    expect(substr_count($csv, "\n"))->toBe(1054);
    expect($chunks)->toBe(3);
    File::ensureDirectoryExists(storage_path('hasil-pickup'));
    file_put_contents(storage_path('hasil-pickup/processing-performance.json'), json_encode(['category_rows' => 1053, 'page_queries' => $small, 'two_pages_and_export_ms' => round((hrtime(true) - $start) / 1e6, 2)]));
});

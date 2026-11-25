<?php

use App\Actions\Pickup\DeliverPickupAwbManifest;
use App\Actions\Pickup\QueryReconciliationWorkspace;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Pickup\RenderPickupAwbManifest;
use App\Jobs\RenderPickupAwbManifestJob;
use App\Mail\PickupAwbManifestMail;
use App\Models\CustomerAwbDeliveryPreference;
use App\Models\JneShipment;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupCustomerReconciliation;
use App\Models\PickupPendingItem;
use App\Models\User;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-11-20 08:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'pickup.automation.auto_lock' => false, 'pickup.automation.send_enabled' => false,
        'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    Queue::fake();
    Storage::fake('jne_reports');
    Storage::fake('local');
});

function exceptionClosureFixture(int $expected = 10, int $actual = 9): array
{
    $fixture = pickupAutomationFixture($expected, 0);
    $fixture['job'] = importPickupAutomationReport($fixture, $actual, 0);
    $fixture['retail'] = User::factory()->create(['role' => 'retail_staff', 'is_active' => true]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);

    return $fixture;
}

function exceptionClosureBody(array $fixture): array
{
    $workspace = app(QueryReconciliationWorkspace::class)->handle($fixture['task']);

    return ['action' => 'CLOSE_WITH_EXCEPTION', 'expected_revision' => $workspace['version'], 'fingerprint' => $workspace['fingerprint'],
        'review_token' => $workspace['review_token'], 'reason_code' => 'PENDING_GOODS', 'reason' => 'Satu paket pending atas permintaan customer.'];
}

test('retail closes a shortfall with an immutable explanation without changing POP handover or pending quantities', function () {
    $fixture = exceptionClosureFixture();
    $pending = PickupPendingItem::factory()->create(['pickup_task_id' => $fixture['task']->id, 'created_by' => $fixture['admin']->id, 'updated_by' => $fixture['admin']->id]);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $proof = $fixture['task']->proof->fresh()->getAttributes();
    $handover = $fixture['task']->handoverItem->fresh()->getAttributes();
    $this->actingAs($fixture['retail'])->getJson(route('reconciliation-workspace.show', $fixture['task']))->assertOk()
        ->assertJsonPath('capabilities.review', false)->assertJsonPath('capabilities.close_with_explanation', true)->assertJsonPath('closure.ready', true);
    $body = exceptionClosureBody($fixture);
    $this->postJson(route('reconciliation-workspace.lock', $fixture['task']), $body)->assertOk();
    $group = PickupCustomerReconciliation::sole();
    expect($group->status)->toBe('DONE')->and($group->approval_snapshot['mode'])->toBe('EXCEPTION')
        ->and($group->approval_snapshot['included_count'])->toBe(9)->and($group->approval_snapshot['reviewer']['id'])->toBe($fixture['retail']->id)
        ->and($group->approval_snapshot['exception']['reason_code'])->toBe('PENDING_GOODS');
    expect($fixture['task']->proof->fresh()->getAttributes())->toBe($proof)
        ->and($fixture['task']->handoverItem->fresh()->getAttributes())->toBe($handover)->and($pending->fresh()->status)->toBe('PENDING');
    $manifest = PickupAwbManifest::sole();
    expect($manifest->snapshot['categories']['manual_hybrid']['pop'])->toBe(10)
        ->and($manifest->snapshot['categories']['manual_hybrid']['confirmed'])->toBe(9)
        ->and($manifest->snapshot['closure']['explanation'])->toBe($body['reason']);
    expect(DB::table('pickup_awb_manifest_items')->count())->toBe(9);
    Queue::assertPushed(RenderPickupAwbManifestJob::class, 1);

    $this->postJson(route('reconciliation-workspace.lock', $fixture['task']), $body)->assertOk()->assertJsonPath('action', 'ALREADY_CLOSED');
    Queue::assertPushed(RenderPickupAwbManifestJob::class, 1);
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
    expect(DB::table('pickup_customer_reconciliation_events')->get()->filter(fn ($row) => (json_decode($row->snapshot, true)['event'] ?? '') === 'CLOSE_WITH_EXCEPTION')->count())->toBe(1);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    expect($group->fresh()->status)->toBe('DONE')->and($group->fresh()->post_lock_change)->toBeNull()
        ->and($group->fresh()->approval_snapshot)->toBe($group->approval_snapshot)->and($manifest->fresh()->status)->toBe('PENDING');
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
});

test('the 12 hour deadline starts at warehouse validation and late closure remains possible', function () {
    $fixture = exceptionClosureFixture();
    $due = $fixture['task']->handoverItem->verified_at->addHours(12)->toIso8601String();
    $this->actingAs($fixture['retail'])->getJson(route('reconciliation-workspace.show', $fixture['task']))->assertOk()->assertJsonPath('closure.due_at', $due)->assertJsonPath('closure.overdue', false);
    $this->travel(13)->hours();
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $this->getJson(route('reconciliation-workspace.show', $fixture['task']))->assertOk()->assertJsonPath('closure.due_at', $due)->assertJsonPath('closure.overdue', true);
    $this->postJson(route('reconciliation-workspace.lock', $fixture['task']), exceptionClosureBody($fixture))->assertOk();
    expect(PickupCustomerReconciliation::sole()->approval_snapshot['exception']['overdue'])->toBeTrue();
});

test('closure requires validation latest evidence and a complete reason', function (string $condition) {
    $fixture = exceptionClosureFixture();
    $body = exceptionClosureBody($fixture);
    match ($condition) {
        'missing_reason' => $body['reason'] = '',
        'unknown_reason' => $body['reason_code'] = 'INVALID',
        'stale_revision' => $body['expected_revision'] = 0,
        'stale_evidence' => JneShipment::firstOrFail()->increment('version'),
        'not_validated' => $fixture['task']->handoverItem->update(['status' => 'PENDING', 'verified_at' => null]),
    };
    $response = $this->actingAs($fixture['retail'])->postJson(route('reconciliation-workspace.lock', $fixture['task']), $body);
    if (in_array($condition, ['missing_reason', 'unknown_reason'], true)) {
        $response->assertUnprocessable();
    } else {
        $response->assertConflict();
    }
    expect(PickupCustomerReconciliation::sole()->approval_snapshot)->toBeNull();
    Queue::assertNotPushed(RenderPickupAwbManifestJob::class);
})->with(['missing_reason', 'unknown_reason', 'stale_revision', 'stale_evidence', 'not_validated']);

test('pickup staff and inactive retail cannot close and retail cannot reopen or change attribution', function (string $role, bool $active) {
    $fixture = exceptionClosureFixture();
    $user = User::factory()->create(['role' => $role, 'is_active' => $active]);
    $this->actingAs($user)->postJson(route('reconciliation-workspace.lock', $fixture['task']), exceptionClosureBody($fixture))->assertForbidden();
    Queue::assertNotPushed(RenderPickupAwbManifestJob::class);
})->with([['pickup_staff', true], ['cs', true], ['retail_staff', false]]);

test('retail can open the reconciliation page but cannot use admin mutation endpoints', function () {
    $fixture = exceptionClosureFixture();
    $this->actingAs($fixture['retail'])->get(route('pickup-automation.index'))->assertOk();
    $this->getJson(route('pickup-automation.show', $fixture['task']))->assertOk();
    $this->postJson(route('reconciliation-workspace.lock', $fixture['task']), ['action' => 'REOPEN'])->assertForbidden();
    $this->postJson(route('reconciliation-workspace.apply', $fixture['task']), [])->assertForbidden();
    $this->postJson(route('pickup-automation.bulk-recheck'), [])->assertForbidden();
    Queue::assertNotPushed(RenderPickupAwbManifestJob::class);
});

test('excess and zero available resi may be closed with an explanation', function (int $actual) {
    $fixture = exceptionClosureFixture(2, $actual);
    $body = [...exceptionClosureBody($fixture), 'reason_code' => 'OTHER', 'reason' => 'Jumlah berbeda setelah pemeriksaan fisik dan bukti sumber.'];
    $this->actingAs($fixture['retail'])->postJson(route('reconciliation-workspace.lock', $fixture['task']), $body)->assertOk();
    expect(PickupCustomerReconciliation::sole()->status)->toBe('DONE')->and(PickupAwbManifest::sole()->snapshot['categories']['manual_hybrid']['confirmed'])->toBe($actual);
    Queue::assertPushed(RenderPickupAwbManifestJob::class, 1);
})->with([0, 3]);

test('late material evidence creates a discrepancy and never changes or silently resends the closed report', function () {
    $fixture = exceptionClosureFixture();
    $this->actingAs($fixture['retail'])->postJson(route('reconciliation-workspace.lock', $fixture['task']), exceptionClosureBody($fixture))->assertOk();
    $approved = PickupCustomerReconciliation::sole()->approval_snapshot;
    $manifest = PickupAwbManifest::sole()->getAttributes();
    importPickupAutomationReport($fixture, 10, 0);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $group = PickupCustomerReconciliation::sole();
    expect($group->approval_snapshot)->toBe($approved)->and($group->post_lock_change)->not->toBeNull()
        ->and(PickupAwbManifest::sole()->snapshot)->toBe(json_decode($manifest['snapshot'], true))->and(PickupAwbManifest::sole()->status)->toBe('REVIEW');
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
    Queue::assertPushed(RenderPickupAwbManifestJob::class, 1);
});

test('a warehouse discrepancy may be explained without replacing either finalized count', function () {
    $fixture = exceptionClosureFixture();
    $fixture['task']->handoverItem->update(['manual_hybrid' => 8, 'status' => 'DISCREPANCY', 'discrepancy_notes' => 'Diterima delapan paket.']);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $this->actingAs($fixture['retail'])->postJson(route('reconciliation-workspace.lock', $fixture['task']), exceptionClosureBody($fixture))->assertOk();
    $categories = PickupAwbManifest::sole()->snapshot['categories']['manual_hybrid'];
    expect($categories['pop'])->toBe(10)->and($categories['received'])->toBe(8)->and($categories['confirmed'])->toBe(9, JneShipment::get(['awb', 'pickup_task_id', 'customer_match_status', 'match_status', 'match_method', 'category_status'])->toJson());
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    expect(PickupCustomerReconciliation::sole()->status)->toBe('DONE')->and(PickupCustomerReconciliation::sole()->post_lock_change)->toBeNull();
    Queue::assertPushed(RenderPickupAwbManifestJob::class, 1);
});

test('a failed import cannot be accepted as valid AWB evidence by the closure shortcut', function () {
    $fixture = exceptionClosureFixture();
    $fixture['job']->update(['projection_status' => 'FAILED']);
    $this->actingAs($fixture['retail'])->postJson(route('reconciliation-workspace.lock', $fixture['task']), exceptionClosureBody($fixture))->assertConflict();
    expect(PickupCustomerReconciliation::sole()->approval_snapshot)->toBeNull();
    Queue::assertNotPushed(RenderPickupAwbManifestJob::class);
});

test('closed report renders the explanation and uses the existing idempotent customer delivery flow', function () {
    $fixture = exceptionClosureFixture();
    config(['pickup.automation.enabled' => true, 'pickup.automation.send_enabled' => true, 'mail.default' => 'smtp']);
    CustomerAwbDeliveryPreference::factory()->create(['customer_id' => $fixture['customer']->id, 'enabled' => true, 'recipient' => 'customer@example.test']);
    $body = exceptionClosureBody($fixture);
    $this->actingAs($fixture['retail'])->postJson(route('reconciliation-workspace.lock', $fixture['task']), $body)->assertOk();
    Process::fake(function (PendingProcess $process) {
        file_put_contents($process->command[3], "%PDF-1.4\nfixture\n%%EOF");

        return Process::result();
    });
    $manifest = PickupAwbManifest::sole();
    app(RenderPickupAwbManifest::class)->handle($manifest->id);
    expect($manifest->fresh()->status)->toBe('READY');
    $mail = new PickupAwbManifestMail($manifest->fresh(), 'fixture-key');
    $mail->assertSeeInHtml($body['reason']);
    $mail->assertSeeInHtml('Pickup: 10 paket');
    $mail->assertSeeInHtml('Resi terkonfirmasi: 9');
    Mail::fake();
    $delivery = PickupAwbDelivery::sole();
    app(DeliverPickupAwbManifest::class)->handle($delivery->id);
    app(DeliverPickupAwbManifest::class)->handle($delivery->id);
    Mail::assertSent(PickupAwbManifestMail::class, 1);
    expect($delivery->fresh()->status)->toBe('UNKNOWN');
    $this->assertDatabaseCount('pickup_awb_delivery_attempts', 1);
    Queue::assertPushed(RenderPickupAwbManifestJob::class, 1);
});

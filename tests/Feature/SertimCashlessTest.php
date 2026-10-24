<?php

use App\Actions\Handover\CloseSession;
use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\RecordCashlessAwb;
use App\Jobs\ImportJneReportAwbs;
use App\Models\HandoverSession;
use App\Models\JneShipment;
use App\Models\JneShipperAlias;
use App\Models\PickupCashlessAwb;
use App\Models\PickupCashlessAwbEvent;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

function sertimTask(string $role = 'pickup_staff'): array
{
    $staff = User::factory()->create(['role' => $role]);
    $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED', 'execution_started_at' => now()]);

    return [$staff, $task];
}

function sertimEntry(User $staff, PickupTask $task, string $awb = '0001'): PickupCashlessAwb
{
    return app(RecordCashlessAwb::class)->handle($staff, $task->id, ['awb' => $awb, 'submission_key' => (string) Str::uuid()]);
}

function sertimClose(PickupTask $task): HandoverSession
{
    $task->update(['status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $task->assigned_staff_id, 'manual_hybrid' => 0, 'cashless_hybrid' => 3, 'css_orion' => 100]);
    $retail = User::factory()->create(['role' => 'retail_staff']);
    $session = app(CreateSession::class)->handle($retail, [$task->id], (string) Str::uuid());
    $item = $session->items()->sole();
    $session = app(VerifyItem::class)->handle($retail, $session->id, $item->id, ['expected_version' => 1, 'manual_hybrid' => 0, 'cashless_hybrid' => 3, 'css_orion' => 100]);

    return app(CloseSession::class)->handle($retail, $session->id, $session->version);
}

function sertimImport(string $csv): ReportJob
{
    $job = ReportJob::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'status' => 'COMPLETED',
        'file_path' => 'sertim/'.Str::uuid().'.csv', 'file_checksum' => hash('sha256', $csv), 'completed_at' => now()]);
    Storage::disk('jne_reports')->put($job->file_path, $csv);
    ImportJneReportAwbs::dispatchSync($job->id);
    expect($job->fresh()->projection_status)->toBe('PROJECTED');

    return $job;
}

test('assigned executing staff record normalized cashless AWBs idempotently without inventing a collected shipment', function () {
    [$staff, $task] = sertimTask();
    $payload = ['awb' => 'cgk0001', 'submission_key' => (string) Str::uuid(), 'customer_id' => 99999];

    $id = $this->actingAs($staff)->postJson(route('api.cashless-awbs.store', $task), $payload)->assertOk()->assertJsonPath('data.awb', 'CGK0001')->json('data.id');
    $this->postJson(route('api.cashless-awbs.store', $task), $payload)->assertOk()->assertJsonPath('data.id', $id);

    $this->assertDatabaseCount('pickup_cashless_awbs', 1);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 1);
    $this->assertDatabaseCount('jne_shipments', 0);
    $this->assertDatabaseHas('pickup_cashless_awbs', ['id' => $id, 'original_awb' => 'cgk0001', 'customer_id' => $task->customer_id]);
    $this->getJson(route('api.cashless-awbs.index', $task))->assertOk()->assertJsonPath('reconciliation.awaiting_source_awbs', 1)->assertJsonPath('reconciliation.missing_quantity', null);
});

test('pickup and retail staff cannot add or correct evidence after POP finalization at either API or service boundary', function (string $role) {
    [$staff, $task] = sertimTask($role);
    $record = sertimEntry($staff, $task);
    $task->update(['status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $data = ['awb' => '0002', 'submission_key' => (string) Str::uuid(), 'evidence_id' => $record->id, 'expected_version' => 1, 'reason' => 'Try correction'];

    $this->actingAs($staff)->postJson(route('api.cashless-awbs.correct', $task), $data)->assertForbidden();
    $this->postJson(route('api.cashless-awbs.store', $task), ['awb' => '0002', 'submission_key' => (string) Str::uuid()])->assertForbidden();
    expect(fn () => app(RecordCashlessAwb::class)->handle($staff, $task->id, $data, true))->toThrow(AuthorizationException::class);

    $this->assertDatabaseHas('pickup_cashless_awbs', ['id' => $record->id, 'awb' => '0001', 'version' => 1]);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 1);
})->with(['pickup_staff', 'retail_staff']);

test('Admin correction after closure audits before and after matches while preserving POP and physical handover history', function () {
    Storage::fake('jne_reports');
    [$staff, $task] = sertimTask();
    $record = sertimEntry($staff, $task);
    $session = sertimClose($task);
    sertimImport("AWB,ID_ACCOUNT,SHIPPER_NAME\n0001,SHARED,Shopee International\n0002,SHARED,Tokopedia\n");
    $proofBefore = $task->proof()->first()->getAttributes();
    $itemBefore = $session->items()->sole()->getAttributes();
    $closureBefore = $session->getAttributes();
    $eventCount = $session->events()->count();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $data = ['awb' => '0002', 'evidence_id' => $record->id, 'expected_version' => 1, 'submission_key' => (string) Str::uuid(), 'reason' => 'Scanned label verified against original package'];

    $this->actingAs($admin)->postJson(route('api.cashless-awbs.correct', $task), $data)->assertOk()->assertJsonPath('data.version', 2);
    $this->postJson(route('api.cashless-awbs.correct', $task), $data)->assertOk();

    $this->assertDatabaseHas('pickup_cashless_awbs', ['id' => $record->id, 'original_awb' => '0001', 'awb' => '0002']);
    $this->assertDatabaseHas('jne_shipments', ['awb' => '0001', 'pickup_task_id' => null, 'customer_id' => null, 'match_status' => 'UNMATCHED']);
    $this->assertDatabaseHas('jne_shipments', ['awb' => '0002', 'pickup_task_id' => $task->id, 'customer_id' => $task->customer_id, 'match_status' => 'MATCHED']);
    $audit = PickupCashlessAwbEvent::orderByDesc('id')->first();
    expect($audit->actor_id)->toBe($admin->id);
    expect($audit->previous_awb)->toBe('0001');
    expect($audit->awb)->toBe('0002');
    expect($audit->reason)->toBe($data['reason']);
    expect($audit->created_at)->not->toBeNull();
    expect($audit->affected_results['before']['shipments'][0]['pickup_task_id'])->toBe($task->id);
    expect($audit->affected_results['after']['shipments'][0]['pickup_task_id'])->toBeNull();
    expect($task->proof()->first()->getAttributes())->toBe($proofBefore);
    expect($session->items()->sole()->getAttributes())->toBe($itemBefore);
    expect($session->fresh()->getAttributes())->toBe($closureBefore);
    expect($session->events()->count())->toBe($eventCount);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 2);
});

test('closing a handover blocks normal entries but late Hybrid APEX imports still match and reconcile', function () {
    Storage::fake('jne_reports');
    [$staff, $task] = sertimTask();
    sertimEntry($staff, $task);
    $session = sertimClose($task);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->postJson(route('api.cashless-awbs.store', $task), ['awb' => '0002', 'submission_key' => (string) Str::uuid()])->assertForbidden();
    sertimImport("AWB,ID_ACCOUNT,SHIPPER_NAME\n0001,SHARED,Shopee International\n");

    $this->actingAs($staff)->getJson(route('api.cashless-awbs.index', $task))->assertOk()
        ->assertJsonPath('reconciliation.window', 'CLOSED')->assertJsonPath('reconciliation.confirmed_awbs', 1)
        ->assertJsonPath('reconciliation.shortfall_quantity', 2)->assertJsonPath('reconciliation.missing_quantity', null)
        ->assertJsonPath('reconciliation.collection_complete', false);
    expect($session->fresh()->status)->toBe('CLOSED');
    expect($task->proof()->first()->cashless_hybrid)->toBe(3);
});

test('handover reopen retains the first Sertim closure and does not permit normal staff entry', function () {
    [$staff, $task] = sertimTask();
    $session = sertimClose($task);
    $firstClosed = $session->sertim_closed_at;
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->postJson(route('api.handovers.reopen', $session), ['expected_version' => $session->version, 'reason' => 'Review receiving history'])->assertOk();

    expect($session->fresh()->status)->toBe('IN_VERIFICATION');
    expect($session->fresh()->sertim_closed_at->equalTo($firstClosed))->toBeTrue();
    $this->actingAs($staff)->postJson(route('api.cashless-awbs.store', $task), ['awb' => '0002', 'submission_key' => (string) Str::uuid()])->assertForbidden();
    $this->getJson(route('api.cashless-awbs.index', $task))->assertOk()->assertJsonPath('reconciliation.window', 'CLOSED');
});

test('Retail cannot add replace or revoke Sertim AWBs after handover closure', function () {
    [$retail, $task] = sertimTask('retail_staff');
    $record = sertimEntry($retail, $task);
    sertimClose($task);
    $base = ['submission_key' => (string) Str::uuid(), 'evidence_id' => $record->id, 'expected_version' => 1, 'reason' => 'Attempt after closure'];

    $this->actingAs($retail)->postJson(route('api.cashless-awbs.store', $task), ['awb' => '0002', 'submission_key' => (string) Str::uuid()])->assertForbidden();
    $this->postJson(route('api.cashless-awbs.correct', $task), [...$base, 'awb' => '0002'])->assertForbidden();
    $this->postJson(route('api.cashless-awbs.correct', $task), [...$base, 'awb' => null])->assertForbidden();

    $this->assertDatabaseHas('pickup_cashless_awbs', ['id' => $record->id, 'awb' => '0001', 'version' => 1]);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 1);
});

test('audit history is paginated and cannot be read through another pickup', function () {
    [$staff, $task] = sertimTask();
    $record = sertimEntry($staff, $task);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $other = PickupTask::factory()->create();

    $this->actingAs($admin)->getJson(route('api.cashless-awbs.history', [$task, $record->id]))->assertOk()
        ->assertJsonPath('data.0.awb', '0001')->assertJsonPath('data.0.actor_id', $staff->id)->assertJsonPath('total', 1);
    $this->getJson(route('api.cashless-awbs.history', [$other, $record->id]))->assertNotFound();
});

test('duplicate and conflicting claim corrections are rejected without changing either customer or audit history', function () {
    [$staff, $task] = sertimTask();
    $one = sertimEntry($staff, $task, '0001');
    [$otherStaff, $otherTask] = sertimTask();
    sertimEntry($otherStaff, $otherTask, '0002');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->postJson(route('api.cashless-awbs.correct', $task), ['awb' => '0002', 'evidence_id' => $one->id, 'expected_version' => 1, 'submission_key' => (string) Str::uuid(), 'reason' => 'Check duplicate'])->assertUnprocessable()->assertJsonValidationErrors('awb');

    $this->assertDatabaseHas('pickup_cashless_awbs', ['id' => $one->id, 'awb' => '0001', 'customer_id' => $task->customer_id, 'version' => 1]);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 2);
});

test('an exact registered owner conflicting with Sertim is flagged instead of confirming a marketplace account owner', function () {
    Storage::fake('jne_reports');
    [$staff, $task] = sertimTask();
    sertimEntry($staff, $task);
    JneShipperAlias::factory()->create(['shipper_name' => 'OTHER VERIFIED OWNER']);

    sertimImport("AWB,ID_ACCOUNT,SHIPPER_NAME\n0001,SHARED,OTHER VERIFIED OWNER\n");

    expect(JneShipment::sole()->customer_match_status)->toBe('CONFLICT');
    expect(JneShipment::sole()->customer_id)->toBeNull();
    expect(JneShipment::sole()->pickup_task_id)->toBeNull();
});

test('Admin late entry and revocation preserve original evidence and require a reason and current version', function () {
    [$staff, $task] = sertimTask();
    sertimClose($task);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $data = ['awb' => '0001', 'submission_key' => (string) Str::uuid(), 'reason' => 'Late label evidence checked'];
    $this->actingAs($admin)->postJson(route('api.cashless-awbs.correct', $task), [...$data, 'reason' => ''])->assertUnprocessable()->assertJsonValidationErrors('reason');
    $id = $this->postJson(route('api.cashless-awbs.correct', $task), $data)->assertOk()->json('data.id');
    $this->postJson(route('api.cashless-awbs.correct', $task), [...$data, 'awb' => '0002'])->assertConflict();
    $revoke = ['awb' => null, 'evidence_id' => $id, 'expected_version' => 1, 'submission_key' => (string) Str::uuid(), 'reason' => 'Incorrect label removed from this pickup'];

    $this->postJson(route('api.cashless-awbs.correct', $task), $revoke)->assertOk()->assertJsonPath('data.awb', null);
    $this->postJson(route('api.cashless-awbs.correct', $task), [...$revoke, 'awb' => '0003', 'submission_key' => (string) Str::uuid()])->assertConflict();

    $this->assertDatabaseHas('pickup_cashless_awbs', ['id' => $id, 'awb' => null, 'original_awb' => '0001']);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 2);
});

test('Sertim prevents guest inactive wrong role and unrelated task access', function () {
    [$staff, $task] = sertimTask();
    sertimEntry($staff, $task);
    $this->getJson(route('api.cashless-awbs.index', $task))->assertUnauthorized();
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']))->getJson(route('api.cashless-awbs.index', $task))->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]))->getJson(route('api.cashless-awbs.index', $task))->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'cs']))->postJson(route('api.cashless-awbs.correct', $task), [])->assertForbidden();
});

test('invalid normalized AWBs never create evidence', function (string $awb) {
    [$staff, $task] = sertimTask();

    $this->actingAs($staff)->postJson(route('api.cashless-awbs.store', $task), ['awb' => $awb, 'submission_key' => (string) Str::uuid()])->assertUnprocessable()->assertJsonValidationErrors('awb');

    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 0);
})->with(['bad space', '<script>', '12/34', str_repeat('1', 101)]);

test('failed audit persistence rolls back the claim and its derived matches', function () {
    [$staff, $task] = sertimTask();
    Event::listen('eloquent.creating: '.PickupCashlessAwbEvent::class, fn () => throw new RuntimeException('synthetic audit failure'));

    expect(fn () => sertimEntry($staff, $task))->toThrow(RuntimeException::class);

    $this->assertDatabaseCount('pickup_cashless_awbs', 0);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 0);
});

test('a failed correction audit rolls back both AWB ownership re-evaluations', function () {
    Storage::fake('jne_reports');
    [$staff, $task] = sertimTask();
    $record = sertimEntry($staff, $task);
    sertimClose($task);
    sertimImport("AWB,ID_ACCOUNT,SHIPPER_NAME\n0001,SHARED,Shopee International\n0002,SHARED,Tokopedia\n");
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    Event::listen('eloquent.creating: '.PickupCashlessAwbEvent::class, fn () => throw new RuntimeException('synthetic audit failure'));

    expect(fn () => app(RecordCashlessAwb::class)->handle($admin, $task->id, ['awb' => '0002', 'evidence_id' => $record->id, 'expected_version' => 1, 'submission_key' => (string) Str::uuid(), 'reason' => 'Check rollback'], true))->toThrow(RuntimeException::class);

    $this->assertDatabaseHas('pickup_cashless_awbs', ['id' => $record->id, 'awb' => '0001', 'version' => 1]);
    $this->assertDatabaseHas('jne_shipments', ['awb' => '0001', 'pickup_task_id' => $task->id, 'customer_match_status' => 'MATCHED']);
    $this->assertDatabaseHas('jne_shipments', ['awb' => '0002', 'pickup_task_id' => null, 'customer_id' => null]);
    $this->assertDatabaseCount('pickup_cashless_awb_events', 1);
});

test('closure upgrade backfills the first close from audit events even for a reopened handover', function () {
    [$staff, $task] = sertimTask();
    $session = sertimClose($task);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin)->postJson(route('api.handovers.reopen', $session), ['expected_version' => $session->version, 'reason' => 'Review'])->assertOk();
    $closedAt = $session->sertim_closed_at;
    Schema::table('handover_sessions', fn (Blueprint $table) => $table->dropColumn('sertim_closed_at'));
    $migration = require database_path('migrations/2026_10_24_151742_add_sertim_closed_at_to_handover_sessions.php');

    $migration->up();

    expect($session->fresh()->sertim_closed_at->equalTo($closedAt))->toBeTrue();
    expect($session->fresh()->status)->toBe('IN_VERIFICATION');
});

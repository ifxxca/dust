<?php

use App\Actions\Pickup\ImportPickupHistory;
use App\Actions\Pickup\PickupResultPeriod;
use App\Models\Customer;
use App\Models\HandoverItem;
use App\Models\HandoverSession;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

function pickupHistoryFixture(): array
{
    return ['source_name' => 'history.xlsx', 'source_sha256' => hash('sha256', 'history'), 'rows' => [[
        'row' => 2, 'reference' => 'JNE/123/20261002043000', 'type' => 'Pickup',
        'customer_code' => '4000', 'customer_name' => 'Vanny', 'staff' => "Legacy Courier\n",
        'quantities' => [50, 50, 0], 'total' => 100, 'verified' => true,
        'verifier' => 'Legacy Warehouse', 'warehouse' => [60, 40, 0], 'warehouse_total' => 100,
        'picked_up_at' => '2026-10-02 04:30:00',
        'raw' => ['Kode Customer' => '4000', 'Status Tarikan (Finance)' => 'Tarikan OK', 'Diverif Finance Oleh' => 'Legacy Finance',
            'Total Tarikan (Finance)' => 100, 'Status Rekap PDF' => 'Whatsapp'],
    ]]];
}

test('history preview resolves identities without changing data', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    Customer::factory()->recycle($admin)->create(['customer_code' => '4000', 'name' => 'Vanny']);

    $result = app(ImportPickupHistory::class)->handle(pickupHistoryFixture(), $admin->id);

    expect($result['applied'])->toBeFalse();
    expect($result['summary'])->toMatchArray(['pickups_new' => 1, 'users_archived' => 3, 'total_awb' => 100, 'warehouse_discrepancies' => 1]);
    $this->assertDatabaseCount('users', 1);
    $this->assertDatabaseCount('pickup_tasks', 0);
    $this->assertDatabaseCount('handover_sessions', 0);
});

test('history import preserves quantities actors source evidence and operational date without sending receipts', function () {
    $this->travelTo('2026-10-27 12:00:00');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    Customer::factory()->recycle($admin)->create(['customer_code' => '4000', 'name' => 'Vanny']);
    Queue::fake();

    $result = app(ImportPickupHistory::class)->handle(pickupHistoryFixture(), $admin->id, true);

    expect($result['summary']['pickups_new'])->toBe(1);
    $task = PickupTask::sole();
    expect($task->customer_name_snapshot)->toBe('Vanny');
    expect($task->assignedStaff->name)->toBe('Legacy Courier');
    expect($task->assignedStaff->is_active)->toBeFalse();
    expect($task->proof->only(['manual_hybrid', 'cashless_hybrid', 'css_orion']))->toBe(['manual_hybrid' => 50, 'cashless_hybrid' => 50, 'css_orion' => 0]);
    expect($task->proof->picked_up_at->format('Y-m-d H:i:s'))->toBe('2026-10-01 21:30:00');
    expect(PickupResultPeriod::date($task->proof->picked_up_at)->toDateString())->toBe('2026-10-01');
    expect($task->proof->notes)->toContain('Tarikan OK', 'Whatsapp', 'Legacy Finance');
    $item = HandoverItem::sole();
    expect($item->status)->toBe('DISCREPANCY');
    expect($item->verified_at)->toBeNull();
    expect(HandoverSession::sole()->status)->toBe('IN_VERIFICATION');
    expect(HandoverSession::sole()->closed_at)->toBeNull();
    $this->assertDatabaseHas('users', ['name' => 'Legacy Warehouse', 'is_active' => false]);
    $this->assertDatabaseHas('users', ['name' => 'Legacy Finance', 'is_active' => false]);
    $this->assertDatabaseHas('pickup_task_events', ['action' => 'history_imported', 'actor_id' => $admin->id]);
    $this->assertDatabaseCount('pickup_receipts', 0);
    $this->assertDatabaseCount('pickup_visits', 0);
    $this->assertDatabaseCount('pickup_processing_records', 0);
    $this->assertDatabaseCount('pickup_processing_reconciliations', 0);
    Queue::assertNothingPushed();
});

test('reimport skips identical references and holds changed rows without overwriting original evidence', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    Customer::factory()->recycle($admin)->create(['customer_code' => '4000', 'name' => 'Vanny']);
    $importer = app(ImportPickupHistory::class);
    $input = pickupHistoryFixture();
    $importer->handle($input, $admin->id, true);
    $second = $importer->handle($input, $admin->id, true);
    $input['rows'][0]['quantities'] = [40, 60, 0];

    $changed = $importer->handle($input, $admin->id, true);

    expect($second['summary'])->toMatchArray(['pickups_existing' => 1, 'pickups_new' => 0, 'users_archived' => 0]);
    expect($changed['summary']['conflicts'])->toBe(1);
    $this->assertDatabaseCount('pickup_tasks', 1);
    $this->assertDatabaseCount('handover_items', 1);
    $this->assertDatabaseHas('pickup_records', ['manual_hybrid' => 50, 'cashless_hybrid' => 50]);
});

test('different or unknown customer identities are held until separate archive import is selected', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $master = Customer::factory()->recycle($admin)->create(['customer_code' => '4000', 'name' => 'Another Customer']);
    $input = pickupHistoryFixture();
    $importer = app(ImportPickupHistory::class);

    $held = $importer->handle($input, $admin->id, true);
    expect($held['summary']['pickups_held'])->toBe(1);
    $this->assertDatabaseCount('pickup_tasks', 0);
    $this->assertDatabaseCount('users', 1);
    $result = $importer->handle($input, $admin->id, true, true);

    expect($result['summary']['customers_archived'])->toBe(1);
    $archive = Customer::findOrFail(PickupTask::sole()->customer_id);
    expect($archive->customer_code)->toStartWith('HIST-');
    expect($archive->is_active)->toBeFalse();
    expect($archive->name)->toBe('Vanny');
    expect($master->fresh()->name)->toBe('Another Customer');
    expect($master->fresh()->is_active)->toBeTrue();
});

test('following master uses the master identity for a known code while unknown codes remain held', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $master = Customer::factory()->recycle($admin)->create(['customer_code' => '4000', 'name' => 'Master Vanny']);
    $input = pickupHistoryFixture();
    $input['rows'][0]['raw']['Customer'] = 'Vanny';
    $input['rows'][] = [...$input['rows'][0], 'row' => 3, 'reference' => 'JNE/124/20261002043000', 'customer_code' => null];

    $result = app(ImportPickupHistory::class)->handle($input, $admin->id, true, false, true);

    expect($result['summary'])->toMatchArray(['pickups_new' => 1, 'pickups_held' => 1, 'customers_archived' => 0]);
    $this->assertDatabaseCount('customers', 1);
    $this->assertDatabaseHas('pickup_tasks', ['customer_id' => $master->id, 'customer_name_snapshot' => 'Master Vanny']);
    $this->assertDatabaseHas('pickup_records', ['customer_name' => 'Master Vanny']);
    expect(PickupTask::sole()->proof->notes)->toContain('Vanny');
});

test('invalid category totals fail before any writes', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    Customer::factory()->recycle($admin)->create(['customer_code' => '4000', 'name' => 'Vanny']);
    $input = pickupHistoryFixture();
    $input['rows'][0]['total'] = 101;

    expect(fn () => app(ImportPickupHistory::class)->handle($input, $admin->id, true))->toThrow(ValidationException::class);

    $this->assertDatabaseCount('pickup_tasks', 0);
    $this->assertDatabaseCount('users', 1);
});

test('non admin actors cannot import history', function () {
    $staff = User::factory()->create(['role' => 'pickup_staff']);

    expect(fn () => app(ImportPickupHistory::class)->handle(pickupHistoryFixture(), $staff->id, true))
        ->toThrow(HttpException::class);

    $this->assertDatabaseCount('pickup_tasks', 0);
});

test('historical types and zero quantities remain source data without fabricated warehouse results', function (string $type, string $stored) {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    Customer::factory()->recycle($admin)->create(['customer_code' => '4000', 'name' => 'Vanny']);
    $input = pickupHistoryFixture();
    $input['rows'][0] = [...$input['rows'][0], 'type' => $type, 'total' => 0, 'quantities' => [0, 0, 0],
        'verified' => false, 'verifier' => null, 'warehouse' => null, 'warehouse_total' => null];

    app(ImportPickupHistory::class)->handle($input, $admin->id, true);

    expect(PickupTask::sole()->pickup_type)->toBe($stored);
    $this->assertDatabaseHas('pickup_records', ['manual_hybrid' => 0, 'cashless_hybrid' => 0, 'css_orion' => 0]);
    $this->assertDatabaseCount('handover_items', 0);
})->with([['Member Direct', 'member_direct'], ['Walk-In', 'walk_in']]);

test('command previews a private manifest by default', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    Customer::factory()->recycle($admin)->create(['customer_code' => '4000', 'name' => 'Vanny']);
    Storage::fake('local');
    Storage::disk('local')->put('history.json', json_encode(pickupHistoryFixture()));

    $this->artisan('pickup-history:import', ['manifest' => Storage::disk('local')->path('history.json'), '--actor' => $admin->id])
        ->expectsOutput('PREVIEW_ONLY')->assertSuccessful();

    $this->assertDatabaseCount('pickup_tasks', 0);
});

test('matching warehouse categories are verified without inventing a verification time', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    Customer::factory()->recycle($admin)->create(['customer_code' => '4000', 'name' => 'Vanny']);
    $input = pickupHistoryFixture();
    $input['rows'][0]['warehouse'] = [50, 50, 0];

    app(ImportPickupHistory::class)->handle($input, $admin->id, true);

    $this->assertDatabaseHas('handover_items', ['status' => 'VERIFIED', 'manual_hybrid' => 50, 'cashless_hybrid' => 50, 'verified_at' => null]);
});

test('a late ambiguous staff name rolls back the entire batch including earlier imported rows', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    Customer::factory()->recycle($admin)->create(['customer_code' => '4000', 'name' => 'Vanny']);
    User::factory()->count(2)->create(['name' => 'Duplicate Staff']);
    $input = pickupHistoryFixture();
    $input['rows'][] = [...$input['rows'][0], 'row' => 3, 'reference' => 'JNE/124/20261002043000', 'staff' => 'Duplicate Staff'];

    expect(fn () => app(ImportPickupHistory::class)->handle($input, $admin->id, true))->toThrow(ValidationException::class);

    $this->assertDatabaseCount('pickup_tasks', 0);
    $this->assertDatabaseCount('pickup_records', 0);
    $this->assertDatabaseCount('handover_items', 0);
    $this->assertDatabaseCount('users', 3);
});

<?php

use App\Actions\Reports\ImportCustomerDirectory;
use App\Actions\Reports\ResolveJneCustomers;
use App\Actions\Scheduling\GeneratePickupTasks;
use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipperAlias;
use App\Models\PickupSchedule;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

function directoryImportInput(): array
{
    return ['source_name' => 'directory.xlsx', 'source_sha256' => hash('sha256', 'fixture'),
        'customers' => [['code' => '00100', 'name' => 'PT A', 'row' => 2], ['code' => '101B', 'name' => 'PT B', 'row' => 3]],
        'aliases' => [['code' => '00100', 'shipper_name' => '100 ANITA', 'source_customer_name' => 'PT A', 'row' => 2],
            ['code' => '00100', 'shipper_name' => '100 LALA', 'source_customer_name' => '#N/A', 'row' => 3],
            ['code' => '00100', 'shipper_name' => '100 ANITA ', 'source_customer_name' => 'PT A', 'row' => 4],
            ['code' => '101B', 'shipper_name' => 'OTHER', 'source_customer_name' => 'PT B', 'row' => 5]]];
}

test('preview reports real planned counts and changes no customer or alias rows', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $result = app(ImportCustomerDirectory::class)->handle(directoryImportInput(), $admin->id);
    expect($result['applied'])->toBeFalse();
    expect($result['summary']['customers_new'])->toBe(2);
    expect($result['summary']['aliases_new'])->toBe(3);
    expect($result['summary']['duplicate_rows'])->toBe(1);
    expect($result['summary']['canonical_name_corrections'])->toBe(1);
    $this->assertDatabaseCount('customers', 0);
    $this->assertDatabaseCount('jne_shipper_aliases', 0);
});

test('apply imports customer identity and aliases idempotently without inventing pickup details', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $importer = app(ImportCustomerDirectory::class);
    $first = $importer->handle(directoryImportInput(), $admin->id, true);
    $second = $importer->handle(directoryImportInput(), $admin->id, true);
    expect($first['summary']['customers_new'])->toBe(2);
    expect($second['summary']['customers_new'])->toBe(0);
    expect($second['summary']['aliases_existing'])->toBe(3);
    $this->assertDatabaseCount('customers', 2);
    $this->assertDatabaseCount('jne_shipper_aliases', 3);
    $this->assertDatabaseCount('jne_report_profiles', 0);
    $this->assertDatabaseHas('customers', ['customer_code' => '00100', 'name' => 'PT A', 'contact' => '', 'pickup_address' => '', 'created_by' => $admin->id]);
    $source = JneReportAwb::factory()->create(['shipper_name' => '100 LALA']);
    $resolved = app(ResolveJneCustomers::class)->handle(collect([$source]));
    expect($resolved[$source->id]['customer_id'])->toBe(Customer::where('customer_code', '00100')->value('id'));
});

test('existing customers with conflicting code or disabled state remain untouched and their aliases are skipped', function (bool $active, string $name) {
    $existing = Customer::factory()->create(['customer_code' => '00100', 'name' => $name, 'is_active' => $active]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $before = $existing->refresh()->getRawOriginal();
    $result = app(ImportCustomerDirectory::class)->handle(directoryImportInput(), $admin->id, true);
    expect($result['summary']['customers_skipped'])->toBe(1);
    expect($result['summary']['aliases_skipped'])->toBe(3);
    expect($existing->fresh()->getRawOriginal())->toBe($before);
    $this->assertDatabaseCount('jne_shipper_aliases', 1);
})->with([[true, 'ANOTHER CUSTOMER'], [false, 'PT A']]);

test('existing customer contact address version and disabled aliases are retained', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create(['customer_code' => '00100', 'name' => 'PT A']);
    $before = $customer->refresh()->getRawOriginal();
    JneShipperAlias::factory()->create(['customer_id' => $customer->id, 'shipper_name' => '100 ANITA', 'is_active' => false]);
    app(ImportCustomerDirectory::class)->handle(directoryImportInput(), $admin->id, true);
    expect($customer->fresh()->getRawOriginal())->toBe($before);
    expect(JneShipperAlias::where('customer_id', $customer->id)->where('normalized_name', '100 ANITA')->sole()->is_active)->toBeFalse();
});

test('ambiguous source aliases remain assigned to both codes for review without choosing an owner', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $input = directoryImportInput();
    $input['aliases'][3]['shipper_name'] = '100 ANITA';
    $result = app(ImportCustomerDirectory::class)->handle($input, $admin->id, true);
    expect($result['summary']['ambiguous_names'])->toBe(1);
    $source = JneReportAwb::factory()->create(['shipper_name' => '100 ANITA']);
    expect(app(ResolveJneCustomers::class)->handle(collect([$source]))[$source->id]['status'])->toBe('AMBIGUOUS');
});

test('structurally invalid master rejects the whole import', function () {
    $input = directoryImportInput();
    $input['customers'][] = ['code' => '00100', 'name' => 'DIFFERENT MASTER NAME', 'row' => 10];
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    expect(fn () => app(ImportCustomerDirectory::class)->handle($input, $admin->id, true))->toThrow(ValidationException::class);
    $this->assertDatabaseCount('customers', 0);
    $this->assertDatabaseCount('jne_shipper_aliases', 0);
});

test('import requires an existing active admin', function (string $role, bool $active) {
    $actor = User::factory()->create(['role' => $role, 'is_active' => $active]);
    try {
        app(ImportCustomerDirectory::class)->handle(directoryImportInput(), $actor->id, true);
        test()->fail('Unauthorized directory import was accepted.');
    } catch (HttpException $exception) {
        expect($exception->getStatusCode())->toBe(403);
    }
    $this->assertDatabaseCount('customers', 0);
})->with([['pickup_staff', true], ['admin_supervisor', false]]);

test('identity only customer cannot create pickup or enable regular pickup before contact is filled', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    app(ImportCustomerDirectory::class)->handle(directoryImportInput(), $admin->id, true);
    $customer = Customer::where('customer_code', '00100')->sole();
    $this->actingAs($admin)->postJson(route('api.tasks.store'), ['customer_id' => $customer->id, 'pickup_address' => 'Actual supplied pickup address', 'scheduled_at' => '2026-11-01T10:00:00+07:00'])
        ->assertUnprocessable()->assertJsonValidationErrors('customer_id');
    $this->postJson(route('api.schedules.store'), ['customer_id' => $customer->id, 'pickup_address' => 'Actual supplied pickup address', 'weekdays' => [1], 'pickup_time' => '10:00',
        'starts_on' => '2026-10-26', 'is_active' => true])->assertUnprocessable()->assertJsonValidationErrors('customer_id');
    $schedule = PickupSchedule::factory()->create(['customer_id' => $customer->id, 'is_active' => true, 'weekdays' => [1], 'starts_on' => '2026-10-26', 'ends_on' => null]);
    expect(app(GeneratePickupTasks::class)->handle($schedule->id, CarbonImmutable::parse('2026-10-26', 'Asia/Jakarta')))->toBe(0);
    $this->assertDatabaseCount('pickup_tasks', 0);
});

test('command previews by default and produces a private review without changing source data', function () {
    Storage::fake('local');
    $path = tempnam(sys_get_temp_dir(), 'directory_');
    $input = directoryImportInput();
    file_put_contents($path, json_encode($input, JSON_THROW_ON_ERROR));
    try {
        $admin = User::factory()->create(['role' => 'admin_supervisor']);
        $this->artisan('jne-customers:import', ['manifest' => $path, '--actor' => $admin->id])->expectsOutput('PREVIEW_ONLY')->assertSuccessful();
        $this->assertDatabaseCount('customers', 0);
        $this->artisan('jne-customers:import', ['manifest' => $path, '--actor' => $admin->id, '--apply' => true])->expectsOutput('IMPORT_APPLIED')->assertSuccessful();
        $this->assertDatabaseCount('customers', 2);
        expect(json_decode(file_get_contents($path), true))->toBe($input);
        expect(Storage::disk('local')->allFiles())->toHaveCount(4);
    } finally {
        unlink($path);
    }
});

test('unknown alias codes are reported and never create an invented customer', function () {
    $input = directoryImportInput();
    $input['aliases'][] = ['code' => '999', 'shipper_name' => 'UNKNOWN', 'source_customer_name' => 'NO MASTER', 'row' => 100];
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $result = app(ImportCustomerDirectory::class)->handle($input, $admin->id, true);
    expect($result['summary']['aliases_skipped'])->toBe(1);
    $this->assertDatabaseMissing('customers', ['customer_code' => '999']);
    $this->assertDatabaseCount('jne_shipper_aliases', 3);
});

test('directory UI exposes missing pickup details and schedule update still requires contact', function () {
    $this->withoutVite();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create(['contact' => '', 'pickup_address' => '']);
    $this->actingAs($admin)->get(route('jne-shipper-aliases.index', ['customer_id' => $customer->id]))->assertInertia(fn ($page) => $page->where('selectedCustomer.pickup_details_missing', true));
    $schedule = PickupSchedule::factory()->create(['customer_id' => $customer->id, 'is_active' => false]);
    $this->patchJson(route('api.schedules.update', $schedule), ['customer_id' => $customer->id, 'pickup_address' => 'Actual pickup address', 'weekdays' => [1], 'pickup_time' => '10:00',
        'starts_on' => '2026-10-26', 'is_active' => true, 'expected_version' => 1])->assertUnprocessable()->assertJsonValidationErrors('customer_id');
    expect($schedule->fresh()->is_active)->toBeFalse();
});

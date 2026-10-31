<?php

use App\Actions\Pickup\SyncCustomerAddresses;
use App\Models\Customer;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

function addressSyncCsv(array $rows, array $header = ['kode_customer', 'customer', 'alamat']): string
{
    $stream = fopen('php://temp', 'w+b');
    fputcsv($stream, $header, ',', '"', '');
    foreach ($rows as $row) {
        fputcsv($stream, $row, ',', '"', '');
    }
    rewind($stream);
    Storage::disk('local')->put('customer-source.csv', $stream);
    fclose($stream);

    return Storage::disk('local')->path('customer-source.csv');
}

test('address sync matches exact codes preserves zeroes skips conflicts and changes only master addresses once', function () {
    Storage::fake('local');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customers = [];
    foreach (['00', '01', '1', '644', '285'] as $code) {
        $customers[$code] = Customer::factory()->create(['customer_code' => $code, 'name' => 'Master '.$code, 'pickup_address' => 'Alamat lama '.$code]);
    }
    $task = PickupTask::factory()->create(['customer_id' => $customers['00']->id, 'pickup_address' => 'Alamat pickup historis']);
    $before = $customers['00']->getAttributes();
    $path = addressSyncCsv([['00', 'Nama CSV lain', 'Alamat PM'], ['01', 'PSG', "Alamat PSG\nLantai 2"], ['1', 'Hafiz', 'Alamat Hafiz'],
        ['00', 'Duplikat sama', 'Alamat PM'], ['644', 'Konflik A', 'Alamat A'], ['644', 'Konflik B', 'Alamat B'],
        ['NULL', 'Tanpa kode', 'Tidak dipakai'], ['285', 'Alamat kosong', 'NULL'], ['99999', 'Belum terdaftar', 'Tidak dibuat']]);
    $sync = app(SyncCustomerAddresses::class);

    $preview = $sync->handle($path, $admin->id);
    expect($preview['summary']['to_update'])->toBe(3);
    expect($customers['00']->fresh()->pickup_address)->toBe('Alamat lama 00');
    $result = $sync->handle($path, $admin->id, true);

    expect($result['summary'])->toBe(['source_rows' => 9, 'rows_without_code' => 1, 'rows_without_address' => 1,
        'conflicting_codes' => 1, 'unmatched_codes' => 1, 'unchanged' => 0, 'to_update' => 3, 'updated' => 3]);
    expect($customers['00']->fresh()->pickup_address)->toBe('Alamat PM');
    expect($customers['01']->fresh()->pickup_address)->toBe("Alamat PSG\nLantai 2");
    expect($customers['1']->fresh()->pickup_address)->toBe('Alamat Hafiz');
    expect($customers['644']->fresh()->pickup_address)->toBe('Alamat lama 644');
    expect($customers['285']->fresh()->pickup_address)->toBe('Alamat lama 285');
    expect($task->fresh()->pickup_address)->toBe('Alamat pickup historis');
    expect($customers['00']->fresh()->version)->toBe(2);
    expect($customers['00']->fresh()->updated_by)->toBe($admin->id);
    foreach (array_diff_key($before, array_flip(['pickup_address', 'updated_at', 'updated_by', 'version'])) as $key => $value) {
        expect($customers['00']->fresh()->getRawOriginal($key))->toBe($value);
    }
    $backup = json_decode(file_get_contents($result['backup_path']), true, flags: JSON_THROW_ON_ERROR);
    expect($backup['changes'][0]['previous_address'])->toBe('Alamat lama 00');
    expect($backup['source_sha256'])->toBe(hash_file('sha256', $path));
    $this->assertDatabaseCount('customers', 5);

    $again = $sync->handle($path, $admin->id, true);
    expect($again['summary']['updated'])->toBe(0)->and($again['summary']['unchanged'])->toBe(3);
    expect($customers['00']->fresh()->version)->toBe(2);
});

test('address sync requires an active supervisor', function (string $role, bool $active) {
    Storage::fake('local');
    $user = User::factory()->create(['role' => $role, 'is_active' => $active]);
    $customer = Customer::factory()->create(['customer_code' => '100', 'pickup_address' => 'Lama']);
    $path = addressSyncCsv([['100', 'Customer', 'Baru']]);

    expect(fn () => app(SyncCustomerAddresses::class)->handle($path, $user->id, true))->toThrow(HttpException::class);

    expect($customer->fresh()->pickup_address)->toBe('Lama')->and($customer->fresh()->version)->toBe(1);
})->with([['pickup_staff', true], ['admin_supervisor', false]]);

test('invalid CSV structure is rejected before any address update', function (string $condition) {
    Storage::fake('local');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create(['customer_code' => '100', 'pickup_address' => 'Lama']);
    $header = $condition === 'missing_header' ? ['kode_customer', 'customer', 'other'] : ['kode_customer', 'customer', 'alamat'];
    $row = ['100', 'Customer', $condition === 'long_address' ? str_repeat('x', 2001) : 'Baru'];
    if ($condition === 'row_width') {
        $row[] = 'Extra';
    }
    $path = addressSyncCsv([$row], $header);

    expect(fn () => app(SyncCustomerAddresses::class)->handle($path, $admin->id, true))->toThrow(ValidationException::class);

    expect($customer->fresh()->pickup_address)->toBe('Lama');
})->with(['missing_header', 'row_width', 'long_address']);

test('a failed private backup prevents every address change', function () {
    Storage::fake('local');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create(['customer_code' => '100', 'pickup_address' => 'Lama']);
    $path = addressSyncCsv([['100', 'Customer', 'Baru']]);
    $disk = Mockery::mock(FilesystemAdapter::class);
    $disk->shouldReceive('put')->once()->andReturn(false);
    Storage::shouldReceive('disk')->with('local')->andReturn($disk);

    expect(fn () => app(SyncCustomerAddresses::class)->handle($path, $admin->id, true))->toThrow(RuntimeException::class);

    expect($customer->fresh()->pickup_address)->toBe('Lama')->and($customer->fresh()->version)->toBe(1);
});

test('the command previews by default and applies only with the apply flag', function () {
    Storage::fake('local');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create(['customer_code' => '100', 'pickup_address' => 'Lama']);
    $path = addressSyncCsv([['100', 'Nama tidak dipakai', 'Baru']]);

    $this->artisan('customers:sync-addresses', ['csv' => $path, '--actor' => $admin->id])->expectsOutput('PREVIEW_ONLY')->assertSuccessful();
    expect($customer->fresh()->pickup_address)->toBe('Lama');
    $this->artisan('customers:sync-addresses', ['csv' => $path, '--actor' => $admin->id, '--apply' => true])->expectsOutput('ADDRESSES_SYNCED')->assertSuccessful();

    expect($customer->fresh()->pickup_address)->toBe('Baru');
});

<?php

use App\Models\Customer;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

$root = dirname(__DIR__, 2);
$database = getenv('RETAIL_PWA_TEST_DB') ?: '';
$directory = realpath(dirname($database));
$output = realpath($root.'/output');
if (! $directory || ! $output || ! str_starts_with(strtolower(str_replace('\\', '/', $directory)).'/', strtolower(str_replace('\\', '/', $output)).'/') || basename($database) !== 'retail-pwa.sqlite') {
    throw new RuntimeException('Fixture memerlukan database terisolasi di output.');
}
if (PHP_SAPI === 'cli-server') {
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    $static = realpath($root.'/public'.$path);
    if ($static && str_starts_with(str_replace('\\', '/', $static), str_replace('\\', '/', realpath($root.'/public/retail')).'/') && is_file($static)) {
        return false;
    }
}
require $root.'/vendor/autoload.php';
$application = require $root.'/bootstrap/app.php';
$application->make(Kernel::class)->bootstrap();
config([
    'app.env' => 'testing', 'app.debug' => false, 'app.url' => 'http://127.0.0.1:8027',
    'database.default' => 'sqlite', 'database.connections.sqlite.database' => $database,
    'database.connections.sqlite.url' => null,
    'session.driver' => 'file', 'session.files' => $directory.'/sessions', 'session.secure' => false,
    'cache.default' => 'array', 'queue.default' => 'sync', 'mail.default' => 'array',
    'pickup.automation.enabled' => false, 'pickup.awb_send.enabled' => false,
    'pickup.cashless_entry.enabled' => false, 'pickup.receipt_channel' => 'disabled',
    'control-center.enabled' => false,
]);
if (PHP_SAPI === 'cli-server') {
    if ($path === '/m/sw.js' && is_file($directory.'/worker-update')) {
        header('Content-Type: application/javascript');
        header('Cache-Control: no-cache, no-store');
        header('Service-Worker-Allowed: /m');
        echo str_replace('retail-shell-', 'retail-shell-uat-', file_get_contents($root.'/public/retail/sw.js'));

        return;
    }
    $application->handleRequest(Request::capture());

    return;
}
if (is_file($database)) {
    throw new RuntimeException('Fixture tidak boleh menimpa database yang sudah ada.');
}
touch($database);
mkdir($directory.'/sessions');
Artisan::call('migrate', ['--force' => true, '--no-interaction' => true]);
$staff = User::factory()->create(['name' => 'Petugas PWA', 'email' => 'pwa-staff@example.test', 'role' => 'pickup_staff', 'password' => 'password']);
$other = User::factory()->create(['name' => 'Petugas Kedua', 'email' => 'pwa-other@example.test', 'role' => 'pickup_staff', 'password' => 'password']);
$supervisor = User::factory()->create(['name' => 'Supervisor PWA', 'email' => 'pwa-supervisor@example.test', 'role' => 'admin_supervisor', 'password' => 'password']);
$retail = User::factory()->create(['name' => 'Petugas Retail PWA', 'email' => 'pwa-retail@example.test', 'role' => 'retail_staff', 'password' => 'password']);
$customer = Customer::factory()->create(['name' => 'Customer UAT PWA']);
$task = PickupTask::factory()->create(['customer_id' => $customer->id, 'customer_name_snapshot' => $customer->name, 'reference' => 'PWA-EXECUTION', 'assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED', 'scheduled_at' => now()]);
$book = PickupTask::factory()->create(['customer_id' => $customer->id, 'customer_name_snapshot' => 'Buku Cashless PWA', 'reference' => 'PWA-CASHLESS', 'assigned_staff_id' => $staff->id, 'status' => 'PICKED_UP', 'scheduled_at' => now()]);
PickupRecord::factory()->create(['pickup_task_id' => $book->id, 'staff_id' => $staff->id, 'customer_name' => 'Buku Cashless PWA', 'cashless_hybrid' => 3, 'manual_hybrid' => 0, 'css_orion' => 0]);
echo json_encode(['task' => $task->id, 'book' => $book->id, 'staff' => $staff->id, 'other' => $other->id], JSON_THROW_ON_ERROR);

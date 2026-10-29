<?php

use App\Models\Customer;
use App\Models\HandoverSession;
use App\Models\JneReportAwb;
use App\Models\JneReportProfile;
use App\Models\JneShipment;
use App\Models\JneShipperAlias;
use App\Models\PickupRecord;
use App\Models\PickupSchedule;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;

if (getenv('APP_ENV') !== 'testing') {
    throw new RuntimeException('Set APP_ENV=testing for isolated browser fixtures.');
}

require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$auditDb = getenv('UI_UX_DATABASE');
$outputRoot = realpath(getcwd().'/output');
$parent = $auditDb ? realpath(dirname($auditDb)) : false;
$normalizedRoot = $outputRoot ? strtolower(str_replace('\\', '/', $outputRoot)).'/' : '';
$normalizedParent = $parent ? strtolower(str_replace('\\', '/', $parent)).'/' : '';
if (! $auditDb || ! $outputRoot || ! $parent || ! str_starts_with($normalizedParent, $normalizedRoot)
    || ! str_ends_with(strtolower($auditDb), '.sqlite') || file_exists($auditDb) || file_exists($auditDb.'.ids.json')) {
    throw new RuntimeException('Use a new .sqlite file inside the existing project output directory. Existing fixtures are never overwritten.');
}
Http::preventStrayRequests();
Queue::fake();
Notification::fake();
touch($auditDb);
config(['database.connections.audit' => [...config('database.connections.sqlite'), 'database' => $auditDb], 'database.default' => 'audit', 'queue.default' => 'sync', 'cache.default' => 'array']);
Artisan::call('migrate', ['--database' => 'audit', '--force' => true]);
$users = [];
foreach (['admin_supervisor', 'cs', 'pickup_staff', 'retail_staff'] as $role) {
    $users[$role] = User::factory()->create(['name' => 'Audit '.$role, 'email' => 'audit-'.$role.'@example.test', 'role' => $role, 'is_active' => true]);
}
$today = now('Asia/Jakarta')->startOfDay();
$yesterday = $today->copy()->subDay()->toDateString();
$admin = $users['admin_supervisor'];
$staff = $users['pickup_staff'];
$retail = $users['retail_staff'];
$customers = [];
for ($i = 0; $i < 28; $i++) {
    $customers[] = Customer::factory()->create(['name' => $i === 0 ? 'Customer Audit dengan Nama Perusahaan yang Sangat Panjang untuk Pemeriksaan Layout dan Pemotongan Teks' : 'Customer Audit '.($i + 1), 'pickup_address' => 'Alamat fixture audit, Kecamatan Contoh, Kota Pengujian', 'customer_code' => 'AUD'.str_pad((string) $i, 4, '0', STR_PAD_LEFT)]);
}
$session = HandoverSession::factory()->create(['reference' => 'AUD-HANDOVER-001', 'created_by' => $retail->id, 'status' => 'IN_VERIFICATION']);
$ids = ['session' => $session->id];
for ($i = 0; $i < 34; $i++) {
    $status = ['SCHEDULED', 'ASSIGNED', 'PICKED_UP', 'PICKED_UP', 'NO_PACKAGES', 'CANCELLED'][$i % 6];
    $customer = $customers[$i % count($customers)];
    $task = PickupTask::factory()->create(['reference' => 'AUD-PICKUP-'.str_pad((string) $i, 4, '0', STR_PAD_LEFT), 'customer_id' => $customer->id, 'customer_name_snapshot' => $customer->name, 'created_by' => $admin->id, 'assigned_staff_id' => $status === 'SCHEDULED' ? null : $staff->id, 'pickup_type' => $i % 2 ? 'regular' : 'on_demand', 'scheduled_at' => $today->copy()->setTime(10, 0)->utc()->toDateTimeString(), 'status' => $status]);
    if ($status === 'ASSIGNED' && ! isset($ids['execute'])) {
        $ids['execute'] = $task->id;
    }
    if ($status === 'PICKED_UP') {
        $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id, 'customer_name' => $customer->name, 'pickup_address' => 'Alamat fixture audit', 'contact' => 'Kontak fixture', 'picked_up_at' => $today->copy()->setTime(11, 0)->utc()->toDateTimeString(), 'manual_hybrid' => 4, 'cashless_hybrid' => 3, 'css_orion' => 2]);
        $ids['proof'] ??= $task->id;
        $session->items()->create(['pickup_task_id' => $task->id, 'pickup_record_id' => $proof->id, 'status' => $i % 6 === 2 ? 'PENDING' : 'DISCREPANCY', 'manual_hybrid' => 3, 'cashless_hybrid' => 3, 'css_orion' => 2, 'verified_pickup_revision' => 0, 'discrepancy_notes' => $i % 6 === 3 ? 'Fixture: selisih satu paket' : null, 'verified_by' => $i % 6 === 3 ? $retail->id : null, 'verified_at' => $i % 6 === 3 ? now() : null]);
    }
}
PickupSchedule::factory()->create(['customer_id' => $customers[1]->id, 'created_by' => $admin->id, 'starts_on' => $today->copy()->startOfMonth()->toDateString()]);
$profile = JneReportProfile::factory()->create(['label' => 'Account fixture audit', 'customer_account' => 'AUDIT001', 'enabled' => false, 'created_by' => $admin->id, 'updated_by' => $admin->id]);
foreach (['HYBRID_PM' => 'Hybrid Server PM', 'HYBRID_PUMAN' => 'Hybrid Server Puman'] as $account => $label) {
    JneReportProfile::factory()->create(['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => $account, 'label' => $label,
        'enabled' => false, 'lookback_days' => 1, 'interval_minutes' => 30, 'next_run_at' => null, 'created_by' => $admin->id, 'updated_by' => $admin->id]);
}
$report = ReportJob::factory()->create(['customer_account' => 'AUDIT001', 'status' => 'COMPLETED', 'import_status' => 'IMPORTED', 'projection_status' => 'PROJECTED', 'created_by' => $admin->id, 'date_from' => $yesterday, 'date_thru' => $today->toDateString(), 'row_count' => 30, 'awb_count' => 30, 'completed_at' => now(), 'imported_at' => now()]);
$ids['report'] = $report->id;
ReportJob::factory()->create(['customer_account' => 'AUDIT002', 'status' => 'NEEDS_ATTENTION', 'created_by' => $admin->id, 'error_message' => 'Fixture audit: laporan belum tersedia; periksa lalu coba kembali.']);
JneShipperAlias::factory()->create(['customer_id' => $customers[0]->id, 'shipper_name' => 'Pengirim Audit']);
for ($i = 0; $i < 30; $i++) {
    $tracking = ['DELIVERED', 'IN_TRANSIT', 'EXCEPTION', 'CANCELLED', 'UNKNOWN'][$i % 5];
    $awb = ['0101', '0166', 'CSS01', 'CGKEC'][$i % 4].str_pad((string) $i, 12, '0', STR_PAD_LEFT);
    $source = JneReportAwb::factory()->create(['report_job_id' => $report->id, 'source_row' => $i + 2, 'awb' => $awb, 'customer_account' => 'AUDIT001', 'shipper_name' => 'Pengirim Audit', 'consignee_name' => 'Penerima Fixture', 'entry_at' => $today->copy()->subDay()->setTime(12, 0)->utc()->toDateTimeString(), 'service' => $i % 2 ? 'REG' : 'YES', 'destination' => $i % 2 ? 'BDO10000' : 'CKR10020', 'destination_name' => $i % 2 ? 'Bandung' : 'Cikarang', 'amount_cents' => 1500000, 'weight_grams' => 2000, 'quantity' => 1, 'metrics_version' => 2, 'status_web' => $tracking === 'DELIVERED' ? 'DELIVERED TO [PENERIMA | 24-10-2026 10:00 | BANDUNG]' : $tracking, 'raw_data' => ['AWB' => $awb, 'ID_ACCOUNT' => 'AUDIT001', 'SHIPPER_NAME' => 'Pengirim Audit', 'STATUS_WEB' => $tracking]]);
    $shipment = JneShipment::factory()->create(['awb' => $awb, 'customer_account' => 'AUDIT001', 'customer_id' => $i % 3 ? $customers[0]->id : null, 'customer_match_status' => $i % 3 ? 'MATCHED' : 'UNMATCHED', 'tracking_status' => $tracking, 'match_status' => 'UNMATCHED', 'latest_report_job_id' => $report->id, 'latest_report_awb_id' => $source->id, 'last_observed_at' => now()]);
    $ids['shipment'] ??= $shipment->id;
}
file_put_contents($auditDb.'.ids.json', json_encode($ids, JSON_THROW_ON_ERROR));
echo json_encode(['fixture' => 'isolated SQLite', 'users' => count($users), 'customers' => count($customers), 'tasks' => 34, 'shipments' => 30, 'ids' => $ids]);

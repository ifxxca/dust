<?php

use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\JneShipmentObservation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Database\Seeders\JnePickupSimulationSeeder;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

test('simulation imports fourteen scenarios through the real pipeline without inventing code and date pickup matches', function () {
    $this->travelTo('2026-10-26 08:00:00 UTC');
    Storage::fake('jne_reports');
    Http::preventStrayRequests();
    User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);

    $this->seed(JnePickupSimulationSeeder::class);

    $this->assertDatabaseCount('customers', 14);
    $this->assertDatabaseCount('pickup_tasks', 15);
    $this->assertDatabaseCount('pickup_records', 15);
    $this->assertDatabaseCount('handover_items', 15);
    $this->assertDatabaseCount('report_jobs', 16);
    $this->assertDatabaseCount('jne_report_awbs', 3870);
    $this->assertDatabaseCount('jne_shipments', 3590);
    $this->assertDatabaseCount('pickup_cashless_awbs', 200);
    $this->assertDatabaseCount('pickup_processing_records', 0);
    expect(ReportJob::where('import_status', 'IMPORTED')->where('projection_status', 'PROJECTED')->count())->toBe(16);

    $irfan = Customer::where('customer_code', 'SIM100')->sole();
    $task = PickupTask::where('customer_id', $irfan->id)->sole();
    expect($task->proof->manual_hybrid)->toBe(100);
    expect($task->proof->cashless_hybrid)->toBe(200);
    expect(JneShipment::where('customer_id', $irfan->id)->where('customer_match_status', 'MATCHED')->count())->toBe(300);
    expect(JneShipment::where('pickup_task_id', $task->id)->count())->toBe(0);
    expect(JneReportAwb::where('awb', 'SIMJNE20261026S01M0001')->sole()->raw_data)->toMatchArray(['CUSTOMER_CODE' => 'SIM100', 'SIM_CATEGORY' => 'manual_hybrid']);

    $duplicateReport = ReportJob::where('parameters->simulation->scenario', 'S07')->sole();
    expect($duplicateReport->duplicate_awb_count)->toBe(20);
    expect($duplicateReport->imported_awb_count)->toBe(300);
    expect(JneShipment::where('awb', 'like', 'SIMJNE20261026S12%')->count())->toBe(300);
    expect(JneShipmentObservation::whereIn('jne_report_awb_id', JneReportAwb::where('awb', 'like', 'SIMJNE20261026S12%')->select('id'))->count())->toBe(570);

    $lateCustomer = Customer::where('customer_code', 'SIM104')->sole();
    expect(PickupTask::where('customer_id', $lateCustomer->id)->sole()->proof->picked_up_at->setTimezone('Asia/Jakarta')->toDateString())->toBe('2026-10-25');
    expect(JneReportAwb::where('awb', 'SIMJNE20261026S05M0001')->sole()->entry_at->setTimezone('Asia/Jakarta')->toDateString())->toBe('2026-10-25');
    expect(JneReportAwb::where('awb', 'SIMJNE20261026S06M0001')->sole()->entry_at->setTimezone('Asia/Jakarta')->toDateString())->toBe('2026-10-25');
    expect(PickupTask::where('customer_id', Customer::where('customer_code', 'SIM105')->sole()->id)->sole()->proof->picked_up_at->setTimezone('Asia/Jakarta')->toDateString())->toBe('2026-10-26');

    expect(JneShipment::where('awb', 'like', 'SIMJNE20261026S08%')->whereNotNull('pickup_task_id')->count())->toBe(0);
    expect(JneShipment::where('awb', 'like', 'SIMJNE20261026S09%')->where('customer_match_status', 'MATCHED')->count())->toBe(0);
    expect(JneShipment::where('awb', 'like', 'SIMJNE20261026S10%')->where('match_status', 'MATCHED')->count())->toBe(300);
    expect(JneShipment::where('awb', 'like', 'SIMJNE20261026S11%')->where('match_status', 'MATCHED')->where('match_method', 'SERTIM')->count())->toBe(200);
    expect(JneShipment::where('awb', 'like', 'SIMJNE20261026S13%')->where('customer_match_status', 'CONFLICT')->count())->toBe(10);
    Storage::disk('jne_reports')->assertExists($duplicateReport->file_path);
    Http::assertNothingSent();
});

test('repeated simulation seeding preserves existing records and does not duplicate reports or matching history', function () {
    $this->travelTo('2026-10-26 08:00:00 UTC');
    Storage::fake('jne_reports');
    User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);
    $realCustomer = Customer::factory()->create(['customer_code' => '100', 'name' => 'Irfan asli']);
    $this->seed(JnePickupSimulationSeeder::class);
    $observationCount = JneShipmentObservation::count();
    $eventCount = JneShipmentMatchEvent::count();
    $proof = PickupRecord::where('pickup_task_id', PickupTask::where('customer_id', Customer::where('customer_code', 'SIM100')->sole()->id)->sole()->id)->sole();
    $proof->update(['notes' => 'Catatan pengguna setelah simulasi']);

    $this->seed(JnePickupSimulationSeeder::class);

    $this->assertDatabaseCount('customers', 15);
    $this->assertDatabaseCount('pickup_tasks', 15);
    $this->assertDatabaseCount('report_jobs', 16);
    $this->assertDatabaseCount('jne_shipments', 3590);
    expect(JneShipmentObservation::count())->toBe($observationCount);
    expect(JneShipmentMatchEvent::count())->toBe($eventCount);
    expect($proof->fresh()->notes)->toBe('Catatan pengguna setelah simulasi');
    expect($realCustomer->fresh()->only(['customer_code', 'name']))->toBe(['customer_code' => '100', 'name' => 'Irfan asli']);
});

test('simulation rejects a customer code collision and rolls back its database inserts', function () {
    User::factory()->create(['role' => 'admin_supervisor', 'is_active' => true]);
    $customer = Customer::factory()->create(['customer_code' => 'SIM101', 'name' => 'Customer kerja']);

    expect(fn () => $this->seed(JnePickupSimulationSeeder::class))->toThrow(RuntimeException::class, 'sudah dipakai customer lain');

    $this->assertDatabaseCount('customers', 1);
    $this->assertDatabaseCount('pickup_tasks', 0);
    $this->assertDatabaseCount('report_jobs', 0);
    $this->assertDatabaseMissing('users', ['email' => 'jne-simulation-staff@example.test']);
    expect($customer->fresh()->name)->toBe('Customer kerja');
});

test('simulation refuses production without changing data', function () {
    $environment = app()->environment();
    app()->instance('env', 'production');

    try {
        expect(fn () => app(JnePickupSimulationSeeder::class)->run())->toThrow(RuntimeException::class, 'hanya boleh dijalankan di local atau testing');
    } finally {
        app()->instance('env', $environment);
    }

    $this->assertDatabaseCount('users', 0);
    $this->assertDatabaseCount('customers', 0);
    $this->assertDatabaseCount('report_jobs', 0);
});

test('simulation requires an active administrator before creating any data', function () {
    User::factory()->create(['role' => 'admin_supervisor', 'is_active' => false]);
    User::factory()->create(['role' => 'cs', 'is_active' => true]);

    expect(fn () => $this->seed(JnePickupSimulationSeeder::class))->toThrow(RuntimeException::class, 'Buat Admin aktif');

    $this->assertDatabaseCount('customers', 0);
    $this->assertDatabaseCount('pickup_tasks', 0);
    $this->assertDatabaseCount('report_jobs', 0);
    $this->assertDatabaseMissing('users', ['email' => 'jne-simulation-staff@example.test']);
});

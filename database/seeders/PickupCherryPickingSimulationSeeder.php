<?php

namespace Database\Seeders;

use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Models\Customer;
use App\Models\JneSourceContract;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

class PickupCherryPickingSimulationSeeder extends Seeder
{
    public function run(int $wrongCodeAwbs = 1): void
    {
        $database = (string) config('database.connections.sqlite.database');
        $expected = base_path('storage/app/private/simulations/cherry-picking/cherry-picking.sqlite');
        $isolated = (app()->environment('testing') && $database === ':memory:')
            || ($database !== ':memory:' && realpath($database) !== false && realpath($database) === realpath($expected));
        if (! app()->environment(['local', 'testing', 'cherry-picking']) || config('database.default') !== 'sqlite' || ! $isolated) {
            throw new RuntimeException('Simulasi hanya boleh memakai database SQLite cherry-picking terisolasi atau database testing in-memory.');
        }
        if ($wrongCodeAwbs < 1 || $wrongCodeAwbs > 100) {
            throw new RuntimeException('Simulasi mendukung 1 sampai 100 AWB salah kode.');
        }
        if (! config('jne-reports.evidence_policies_enabled') || ! config('jne-reports.category_reconciliation_enabled')
            || ! config('pickup.automation.auto_lock') || config('pickup.automation.enabled') || config('pickup.automation.send_enabled')) {
            throw new RuntimeException('Gunakan konfigurasi simulasi: evidence/kategori/auto-lock aktif, scheduler otomatis dan pengiriman nonaktif.');
        }
        if (PickupTask::where('reference', 'SIM-CP-20261102-01')->exists()) {
            $this->command?->info('Simulasi sudah tersedia; hasil koreksi Anda tetap dipertahankan.');

            return;
        }
        if (Customer::exists() || PickupTask::exists() || ReportJob::exists() || User::exists()) {
            throw new RuntimeException('Database simulasi harus kosong. Tidak ada data existing yang ditimpa.');
        }

        DB::transaction(function () use ($wrongCodeAwbs): void {
            $admin = User::factory()->create(['name' => '[SIMULASI] Admin Cherry Picking', 'email' => 'simulasi@example.test', 'role' => 'admin_supervisor', 'is_active' => true,
                'password' => Hash::make('Simulasi-2026!'), 'email_verified_at' => now()]);
            $staff = User::factory()->create(['name' => '[SIMULASI] Kurir', 'role' => 'pickup_staff', 'is_active' => true, 'password' => Hash::make(Str::random(64))]);
            JneSourceContract::create(['source' => 'apex', 'report_type' => 'apex', 'active_key' => JneSourceContract::key('apex', 'apex'), 'revision' => 1,
                'created_by' => $admin->id, 'verified_by' => $admin->id, 'verified_at' => now(), 'reason' => 'DATA DUMMY pada database simulasi terisolasi; bukan sertifikasi sumber JNE asli.',
                'definition' => ['customer_code_column' => 'CUSTOMER_CODE', 'category_column' => 'PROCESS_TYPE', 'category_values' => ['MANUAL' => 'manual_hybrid'],
                    'automatic_reconciliation' => true, 'pickup_date_column' => 'TGL_ENTRY', 'collection_mode' => 'complete_date_report', 'collection_requirements' => ['apex:apex:SIM_CP']]]);
            $pickupAt = CarbonImmutable::parse('2026-11-02 10:00:00', 'Asia/Jakarta')->utc();
            $tasks = [];
            $customers = [];
            foreach (range(1, 10) as $number) {
                $expectedManual = $number === 9 ? 4 + $wrongCodeAwbs : 5;
                $customer = Customer::factory()->create(['customer_code' => sprintf('70%02d', $number), 'name' => sprintf('[SIM CP] Customer %02d', $number),
                    'pickup_address' => 'Alamat dummy simulasi', 'created_by' => $admin->id, 'is_active' => true]);
                $task = PickupTask::factory()->create(['reference' => sprintf('SIM-CP-20261102-%02d', $number), 'customer_id' => $customer->id,
                    'customer_name_snapshot' => $customer->name, 'scheduled_at' => $pickupAt, 'status' => 'PICKED_UP', 'created_by' => $admin->id, 'assigned_staff_id' => $staff->id]);
                PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id, 'customer_name' => $customer->name,
                    'manual_hybrid' => $expectedManual, 'cashless_hybrid' => 0, 'css_orion' => 0, 'picked_up_at' => $pickupAt]);
                $session = app(CreateSession::class)->handle($admin, [$task->id], (string) Str::uuid());
                app(VerifyItem::class)->handle($admin, $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => $expectedManual, 'cashless_hybrid' => 0, 'css_orion' => 0]);
                $tasks[$number] = $task;
                $customers[$number] = $customer;
            }

            $stream = fopen('php://temp', 'w+b');
            fputcsv($stream, ['AWB', 'ID_ACCOUNT', 'CUSTOMER_CODE', 'SHIPPER_NAME', 'CONSIGNEE_NAME', 'STATUS_WEB', 'STATUS_POD', 'AWB_CANCEL', 'NOREF', 'TGL_ENTRY', 'PROCESS_TYPE', 'QTY'], ',', '"', '');
            $awbNumber = 0;
            foreach ($customers as $number => $customer) {
                foreach (range(1, $number === 9 ? 4 : 5) as $parcel) {
                    fputcsv($stream, [sprintf('010120261102%03d', ++$awbNumber), 'SIM_CP', $customer->customer_code, $customer->customer_code.' '.$customer->name,
                        sprintf('SIM Customer %02d Penerima %02d', $number, $parcel), 'ON PROCESS', '', 'N', '', '2026-11-02 10:30:00', 'MANUAL', 1], ',', '"', '');
                }
            }
            foreach (range(1, $wrongCodeAwbs) as $parcel) {
                fputcsv($stream, [sprintf('010120261102%03d', ++$awbNumber), 'SIM_CP', $customers[10]->customer_code, $customers[10]->customer_code.' [SIM CP] Customer 09',
                    'SIM Customer 09 Penerima Salah Kode'.($wrongCodeAwbs > 1 ? sprintf(' %02d', $parcel) : ''), 'ON PROCESS', '', 'N', '', '2026-11-02 10:30:00', 'MANUAL', 1], ',', '"', '');
            }
            rewind($stream);
            $csv = stream_get_contents($stream);
            fclose($stream);
            $path = 'simulations/cherry-picking-20261102'.($wrongCodeAwbs > 1 ? '-'.$wrongCodeAwbs : '').'.csv';
            Storage::disk('jne_reports')->put($path, $csv);
            $job = ReportJob::factory()->create(['customer_account' => 'SIM_CP', 'date_from' => '2026-11-02', 'date_thru' => '2026-11-02', 'created_by' => $admin->id,
                'status' => 'COMPLETED', 'file_path' => $path, 'file_checksum' => hash('sha256', $csv), 'row_count' => $awbNumber, 'started_at' => now(), 'completed_at' => now(), 'parameters' => ['synthetic' => true]]);
            app(ImportReportAwbs::class)->handle($job->id);
            app(ProjectJneShipments::class)->handle($job->id);
            foreach ($tasks as $task) {
                app(ReconcilePickupProcessing::class)->handle($task->id);
            }
        });
        $this->command?->info('Simulasi 2 November 2026: 10 pickup, '.(49 + $wrongCodeAwbs).' AWB, 8 cocok, 1 kurang '.$wrongCodeAwbs.', 1 lebih '.$wrongCodeAwbs.'.');
    }
}

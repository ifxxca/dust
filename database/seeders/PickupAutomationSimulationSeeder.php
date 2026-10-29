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

class PickupAutomationSimulationSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new RuntimeException('Simulasi hanya dapat dijalankan di local/testing.');
        }
        if (! config('jne-reports.evidence_policies_enabled') || ! config('jne-reports.category_reconciliation_enabled')) {
            throw new RuntimeException('Aktifkan kebijakan evidence dan kategori untuk menjalankan simulasi otomatis.');
        }
        $admin = User::where('role', 'admin_supervisor')->where('is_active', true)->orderBy('id')->firstOrFail();
        $day = CarbonImmutable::now(config('jne-reports.source_timezone'))->startOfDay();
        $summary = DB::transaction(function () use ($admin, $day): array {
            $staff = User::firstOrCreate(['email' => 'pickup-automation-simulation@example.test'], ['name' => '[SIM AUTO] Irfan', 'role' => 'pickup_staff', 'is_active' => true, 'password' => Hash::make(Str::random(64)), 'email_verified_at' => now()]);
            if ($staff->name !== '[SIM AUTO] Irfan' || $staff->role !== 'pickup_staff') {
                throw new RuntimeException('Identitas staff simulasi sudah digunakan; data tidak ditimpa.');
            }
            JneSourceContract::firstOrCreate(['active_key' => JneSourceContract::key('simulation', 'pickup')], ['source' => 'simulation', 'report_type' => 'pickup', 'revision' => 1, 'created_by' => $admin->id, 'verified_by' => $admin->id, 'verified_at' => now(), 'reason' => 'Kontrak data sintetis SIM AUTO; bukan kontrak report JNE asli.',
                'definition' => ['customer_code_column' => 'CUSTOMER_CODE', 'category_column' => 'PROCESS_TYPE', 'category_values' => ['MANUAL' => 'manual_hybrid', 'CASHLESS' => 'cashless_hybrid', 'ORION' => 'css_orion'], 'automatic_reconciliation' => true, 'pickup_date_column' => 'TGL_ENTRY', 'collection_mode' => 'complete_date_report', 'collection_requirements' => ['simulation:pickup:SIM_AUTO']]]);
            $summary = [];
            $rows = [];
            $tasks = [];
            foreach ($this->scenarios() as $number => $scenario) {
                $code = 'SIM-AUTO-'.($number + 1);
                $name = '[SIM AUTO] '.$scenario['name'];
                $customer = Customer::firstOrCreate(['customer_code' => $code], ['name' => $name, 'pickup_address' => 'Alamat simulasi', 'contact' => 'simulasi@example.test', 'created_by' => $admin->id, 'is_active' => true]);
                if ($customer->name !== $name) {
                    throw new RuntimeException('Kode customer simulasi sudah digunakan; data tidak ditimpa.');
                }
                $reference = 'SIM-AUTO-'.$day->format('Ymd').'-'.($number + 1);
                $task = PickupTask::firstOrCreate(['reference' => $reference], ['customer_id' => $customer->id, 'customer_name_snapshot' => $customer->name, 'pickup_address' => $customer->pickup_address, 'contact_snapshot' => $customer->contact, 'scheduled_at' => $day->setTime(10, 0)->utc(), 'status' => 'PICKED_UP', 'version' => 1, 'created_by' => $admin->id, 'assigned_staff_id' => $staff->id]);
                if ($task->wasRecentlyCreated) {
                    PickupRecord::create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id, 'submission_key' => (string) Str::uuid(), 'customer_name' => $customer->name, 'pickup_address' => $customer->pickup_address, 'contact' => $customer->contact, 'manual_hybrid' => $scenario['target'][0], 'cashless_hybrid' => $scenario['target'][1], 'css_orion' => $scenario['target'][2], 'picked_up_at' => $day->setTime(10, 0)->utc(), 'finalized_at' => now()]);
                    if ($scenario['verify']) {
                        $session = app(CreateSession::class)->handle($admin, [$task->id], (string) Str::uuid());
                        app(VerifyItem::class)->handle($admin, $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => $scenario['target'][0], 'cashless_hybrid' => $scenario['target'][1], 'css_orion' => $scenario['target'][2]]);
                    }
                }
                $tasks[] = $task;
                foreach (['MANUAL', 'CASHLESS', 'ORION'] as $categoryIndex => $category) {
                    for ($index = 1; $index <= $scenario['actual'][$categoryIndex]; $index++) {
                        $rows[] = ['000SIM'.$day->format('Ymd').'S'.($number + 1).$category.$index, 'SIM_AUTO', $code, $name, 'Penerima simulasi '.$index, 'ON PROCESS', '', 'N', '', $day->format('Y-m-d').' 10:30:00', $category, 3];
                    }
                }
            }
            $path = 'simulations/pickup-automation-'.$day->format('Ymd').'.csv';
            $job = ReportJob::where('file_path', $path)->first();
            if (! $job) {
                $stream = fopen('php://temp', 'w+b');
                if ($stream === false) {
                    throw new RuntimeException('Stream CSV simulasi tidak tersedia.');
                }
                fputcsv($stream, ['AWB', 'ID_ACCOUNT', 'CUSTOMER_CODE', 'SHIPPER_NAME', 'CONSIGNEE_NAME', 'STATUS_WEB', 'STATUS_POD', 'AWB_CANCEL', 'NOREF', 'TGL_ENTRY', 'PROCESS_TYPE', 'QTY'], ',', '"', '');
                foreach ($rows as $row) {
                    fputcsv($stream, $row, ',', '"', '');
                }
                rewind($stream);
                $csv = stream_get_contents($stream);
                fclose($stream);
                Storage::disk('jne_reports')->put($path, $csv);
                $job = ReportJob::create(['source' => 'simulation', 'report_type' => 'pickup', 'customer_account' => 'SIM_AUTO', 'date_from' => $day->toDateString(), 'date_thru' => $day->toDateString(), 'report_mode' => 'P', 'status' => 'COMPLETED', 'created_by' => $admin->id, 'started_at' => now(), 'completed_at' => now(), 'file_path' => $path, 'file_checksum' => hash('sha256', $csv), 'parameters' => ['synthetic' => true]]);
                app(ImportReportAwbs::class)->handle($job->id);
                app(ProjectJneShipments::class)->handle($job->id);
            }
            foreach ($tasks as $task) {
                $result = app(ReconcilePickupProcessing::class)->handle($task->id);
                $summary[] = [$task->reference, $task->customer_name_snapshot, $result->status];
            }

            return $summary;
        });
        $this->command->table(['Pickup', 'Skenario', 'Status'], $summary);
    }

    /** @return list<array{name: string, target: array{int, int, int}, actual: array{int, int, int}, verify: bool}> */
    private function scenarios(): array
    {
        return [
            ['name' => 'Vanny 66 Manual + 100 Orion', 'target' => [66, 0, 100], 'actual' => [66, 0, 100], 'verify' => true],
            ['name' => '100 Manual + 200 Cashless', 'target' => [100, 200, 0], 'actual' => [100, 200, 0], 'verify' => true],
            ['name' => 'Kurang 10 Manual', 'target' => [50, 50, 0], 'actual' => [40, 50, 0], 'verify' => true],
            ['name' => 'Kategori tertukar', 'target' => [50, 50, 0], 'actual' => [60, 40, 0], 'verify' => true],
            ['name' => 'Lebih 5 Orion', 'target' => [0, 0, 10], 'actual' => [0, 0, 15], 'verify' => true],
            ['name' => 'Belum ada tarikan', 'target' => [10, 0, 0], 'actual' => [0, 0, 0], 'verify' => true],
            ['name' => 'Menunggu gudang', 'target' => [10, 0, 0], 'actual' => [0, 0, 0], 'verify' => false],
        ];
    }
}

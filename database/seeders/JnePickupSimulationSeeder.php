<?php

namespace Database\Seeders;

use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Models\Customer;
use App\Models\JneShipment;
use App\Models\JneShipperAlias;
use App\Models\PickupCashlessAwb;
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

class JnePickupSimulationSeeder extends Seeder
{
    public function __construct(
        private ImportReportAwbs $importer,
        private ProjectJneShipments $projector,
        private CreateSession $createSession,
        private VerifyItem $verifyItem,
    ) {}

    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new RuntimeException('Simulasi JNE hanya boleh dijalankan di local atau testing.');
        }

        $admin = User::where('role', 'admin_supervisor')->where('is_active', true)->orderBy('id')->first();
        if (! $admin) {
            throw new RuntimeException('Buat Admin aktif sebelum menjalankan simulasi JNE.');
        }

        $day = CarbonImmutable::now(config('jne-reports.source_timezone'))->startOfDay();
        $summary = DB::transaction(function () use ($admin, $day): array {
            $staff = User::firstOrCreate(['email' => 'jne-simulation-staff@example.test'], [
                'name' => '[SIM JNE] Staff Pickup', 'role' => 'pickup_staff', 'is_active' => true,
                'password' => Hash::make(Str::random(64)), 'email_verified_at' => now(),
            ]);
            if ($staff->name !== '[SIM JNE] Staff Pickup' || $staff->role !== 'pickup_staff' || ! $staff->is_active) {
                throw new RuntimeException('Identitas staff simulasi sudah dipakai atau diubah; data tidak ditimpa.');
            }

            $customers = [];
            foreach ($this->scenarios() as $number => $scenario) {
                $code = 'SIM'.(100 + $number);
                $name = '[SIM JNE '.$scenario['id'].'] Irfan - '.$scenario['label'];
                $customer = Customer::firstOrCreate(['customer_code' => $code], [
                    'name' => $name, 'pickup_address' => 'Alamat simulasi JNE', 'contact' => 'simulasi@example.test',
                    'created_by' => $admin->id, 'is_active' => true,
                ]);
                if ($customer->name !== $name) {
                    throw new RuntimeException("Kode {$code} sudah dipakai customer lain; data tidak ditimpa.");
                }
                JneShipperAlias::firstOrCreate(['customer_id' => $customer->id, 'shipper_name' => $code.' IRFAN SIMULASI'], ['is_active' => true, 'created_by' => $admin->id, 'updated_by' => $admin->id]);
                $customers[$scenario['id']] = $customer;
            }

            $summary = [];
            foreach ($this->scenarios() as $scenario) {
                $customer = $customers[$scenario['id']];
                $pickupDay = $scenario['id'] === 'S05' ? $day->subDay() : $day;
                $entryDay = in_array($scenario['id'], ['S05', 'S06'], true) ? $day->subDay() : $day;
                $tasks = [$this->pickup($scenario, $customer, $staff, $admin, $pickupDay, 1)];
                if ($scenario['id'] === 'S08') {
                    $tasks[] = $this->pickup($scenario, $customer, $staff, $admin, $pickupDay, 2);
                }
                $rows = $this->rows($scenario, $customer, $tasks[0], $entryDay, $day);

                if ($scenario['id'] === 'S11') {
                    foreach ($rows as $row) {
                        if ($row['SIM_CATEGORY'] === 'cashless_hybrid') {
                            PickupCashlessAwb::firstOrCreate(['awb' => $row['AWB']], [
                                'pickup_task_id' => $tasks[0]->id, 'customer_id' => $customer->id,
                                'original_awb' => $row['AWB'], 'raw_awb' => $row['AWB'], 'created_by' => $admin->id,
                            ]);
                        }
                    }
                }

                if ($scenario['id'] === 'S07') {
                    $rows = [...$rows, ...array_slice($rows, 0, 20)];
                }

                if ($scenario['id'] === 'S12') {
                    $initial = array_values(array_filter($rows, fn (array $row): bool => (int) substr($row['AWB'], -4) <= ($row['SIM_CATEGORY'] === 'manual_hybrid' ? 90 : 180)));
                    $this->report($scenario, $customer, $admin, $day, $entryDay, $initial, 'initial');
                }
                $this->report($scenario, $customer, $admin, $day, $entryDay, $rows, 'final');

                if ($scenario['id'] === 'S13') {
                    $conflicting = array_slice($rows, 0, 10);
                    foreach ($conflicting as &$row) {
                        $row['SHIPPER_NAME'] = $customers['S10']->customer_code.' IRFAN SIMULASI';
                        $row['CUSTOMER_CODE'] = $customers['S10']->customer_code;
                    }
                    unset($row);
                    $this->report($scenario, $customer, $admin, $day, $entryDay, $conflicting, 'conflict');
                }

                $awbs = array_unique(array_column($rows, 'AWB'));
                $summary[] = [
                    $scenario['id'], $scenario['label'], $customer->customer_code,
                    '100 / 200', count($awbs),
                    JneShipment::whereIn('awb', $awbs)->where('customer_match_status', 'MATCHED')->count(),
                    JneShipment::whereIn('awb', $awbs)->where('match_status', 'MATCHED')->whereIn('pickup_task_id', array_map(fn (PickupTask $task): int => $task->id, $tasks))->count(),
                ];
            }

            return $summary;
        });

        $this->command->table(['Kasus', 'Skenario', 'Kode', 'POP M / C', 'Resi unik', 'Customer cocok', 'Pickup cocok'], $summary);
        $this->command->warn('Hasil memakai importer dan matcher saat ini. Kode + tanggal belum otomatis menghubungkan pickup; hasil tidak dipaksakan oleh seeder.');
        $this->command->info('Cari customer [SIM JNE] atau kode SIM100-SIM113. CSV tersimpan di disk jne_reports: simulations/jne-pickup/'.$day->format('Ymd').'.');
    }

    /** @return list<array{id: string, label: string, manual: int, cashless: int}> */
    private function scenarios(): array
    {
        return [
            ['id' => 'S01', 'label' => 'Kode dan tanggal sama - lengkap', 'manual' => 100, 'cashless' => 200],
            ['id' => 'S02', 'label' => 'Report parsial - kurang 30', 'manual' => 90, 'cashless' => 180],
            ['id' => 'S03', 'label' => 'Belum ada resi di report', 'manual' => 0, 'cashless' => 0],
            ['id' => 'S04', 'label' => 'Report berlebih - lebih 10', 'manual' => 105, 'cashless' => 205],
            ['id' => 'S05', 'label' => 'Impor terlambat - pickup kemarin', 'manual' => 100, 'cashless' => 200],
            ['id' => 'S06', 'label' => 'Tanggal report berbeda dari pickup', 'manual' => 100, 'cashless' => 200],
            ['id' => 'S07', 'label' => '20 baris duplikat dalam CSV', 'manual' => 100, 'cashless' => 200],
            ['id' => 'S08', 'label' => 'Dua pickup customer di hari sama', 'manual' => 100, 'cashless' => 200],
            ['id' => 'S09', 'label' => 'Kode sumber tidak terdaftar', 'manual' => 10, 'cashless' => 0],
            ['id' => 'S10', 'label' => 'Pembanding referensi pickup cocok', 'manual' => 100, 'cashless' => 200],
            ['id' => 'S11', 'label' => 'Pembanding 200 AWB Sertim Cashless', 'manual' => 100, 'cashless' => 200],
            ['id' => 'S12', 'label' => 'Impor bertahap 270 lalu 300 resi', 'manual' => 100, 'cashless' => 200],
            ['id' => 'S13', 'label' => '10 AWB berbeda customer antar-report', 'manual' => 100, 'cashless' => 200],
            ['id' => 'S14', 'label' => 'Total pas - kategori 105 manual 195 cashless', 'manual' => 105, 'cashless' => 195],
        ];
    }

    /** @param array{id: string, label: string, manual: int, cashless: int} $scenario */
    private function pickup(array $scenario, Customer $customer, User $staff, User $admin, CarbonImmutable $day, int $sequence): PickupTask
    {
        $reference = str_pad('SIMJNE'.$day->format('Ymd').$scenario['id'].$sequence, 26, '0');
        $marker = '[SIM JNE '.$scenario['id'].'] '.$scenario['label'];
        $task = PickupTask::firstOrCreate(['reference' => $reference], [
            'customer_id' => $customer->id, 'customer_name_snapshot' => $customer->name,
            'pickup_address' => $customer->pickup_address, 'contact_snapshot' => $customer->contact,
            'scheduled_at' => $day->setTime(8 + $sequence, 0)->utc(), 'status' => 'PICKED_UP', 'version' => 1,
            'execution_started_at' => $day->setTime(8 + $sequence, 0)->utc(), 'assigned_staff_id' => $staff->id,
            'created_by' => $admin->id, 'notes' => $marker.'; target uji: kode customer + tanggal paket, bukan tanggal impor.',
        ]);
        if ($task->customer_id !== $customer->id || ! str_starts_with($task->notes ?? '', $marker)) {
            throw new RuntimeException('Referensi pickup simulasi sudah dipakai atau diubah; data tidak ditimpa.');
        }
        if (! $task->wasRecentlyCreated) {
            return $task;
        }

        $quantities = ['manual_hybrid' => $scenario['id'] === 'S08' ? 50 : 100, 'cashless_hybrid' => $scenario['id'] === 'S08' ? 100 : 200, 'css_orion' => 0];
        $task->visits()->create(['staff_id' => $staff->id, 'started_at' => $task->execution_started_at, 'recorded_at' => $task->scheduled_at, 'outcome' => 'COLLECTED']);
        $task->proof()->create([
            ...$quantities, 'staff_id' => $staff->id, 'submission_key' => (string) Str::uuid(),
            'customer_name' => $customer->name, 'pickup_address' => $customer->pickup_address, 'contact' => $customer->contact,
            'picked_up_at' => $task->scheduled_at, 'finalized_at' => $task->scheduled_at, 'notes' => $marker,
        ]);
        $task->events()->create(['action' => 'pickup_finalized', 'actor_id' => $staff->id, 'task_version' => $task->version, 'occurred_at' => $task->scheduled_at]);
        $session = $this->createSession->handle($staff, [$task->id], (string) Str::uuid());
        $this->verifyItem->handle($admin, $session->id, $session->items()->sole()->id, ['expected_version' => $session->version, ...$quantities]);

        return $task;
    }

    /**
     * @param  array{id: string, label: string, manual: int, cashless: int}  $scenario
     * @return list<array<string, string>>
     */
    private function rows(array $scenario, Customer $customer, PickupTask $task, CarbonImmutable $entryDay, CarbonImmutable $day): array
    {
        $rows = [];
        foreach (['manual_hybrid' => $scenario['manual'], 'cashless_hybrid' => $scenario['cashless']] as $category => $quantity) {
            for ($number = 1; $number <= $quantity; $number++) {
                $rows[] = [
                    'AWB' => 'SIMJNE'.$day->format('Ymd').$scenario['id'].($category === 'manual_hybrid' ? 'M' : 'C').str_pad((string) $number, 4, '0', STR_PAD_LEFT),
                    'ID_ACCOUNT' => 'SIM_JNE_ACCOUNT',
                    'CUSTOMER_CODE' => $scenario['id'] === 'S09' ? 'SIM999' : $customer->customer_code,
                    'SHIPPER_NAME' => $scenario['id'] === 'S09' ? 'Shopee International' : $customer->customer_code.' IRFAN SIMULASI',
                    'CONSIGNEE_NAME' => 'Penerima simulasi', 'STATUS_WEB' => 'ON PROCESS', 'STATUS_POD' => '', 'AWB_CANCEL' => 'N',
                    'NOREF' => $scenario['id'] === 'S10' ? $task->reference : '',
                    'TGL_ENTRY' => $entryDay->setTime(12, 0)->format('Y-m-d H:i:s'),
                    'TGL_TARIK_REPORT' => CarbonImmutable::now(config('jne-reports.source_timezone'))->format('Y-m-d H:i:s'),
                    'SIM_CATEGORY' => $category,
                ];
            }
        }

        return $rows;
    }

    /**
     * @param  array{id: string, label: string, manual: int, cashless: int}  $scenario
     * @param  list<array<string, string>>  $rows
     */
    private function report(array $scenario, Customer $customer, User $admin, CarbonImmutable $day, CarbonImmutable $entryDay, array $rows, string $batch): void
    {
        $key = hash('sha256', 'jne-pickup-simulation:'.$day->format('Ymd').':'.$scenario['id'].':'.$batch);
        $job = ReportJob::where('schedule_key', $key)->first();
        if ($job && data_get($job->getAttribute('parameters'), 'simulation.scenario') !== $scenario['id']) {
            throw new RuntimeException('Kunci report simulasi sudah dipakai; data tidak ditimpa.');
        }
        if (! $job) {
            $stream = fopen('php://temp', 'w+b');
            if ($stream === false) {
                throw new RuntimeException('CSV simulasi tidak dapat dibuat.');
            }
            try {
                fputcsv($stream, array_keys($rows[0] ?? array_fill_keys(['AWB', 'ID_ACCOUNT', 'CUSTOMER_CODE', 'SHIPPER_NAME', 'CONSIGNEE_NAME', 'STATUS_WEB', 'STATUS_POD', 'AWB_CANCEL', 'NOREF', 'TGL_ENTRY', 'TGL_TARIK_REPORT', 'SIM_CATEGORY'], '')), ',', '"', '');
                foreach ($rows as $row) {
                    fputcsv($stream, array_values($row), ',', '"', '');
                }
                rewind($stream);
                $csv = stream_get_contents($stream);
            } finally {
                fclose($stream);
            }
            if ($csv === false) {
                throw new RuntimeException('CSV simulasi tidak dapat dibaca.');
            }
            $path = 'simulations/jne-pickup/'.$day->format('Ymd').'/'.$scenario['id'].'-'.$batch.'.csv';
            if (! Storage::disk('jne_reports')->put($path, $csv)) {
                throw new RuntimeException('CSV simulasi tidak dapat disimpan.');
            }
            $job = ReportJob::create([
                'customer_account' => 'SIM_JNE_ACCOUNT', 'date_from' => $entryDay->toDateString(), 'date_thru' => $entryDay->toDateString(),
                'source' => 'apex', 'report_type' => 'apex', 'report_mode' => 'P', 'status' => 'COMPLETED',
                'created_by' => $admin->id, 'schedule_key' => $key, 'started_at' => now(), 'completed_at' => now(),
                'file_path' => $path, 'file_checksum' => hash('sha256', $csv), 'file_size' => strlen($csv), 'file_mime' => 'text/csv', 'row_count' => count($rows),
                'parameters' => ['simulation' => ['scenario' => $scenario['id'], 'label' => $scenario['label'], 'customer_code' => $customer->customer_code,
                    'batch' => $batch, 'grouping_target' => 'customer_code_and_entry_date', 'category_column' => 'SIM_CATEGORY', 'synthetic' => true]],
            ]);
            $job->recordEvent('CSV sintetis dari JnePickupSimulationSeeder; tanpa penarikan ke JNE.');
        }

        $this->importer->handle($job->id);
        if ($job->projection_status !== 'PROJECTED') {
            $this->projector->handle($job->id);
        }
    }
}

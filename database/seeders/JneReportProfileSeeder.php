<?php

namespace Database\Seeders;

use App\Models\JneReportProfile;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class JneReportProfileSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $admin = User::where('role', 'admin_supervisor')->where('is_active', true)->orderBy('id')->first();
        if ($admin === null) {
            throw new RuntimeException('Buat Admin aktif dengan app:create-operational-admin sebelum menjalankan seeder penarikan JNE.');
        }

        DB::transaction(function () use ($admin): void {
            foreach ([
                ['source' => 'hybrid', 'report_type' => 'combined', 'customer_account' => 'HYBRID_GABUNGAN', 'label' => 'Hybrid ROBERTO + NURALAMT', 'lookback_days' => 1],
                ['source' => 'apex', 'report_type' => 'unresolved', 'customer_account' => 'AWB_AKTIF', 'label' => 'Pembaruan resi belum delivered / cancel', 'lookback_days' => 60],
                ['source' => 'apex', 'report_type' => 'apex', 'customer_account' => '20087000', 'label' => 'Report customer 20087000', 'lookback_days' => 1],
            ] as $profile) {
                JneReportProfile::firstOrCreate([
                    'source' => $profile['source'],
                    'report_type' => $profile['report_type'],
                    'customer_account' => $profile['customer_account'],
                ], [
                    'label' => $profile['label'],
                    'lookback_days' => $profile['lookback_days'],
                    'mode' => 'rolling',
                    'enabled' => true,
                    'interval_minutes' => 30,
                    'next_run_at' => now(),
                    'created_by' => $admin->id,
                    'updated_by' => $admin->id,
                ]);
            }
        });
    }
}

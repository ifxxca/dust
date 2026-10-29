<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::transaction(function (): void {
            $profiles = DB::table('jne_report_profiles')->where('source', 'hybrid')->where('report_type', 'combined')->where('customer_account', 'HYBRID_GABUNGAN')->lockForUpdate()->get();
            foreach ($profiles as $profile) {
                foreach (['HYBRID_PM' => 'Hybrid Server PM', 'HYBRID_PUMAN' => 'Hybrid Server Puman'] as $account => $label) {
                    $values = (array) $profile;
                    unset($values['id']);
                    DB::table('jne_report_profiles')->insertOrIgnore([
                        ...$values, 'customer_account' => $account, 'label' => $label,
                        'last_run_at' => null, 'last_error' => null, 'version' => 1,
                        'created_at' => now(), 'updated_at' => now(),
                    ]);
                }
                DB::table('jne_report_profiles')->where('id', $profile->id)->update([
                    'enabled' => false, 'next_run_at' => null, 'version' => $profile->version + 1,
                    'last_error' => 'Jadwal dipisah menjadi Hybrid Server PM dan Server Puman. Riwayat dan batch lama tetap tersimpan.', 'updated_at' => now(),
                ]);
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        throw new RuntimeException('Jadwal per server tidak dapat digabung otomatis tanpa mengubah pilihan operator. Gunakan migrasi lanjutan; riwayat batch tetap dipertahankan.');
    }
};

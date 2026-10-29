<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('cashless_entry_items', function (Blueprint $table): void {
            $table->index(['pickup_cashless_awb_id', 'id'], 'cashless_entry_record_history');
            $table->unique(['batch_id', 'pickup_cashless_awb_id'], 'cashless_entry_batch_record');
        });
        Schema::table('cashless_entry_items', function (Blueprint $table): void {
            $table->dropUnique(['pickup_cashless_awb_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::table('cashless_entry_items')->groupBy('pickup_cashless_awb_id')->havingRaw('COUNT(*) > 1')->exists()) {
            throw new RuntimeException('Riwayat retry tidak dapat dihapus. Pertahankan migrasi cashless retry.');
        }
        Schema::table('cashless_entry_items', function (Blueprint $table): void {
            $table->unique('pickup_cashless_awb_id');
        });
        Schema::table('cashless_entry_items', function (Blueprint $table): void {
            $table->dropUnique('cashless_entry_batch_record');
            $table->dropIndex('cashless_entry_record_history');
        });
    }
};

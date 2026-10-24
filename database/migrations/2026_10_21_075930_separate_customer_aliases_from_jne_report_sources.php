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
        Schema::table('jne_report_profiles', fn (Blueprint $table) => $table->string('label', 150)->nullable());
        Schema::table('jne_shipper_aliases', function (Blueprint $table): void {
            $table->foreignId('jne_report_profile_id')->nullable()->change();
            $table->string('mapping_key', 64)->nullable()->unique();
            $table->index(['alias_key', 'is_active'], 'jne_global_alias_lookup');
        });
        $seen = [];
        foreach (DB::table('jne_shipper_aliases')->orderByDesc('is_active')->orderBy('id')->cursor() as $alias) {
            $key = hash('sha256', $alias->customer_id.':'.$alias->alias_key);
            if (! isset($seen[$key])) {
                DB::table('jne_shipper_aliases')->where('id', $alias->id)->update(['mapping_key' => $key]);
                $seen[$key] = true;
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        throw new LogicException('Alias customer sudah terpisah dari sumber report. Gunakan migrasi perbaikan; sumber untuk alias baru tidak dapat direkonstruksi.');
    }
};

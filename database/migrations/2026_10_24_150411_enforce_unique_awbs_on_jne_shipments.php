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
        $duplicates = DB::table('jne_shipments')->selectRaw('UPPER(TRIM(awb)) as normalized_awb')->groupByRaw('UPPER(TRIM(awb))')->havingRaw('count(*) > 1')->exists();
        if ($duplicates) {
            throw new RuntimeException('JNE registry contains duplicate normalized AWBs. Review existing ownership, pickup claims and observation history before applying AWB uniqueness; no records were merged or removed.');
        }
        DB::table('jne_shipments')->update(['awb' => DB::raw('UPPER(TRIM(awb))')]);
        Schema::table('jne_shipments', function (Blueprint $table): void {
            $table->unique('awb');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('jne_shipments', function (Blueprint $table): void {
            $table->dropUnique(['awb']);
        });
    }
};

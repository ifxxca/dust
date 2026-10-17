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
        Schema::table('handover_items', function (Blueprint $table) {
            $table->unsignedInteger('verified_pickup_revision')->nullable();
        });
        DB::table('handover_items')->where('status', '!=', 'PENDING')->update(['verified_pickup_revision' => 0]);
        Schema::table('handover_events', function (Blueprint $table) {
            $table->string('reason', 500)->nullable();
            $table->json('changes')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('handover_events', fn (Blueprint $table) => $table->dropColumn(['reason', 'changes']));
        Schema::table('handover_items', fn (Blueprint $table) => $table->dropColumn('verified_pickup_revision'));
    }
};

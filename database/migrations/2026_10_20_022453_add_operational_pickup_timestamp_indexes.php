<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('pickup_records', fn (Blueprint $table) => $table->index(['picked_up_at', 'pickup_task_id'], 'pop_monitoring_picked_up'));
        Schema::table('pickup_visits', fn (Blueprint $table) => $table->index(['recorded_at', 'pickup_task_id'], 'visits_monitoring_recorded'));
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('pickup_records', fn (Blueprint $table) => $table->dropIndex('pop_monitoring_picked_up'));
        Schema::table('pickup_visits', fn (Blueprint $table) => $table->dropIndex('visits_monitoring_recorded'));
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pickup_visits', fn (Blueprint $table) => $table->index(['started_at', 'pickup_task_id'], 'visits_monitoring_started'));
        Schema::table('handover_items', fn (Blueprint $table) => $table->index(['verified_at', 'pickup_task_id'], 'items_monitoring_received'));
        Schema::table('pickup_processing_records', fn (Blueprint $table) => $table->index(['created_at', 'pickup_task_id'], 'processing_monitoring_recorded'));
        Schema::table('pickup_records', fn (Blueprint $table) => $table->index(['finalized_at', 'pickup_task_id'], 'pop_monitoring_backlog'));
    }

    public function down(): void
    {
        Schema::table('pickup_visits', fn (Blueprint $table) => $table->dropIndex('visits_monitoring_started'));
        Schema::table('handover_items', fn (Blueprint $table) => $table->dropIndex('items_monitoring_received'));
        Schema::table('pickup_processing_records', fn (Blueprint $table) => $table->dropIndex('processing_monitoring_recorded'));
        Schema::table('pickup_records', fn (Blueprint $table) => $table->dropIndex('pop_monitoring_backlog'));
    }
};

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
        Schema::create('pickup_notification_reads', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('pickup_task_event_id')->constrained()->cascadeOnDelete();
            $table->timestamp('read_at');
            $table->primary(['user_id', 'pickup_task_event_id']);
        });
        Schema::table('pickup_task_events', function (Blueprint $table) {
            $table->index(['action', 'id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('pickup_task_events', function (Blueprint $table) {
            $table->dropIndex(['action', 'id']);
        });
        Schema::dropIfExists('pickup_notification_reads');
    }
};

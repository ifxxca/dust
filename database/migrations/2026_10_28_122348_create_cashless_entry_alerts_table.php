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
        Schema::create('cashless_entry_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('batch_id')->unique()->constrained('cashless_entry_batches')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'read_at', 'id']);
        });
        Schema::create('cashless_entry_alert_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('alert_id')->constrained('cashless_entry_alerts')->cascadeOnDelete();
            $table->foreignId('device_id')->constrained('mobile_push_devices')->cascadeOnDelete();
            $table->string('status', 20);
            $table->timestamps();
            $table->unique(['alert_id', 'device_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cashless_entry_alert_deliveries');
        Schema::dropIfExists('cashless_entry_alerts');
    }
};

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
        Schema::create('mobile_push_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('personal_access_token_id')->constrained()->cascadeOnDelete();
            $table->uuid('installation_id')->unique();
            $table->text('fcm_token');
            $table->char('token_hash', 64)->unique();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('mobile_push_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('mobile_push_device_id')->constrained()->cascadeOnDelete();
            $table->foreignId('pickup_task_event_id')->constrained()->cascadeOnDelete();
            $table->string('status', 20);
            $table->timestamps();
            $table->unique(['mobile_push_device_id', 'pickup_task_event_id'], 'mobile_push_delivery_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('mobile_push_deliveries');
        Schema::dropIfExists('mobile_push_devices');
    }
};

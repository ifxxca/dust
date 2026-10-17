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
        Schema::create('handover_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('handover_session_id')->constrained()->restrictOnDelete();
            $table->foreignId('pickup_task_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('pickup_record_id')->unique()->constrained()->restrictOnDelete();
            $table->unsignedInteger('manual_hybrid')->nullable();
            $table->unsignedInteger('cashless_hybrid')->nullable();
            $table->unsignedInteger('css_orion')->nullable();
            $table->string('status', 32)->default('PENDING');
            $table->text('discrepancy_notes')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->dateTime('verified_at', 6)->nullable();
            $table->index(['handover_session_id', 'status']);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('handover_items');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pickup_processing_records', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('pickup_task_id')->constrained()->restrictOnDelete();
            $table->string('category', 32);
            $table->string('system', 24);
            $table->unsignedInteger('revision');
            $table->uuid('submission_key')->unique();
            $table->string('payload_hash', 64);
            $table->unsignedInteger('successful_quantity');
            $table->unsignedInteger('failed_quantity');
            $table->unsignedInteger('pending_quantity');
            $table->unsignedInteger('unknown_quantity');
            $table->string('external_reference', 100)->nullable();
            $table->string('reason', 500);
            $table->unsignedInteger('pickup_revision');
            $table->unsignedInteger('handover_revision')->nullable();
            $table->unsignedInteger('received_quantity')->nullable();
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->timestamp('created_at');
            $table->unique(['pickup_task_id', 'category', 'system', 'revision'], 'processing_slot_revision');
            $table->index(['system', 'external_reference'], 'processing_reference');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pickup_processing_records');
    }
};

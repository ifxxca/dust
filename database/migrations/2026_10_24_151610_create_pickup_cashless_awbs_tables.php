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
        Schema::create('pickup_cashless_awbs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('pickup_task_id')->constrained()->restrictOnDelete();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->string('original_awb', 100);
            $table->string('raw_awb', 100)->nullable();
            $table->string('awb', 100)->nullable()->unique();
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });
        Schema::create('pickup_cashless_awb_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('pickup_cashless_awb_id')->constrained()->restrictOnDelete();
            $table->foreignId('pickup_task_id')->constrained()->restrictOnDelete();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->uuid('submission_key')->unique();
            $table->string('payload_hash', 64);
            $table->unsignedInteger('revision');
            $table->string('previous_awb', 100)->nullable();
            $table->string('awb', 100)->nullable();
            $table->string('previous_raw_awb', 100)->nullable();
            $table->string('raw_awb', 100)->nullable();
            $table->string('reason', 500)->nullable();
            $table->json('affected_results');
            $table->timestamp('created_at');
            $table->unique(['pickup_cashless_awb_id', 'revision'], 'cashless_awb_revision_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pickup_cashless_awb_events');
        Schema::dropIfExists('pickup_cashless_awbs');
    }
};

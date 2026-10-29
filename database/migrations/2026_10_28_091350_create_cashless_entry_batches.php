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
        Schema::create('cashless_entry_batches', function (Blueprint $table): void {
            $table->id();
            $table->uuid('submission_key')->unique();
            $table->foreignId('pickup_task_id')->constrained()->restrictOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->string('source', 24)->nullable();
            $table->string('status', 24)->default('WAITING_SOURCE');
            $table->string('ho_number', 64)->nullable();
            $table->string('worker_id', 100)->nullable();
            $table->uuid('claim_key')->nullable()->unique();
            $table->string('claim_token_hash', 64)->nullable();
            $table->timestamp('lease_until')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->json('verification')->nullable();
            $table->string('error_message', 1000)->nullable();
            $table->timestamps();
            $table->index(['source', 'status', 'id']);
            $table->unique(['source', 'ho_number']);
        });
        Schema::create('cashless_entry_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('batch_id')->constrained('cashless_entry_batches')->restrictOnDelete();
            $table->foreignId('pickup_cashless_awb_id')->unique()->constrained()->restrictOnDelete();
            $table->string('awb', 100);
            $table->string('status', 24)->default('PENDING');
            $table->string('message', 1000)->nullable();
            $table->string('previous_ho', 64)->nullable();
            $table->unsignedInteger('elapsed_ms')->nullable();
            $table->timestamps();
            $table->index(['batch_id', 'status', 'id']);
        });
        Schema::create('cashless_entry_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('batch_id')->constrained('cashless_entry_batches')->restrictOnDelete();
            $table->uuid('event_key');
            $table->string('payload_hash', 64);
            $table->string('type', 32);
            $table->json('evidence');
            $table->timestamp('created_at');
            $table->unique(['batch_id', 'event_key']);
        });
        Schema::create('cashless_entry_lanes', function (Blueprint $table): void {
            $table->string('source', 24)->primary();
            $table->foreignId('active_batch_id')->nullable()->constrained('cashless_entry_batches')->restrictOnDelete();
        });
        DB::table('cashless_entry_lanes')->insert([
            ['source' => 'roberto'], ['source' => 'nuralamt'],
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cashless_entry_lanes');
        Schema::dropIfExists('cashless_entry_events');
        Schema::dropIfExists('cashless_entry_items');
        Schema::dropIfExists('cashless_entry_batches');
    }
};

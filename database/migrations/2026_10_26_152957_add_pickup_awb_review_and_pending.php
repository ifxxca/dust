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
        Schema::table('pickup_processing_reconciliations', function (Blueprint $table): void {
            $table->boolean('review_open')->default(false);
            $table->timestamp('locked_at')->nullable();
        });
        Schema::create('pickup_pending_items', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 26)->unique();
            $table->foreignId('pickup_task_id')->constrained()->restrictOnDelete();
            $table->string('category', 32);
            $table->string('label', 150);
            $table->string('reason', 500);
            $table->string('status', 24)->default('PENDING');
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('jne_shipment_id')->nullable()->unique()->constrained()->restrictOnDelete();
            $table->date('processing_date')->nullable()->index();
            $table->timestamp('ready_at')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('updated_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->index(['pickup_task_id', 'status']);
        });
        Schema::create('pickup_awb_exclusions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('pickup_task_id')->constrained()->restrictOnDelete();
            $table->foreignId('jne_shipment_id')->constrained()->restrictOnDelete();
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->string('reason', 500);
            $table->timestamps();
            $table->unique(['pickup_task_id', 'jne_shipment_id'], 'pickup_awb_exclusion_unique');
        });
        Schema::create('pickup_awb_review_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('pickup_task_id')->constrained()->restrictOnDelete();
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->string('action', 32);
            $table->string('reason', 500);
            $table->json('evidence');
            $table->timestamp('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pickup_awb_review_events');
        Schema::dropIfExists('pickup_awb_exclusions');
        Schema::dropIfExists('pickup_pending_items');
        Schema::table('pickup_processing_reconciliations', function (Blueprint $table): void {
            $table->dropColumn(['review_open', 'locked_at']);
        });
    }
};

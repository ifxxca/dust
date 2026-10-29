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
        Schema::create('pickup_processing_reconciliations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('pickup_task_id')->unique()->constrained()->restrictOnDelete();
            $table->string('status', 32)->default('AWAITING_VERIFICATION');
            $table->unsignedInteger('revision')->default(0);
            $table->unsignedBigInteger('input_version')->default(0);
            $table->unsignedBigInteger('evaluated_input_version')->default(0);
            $table->json('categories')->nullable();
            $table->json('reasons')->nullable();
            $table->json('evidence')->nullable();
            $table->string('evidence_hash', 64)->nullable();
            $table->timestamp('evaluated_at')->nullable();
            $table->timestamp('next_evaluation_at')->nullable()->index();
            $table->string('last_error', 500)->nullable();
            $table->timestamps();
            $table->index(['status', 'next_evaluation_at'], 'pickup_reconciliation_due');
        });
        Schema::create('pickup_processing_reconciliation_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('pickup_task_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('revision');
            $table->json('snapshot');
            $table->timestamp('created_at');
            $table->unique(['pickup_task_id', 'revision'], 'pickup_reconciliation_revision');
        });
        Schema::create('pickup_awb_manifests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('pickup_task_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('revision');
            $table->string('content_hash', 64);
            $table->string('status', 24)->default('PENDING');
            $table->json('snapshot');
            $table->string('xlsx_path')->nullable();
            $table->string('pdf_path')->nullable();
            $table->json('checksums')->nullable();
            $table->string('last_error', 500)->nullable();
            $table->unsignedInteger('render_attempts')->default(0);
            $table->timestamp('next_render_at')->nullable();
            $table->timestamps();
            $table->unique(['pickup_task_id', 'content_hash'], 'pickup_manifest_content');
            $table->unique(['pickup_task_id', 'revision'], 'pickup_manifest_revision');
        });
        Schema::create('pickup_awb_manifest_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('pickup_awb_manifest_id')->constrained()->restrictOnDelete();
            $table->string('awb', 100);
            $table->string('category', 32);
            $table->string('consignee_name', 500)->nullable();
            $table->unique(['pickup_awb_manifest_id', 'awb'], 'pickup_manifest_awb');
        });
        Schema::create('customer_awb_delivery_preferences', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->unique()->constrained()->restrictOnDelete();
            $table->boolean('enabled')->default(false);
            $table->string('channel', 24)->default('email');
            $table->string('recipient', 255)->nullable();
            $table->unsignedInteger('revision')->default(1);
            $table->foreignId('updated_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });
        Schema::create('pickup_awb_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('pickup_awb_manifest_id')->constrained()->restrictOnDelete();
            $table->string('channel', 24);
            $table->string('recipient', 255);
            $table->string('recipient_hash', 64);
            $table->string('status', 32)->default('READY');
            $table->uuid('submission_key')->unique();
            $table->unsignedInteger('preference_revision');
            $table->string('provider_message_id')->nullable();
            $table->string('last_error', 500)->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamps();
            $table->unique(['pickup_awb_manifest_id', 'channel', 'recipient_hash'], 'pickup_manifest_recipient');
            $table->index(['status', 'updated_at'], 'pickup_delivery_due');
        });
        Schema::create('customer_awb_delivery_preference_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->unsignedInteger('revision');
            $table->json('before');
            $table->json('after');
            $table->string('reason', 500);
            $table->timestamp('created_at');
            $table->unique(['customer_id', 'revision'], 'customer_awb_preference_revision');
        });
        Schema::create('pickup_awb_delivery_attempts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('pickup_awb_delivery_id')->constrained()->restrictOnDelete();
            $table->string('status', 32);
            $table->string('provider_message_id')->nullable();
            $table->string('error', 500)->nullable();
            $table->timestamp('started_at');
            $table->timestamp('finished_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pickup_awb_delivery_attempts');
        Schema::dropIfExists('pickup_awb_deliveries');
        Schema::dropIfExists('customer_awb_delivery_preference_events');
        Schema::dropIfExists('customer_awb_delivery_preferences');
        Schema::dropIfExists('pickup_awb_manifest_items');
        Schema::dropIfExists('pickup_awb_manifests');
        Schema::dropIfExists('pickup_processing_reconciliation_events');
        Schema::dropIfExists('pickup_processing_reconciliations');
    }
};

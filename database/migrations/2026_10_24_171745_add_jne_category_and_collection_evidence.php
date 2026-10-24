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
        Schema::table('jne_shipments', function (Blueprint $table): void {
            $table->string('category', 24)->nullable();
            $table->string('category_status', 24)->default('UNMATCHED');
            $table->string('category_method', 24)->nullable();
            $table->json('category_evidence')->nullable();
            $table->string('category_review_hash', 64)->nullable();
            $table->string('identity_review_hash', 64)->nullable();
            $table->index(['pickup_task_id', 'category_status', 'category']);
        });
        Schema::create('jne_collection_windows', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('pickup_task_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('jne_source_contract_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('status', 24)->default('OPEN');
            $table->json('required_sources')->nullable();
            $table->json('report_job_ids')->nullable();
            $table->json('report_evidence')->nullable();
            $table->unsignedBigInteger('source_high_water_id')->default(0);
            $table->string('proof_hash', 64)->nullable();
            $table->string('sertim_hash', 64)->nullable();
            $table->timestamp('cutoff_at')->nullable();
            $table->timestamp('attested_at')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('updated_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
        });
        Schema::create('jne_reconciliation_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('pickup_task_id')->constrained()->restrictOnDelete();
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->uuid('submission_key')->unique();
            $table->string('payload_hash', 64);
            $table->string('reason', 500);
            $table->json('before');
            $table->json('after');
            $table->timestamp('created_at');
            $table->index(['pickup_task_id', 'id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('jne_reconciliation_events');
        Schema::dropIfExists('jne_collection_windows');
        Schema::table('jne_shipments', function (Blueprint $table): void {
            $table->dropIndex(['pickup_task_id', 'category_status', 'category']);
            $table->dropColumn(['category', 'category_status', 'category_method', 'category_evidence', 'category_review_hash', 'identity_review_hash']);
        });
    }
};

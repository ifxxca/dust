<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pickup_customer_reconciliations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->date('business_date');
            $table->foreignId('anchor_task_id')->constrained('pickup_tasks')->restrictOnDelete();
            $table->unsignedInteger('pickup_count')->default(0);
            $table->string('status', 32)->default('AWAITING_VERIFICATION');
            $table->unsignedInteger('revision')->default(0);
            $table->json('categories')->nullable();
            $table->json('reasons')->nullable();
            $table->json('evidence')->nullable();
            $table->string('evidence_hash', 64)->nullable();
            $table->timestamp('evaluated_at')->nullable();
            $table->timestamp('locked_at')->nullable();
            $table->timestamps();
            $table->unique(['customer_id', 'business_date'], 'pickup_customer_day_unique');
        });
        Schema::table('pickup_processing_reconciliations', function (Blueprint $table): void {
            $table->foreignId('customer_reconciliation_id')->nullable()->constrained('pickup_customer_reconciliations', 'id', 'pickup_result_customer_day_fk')->nullOnDelete();
        });
        Schema::table('pickup_awb_manifests', function (Blueprint $table): void {
            $table->foreignId('customer_reconciliation_id')->nullable()->constrained('pickup_customer_reconciliations', 'id', 'pickup_manifest_customer_day_fk')->nullOnDelete();
        });
        Schema::create('pickup_customer_reconciliation_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_reconciliation_id')->constrained('pickup_customer_reconciliations', 'id', 'pickup_customer_event_day_fk')->restrictOnDelete();
            $table->unsignedInteger('revision');
            $table->json('snapshot');
            $table->timestamp('created_at');
            $table->unique(['customer_reconciliation_id', 'revision'], 'pickup_customer_event_revision');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pickup_customer_reconciliation_events');
        Schema::table('pickup_awb_manifests', function (Blueprint $table): void {
            $table->dropForeign('pickup_manifest_customer_day_fk');
            $table->dropColumn('customer_reconciliation_id');
        });
        Schema::table('pickup_processing_reconciliations', function (Blueprint $table): void {
            $table->dropForeign('pickup_result_customer_day_fk');
            $table->dropColumn('customer_reconciliation_id');
        });
        Schema::dropIfExists('pickup_customer_reconciliations');
    }
};

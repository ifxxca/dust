<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', fn (Blueprint $table) => $table->json('document_delivery_settings')->nullable());
        Schema::create('document_delivery_settings', function (Blueprint $table): void {
            $table->id();
            $table->string('session', 100)->nullable();
            $table->boolean('enabled')->default(false);
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
        });
        Schema::create('pickup_whatsapp_deliveries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->foreignId('pickup_task_id')->constrained()->restrictOnDelete();
            $table->foreignId('pickup_receipt_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('pickup_awb_manifest_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('deduplication_key', 64)->unique();
            $table->string('session', 100);
            $table->string('target', 100);
            $table->string('target_label', 255)->nullable();
            $table->string('status', 24)->default('READY');
            $table->json('parts');
            $table->unsignedInteger('attempts')->default(0);
            $table->string('last_error', 500)->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'updated_at']);
            $table->index(['pickup_task_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pickup_whatsapp_deliveries');
        Schema::dropIfExists('document_delivery_settings');
        Schema::table('customers', fn (Blueprint $table) => $table->dropColumn('document_delivery_settings'));
    }
};

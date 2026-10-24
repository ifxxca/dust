<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_jobs', function (Blueprint $table): void {
            $table->id();
            $table->string('customer_account', 100);
            $table->date('date_from');
            $table->date('date_thru');
            $table->string('report_mode', 20);
            $table->json('parameters')->nullable();
            $table->string('status', 24)->default('QUEUED');
            $table->string('worker_id', 100)->nullable();
            $table->uuid('claim_key')->nullable()->unique();
            $table->text('claim_token')->nullable();
            $table->unsignedTinyInteger('active_slot')->nullable()->unique();
            $table->unsignedInteger('attempt_count')->default(0);
            $table->timestamp('lease_expires_at')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->string('error_message', 1000)->nullable();
            $table->string('file_path')->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->string('file_checksum', 64)->nullable();
            $table->string('file_mime', 100)->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->index(['status', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_jobs');
    }
};

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
        Schema::create('report_job_batches', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('report_job_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('batch_number');
            $table->string('status', 16)->default('PLANNED');
            $table->uuid('start_key')->nullable()->unique();
            $table->string('file_path')->nullable();
            $table->string('file_checksum', 64)->nullable();
            $table->unsignedInteger('row_count')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->text('review_reason')->nullable();
            $table->unique(['report_job_id', 'batch_number']);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('report_job_batches');
    }
};

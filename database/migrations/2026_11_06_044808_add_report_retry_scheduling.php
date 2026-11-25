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
        Schema::table('report_jobs', function (Blueprint $table): void {
            $table->dateTime('retry_available_at')->nullable();
            $table->timestamp('retry_final_at')->nullable();
            $table->string('retry_classification', 24)->nullable();
            $table->string('retry_error_code', 64)->nullable();
            $table->string('retry_failure_key', 64)->nullable();
            $table->unsignedTinyInteger('retry_protocol')->nullable();
            $table->string('retry_submission_state', 20)->nullable();
            $table->index(['status', 'retry_available_at', 'id'], 'report_jobs_retry_due');
            $table->index(['retry_final_at', 'reviewed_at'], 'report_jobs_retry_attention');
        });
        Schema::create('report_source_controls', function (Blueprint $table): void {
            $table->string('source', 20)->primary();
            $table->dateTime('available_at')->nullable();
            $table->unsignedInteger('consecutive_failures')->default(0);
            $table->timestamp('updated_at')->nullable();
        });
        DB::table('report_source_controls')->insert(array_map(fn (string $source): array => ['source' => $source], ['apex', 'roberto', 'nuralamt', 'hybrid']));
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('report_source_controls');
        Schema::table('report_jobs', function (Blueprint $table): void {
            $table->dropIndex('report_jobs_retry_due');
            $table->dropIndex('report_jobs_retry_attention');
            $table->dropColumn(['retry_available_at', 'retry_final_at', 'retry_classification', 'retry_error_code', 'retry_failure_key', 'retry_protocol', 'retry_submission_state']);
        });
    }
};

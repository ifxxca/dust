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
        Schema::table('report_jobs', function (Blueprint $table) {
            $table->string('source_file_path')->nullable();
            $table->string('source_file_checksum', 64)->nullable();
            $table->unsignedInteger('source_row_count')->nullable();
            $table->unsignedInteger('awb_count')->nullable();
            $table->string('source_worker_id', 100)->nullable();
            $table->text('source_claim_token')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('report_jobs', function (Blueprint $table) {
            $table->dropColumn(['source_file_path', 'source_file_checksum', 'source_row_count', 'awb_count', 'source_worker_id', 'source_claim_token']);
        });
    }
};

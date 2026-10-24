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
        Schema::table('jne_report_profiles', function (Blueprint $table): void {
            $table->string('source', 20)->default('apex');
            $table->string('report_type', 20)->default('apex');
            $table->dropUnique(['customer_account']);
            $table->unique(['source', 'report_type', 'customer_account'], 'jne_profile_source_account_unique');
        });
        Schema::table('report_jobs', function (Blueprint $table): void {
            $table->string('source', 20)->default('apex');
            $table->string('report_type', 20)->default('apex');
            $table->unsignedInteger('row_count')->nullable();
            $table->index(['source', 'status', 'id']);
        });
        Schema::create('report_job_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('report_job_id')->constrained()->cascadeOnDelete();
            $table->string('status', 24);
            $table->string('worker_id', 100)->nullable();
            $table->string('message', 1000)->nullable();
            $table->timestamp('created_at');
            $table->index(['report_job_id', 'id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (DB::table('jne_report_profiles')->select('customer_account')->groupBy('customer_account')->havingRaw('count(*) > 1')->exists()) {
            throw new RuntimeException('Rollback ditolak: beberapa konfigurasi memakai account yang sama. Pertahankan data dan gunakan migrasi perbaikan.');
        }
        Schema::dropIfExists('report_job_events');
        Schema::table('report_jobs', function (Blueprint $table): void {
            $table->dropIndex(['source', 'status', 'id']);
            $table->dropColumn(['source', 'report_type', 'row_count']);
        });
        Schema::table('jne_report_profiles', function (Blueprint $table): void {
            $table->dropUnique('jne_profile_source_account_unique');
            $table->dropColumn(['source', 'report_type']);
            $table->unique('customer_account');
        });
    }
};

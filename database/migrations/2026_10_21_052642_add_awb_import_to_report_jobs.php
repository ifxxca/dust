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
            $table->string('import_status', 24)->default('NOT_IMPORTED');
            $table->unsignedInteger('imported_awb_count')->default(0);
            $table->unsignedInteger('duplicate_awb_count')->default(0);
            $table->timestamp('imported_at')->nullable();
            $table->string('import_error', 1000)->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('report_jobs', function (Blueprint $table) {
            $table->dropColumn(['import_status', 'imported_awb_count', 'duplicate_awb_count', 'imported_at', 'import_error']);
        });
    }
};

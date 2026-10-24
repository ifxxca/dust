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
        foreach (['jne_report_profiles', 'report_jobs'] as $name) {
            Schema::table($name, function (Blueprint $table): void {
                $table->char('national_account', 1)->default('N');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        foreach (['jne_report_profiles', 'report_jobs'] as $name) {
            Schema::table($name, function (Blueprint $table): void {
                $table->dropColumn('national_account');
            });
        }
    }
};

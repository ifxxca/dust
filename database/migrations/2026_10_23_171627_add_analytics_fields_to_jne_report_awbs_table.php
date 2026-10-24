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
        Schema::table('jne_report_awbs', function (Blueprint $table) {
            $table->string('service', 100)->nullable();
            $table->string('destination', 100)->nullable();
            $table->unsignedBigInteger('amount_cents')->nullable();
            $table->unsignedBigInteger('weight_grams')->nullable();
            $table->unsignedBigInteger('quantity')->nullable();
            $table->unsignedTinyInteger('metrics_version')->default(0);
            $table->index('entry_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('jne_report_awbs', function (Blueprint $table) {
            $table->dropIndex(['entry_at']);
            $table->dropColumn(['service', 'destination', 'amount_cents', 'weight_grams', 'quantity', 'metrics_version']);
        });
    }
};

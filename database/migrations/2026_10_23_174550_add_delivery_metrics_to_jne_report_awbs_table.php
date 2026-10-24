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
            $table->string('destination_name', 180)->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->unsignedSmallInteger('etd_days')->nullable();
            $table->index(['destination', 'destination_name'], 'jne_awb_destination_name_index');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('jne_report_awbs', function (Blueprint $table) {
            $table->dropIndex('jne_awb_destination_name_index');
            $table->dropColumn(['destination_name', 'delivered_at', 'etd_days']);
        });
    }
};

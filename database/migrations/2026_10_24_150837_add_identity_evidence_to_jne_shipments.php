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
        Schema::table('jne_shipments', function (Blueprint $table): void {
            $table->json('customer_match_candidates')->nullable();
        });
        Schema::table('jne_shipment_match_events', function (Blueprint $table): void {
            $table->json('evidence')->nullable();
        });
        Schema::table('jne_report_awbs', function (Blueprint $table): void {
            $table->index('awb');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('jne_shipments', fn (Blueprint $table) => $table->dropColumn('customer_match_candidates'));
        Schema::table('jne_shipment_match_events', fn (Blueprint $table) => $table->dropColumn('evidence'));
        Schema::table('jne_report_awbs', fn (Blueprint $table) => $table->dropIndex(['awb']));
    }
};

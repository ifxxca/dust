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
            $table->index(['last_observed_at', 'id'], 'jne_shipment_list_order');
        });
        Schema::table('jne_report_awbs', function (Blueprint $table): void {
            $table->index('shipper_name', 'jne_source_shipper_search');
            $table->index('consignee_name', 'jne_source_consignee_search');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('jne_shipments', function (Blueprint $table): void {
            $table->dropIndex('jne_shipment_list_order');
        });
        Schema::table('jne_report_awbs', function (Blueprint $table): void {
            $table->dropIndex('jne_source_shipper_search');
            $table->dropIndex('jne_source_consignee_search');
        });
    }
};

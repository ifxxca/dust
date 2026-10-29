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
        Schema::table('jne_report_awbs', function (Blueprint $table): void {
            $table->index(['entry_at', 'id', 'service', 'destination', 'amount_cents', 'weight_grams', 'quantity', 'delivered_at', 'etd_days'], 'jne_dashboard_source_metrics');
        });
        Schema::table('jne_shipments', function (Blueprint $table): void {
            $table->index(['latest_report_awb_id', 'customer_id', 'customer_match_status', 'tracking_status', 'customer_account', 'pickup_task_id', 'match_status', 'last_observed_at', 'awb'], 'jne_dashboard_shipment_metrics');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('jne_shipments', function (Blueprint $table): void {
            $table->dropIndex('jne_dashboard_shipment_metrics');
        });
        Schema::table('jne_report_awbs', function (Blueprint $table): void {
            $table->dropIndex('jne_dashboard_source_metrics');
        });
    }
};

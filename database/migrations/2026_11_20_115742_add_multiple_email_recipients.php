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
        Schema::table('customers', function (Blueprint $table): void {
            $table->json('additional_emails')->nullable();
        });
        Schema::table('customer_awb_delivery_preferences', function (Blueprint $table): void {
            $table->json('recipients')->nullable();
        });
        Schema::table('pickup_receipts', function (Blueprint $table): void {
            $table->json('recipient_statuses')->nullable();
        });
        Schema::table('receipt_attempts', function (Blueprint $table): void {
            $table->string('recipient')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('receipt_attempts', fn (Blueprint $table) => $table->dropColumn('recipient'));
        Schema::table('pickup_receipts', fn (Blueprint $table) => $table->dropColumn('recipient_statuses'));
        Schema::table('customer_awb_delivery_preferences', fn (Blueprint $table) => $table->dropColumn('recipients'));
        Schema::table('customers', fn (Blueprint $table) => $table->dropColumn('additional_emails'));
    }
};

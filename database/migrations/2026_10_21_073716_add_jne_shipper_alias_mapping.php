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
        Schema::table('jne_report_profiles', function (Blueprint $table): void {
            $table->string('customer_mapping_mode', 24)->default('ACCOUNT');
        });
        Schema::create('jne_shipper_aliases', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('jne_report_profile_id')->constrained()->restrictOnDelete();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->string('shipper_name', 500);
            $table->string('normalized_name', 500);
            $table->string('alias_key', 64);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('updated_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['jne_report_profile_id', 'alias_key', 'customer_id'], 'jne_alias_customer_unique');
        });
        Schema::table('jne_shipments', function (Blueprint $table): void {
            $table->foreignId('customer_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('customer_match_status', 24)->default('UNMATCHED');
            $table->string('customer_match_method', 24)->nullable();
            $table->string('customer_match_note', 500)->nullable();
        });
        Schema::table('jne_shipment_match_events', function (Blueprint $table): void {
            $table->foreignId('previous_customer_id')->nullable()->constrained('customers')->restrictOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('customer_match_status', 24)->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('jne_shipment_match_events', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('previous_customer_id');
            $table->dropConstrainedForeignId('customer_id');
            $table->dropColumn('customer_match_status');
        });
        Schema::table('jne_shipments', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('customer_id');
            $table->dropColumn(['customer_match_status', 'customer_match_method', 'customer_match_note']);
        });
        Schema::dropIfExists('jne_shipper_aliases');
        Schema::table('jne_report_profiles', fn (Blueprint $table) => $table->dropColumn('customer_mapping_mode'));
    }
};

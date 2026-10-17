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
        Schema::table('pickup_receipts', function (Blueprint $table) {
            $table->index('pickup_record_id', 'receipt_record_lookup');
            $table->dropUnique(['pickup_record_id']);
            $table->unsignedInteger('proof_revision')->default(0);
            $table->string('last_error', 255)->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->unique(['pickup_record_id', 'proof_revision']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('pickup_receipts', function (Blueprint $table) {
            $table->dropUnique(['pickup_record_id', 'proof_revision']);
            $table->dropColumn(['proof_revision', 'last_error', 'accepted_at']);
            $table->unique('pickup_record_id');
            $table->dropIndex('receipt_record_lookup');
        });
    }
};

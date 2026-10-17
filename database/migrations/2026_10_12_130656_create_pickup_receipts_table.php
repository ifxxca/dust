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
        Schema::create('pickup_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pickup_record_id')->unique()->constrained()->restrictOnDelete();
            $table->string('recipient');
            $table->string('channel', 20)->nullable();
            $table->string('status', 40)->default('PENDING_CONFIGURATION');
            $table->string('provider_message_id')->nullable();
            $table->dateTime('delivered_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pickup_receipts');
    }
};

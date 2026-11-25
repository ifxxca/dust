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
        Schema::table('pickup_customer_reconciliations', function (Blueprint $table): void {
            $table->json('approval_snapshot')->nullable();
            $table->json('post_lock_change')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('pickup_customer_reconciliations', function (Blueprint $table): void {
            $table->dropColumn(['approval_snapshot', 'post_lock_change']);
        });
    }
};

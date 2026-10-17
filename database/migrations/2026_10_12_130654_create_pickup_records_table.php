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
        Schema::create('pickup_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pickup_task_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('staff_id')->constrained('users')->restrictOnDelete();
            $table->uuid('submission_key')->unique();
            $table->string('customer_name');
            $table->text('pickup_address');
            $table->string('contact');
            $table->unsignedInteger('manual_hybrid');
            $table->unsignedInteger('cashless_hybrid');
            $table->unsignedInteger('css_orion');
            $table->text('notes')->nullable();
            $table->dateTime('picked_up_at', 6);
            $table->dateTime('finalized_at', 6);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pickup_records');
    }
};

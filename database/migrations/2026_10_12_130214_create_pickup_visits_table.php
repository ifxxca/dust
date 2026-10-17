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
        Schema::create('pickup_visits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pickup_task_id')->constrained()->restrictOnDelete();
            $table->foreignId('staff_id')->constrained('users')->restrictOnDelete();
            $table->dateTime('started_at', 6);
            $table->string('outcome', 32)->nullable();
            $table->text('reason')->nullable();
            $table->text('notes')->nullable();
            $table->dateTime('recorded_at', 6)->nullable();
            $table->timestamps();
            $table->index(['pickup_task_id', 'id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pickup_visits');
    }
};

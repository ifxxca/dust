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
        Schema::create('pickup_task_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pickup_task_id')->constrained()->restrictOnDelete();
            $table->string('action', 32);
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('previous_staff_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('new_staff_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->unsignedInteger('task_version');
            $table->string('reason', 500)->nullable();
            $table->dateTime('occurred_at', 6);
            $table->timestamps();
            $table->unique(['pickup_task_id', 'task_version']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pickup_task_events');
    }
};

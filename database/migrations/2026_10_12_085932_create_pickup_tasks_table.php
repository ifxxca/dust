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
        Schema::create('pickup_tasks', function (Blueprint $table) {
            $table->id();
            $table->char('reference', 26)->unique();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->string('customer_name_snapshot');
            $table->text('pickup_address');
            $table->string('contact_snapshot');
            $table->dateTime('scheduled_at', 6);
            $table->text('notes')->nullable();
            $table->string('status', 32)->default('SCHEDULED');
            $table->foreignId('assigned_staff_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->unsignedInteger('version')->default(1);
            $table->dateTime('execution_started_at', 6)->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->index(['assigned_staff_id', 'status', 'scheduled_at', 'id'], 'tasks_staff_list');
            $table->index(['status', 'execution_started_at', 'scheduled_at', 'id'], 'tasks_candidates');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('pickup_tasks');
    }
};

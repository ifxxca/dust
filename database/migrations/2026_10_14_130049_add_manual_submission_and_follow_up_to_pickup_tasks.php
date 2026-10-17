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
        Schema::table('pickup_tasks', function (Blueprint $table) {
            $table->uuid('creation_submission_key')->nullable();
            $table->foreignId('previous_task_id')->nullable()->constrained('pickup_tasks')->restrictOnDelete();
            $table->unique(['created_by', 'creation_submission_key'], 'tasks_creation_submission_unique');
            $table->index(['customer_id', 'scheduled_at'], 'tasks_customer_schedule');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('pickup_tasks', function (Blueprint $table) {
            $table->dropUnique('tasks_creation_submission_unique');
            $table->dropIndex('tasks_customer_schedule');
            $table->dropConstrainedForeignId('previous_task_id');
            $table->dropColumn('creation_submission_key');
        });
    }
};

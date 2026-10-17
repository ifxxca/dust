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
        Schema::create('pickup_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->text('pickup_address');
            $table->json('weekdays');
            $table->string('pickup_time', 5);
            $table->string('timezone', 64);
            $table->date('starts_on');
            $table->date('ends_on')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('last_generated_at')->nullable();
            $table->timestamps();
        });
        Schema::table('pickup_tasks', function (Blueprint $table) {
            $table->string('pickup_type', 20)->default('on_demand')->index();
            $table->foreignId('pickup_schedule_id')->nullable()->constrained()->restrictOnDelete();
            $table->date('occurrence_date')->nullable();
            $table->unique(['pickup_schedule_id', 'occurrence_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('pickup_tasks', function (Blueprint $table) {
            $table->dropUnique(['pickup_schedule_id', 'occurrence_date']);
            $table->dropConstrainedForeignId('pickup_schedule_id');
            $table->dropColumn(['pickup_type', 'occurrence_date']);
        });
        Schema::dropIfExists('pickup_schedules');
    }
};

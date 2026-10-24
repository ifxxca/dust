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
        Schema::table('jne_report_awbs', function (Blueprint $table): void {
            $table->json('raw_data')->nullable();
            $table->string('reference', 255)->nullable();
            $table->timestamp('entry_at')->nullable();
            $table->timestamp('source_status_at')->nullable();
            $table->timestamp('observed_at')->nullable();
        });
        Schema::create('jne_report_profiles', function (Blueprint $table): void {
            $table->id();
            $table->string('customer_account', 100)->unique();
            $table->foreignId('customer_id')->nullable()->constrained()->restrictOnDelete();
            $table->boolean('enabled')->default(false);
            $table->string('mode', 16)->default('rolling');
            $table->unsignedInteger('lookback_days')->default(30);
            $table->date('date_from')->nullable();
            $table->date('date_thru')->nullable();
            $table->unsignedInteger('interval_minutes')->default(360);
            $table->timestamp('next_run_at')->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->string('last_error', 1000)->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('updated_by')->constrained('users')->restrictOnDelete();
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->index(['enabled', 'next_run_at']);
        });
        Schema::table('report_jobs', function (Blueprint $table): void {
            $table->foreignId('jne_report_profile_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('schedule_key', 64)->nullable()->unique();
            $table->string('projection_status', 24)->default('NOT_PROJECTED');
            $table->string('projection_error', 1000)->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('review_note', 500)->nullable();
            $table->index(['customer_account', 'status']);
        });
        Schema::create('jne_shipments', function (Blueprint $table): void {
            $table->id();
            $table->string('customer_account', 100);
            $table->string('awb', 100);
            $table->foreignId('latest_report_awb_id')->nullable()->constrained('jne_report_awbs')->restrictOnDelete();
            $table->foreignId('latest_report_job_id')->nullable()->constrained('report_jobs')->restrictOnDelete();
            $table->timestamp('last_observed_at')->nullable();
            $table->string('tracking_status', 24)->default('UNKNOWN');
            $table->string('status_signature', 64)->nullable();
            $table->foreignId('pickup_task_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('match_status', 24)->default('UNMATCHED');
            $table->string('match_method', 24)->nullable();
            $table->string('match_note', 500)->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
            $table->unique(['customer_account', 'awb']);
            $table->index(['tracking_status', 'id']);
            $table->index(['match_status', 'id']);
        });
        Schema::create('jne_shipment_observations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('jne_shipment_id')->constrained()->cascadeOnDelete();
            $table->foreignId('jne_report_awb_id')->unique()->constrained()->restrictOnDelete();
            $table->string('tracking_status', 24);
            $table->string('status_signature', 64);
            $table->timestamp('observed_at');
            $table->boolean('changes_current');
            $table->timestamp('created_at');
            $table->index(['jne_shipment_id', 'observed_at', 'id'], 'jne_observation_timeline');
        });
        Schema::create('jne_shipment_match_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('jne_shipment_id')->constrained()->cascadeOnDelete();
            $table->foreignId('previous_pickup_task_id')->nullable()->constrained('pickup_tasks')->restrictOnDelete();
            $table->foreignId('pickup_task_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('match_status', 24);
            $table->string('method', 24);
            $table->foreignId('actor_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('reason', 500);
            $table->timestamp('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('jne_shipment_match_events');
        Schema::dropIfExists('jne_shipment_observations');
        Schema::dropIfExists('jne_shipments');
        Schema::table('report_jobs', function (Blueprint $table): void {
            $table->dropForeign(['jne_report_profile_id']);
            $table->dropForeign(['reviewed_by']);
            $table->dropIndex(['customer_account', 'status']);
            $table->dropUnique(['schedule_key']);
            $table->dropColumn(['jne_report_profile_id', 'schedule_key', 'projection_status', 'projection_error', 'reviewed_at', 'reviewed_by', 'review_note']);
        });
        Schema::dropIfExists('jne_report_profiles');
        Schema::table('jne_report_awbs', fn (Blueprint $table) => $table->dropColumn(['raw_data', 'reference', 'entry_at', 'source_status_at', 'observed_at']));
    }
};

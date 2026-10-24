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
        Schema::create('jne_report_awbs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('report_job_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('source_row');
            $table->string('awb', 100);
            $table->string('customer_account', 100);
            $table->string('status_web')->nullable();
            $table->string('status_pod')->nullable();
            $table->string('awb_cancel')->nullable();
            $table->string('shipper_name', 500)->nullable();
            $table->string('consignee_name', 500)->nullable();
            $table->timestamps();
            $table->unique(['report_job_id', 'awb']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('jne_report_awbs');
    }
};

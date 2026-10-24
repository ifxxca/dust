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
        Schema::create('jne_mapping_runs', function (Blueprint $table) {
            $table->id();
            $table->json('normalized_names');
            $table->string('status', 24)->default('QUEUED');
            $table->unsignedBigInteger('last_id')->default(0);
            $table->unsignedBigInteger('upper_id')->default(0);
            $table->unsignedBigInteger('affected_count')->default(0);
            $table->string('error_message', 1000)->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('jne_mapping_runs');
    }
};

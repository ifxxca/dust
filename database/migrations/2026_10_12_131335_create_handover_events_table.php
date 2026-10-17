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
        Schema::create('handover_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('handover_session_id')->constrained()->restrictOnDelete();
            $table->foreignId('handover_item_id')->nullable()->constrained()->restrictOnDelete();
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->string('action', 40);
            $table->unsignedInteger('session_version');
            $table->dateTime('occurred_at', 6);
            $table->unique(['handover_session_id', 'session_version']);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('handover_events');
    }
};

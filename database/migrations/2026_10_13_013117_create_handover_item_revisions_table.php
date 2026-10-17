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
        Schema::create('handover_item_revisions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('handover_item_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('revision');
            $table->unsignedInteger('pickup_revision');
            $table->json('values');
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->string('reason', 500);
            $table->timestamps();
            $table->unique(['handover_item_id', 'revision']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('handover_item_revisions');
    }
};

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
        Schema::table('jne_mapping_runs', fn (Blueprint $table) => $table->boolean('reapply_all')->default(false));
        Schema::create('jne_evidence_rule_events', function (Blueprint $table): void {
            $table->id();
            $table->string('kind', 24);
            $table->unsignedBigInteger('rule_id');
            $table->foreignId('actor_id')->constrained('users')->restrictOnDelete();
            $table->string('reason', 500);
            $table->json('before');
            $table->json('after');
            $table->timestamp('created_at');
            $table->index(['kind', 'rule_id', 'id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('jne_evidence_rule_events');
        Schema::table('jne_mapping_runs', fn (Blueprint $table) => $table->dropColumn('reapply_all'));
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('hybrid_username', 100)->nullable();
            $table->text('hybrid_password')->nullable();
            $table->string('hybrid_account_key', 64)->nullable()->unique();
            $table->unsignedInteger('hybrid_credential_version')->default(0);
        });
        Schema::table('cashless_entry_batches', function (Blueprint $table): void {
            $table->foreignId('hybrid_user_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->index(['source', 'hybrid_user_id', 'status']);
        });
        Schema::create('cashless_entry_user_lanes', function (Blueprint $table): void {
            $table->string('source', 24);
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->foreignId('active_batch_id')->nullable()->constrained('cashless_entry_batches')->restrictOnDelete();
            $table->primary(['source', 'user_id']);
        });
        DB::table('cashless_entry_batches')->where('source', 'nuralamt')->where('status', 'QUEUED')
            ->update(['hybrid_user_id' => DB::raw('created_by'), 'status' => 'WAITING_ACCOUNT']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cashless_entry_user_lanes');
        Schema::table('cashless_entry_batches', function (Blueprint $table): void {
            $table->dropIndex(['source', 'hybrid_user_id', 'status']);
            $table->dropConstrainedForeignId('hybrid_user_id');
        });
        Schema::table('users', function (Blueprint $table): void {
            $table->dropUnique(['hybrid_account_key']);
            $table->dropColumn(['hybrid_username', 'hybrid_password', 'hybrid_account_key', 'hybrid_credential_version']);
        });
    }
};

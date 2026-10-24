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
        Schema::create('jne_source_contracts', function (Blueprint $table): void {
            $table->id();
            $table->string('source', 20);
            $table->string('report_type', 20);
            $table->unsignedInteger('revision')->default(1);
            $table->json('definition');
            $table->string('active_key', 64)->nullable()->unique();
            $table->foreignId('verified_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('verified_at')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->text('reason');
            $table->index(['source', 'report_type', 'revision']);
            $table->timestamps();
        });
        Schema::create('jne_customer_code_aliases', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->string('code', 64);
            $table->string('normalized_code', 64)->index();
            $table->string('mapping_key', 64)->unique();
            $table->string('account_scope', 100)->nullable();
            $table->date('valid_from')->nullable();
            $table->date('valid_thru')->nullable();
            $table->boolean('is_active')->default(false);
            $table->unsignedInteger('version')->default(1);
            $table->foreignId('verified_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('verified_at')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->text('reason');
            $table->timestamps();
        });
        Schema::table('jne_report_awbs', function (Blueprint $table): void {
            $table->text('original_customer_code')->nullable();
            $table->json('source_evidence')->nullable();
        });
        Schema::table('jne_shipper_aliases', function (Blueprint $table): void {
            $table->string('account_scope', 100)->nullable();
            $table->date('valid_from')->nullable();
            $table->date('valid_thru')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('verified_at')->nullable();
            $table->text('verification_reason')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('jne_shipper_aliases', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('verified_by');
            $table->dropColumn(['account_scope', 'valid_from', 'valid_thru', 'verified_at', 'verification_reason']);
        });
        Schema::table('jne_report_awbs', fn (Blueprint $table) => $table->dropColumn(['original_customer_code', 'source_evidence']));
        Schema::dropIfExists('jne_customer_code_aliases');
        Schema::dropIfExists('jne_source_contracts');
    }
};

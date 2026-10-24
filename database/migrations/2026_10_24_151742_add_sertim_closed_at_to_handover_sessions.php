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
        Schema::table('handover_sessions', function (Blueprint $table): void {
            $table->timestamp('sertim_closed_at')->nullable();
        });
        DB::table('handover_sessions')->orderBy('id')->chunkById(200, function ($sessions): void {
            $closed = DB::table('handover_events')->whereIn('handover_session_id', $sessions->pluck('id'))->where('action', 'closed')
                ->select('handover_session_id')->selectRaw('min(occurred_at) as first_closed_at')->groupBy('handover_session_id')->pluck('first_closed_at', 'handover_session_id');
            foreach ($sessions as $session) {
                $at = $closed[$session->id] ?? ($session->status === 'CLOSED' ? ($session->closed_at ?? $session->updated_at) : null);
                if ($at !== null) {
                    DB::table('handover_sessions')->where('id', $session->id)->update(['sertim_closed_at' => $at]);
                }
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('handover_sessions', fn (Blueprint $table) => $table->dropColumn('sertim_closed_at'));
    }
};

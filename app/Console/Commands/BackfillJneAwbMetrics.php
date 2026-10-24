<?php

namespace App\Console\Commands;

use App\Actions\Reports\ExtractJneAwbMetrics;
use App\Models\JneReportAwb;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

#[Signature('jne-reports:backfill-metrics')]
#[Description('Extract analytics from stored APEX rows without downloading reports again')]
class BackfillJneAwbMetrics extends Command
{
    /**
     * Execute the console command.
     */
    public function handle(ExtractJneAwbMetrics $metrics): int
    {
        $count = 0;
        JneReportAwb::where('metrics_version', '<', 2)->whereNotNull('raw_data')->chunkById(500, function ($rows) use ($metrics, &$count): void {
            $updates = $rows->map(fn (JneReportAwb $row): array => [
                ...$row->only(['id', 'report_job_id', 'source_row', 'awb', 'customer_account']),
                ...$metrics->handle($row->raw_data ?? []),
            ])->all();
            DB::table('jne_report_awbs')->upsert($updates, ['id'], ['service', 'destination', 'destination_name', 'delivered_at', 'etd_days', 'amount_cents', 'weight_grams', 'quantity', 'metrics_version']);
            $count += count($updates);
        });
        $this->info("{$count} stored APEX row(s) enriched.");

        return self::SUCCESS;
    }
}

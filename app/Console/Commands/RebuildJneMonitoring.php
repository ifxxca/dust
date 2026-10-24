<?php

namespace App\Console\Commands;

use App\Jobs\ImportJneReportAwbs;
use App\Models\ReportJob;
use Illuminate\Console\Command;

class RebuildJneMonitoring extends Command
{
    protected $signature = 'jne-monitoring:rebuild {--sync : Process immediately instead of queueing} {--account= : Restrict to one account}';

    protected $description = 'Enrich stored CSV imports and rebuild JNE monitoring without requesting reports from JNE';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $query = ReportJob::where('status', 'COMPLETED')->where('import_status', 'IMPORTED');
        if ($this->option('account')) {
            $query->where('customer_account', $this->option('account'));
        }
        $count = 0;
        $failures = 0;
        $query->chunkById(100, function ($jobs) use (&$count, &$failures): void {
            foreach ($jobs as $job) {
                if ($this->option('sync')) {
                    ImportJneReportAwbs::dispatchSync($job->id);
                    $job->refresh();
                    $this->line("Report #{$job->id}: import={$job->import_status}; monitoring={$job->projection_status}; AWB={$job->imported_awb_count}.");
                    if ($job->projection_status !== 'PROJECTED') {
                        $failures++;
                    }
                } else {
                    $job->update(['projection_status' => 'QUEUED', 'projection_error' => null]);
                    ImportJneReportAwbs::dispatch($job->id);
                }
                $count++;
            }
        });
        $this->info($count.' stored report(s) submitted for monitoring rebuild.');

        return $failures > 0 ? self::FAILURE : self::SUCCESS;
    }
}

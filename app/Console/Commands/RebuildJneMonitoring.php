<?php

namespace App\Console\Commands;

use App\Actions\Reports\ReclassifyJneShipmentStatuses;
use App\Jobs\ImportJneReportAwbs;
use App\Models\ReportJob;
use Illuminate\Console\Command;

class RebuildJneMonitoring extends Command
{
    protected $signature = 'jne-monitoring:rebuild {--sync : Process immediately instead of queueing} {--account= : Restrict to one account} {--statuses-only : Reclassify stored status data without reimporting or rematching AWBs} {--dry-run : Preview status corrections without changing data}';

    protected $description = 'Enrich stored CSV imports and rebuild JNE monitoring without requesting reports from JNE';

    /**
     * Execute the console command.
     */
    public function handle(ReclassifyJneShipmentStatuses $statuses): int
    {
        if ($this->option('statuses-only')) {
            $counts = $statuses->handle($this->option('account'), (bool) $this->option('dry-run'));
            $this->info(($this->option('dry-run') ? 'Preview: ' : '').$counts['sources'].' source rows classified; '.$counts['shipments'].' shipment status corrections; '.$counts['observations'].' observation corrections.');

            return self::SUCCESS;
        }
        if ($this->option('dry-run')) {
            $this->error('--dry-run requires --statuses-only.');

            return self::FAILURE;
        }
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

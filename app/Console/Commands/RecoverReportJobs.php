<?php

namespace App\Console\Commands;

use App\Actions\Reports\ManageReportJobs;
use Illuminate\Console\Command;

class RecoverReportJobs extends Command
{
    protected $signature = 'report-jobs:recover';

    protected $description = 'Mark expired JNE worker claims for manual review without resubmitting reports';

    public function handle(ManageReportJobs $jobs): int
    {
        $this->info($jobs->recoverExpired().' report job(s) marked NEEDS_ATTENTION.');

        return self::SUCCESS;
    }
}

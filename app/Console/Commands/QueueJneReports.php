<?php

namespace App\Console\Commands;

use App\Actions\Reports\QueueScheduledJneReports;
use Illuminate\Console\Command;

class QueueJneReports extends Command
{
    protected $signature = 'jne-reports:queue-due';

    protected $description = 'Queue due JNE report profiles without repeating active or uncertain requests';

    /**
     * Execute the console command.
     */
    public function handle(QueueScheduledJneReports $scheduler): int
    {
        $this->info($scheduler->handle().' report job(s) queued.');

        return self::SUCCESS;
    }
}

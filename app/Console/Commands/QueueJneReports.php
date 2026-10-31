<?php

namespace App\Console\Commands;

use App\Actions\Reports\QueueScheduledJneReports;
use App\Models\JneReportProfile;
use Illuminate\Console\Command;

class QueueJneReports extends Command
{
    protected $signature = 'jne-reports:queue-due {--profile= : Queue only this saved source profile} {--force : Start a new cycle for the explicit profile without waiting for its scheduled time}';

    protected $description = 'Queue new JNE report cycles without overlapping active work or changing failed report history';

    /**
     * Execute the console command.
     */
    public function handle(QueueScheduledJneReports $scheduler): int
    {
        $profile = $this->option('profile');
        if (($this->option('force') && $profile === null)
            || ($profile !== null && (! ctype_digit((string) $profile) || ! JneReportProfile::whereKey($profile)->exists()))) {
            $this->error('Gunakan --profile=ID yang valid. --force wajib menyebut satu profile secara eksplisit.');

            return self::FAILURE;
        }
        $count = $profile === null ? $scheduler->handle() : $scheduler->queueProfile((int) $profile, (bool) $this->option('force'));
        $this->info($count.' report job(s) queued.');

        return self::SUCCESS;
    }
}

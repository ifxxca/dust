<?php

namespace App\Console\Commands;

use App\Actions\Reports\ManageReportJobs;
use App\Actions\Reports\ReportRetryPolicy;
use Illuminate\Console\Command;

class RecoverReportJobs extends Command
{
    protected $signature = 'report-jobs:recover {--history-job= : Restore a rejected checkpoint for this job} {--history-file= : Original History JSON checkpoint} {--batch= : Original Upload Connote batch number}';

    protected $description = 'Mark expired JNE worker claims for manual review without resubmitting reports';

    public function handle(ManageReportJobs $jobs): int
    {
        if ($this->option('history-job') !== null || $this->option('history-file') !== null || $this->option('batch') !== null) {
            $id = (string) $this->option('history-job');
            $batch = (string) $this->option('batch');
            $file = (string) $this->option('history-file');
            if (! ctype_digit($id) || ! ctype_digit($batch) || ! is_file($file) || filesize($file) > 8192) {
                $this->error('Isi job, batch, dan file checkpoint History asli yang valid.');

                return self::FAILURE;
            }
            $history = json_decode(file_get_contents($file), true);
            if (! is_array($history)) {
                $this->error('Checkpoint History bukan objek JSON yang valid.');

                return self::FAILURE;
            }
            $job = app(ReportRetryPolicy::class)->restoreCheckpoint((int) $id, $history, (int) $batch);
            $this->info("Report #{$job->id}: lanjutkan History asli pada percobaan berikutnya; Process tidak dikirim ulang.");

            return self::SUCCESS;
        }
        $this->info($jobs->recoverExpired().' report job(s) marked NEEDS_ATTENTION.');

        return self::SUCCESS;
    }
}

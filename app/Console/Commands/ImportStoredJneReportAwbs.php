<?php

namespace App\Console\Commands;

use App\Actions\Reports\ManageReportJobs;
use App\Jobs\ImportJneReportAwbs;
use App\Models\ReportJob;
use Illuminate\Console\Command;

class ImportStoredJneReportAwbs extends Command
{
    protected $signature = 'jne-reports:import-awbs {reportJob : Stored report job ID} {--sync : Import immediately without the queue}';

    protected $description = 'Import AWBs from an existing private JNE CSV without requesting a new report';

    /**
     * Execute the console command.
     */
    public function handle(ManageReportJobs $jobs): int
    {
        $id = (string) $this->argument('reportJob');
        $job = ctype_digit($id) ? ReportJob::find($id) : null;
        if (! $job || $job->status !== 'COMPLETED' || ! $job->file_path) {
            $this->error('Report tidak ditemukan atau CSV belum selesai disimpan.');

            return self::FAILURE;
        }
        if ($this->option('sync')) {
            ImportJneReportAwbs::dispatchSync($job->id);
            $job->refresh();
            if ($job->import_status !== 'IMPORTED') {
                $this->error($job->import_error ?? 'Impor AWB belum selesai.');

                return self::FAILURE;
            }
            $this->info("Report #{$job->id}: {$job->imported_awb_count} AWB diimpor; {$job->duplicate_awb_count} duplikat identik dilewati.");
        } else {
            $jobs->queueImport($job->id);
            $this->info("Impor report #{$job->id} diminta. Jalankan worker antrean Laravel untuk memprosesnya.");
        }

        return self::SUCCESS;
    }
}

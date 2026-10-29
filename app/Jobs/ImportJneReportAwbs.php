<?php

namespace App\Jobs;

use App\Actions\Reports\ImportReportAwbs;
use App\Actions\Reports\ProjectJneShipments;
use App\Actions\Reports\ReportPipelineFailure;
use App\Models\ReportJob;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Validation\ValidationException;
use Throwable;

class ImportJneReportAwbs implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 60;

    public function __construct(public int $reportJobId) {}

    /**
     * Execute the job.
     */
    public function handle(ImportReportAwbs $importer, ProjectJneShipments $projector): void
    {
        try {
            $importer->handle($this->reportJobId);
        } catch (ValidationException $exception) {
            $this->markFailed($exception->errors()['import'][0] ?? 'Validasi CSV gagal.');

            return;
        } catch (Throwable $exception) {
            app(ReportPipelineFailure::class)->handle($exception, 'import', $this->reportJobId);
            $this->markFailed('Impor gagal karena gangguan penyimpanan atau database. Ulangi impor dari CSV yang sama.');

            return;
        }
        try {
            $projector->handle($this->reportJobId);
        } catch (Throwable $exception) {
            app(ReportPipelineFailure::class)->handle($exception, 'projection', $this->reportJobId);
            ReportJob::whereKey($this->reportJobId)->update(['projection_status' => 'FAILED', 'projection_error' => 'Pembaruan monitoring gagal. Bangun ulang dari CSV tersimpan; tidak perlu menarik report JNE lagi.']);
        }
    }

    public function failed(?Throwable $exception): void
    {
        if ($exception !== null) {
            app(ReportPipelineFailure::class)->handle($exception, 'worker_failure', $this->reportJobId);
        }
        $this->markFailed('Worker impor berhenti atau melewati batas waktu. Ulangi impor dari CSV yang sama.');
    }

    private function markFailed(string $message): void
    {
        ReportJob::whereKey($this->reportJobId)->where('import_status', '!=', 'IMPORTED')
            ->update(['import_status' => 'FAILED', 'import_error' => $message]);
        ReportJob::whereKey($this->reportJobId)->where('import_status', 'IMPORTED')->where('projection_status', '!=', 'PROJECTED')
            ->update(['projection_status' => 'FAILED', 'projection_error' => 'Pengayaan/pembaruan monitoring belum selesai: '.$message]);
    }
}

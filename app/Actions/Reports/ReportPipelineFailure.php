<?php

namespace App\Actions\Reports;

use App\Actions\Monitoring\RecordOperationsTelemetry;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Log;
use Throwable;

class ReportPipelineFailure
{
    public function handle(Throwable $exception, string $phase, ?int $reportJobId = null, ?int $profileId = null): void
    {
        app(RecordOperationsTelemetry::class)->exception($exception, $reportJobId);
        $trace = array_map(fn (array $frame): array => array_intersect_key($frame, array_flip(['file', 'line', 'class', 'function'])), array_slice($exception->getTrace(), 0, 15));

        Log::error('JNE report pipeline failed.', [
            'phase' => $phase, 'report_job_id' => $reportJobId, 'profile_id' => $profileId,
            'exception_class' => $exception::class, 'previous_exception_class' => $exception->getPrevious() !== null ? $exception->getPrevious()::class : null,
            'sqlstate' => $exception instanceof QueryException ? ($exception->errorInfo[0] ?? null) : null,
            'database_error_code' => $exception instanceof QueryException ? ($exception->errorInfo[1] ?? null) : null,
            'file' => $exception->getFile(), 'line' => $exception->getLine(), 'trace' => $trace,
        ]);
    }
}

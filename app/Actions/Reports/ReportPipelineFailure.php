<?php

namespace App\Actions\Reports;

use Illuminate\Support\Facades\Log;
use Throwable;

class ReportPipelineFailure
{
    public function handle(Throwable $exception, string $phase, ?int $reportJobId = null, ?int $profileId = null): void
    {
        $trace = array_map(fn (array $frame): array => array_intersect_key($frame, array_flip(['file', 'line', 'class', 'function'])), array_slice($exception->getTrace(), 0, 15));

        Log::error('JNE report pipeline failed.', [
            'phase' => $phase, 'report_job_id' => $reportJobId, 'profile_id' => $profileId,
            'exception_class' => $exception::class, 'previous_exception_class' => $exception->getPrevious() !== null ? $exception->getPrevious()::class : null,
            'file' => $exception->getFile(), 'line' => $exception->getLine(), 'trace' => $trace,
        ]);
    }
}

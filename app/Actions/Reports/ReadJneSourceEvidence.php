<?php

namespace App\Actions\Reports;

use App\Models\JneSourceContract;
use App\Models\ReportJob;

class ReadJneSourceEvidence
{
    /** @return array{contract: ?JneSourceContract, origins: array<string, list<array<string, mixed>>>} */
    public function context(ReportJob $job): array
    {
        $contract = config('jne-reports.evidence_policies_enabled') ? JneSourceContract::where('active_key', JneSourceContract::key($job->source, $job->report_type))->whereNotNull('verified_at')->first() : null;
        $origins = [];
        foreach (ReportJob::where('hybrid_batch_id', $job->id)->where('status', 'SOURCE_SAVED')->get() as $child) {
            foreach ($child->parameters['awbs'] ?? [] as $awb) {
                $origins['awb:'.$awb][] = ['report_job_id' => $child->id, 'source' => $child->source, 'report_type' => $child->report_type, 'checksum' => $child->source_file_checksum];
            }
        }

        return ['contract' => $contract, 'origins' => $origins];
    }

    /** @param array{contract: ?JneSourceContract, origins: array<string, list<array<string, mixed>>>} $context
     * @param  array<string, string>  $original
     * @return array{original_customer_code: ?string, source_evidence: string}
     */
    public function row(array $context, array $original, string $awb): array
    {
        $contract = $context['contract'];
        $column = $contract?->definition['customer_code_column'] ?? null;

        return ['original_customer_code' => is_string($column) ? ($original[$column] ?? null) : null,
            'source_evidence' => json_encode(['hybrid_origins' => $context['origins']['awb:'.$awb] ?? [],
                'contract' => $contract ? ['id' => $contract->id, 'revision' => $contract->revision, 'customer_code_column' => $column] : null], JSON_THROW_ON_ERROR)];
    }
}

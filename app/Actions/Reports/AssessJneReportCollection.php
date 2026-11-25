<?php

namespace App\Actions\Reports;

use App\Models\JneReportAwb;
use App\Models\JneSourceContract;
use App\Models\ReportJob;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

class AssessJneReportCollection
{
    public function __construct(private AssessJneCollectionProof $proofs) {}

    public static function supportsAutomaticCollection(string $source, string $type, ?string $account = null): bool
    {
        if ($source !== 'apex' || $type !== 'apex') {
            return false;
        }
        if ($account !== null) {
            return AssessJneCollectionProof::capability($source, $type, $account) !== null;
        }

        return collect(array_keys(config('jne-reports.collection_capabilities', [])))
            ->contains(fn (string $key): bool => str_starts_with($key, $source.':'.$type.':')
                && AssessJneCollectionProof::capability($source, $type, substr($key, strlen($source.':'.$type.':'))) !== null);
    }

    /** @return array{state: string, complete: bool, reasons: list<string>, evidence: array<string, mixed>} */
    public function handle(ReportJob $job, ?JneSourceContract $contract): array
    {
        $parameters = $job->getAttribute('parameters') ?? [];
        $hybrid = in_array($job->source, ['hybrid', 'roberto', 'nuralamt'], true);
        $subset = ! $hybrid && ($job->report_mode === 'A' || $job->report_type === 'unresolved' || ! empty($parameters['awbs']));
        $evidence = ['report_id' => $job->id, 'source' => $job->source, 'report_type' => $job->report_type,
            'account' => $job->customer_account, 'date_from' => $job->date_from?->toDateString(), 'date_thru' => $job->date_thru?->toDateString(),
            'checksum' => $job->file_checksum, 'source_checksum' => $job->source_file_checksum,
            'row_count' => $job->row_count, 'imported_awb_count' => $job->imported_awb_count,
            'contract_id' => $contract?->id, 'contract_revision' => $contract?->revision,
            'collected_at' => ($job->started_at ?? $job->created_at)?->toIso8601String(),
            'enrichment_scope' => $hybrid || $subset ? 'SUBSET_COLLECTION' : null,
            'collection_manifest' => $parameters['collection_manifest'] ?? null];
        $reasons = [];
        if ($subset) {
            $reasons[] = 'Report hanya mencakup AWB terpilih (Upload Connote), sehingga tidak membuktikan cakupan harian penuh.';
        }
        if ($hybrid) {
            $reasons[] = 'Koleksi Hybrid belum mempunyai bukti pagination/export tuntas dan total sumber; keberhasilan child atau pengayaan APEX tidak membuktikan FULL_COLLECTION.';
        }
        if ($job->workflowStage() === 'ATTENTION') {
            return ['state' => 'FAILED', 'complete' => false, 'reasons' => [...$reasons, 'Penarikan, impor, atau proyeksi report gagal.'], 'evidence' => $evidence];
        }
        if (! in_array($job->status, ['COMPLETED', 'SOURCE_SAVED', 'NO_DATA'], true)
            || ($job->status === 'COMPLETED' && $job->workflowStage() !== 'READY')) {
            return ['state' => 'PENDING', 'complete' => false, 'reasons' => [...$reasons, 'CSV belum selesai diimpor dan diproyeksikan: '.$job->workflowStage().'.'], 'evidence' => $evidence];
        }
        if ($subset || $hybrid) {
            if (in_array($job->source, ['roberto', 'nuralamt'], true)) {
                $evidence['export'] = $this->proofs->handle($job);
            }

            return ['state' => $subset ? 'SUBSET_COLLECTION' : 'UNKNOWN', 'complete' => false, 'reasons' => $reasons, 'evidence' => $evidence];
        }
        $capability = AssessJneCollectionProof::capability($job->source, $job->report_type, $job->customer_account);
        $proof = $this->proofs->handle($job);
        $evidence['export'] = $proof;
        $evidence['capability'] = $capability;
        $reasons = [...$reasons, ...$proof['reasons']];
        if ($job->status !== 'COMPLETED' || $job->report_mode !== 'P' || $job->national_account === 'Y'
            || ! self::supportsAutomaticCollection($job->source, $job->report_type, $job->customer_account)) {
            $reasons[] = 'Kemampuan full-date, populasi kategori, account dan cutoff source belum dibuktikan secara independen; kontrak verified saja tidak cukup.';
        }
        if (! is_string($job->file_checksum) || ! preg_match('/^[a-f0-9]{64}$/D', $job->file_checksum)) {
            $reasons[] = 'Checksum CSV sumber belum tersedia.';
        }
        if (! $job->date_from || ! $job->date_thru || $job->date_from->greaterThan($job->date_thru)) {
            $reasons[] = 'Rentang tanggal sumber tidak sah.';
        } else {
            $from = CarbonImmutable::parse($job->date_from->toDateString(), config('jne-reports.source_timezone'))->utc();
            $thru = CarbonImmutable::parse($job->date_thru->toDateString(), config('jne-reports.source_timezone'))->addDay()->utc();
            $invalidScope = JneReportAwb::where('report_job_id', $job->id)->where(function (Builder $rows) use ($job, $from, $thru): void {
                $rows->whereNull('entry_at')->orWhere('entry_at', '<', $from)->orWhere('entry_at', '>=', $thru);
                if ($job->national_account !== 'Y') {
                    $rows->orWhereNull('customer_account')->orWhere('customer_account', '!=', $job->customer_account);
                }
            })->exists();
            if ($invalidScope) {
                $reasons[] = 'Bukti CSV berisi tanggal/account di luar cakupan permintaan atau tanggal entry belum tersedia.';
            }
        }
        $collectedAt = $job->started_at ?? $job->created_at;
        if (! $collectedAt || $collectedAt->isFuture()
            || JneReportAwb::where('report_job_id', $job->id)->where('entry_at', '>', $collectedAt)->exists()) {
            $reasons[] = 'Cutoff koleksi tidak tersedia, berada di masa depan, atau mendahului tanggal entry pada bukti CSV.';
        }
        $rows = $job->row_count ?? ($job->imported_awb_count + $job->duplicate_awb_count);
        if ($rows === null || $rows !== $job->imported_awb_count + $job->duplicate_awb_count
            || $job->imported_awb_count !== JneReportAwb::where('report_job_id', $job->id)->count()) {
            $reasons[] = 'Jumlah baris CSV, hasil impor dan bukti AWB tersimpan tidak konsisten.';
        }
        if ($rows >= min(config('jne-reports.max_awbs'), $capability['export_limit'] ?? config('jne-reports.max_awbs'))) {
            $reasons[] = 'Report mencapai batas ekspor APEX; cakupan tanpa truncation belum dapat dibuktikan. Persempit rentang penarikan.';
        }
        if (! $contract?->verified_at || $contract->active_key !== JneSourceContract::key($job->source, $job->report_type)
            || $contract->source !== $job->source || $contract->report_type !== $job->report_type
            || ($contract->definition['automatic_reconciliation'] ?? false) !== true || ($contract->definition['collection_mode'] ?? '') !== 'complete_date_report') {
            $reasons[] = 'Kontrak report belum mengesahkan rekonsiliasi otomatis dengan cakupan complete_date_report.';
        }

        return ['state' => $reasons === [] ? 'FULL_COLLECTION' : 'UNKNOWN', 'complete' => $reasons === [], 'reasons' => $reasons, 'evidence' => $evidence];
    }

    /** @param Builder<ReportJob> $query */
    public function latestEligible(Builder $query, ?JneSourceContract $contract): ?ReportJob
    {
        if (! $contract?->verified_at || ($contract->definition['automatic_reconciliation'] ?? false) !== true
            || ($contract->definition['collection_mode'] ?? null) !== 'complete_date_report') {
            return null;
        }
        $candidates = (clone $query)->where('source', 'apex')->where('report_type', 'apex')->where('report_mode', 'P')
            ->where('status', 'COMPLETED')->where('import_status', 'IMPORTED')->where('projection_status', 'PROJECTED')
            ->whereNotNull('file_checksum')->where('file_checksum', '!=', '')
            ->where(fn (Builder $scope) => $scope->whereNull('parameters->awbs')->orWhereJsonLength('parameters->awbs', 0));
        foreach ($candidates->lazyByIdDesc(50) as $job) {
            if ($this->handle($job, $contract)['complete']) {
                return $job;
            }
        }

        return null;
    }
}

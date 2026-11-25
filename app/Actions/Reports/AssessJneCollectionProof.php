<?php

namespace App\Actions\Reports;

use App\Models\ReportJob;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Throwable;

class AssessJneCollectionProof
{
    /** @return array<string, mixed> */
    public function decode(?string $json): array
    {
        if ($json === null) {
            return [];
        }
        $proof = json_decode($json, true);

        return Validator::make(['proof' => $proof], [
            'proof' => ['required', 'array:version,protocol,origin,before,after,synthesized'],
            'proof.version' => ['required', 'integer', 'in:1'],
            'proof.protocol' => ['required', 'in:hybrid_ir_total_v1,apex_history_total_v1'],
            'proof.origin' => ['required', 'url:http,https', 'max:200'],
            'proof.synthesized' => ['required', 'boolean'],
            'proof.before' => ['required', 'array:date_from,date_thru,scope,filters_clear,total_label,empty,history_id'],
            'proof.after' => ['required', 'array:date_from,date_thru,scope,filters_clear,total_label,empty,history_id'],
            'proof.*.date_from' => ['sometimes', 'nullable', 'string', 'max:40'],
            'proof.*.date_thru' => ['sometimes', 'nullable', 'string', 'max:40'],
            'proof.*.scope' => ['sometimes', 'nullable', 'string', 'max:100'],
            'proof.*.filters_clear' => ['sometimes', 'boolean'],
            'proof.*.total_label' => ['sometimes', 'nullable', 'string', 'max:150'],
            'proof.*.empty' => ['sometimes', 'boolean'],
            'proof.*.history_id' => ['sometimes', 'nullable', 'string', 'max:2048'],
        ])->validate()['proof'];
    }

    /** @return ?array<string, mixed> */
    public static function capability(string $source, string $type, string $account): ?array
    {
        $capability = config('jne-reports.collection_capabilities')[$source.':'.$type.':'.$account] ?? null;
        if (! is_array($capability) || ! preg_match('/^[a-f0-9]{64}$/D', $capability['verification_checksum'] ?? '')
            || ($capability['cutoff_semantics'] ?? null) !== 'collection_started_at'
            || ($capability['date_column'] ?? null) !== 'TGL_ENTRY'
            || ! is_int($capability['export_limit'] ?? null) || $capability['export_limit'] < 1
            || ! is_array($capability['origins'] ?? null) || $capability['origins'] === []
            || ! is_array($capability['categories'] ?? null) || $capability['categories'] === []
            || array_diff($capability['categories'], ['manual_hybrid', 'cashless_hybrid', 'css_orion']) !== []) {
            return null;
        }

        return $capability;
    }

    /** @return array{complete: bool, reasons: list<string>, evidence: array<string, mixed>} */
    public function handle(ReportJob $job): array
    {
        $raw = $job->parameters['collection_evidence'] ?? [];
        $proof = is_array($raw) ? $raw : [];
        $hybrid = in_array($job->source, ['roberto', 'nuralamt'], true);
        $checksum = $hybrid ? $job->source_file_checksum : $job->file_checksum;
        $path = $hybrid ? $job->source_file_path : $job->file_path;
        $rows = $hybrid ? $job->source_row_count : $job->row_count;
        $protocol = $hybrid ? 'hybrid_ir_total_v1' : 'apex_history_total_v1';
        $reasons = [];
        $capability = self::capability($job->source, $job->report_type, $job->customer_account);
        if ($capability !== null && ! in_array($proof['origin'] ?? null, $capability['origins'], true)) {
            $reasons[] = 'Origin koleksi tidak termasuk endpoint sumber yang telah diverifikasi.';
        }
        $before = is_array($proof['before'] ?? null) ? $proof['before'] : [];
        $after = is_array($proof['after'] ?? null) ? $proof['after'] : [];
        $total = $this->total($before, $hybrid);
        if (($proof['version'] ?? null) !== 1 || ($proof['protocol'] ?? null) !== $protocol || ($proof['synthesized'] ?? false) === true
            || $total === null || $total !== $this->total($after, $hybrid) || $total !== $rows) {
            $reasons[] = 'Total upstream sebelum/sesudah unduhan tidak terbukti sama dengan seluruh baris CSV; kemungkinan subset, truncation, atau perubahan sumber.';
        }
        foreach ([$before, $after] as $scope) {
            if (($scope['date_from'] ?? null) !== $job->date_from?->toDateString() || ($scope['date_thru'] ?? null) !== $job->date_thru?->toDateString()
                || ($scope['filters_clear'] ?? false) !== true
                || ($scope['scope'] ?? null) !== ($hybrid ? 'ALL_USERS' : $job->customer_account)) {
                $reasons[] = 'Scope tanggal, account/user atau filter final sumber belum terbukti.';
                break;
            }
        }
        if (! $hybrid && (empty($before['history_id']) || ($before['history_id'] ?? null) !== ($after['history_id'] ?? null))) {
            $reasons[] = 'Identitas artifact History sebelum/sesudah unduhan belum terbukti.';
        }
        if (! $this->intact($path, $checksum)) {
            $reasons[] = 'File coverage hilang atau checksum isi CSV tidak sesuai bukti tersimpan.';
        }

        return ['complete' => $reasons === [], 'reasons' => $reasons, 'evidence' => [
            'protocol' => $proof['protocol'] ?? null, 'upstream_total' => $total, 'csv_rows' => $rows,
            'checksum' => $checksum, 'export_verified' => $reasons === [], 'observations' => $proof,
        ]];
    }

    /** @param array<string, mixed> $scope */
    private function total(array $scope, bool $hybrid): ?int
    {
        $label = $scope['total_label'] ?? null;
        if (! is_string($label)) {
            return null;
        }
        if ($hybrid && ($scope['empty'] ?? false) === true && $label === 'No data found.') {
            return 0;
        }
        if (! $hybrid) {
            return preg_match('/^(0|[1-9][0-9]{0,8})$/D', $label) ? (int) $label : null;
        }
        if (! preg_match('/^1\s*[-–]\s*([1-9][0-9]{0,8})\s+of\s+([1-9][0-9]{0,8})$/D', trim($label), $matches)) {
            return null;
        }

        return (int) $matches[1] <= (int) $matches[2] ? (int) $matches[2] : null;
    }

    private function intact(?string $path, ?string $checksum): bool
    {
        if (! $path || ! $checksum || ! preg_match('/^[a-f0-9]{64}$/D', $checksum)) {
            return false;
        }
        try {
            $stream = Storage::disk('jne_reports')->readStream($path);
            if (! is_resource($stream)) {
                return false;
            }
            try {
                $hash = hash_init('sha256');
                hash_update_stream($hash, $stream);

                return hash_equals($checksum, hash_final($hash));
            } finally {
                fclose($stream);
            }
        } catch (Throwable) {
            return false;
        }
    }
}

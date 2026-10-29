<?php

namespace App\Actions\Reports;

use App\Models\JneReportAwb;
use App\Models\ReportJob;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class ImportReportAwbs
{
    public function __construct(private ExtractJneAwbMetrics $metrics) {}

    public function handle(int $reportJobId): void
    {
        DB::transaction(function () use ($reportJobId): void {
            $job = ReportJob::whereKey($reportJobId)->lockForUpdate()->firstOrFail();
            if ($job->import_status === 'IMPORTED' && ! JneReportAwb::where('report_job_id', $job->id)->whereNull('raw_data')->exists()) {
                return;
            }
            if ($job->status !== 'COMPLETED' || ! $job->file_path || ! $job->file_checksum) {
                $this->invalid('CSV belum selesai disimpan.');
            }
            $stream = $this->openCsv($job);
            $evidence = app(ReadJneSourceEvidence::class);
            $context = $evidence->context($job);
            $captureEvidence = config('jne-reports.source_provenance_enabled') || config('jne-reports.evidence_policies_enabled') || config('jne-reports.category_markers_enabled');
            try {
                [$headers, $delimiter] = $this->headers($stream);
                $rows = [];
                $records = 0;
                $duplicates = 0;
                $sourceRow = 1;
                while (($values = fgetcsv($stream, null, $delimiter, '"', '')) !== false) {
                    $sourceRow++;
                    if ($values === [null]) {
                        continue;
                    }
                    $records++;
                    if ($job->source === 'apex' && $records > config('jne-reports.max_awbs')) {
                        $this->invalid('CSV melebihi batas 6.000 baris AWB per report.');
                    }
                    if (count($values) !== count($headers)) {
                        $this->invalid("Struktur kolom CSV tidak sesuai pada baris {$sourceRow}.");
                    }
                    $values = array_map($this->utf8Cell(...), $values);
                    $cells = array_combine($headers, array_map($this->normalize(...), $values));
                    $row = $this->normalizeRow($cells, $sourceRow);
                    $row = [...$row, ...$this->metrics->handle($cells)];
                    $row['raw_data'] = json_encode(array_combine($headers, $values), JSON_THROW_ON_ERROR);
                    $reference = ltrim($cells['NOREF'] ?? '', "'");
                    $row['reference'] = $reference !== '' && mb_strlen($reference) <= 255 ? $reference : null;
                    $row['entry_at'] = $this->sourceDate($cells['TGL_ENTRY'] ?? null);
                    $row['source_status_at'] = $this->sourceDate($cells['TGL_UPDATE_STATUS_POD'] ?? null);
                    $observed = $this->sourceDate($cells['TGL_TARIK_REPORT'] ?? null);
                    $latestAllowed = CarbonImmutable::instance($job->completed_at ?? $job->created_at)->addMinutes(5);
                    $row['observed_at'] = $observed && CarbonImmutable::parse($observed, 'UTC')->lessThanOrEqualTo($latestAllowed)
                        ? $observed : ($job->started_at ?? $job->created_at)->utc()->format('Y-m-d H:i:s');
                    if (! is_string($row['awb']) || ! preg_match('/^[A-Za-z0-9_-]+$/D', $row['awb'])) {
                        $this->invalid("AWB kosong atau formatnya tidak valid pada baris {$sourceRow}.");
                    }
                    $row['awb'] = strtoupper($row['awb']);
                    if ($captureEvidence) {
                        $row = [...$row, ...$evidence->row($context, array_combine($headers, $values), $row['awb'])];
                    }
                    if (! is_string($row['customer_account']) || ! preg_match('/^[\pL\pN._\- ]{1,100}$/uD', $row['customer_account']) || ($job->source === 'apex' && $job->report_mode !== 'A' && strcasecmp($row['customer_account'], $this->normalize($job->customer_account)) !== 0)) {
                        $this->invalid("ID_ACCOUNT tidak sesuai dengan akun permintaan pada baris {$sourceRow}.");
                    }
                    $row['customer_account'] = mb_strtoupper($row['customer_account']);
                    $key = 'awb:'.$row['awb'];
                    if (isset($rows[$key])) {
                        if ($rows[$key]['data'] !== $row) {
                            $this->invalid("AWB berulang dengan data berbeda pada baris {$sourceRow}. Periksa CSV sumber.");
                        }
                        $duplicates++;

                        continue;
                    }
                    $rows[$key] = ['data' => $row, 'source_row' => $sourceRow];
                }
                $now = now();
                foreach (array_chunk(array_values($rows), 250) as $chunk) {
                    $recordsToStore = array_map(fn (array $row): array => [...$row['data'], 'source_row' => $row['source_row'], 'report_job_id' => $job->id, 'created_at' => $now, 'updated_at' => $now], $chunk);
                    JneReportAwb::upsert($recordsToStore, ['report_job_id', 'awb'], ['source_row', 'customer_account', 'status_web', 'status_pod', 'awb_cancel', 'shipper_name', 'consignee_name', 'raw_data', 'reference', 'entry_at', 'source_status_at', 'observed_at', 'service', 'destination', 'destination_name', 'delivered_at', 'etd_days', 'amount_cents', 'weight_grams', 'quantity', 'metrics_version', ...($captureEvidence ? ['original_customer_code', 'source_evidence'] : []), 'updated_at']);
                }
                $job->update(['import_status' => 'IMPORTED', 'imported_awb_count' => count($rows), 'duplicate_awb_count' => $duplicates, 'imported_at' => $now, 'import_error' => null]);
            } finally {
                fclose($stream);
            }
        });
    }

    /**
     * @param  array<string, string>  $cells
     * @return array<string, string|null>
     */
    private function normalizeRow(array $cells, int $sourceRow): array
    {
        $row = [];
        foreach (['AWB' => 'awb', 'ID_ACCOUNT' => 'customer_account', 'STATUS_WEB' => 'status_web', 'STATUS_POD' => 'status_pod', 'AWB_CANCEL' => 'awb_cancel', 'SHIPPER_NAME' => 'shipper_name', 'CONSIGNEE_NAME' => 'consignee_name'] as $header => $field) {
            $value = $cells[$header] ?? '';
            if (in_array($field, ['awb', 'customer_account'], true) && str_starts_with($value, "'")) {
                $value = substr($value, 1);
            }
            $maxLength = in_array($field, ['shipper_name', 'consignee_name'], true) ? 500 : (in_array($field, ['awb', 'customer_account'], true) ? 100 : 255);
            if (! mb_check_encoding($value, 'UTF-8') || str_contains($value, "\0") || mb_strlen($value) > $maxLength) {
                $this->invalid("Nilai kolom {$header} tidak valid pada baris {$sourceRow}.");
            }
            $row[$field] = $value === '' ? null : $value;
        }

        return $row;
    }

    /** @return resource */
    private function openCsv(ReportJob $job): mixed
    {
        $source = Storage::disk('jne_reports')->readStream($job->file_path);
        if (! is_resource($source)) {
            $this->invalid('CSV sumber tidak tersedia. Pulihkan file asli lalu ulangi impor.');
        }
        $stream = fopen('php://temp/maxmemory:2097152', 'w+b');
        if (! is_resource($stream)) {
            fclose($source);
            $this->invalid('Ruang sementara untuk membaca CSV tidak tersedia.');
        }
        try {
            $maxBytes = config('jne-reports.max_file_kb') * 1024;
            $size = stream_copy_to_stream($source, $stream, $maxBytes + 1);
            if ($size === false || $size < 1 || $size > $maxBytes) {
                $this->invalid('CSV kosong atau melebihi batas ukuran file.');
            }
            rewind($stream);
            $hash = hash_init('sha256');
            hash_update_stream($hash, $stream);
            if (! hash_equals($job->file_checksum, hash_final($hash))) {
                $this->invalid('Checksum CSV berubah. Pulihkan file asli sebelum mengulang impor.');
            }
            rewind($stream);

            return $stream;
        } catch (Throwable $exception) {
            fclose($stream);
            throw $exception;
        } finally {
            fclose($source);
        }
    }

    /**
     * @param  resource  $stream
     * @return array{array<int, string>, string}
     */
    private function headers(mixed $stream): array
    {
        foreach ([',', ';', "\t"] as $delimiter) {
            rewind($stream);
            $values = fgetcsv($stream, null, $delimiter, '"', '');
            if (! is_array($values) || count($values) < 2) {
                continue;
            }
            $headers = array_map(fn (?string $value): string => strtoupper(trim(ltrim($value ?? '', "\xEF\xBB\xBF"))), $values);
            if (in_array('', $headers, true) || count(array_unique($headers)) !== count($headers)) {
                $this->invalid('Header CSV kosong atau berulang.');
            }
            if (! in_array('AWB', $headers, true) || ! in_array('ID_ACCOUNT', $headers, true)) {
                $this->invalid('CSV wajib memiliki kolom AWB dan ID_ACCOUNT.');
            }

            return [$headers, $delimiter];
        }
        $this->invalid('Header CSV tidak dapat dibaca.');
    }

    private function normalize(?string $value): string
    {
        $value = trim($value ?? '');
        if (preg_match('/^="((?:[^"]|"")*)"$/sD', $value, $matches)) {
            return trim(str_replace('""', '"', $matches[1]));
        }

        return $value;
    }

    private function utf8Cell(?string $value): ?string
    {
        if ($value === null || mb_check_encoding($value, 'UTF-8')) {
            return $value;
        }

        return mb_convert_encoding($value, 'UTF-8', 'Windows-1252');
    }

    private function sourceDate(?string $value): ?string
    {
        if (! $value) {
            return null;
        }
        foreach (['d-M-Y H:i', 'd-M-Y H:i:s', 'Y-m-d H:i:s', 'Y-m-d\TH:i:sP'] as $format) {
            try {
                $date = CarbonImmutable::createFromFormat('!'.$format, $value, config('jne-reports.source_timezone'));
                if ($date && strtoupper($date->format($format)) === strtoupper($value)) {
                    return $date->utc()->format('Y-m-d H:i:s');
                }
            } catch (Throwable) {
                continue;
            }
        }

        return null;
    }

    private function invalid(string $message): never
    {
        throw ValidationException::withMessages(['import' => $message]);
    }
}

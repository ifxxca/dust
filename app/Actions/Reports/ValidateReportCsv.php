<?php

namespace App\Actions\Reports;

use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

class ValidateReportCsv
{
    public function handle(UploadedFile $file, bool $enforceApexLimit = true): int
    {
        $stream = fopen($file->getRealPath(), 'rb');
        if ($stream === false) {
            throw ValidationException::withMessages(['file' => 'File CSV tidak dapat dibaca.']);
        }

        try {
            $sample = fread($stream, 8192);
            if ($sample === false || str_contains($sample, "\0") || preg_match('/^\s*(?:<!doctype|<html|<\?xml|[\{\[])/i', ltrim($sample, "\xEF\xBB\xBF"))) {
                $this->invalid();
            }
            $delimiter = null;
            foreach ([',', ';', "\t"] as $candidate) {
                rewind($stream);
                $headers = fgetcsv($stream, null, $candidate, '"', '');
                if (is_array($headers) && count($headers) >= 2) {
                    $delimiter = $candidate;
                    break;
                }
            }
            if ($delimiter === null || ! is_array($headers)) {
                $this->invalid();
            }
            $normalized = array_map(fn (?string $header): string => trim(ltrim($header ?? '', "\xEF\xBB\xBF")), $headers);
            if (in_array('', $normalized, true) || count(array_unique($normalized)) !== count($normalized)) {
                $this->invalid();
            }
            $awbCount = 0;
            $maxAwbs = config('jne-reports.max_awbs');
            while (($row = fgetcsv($stream, null, $delimiter, '"', '')) !== false) {
                if ($row === [null]) {
                    continue;
                }
                if (count($row) !== count($headers) || str_contains(implode('', $row), "\0")) {
                    $this->invalid();
                }
                $awbCount++;
                if ($enforceApexLimit && $awbCount > $maxAwbs) {
                    throw ValidationException::withMessages(['file' => 'CSV melebihi batas '.number_format($maxAwbs, 0, ',', '.').' AWB per proses. Persempit periode lalu buat permintaan baru.']);
                }
            }

            return $awbCount;
        } finally {
            fclose($stream);
        }
    }

    private function invalid(): never
    {
        throw ValidationException::withMessages(['file' => 'File harus berupa CSV dengan header dan kolom yang konsisten.']);
    }
}

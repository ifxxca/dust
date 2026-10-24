<?php

namespace App\Actions\Reports;

use App\Models\ReportJob;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

class ValidateApexAwbReport
{
    public function handle(ReportJob $job, UploadedFile $file): void
    {
        $stream = fopen($file->getRealPath(), 'rb');
        if ($stream === false) {
            $this->invalid();
        }
        try {
            $delimiter = ',';
            foreach ([',', ';', "\t"] as $candidate) {
                rewind($stream);
                $headers = fgetcsv($stream, null, $candidate, '"', '');
                $headers = array_map(fn (?string $value): string => trim(ltrim($value ?? '', "\xEF\xBB\xBF")), $headers ?: []);
                if (in_array('AWB', $headers, true) && in_array('ID_ACCOUNT', $headers, true)) {
                    $delimiter = $candidate;
                    break;
                }
            }
            $awbColumn = array_search('AWB', $headers, true);
            $accountColumn = array_search('ID_ACCOUNT', $headers, true);
            if ($awbColumn === false || $accountColumn === false) {
                $this->invalid();
            }
            $expected = array_fill_keys(array_map(fn (string $awb): string => 'awb:'.$awb, $job->parameters['awbs'] ?? []), true);
            $found = [];
            while (($row = fgetcsv($stream, null, $delimiter, '"', '')) !== false) {
                if ($row === [null]) {
                    continue;
                }
                $awb = strtoupper(ltrim(trim($row[$awbColumn] ?? ''), "'"));
                $account = ltrim(trim($row[$accountColumn] ?? ''), "'");
                if (! isset($expected['awb:'.$awb]) || ! preg_match('/^[\pL\pN._\- ]{1,100}$/uD', $account)) {
                    $this->invalid();
                }
                $found['awb:'.$awb] = true;
            }
            if (count($found) !== count($expected)) {
                $this->invalid();
            }
        } finally {
            fclose($stream);
        }
    }

    private function invalid(): never
    {
        throw ValidationException::withMessages(['file' => 'Hasil APEX wajib memiliki AWB dan ID_ACCOUNT serta mencakup tepat daftar AWB yang dikirim.']);
    }
}

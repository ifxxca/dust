<?php

namespace App\Actions\Reports;

use App\Models\ReportJob;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

class ValidateHybridReportCsv
{
    /** @return list<string> */
    public function handle(ReportJob $job, UploadedFile $file): array
    {
        $stream = fopen($file->getRealPath(), 'rb');
        if ($stream === false) {
            $this->invalid();
        }
        try {
            $headers = fgetcsv($stream, null, ',', '"', '');
            $headers = array_map(fn (?string $value): string => ltrim($value ?? '', "\xEF\xBB\xBF"), $headers ?: []);
            $dateColumn = array_search($job->report_type === 'cashless' ? 'HO Date' : 'Date', $headers, true);
            $awbColumn = array_search($job->report_type === 'cashless' ? 'Cnote No' : 'Cnote no', $headers, true);
            if ($dateColumn === false || $awbColumn === false || $job->date_from->toDateString() !== $job->date_thru->toDateString()) {
                $this->invalid();
            }
            $prefix = strtoupper($job->date_from->format('d-M-Y')).' ';
            $awbs = [];
            while (($row = fgetcsv($stream, null, ',', '"', '')) !== false) {
                if ($row === [null]) {
                    continue;
                }
                if (! trim($row[$awbColumn] ?? '') || ! str_starts_with(strtoupper($row[$dateColumn] ?? ''), $prefix)) {
                    $this->invalid();
                }
                $awb = strtoupper(ltrim(trim($row[$awbColumn]), "'"));
                if (! preg_match('/^[A-Z0-9_-]{1,100}$/D', $awb)) {
                    $this->invalid();
                }
                $awbs['awb:'.$awb] = $awb;
            }

            return array_values($awbs);
        } finally {
            fclose($stream);
        }
    }

    private function invalid(): never
    {
        throw ValidationException::withMessages(['file' => 'CSV Hybrid harus sesuai jenis report dan tanggal penarikan.']);
    }
}

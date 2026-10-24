<?php

namespace App\Actions\Reports;

use App\Models\ReportJob;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class CombineHybridReports
{
    public function handle(int $batchId): void
    {
        DB::transaction(function () use ($batchId): void {
            $batch = ReportJob::whereKey($batchId)->lockForUpdate()->firstOrFail();
            if ($batch->status !== 'COLLECTING_SOURCES') {
                return;
            }
            $sources = ReportJob::where('hybrid_batch_id', $batch->id)->orderBy('id')->get();
            $failed = $sources->first(fn (ReportJob $source): bool => in_array($source->status, ['FAILED', 'NEEDS_ATTENTION'], true));
            if ($failed) {
                $batch->update(['status' => 'NEEDS_ATTENTION', 'error_message' => 'HYBRID_SOURCE_FAILED: Report '.$failed->source.' '.$failed->report_type.' (#'.$failed->id.') gagal. Gabungan belum dikirim ke APEX.']);
                $batch->recordEvent($batch->error_message);

                return;
            }
            if ($sources->count() !== 4 || $sources->contains(fn (ReportJob $source): bool => $source->status !== 'SOURCE_SAVED')) {
                return;
            }
            $expected = collect(ReportJob::HYBRID_PARTS)->map(fn (array $part): string => implode(':', $part))->sort()->values()->all();
            $actual = $sources->map(fn (ReportJob $source): string => $source->source.':'.$source->report_type)->sort()->values()->all();
            abort_unless($actual === $expected && $sources->every(fn (ReportJob $source): bool => $source->date_from->equalTo($batch->date_from) && $source->date_thru->equalTo($batch->date_thru)), 409, 'Sumber gabungan tidak sesuai siklus atau tanggal.');
            $awbs = [];
            foreach ($sources as $source) {
                foreach ($source->parameters['awbs'] ?? [] as $awb) {
                    $awbs['awb:'.$awb] = $awb;
                }
            }
            $awbs = array_values($awbs);
            $content = $awbs === [] ? '' : implode("\r\n", $awbs)."\r\n";
            $checksum = hash('sha256', $content);
            $path = 'report-jobs/'.$batch->id.'/awbs-'.$checksum.'.csv';
            abort_unless(Storage::disk('jne_reports')->put($path, $content, ['visibility' => 'private']) === true, 503, 'Penyimpanan AWB gabungan gagal.');
            $rowCount = (int) $sources->sum('source_row_count');
            $batch->update([
                'status' => $awbs === [] ? 'NO_DATA' : 'WAITING_APEX', 'report_mode' => 'A',
                'parameters' => ['awbs' => $awbs], 'awb_count' => count($awbs), 'source_row_count' => $rowCount,
                'source_file_path' => $path, 'source_file_checksum' => $checksum,
                'completed_at' => $awbs === [] ? now() : null,
            ]);
            $batch->recordEvent('Keempat report lengkap: '.$rowCount.' baris menjadi '.count($awbs).' AWB unik dalam satu file gabungan.'.($awbs === [] ? ' Tidak ada AWB untuk dikirim ke APEX.' : ' Menunggu Upload Connote APEX.'));
        }, 5);
    }
}

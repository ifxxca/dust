<?php

namespace App\Actions\Pickup;

use App\Models\PickupAwbManifest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;
use ZipArchive;

class RenderPickupAwbManifest
{
    public function __construct(private DeliverPickupAwbManifest $deliveries) {}

    public function handle(int $manifestId): void
    {
        $manifest = DB::transaction(function () use ($manifestId): ?PickupAwbManifest {
            $manifest = PickupAwbManifest::whereKey($manifestId)->lockForUpdate()->firstOrFail();
            if (! in_array($manifest->status, ['PENDING', 'FAILED'], true) || $manifest->render_attempts >= 4) {
                return null;
            }
            $manifest->update(['status' => 'RENDERING', 'last_error' => null, 'render_attempts' => $manifest->render_attempts + 1]);

            return $manifest;
        });
        if (! $manifest) {
            return;
        }
        $disk = Storage::disk('local');
        $base = 'pickup-awb-manifests/'.$manifest->id.'/v'.$manifest->revision.'-'.Str::uuid();
        try {
            $items = DB::table('pickup_awb_manifest_items')->where('pickup_awb_manifest_id', $manifestId)->orderBy('awb')->get();
            $rows = [['Resi', 'Kategori', 'Penerima', 'Customer', 'Kode customer', 'Referensi pickup', 'Tanggal pickup']];
            foreach ($items as $item) {
                $rows[] = [$item->awb, $item->category, $item->consignee_name ?? '', $manifest->snapshot['customer_name'], $manifest->snapshot['customer_code'] ?? '', $manifest->snapshot['reference'], $manifest->snapshot['pickup_date']];
            }
            $html = view('pickup-awb-manifest', ['manifest' => $manifest, 'items' => $items])->render();
            if (! $disk->put($base.'.html', $html)) {
                throw new RuntimeException('HTML manifest tidak dapat disimpan.');
            }
            $this->xlsx($disk->path($base.'.xlsx'), $rows);
            $process = Process::timeout(55)->run([config('pickup.automation.node_binary'), base_path('workers/jne-report/src/render-pickup-manifest.mjs'), $disk->path($base.'.html'), $disk->path($base.'.pdf')]);
            if (! $process->successful() || ! $disk->exists($base.'.pdf') || ! str_starts_with($disk->get($base.'.pdf'), '%PDF-')) {
                throw new RuntimeException('PDF gagal dibuat. Periksa Node dan browser Playwright pada worker dokumen.');
            }
            DB::transaction(function () use ($manifest, $base, $disk): void {
                $current = PickupAwbManifest::whereKey($manifest->id)->lockForUpdate()->firstOrFail();
                if ($current->status !== 'RENDERING') {
                    return;
                }
                $current->update(['status' => 'READY', 'xlsx_path' => $base.'.xlsx', 'pdf_path' => $base.'.pdf',
                    'checksums' => ['xlsx' => hash_file('sha256', $disk->path($base.'.xlsx')), 'pdf' => hash_file('sha256', $disk->path($base.'.pdf'))], 'last_error' => null]);
                $this->deliveries->queue($current);
            });
        } catch (Throwable $exception) {
            PickupAwbManifest::whereKey($manifestId)->where('status', 'RENDERING')->update(['status' => 'FAILED', 'last_error' => 'Pembuatan dokumen gagal; periksa worker lalu coba ulang.', 'next_render_at' => now()->addMinutes(2)]);
            throw $exception;
        }
    }

    /** @param list<list<string>> $rows */
    private function xlsx(string $path, array $rows): void
    {
        $sheet = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
        foreach ($rows as $index => $row) {
            $sheet .= '<row r="'.($index + 1).'">';
            foreach ($row as $column => $value) {
                $sheet .= '<c r="'.range('A', 'G')[$column].($index + 1).'" t="inlineStr"><is><t xml:space="preserve">'.htmlspecialchars($value, ENT_XML1 | ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').'</t></is></c>';
            }
            $sheet .= '</row>';
        }
        $sheet .= '</sheetData></worksheet>';
        $zip = new ZipArchive;
        if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Excel tidak dapat dibuat.');
        }
        try {
            $zip->addFromString('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
            $zip->addFromString('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
            $zip->addFromString('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Daftar resi" sheetId="1" r:id="rId1"/></sheets></workbook>');
            $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
            $zip->addFromString('xl/worksheets/sheet1.xml', $sheet);
        } finally {
            $zip->close();
        }
    }
}

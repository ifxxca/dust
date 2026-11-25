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
            $items = DB::table('pickup_awb_manifest_items')->where('pickup_awb_manifest_id', $manifestId)->orderBy('awb')->get()
                ->map(function (object $item) use ($manifest): object {
                    $details = $manifest->snapshot['shipment_details']['awb:'.$item->awb] ?? [];
                    $item->shipper_name = $details['shipper_name'] ?? null;
                    $item->consignee_address = $details['consignee_address'] ?? null;
                    $item->consignee_district = $details['consignee_district'] ?? null;
                    $item->destination_code = $details['destination_code'] ?? null;
                    $item->district_status = $details['district_status'] ?? 'UNKNOWN';
                    $item->cod_flag = $details['cod_flag'] ?? null;
                    $item->amount_cents = $item->category === 'cashless_hybrid' || $item->cod_flag === 'Y' ? 0 : ($details['amount_cents'] ?? null);
                    $item->category_label = ['manual_hybrid' => 'Manual', 'cashless_hybrid' => 'Cashless', 'css_orion' => 'CSS / Orion'][$item->category] ?? $item->category;

                    return $item;
                });
            $html = view('pickup-awb-manifest', ['manifest' => $manifest, 'items' => $items])->render();
            if (! $disk->put($base.'.html', $html)) {
                throw new RuntimeException('HTML manifest tidak dapat disimpan.');
            }
            $this->xlsx($disk->path($base.'.xlsx'), $manifest, $items->all());
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

    /** @param list<object> $items */
    private function xlsx(string $path, PickupAwbManifest $manifest, array $items): void
    {
        $snapshot = $manifest->snapshot;
        $rows = [
            ['Rekap Pickup'],
            [$snapshot['customer_name'].' · Kode '.($snapshot['customer_code'] ?? '—')],
            ['Pickup '.$snapshot['reference'].' · '.$snapshot['pickup_date'].' · Versi '.$manifest->revision],
            ['Total '.count($items).' AWB unik'],
            [],
            ['No', 'Resi', 'Kategori', 'Pengirim', 'Penerima', 'Alamat penerima', 'Amount (Rp)'],
        ];
        foreach ($items as $index => $item) {
            $rows[] = [$index + 1, $item->awb, $item->category_label.($item->cod_flag === 'Y' ? ' · COD' : ''), $item->shipper_name ?: '—', $item->consignee_name ?: '—', $item->consignee_address ?: '—', $item->amount_cents !== null ? $item->amount_cents / 100 : '—'];
        }
        $lastItemRow = count($rows);
        $mergedRows = [1, 2, 3, 4];
        if (isset($snapshot['closure'])) {
            $closure = $snapshot['closure'];
            $rows[] = [];
            $rows[] = ['Keterangan selisih: '.$closure['reason_label']];
            $mergedRows[] = count($rows);
            $rows[] = [$closure['explanation']];
            $mergedRows[] = count($rows);
            $rows[] = ['Jumlah pickup: '.array_sum(array_column($snapshot['categories'], 'pop')).' paket · Resi terkonfirmasi: '.count($items)];
            $mergedRows[] = count($rows);
        }
        $widths = [6, 24, 18, 32, 32, 64, 20];
        $sheet = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:G'.count($rows).'"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>';
        foreach ($widths as $index => $width) {
            $sheet .= '<col min="'.($index + 1).'" max="'.($index + 1).'" width="'.$width.'" customWidth="1"/>';
        }
        $sheet .= '</cols><sheetData>';
        foreach ($rows as $index => $row) {
            $number = $index + 1;
            $lines = 1;
            foreach ($row as $column => $value) {
                $width = in_array($number, $mergedRows, true) ? 145 : $widths[$column] - 2;
                $wrapped = array_sum(array_map(fn (string $line): int => max(1, (int) ceil(mb_strlen($line) / $width)), explode("\n", (string) $value)));
                $lines = max($lines, $wrapped);
            }
            $height = $number === 1 ? 30 : max(24, $lines * 15 + 10);
            $sheet .= '<row r="'.$number.'" ht="'.min(409, $height).'" customHeight="1">';
            foreach ($row as $column => $value) {
                $style = match (true) {
                    $number === 1 => 1,
                    $number < 6 => 2,
                    $number === 6 => 3,
                    $number > $lastItemRow => 2,
                    $column === 6 => $number % 2 === 0 ? 7 : 6,
                    default => $number % 2 === 0 ? 5 : 4,
                };
                $reference = range('A', 'G')[$column].$number;
                $sheet .= is_int($value) || is_float($value)
                    ? '<c r="'.$reference.'" s="'.$style.'"><v>'.$value.'</v></c>'
                    : '<c r="'.$reference.'" s="'.$style.'" t="inlineStr"><is><t xml:space="preserve">'.htmlspecialchars($value, ENT_XML1 | ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').'</t></is></c>';
            }
            $sheet .= '</row>';
        }
        $sheet .= '</sheetData>';
        if ($items !== []) {
            $sheet .= '<autoFilter ref="A6:G'.$lastItemRow.'"/>';
        }
        $sheet .= '<mergeCells count="'.count($mergedRows).'">';
        foreach ($mergedRows as $row) {
            $sheet .= '<mergeCell ref="A'.$row.':G'.$row.'"/>';
        }
        $sheet .= '</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;C&amp;P / &amp;N</oddFooter></headerFooter></worksheet>';
        $zip = new ZipArchive;
        if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Excel tidak dapat dibuat.');
        }
        try {
            $zip->addFromString('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
            $zip->addFromString('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
            $zip->addFromString('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Daftar resi" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">\'Daftar resi\'!$6:$6</definedName></definedNames></workbook>');
            $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
            $zip->addFromString('xl/styles.xml', $this->styles());
            $zip->addFromString('xl/worksheets/sheet1.xml', $sheet);
        } finally {
            $zip->close();
        }
    }

    private function styles(): string
    {
        return '<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><color rgb="FF172033"/><name val="Arial"/></font><font><b/><sz val="17"/><color rgb="FF172033"/><name val="Arial"/></font><font><sz val="11"/><color rgb="FF475569"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E3A5F"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf><xf numFmtId="4" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>';
    }
}

<?php

use App\Actions\Pickup\DeliverPickupAwbManifest;
use App\Actions\Pickup\QueryPickupAutomation;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Pickup\RenderPickupAwbManifest;
use App\Mail\PickupAwbManifestMail;
use App\Models\CustomerAwbDeliveryPreference;
use App\Models\JneReportAwb;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupCustomerReconciliation;
use Illuminate\Mail\PendingMail;
use Illuminate\Mail\SentMessage;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Mailer\Envelope;
use Symfony\Component\Mime\Email;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    $this->travelTo('2026-10-26 08:00:00 UTC');
    config(['jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true, 'pickup.automation.enabled' => false, 'pickup.automation.send_enabled' => false]);
    Queue::fake();
    Storage::fake('jne_reports');
    Storage::fake('local');
    Process::fake(function (PendingProcess $process) {
        file_put_contents($process->command[3], "%PDF-1.4\nfixture\n%%EOF");

        return Process::result();
    });
    $this->fixture = pickupAutomationFixture();
    importPickupAutomationReport($this->fixture);
    $source = JneReportAwb::where('awb', '000MANUAL1')->sole();
    $source->update(['shipper_name' => '4000 VANNY SONGKET', 'raw_data' => [...$source->raw_data,
        'DEST' => 'DJJ21506', 'COD_FLAG' => 'N', 'PAYMENT_TYPE' => 'CASH', 'AMOUNT' => '18500.50',
        'ADDR1' => ' Jl. Penerima No. 12 & 14 ', 'ADDR2' => '   ', 'ADDR3' => 'Jakarta Barat 11730']]);
    app(ReconcilePickupProcessing::class)->handle($this->fixture['task']->id);
});

test('pickup recap freezes sender address district and amount in the approved snapshot', function () {
    $manifest = PickupAwbManifest::sole();
    $group = PickupCustomerReconciliation::sole();
    $approved = collect($group->approval_snapshot['included_awbs'])->firstWhere('awb', '000MANUAL1');

    expect($approved['consignee_address'])->toBe("Jl. Penerima No. 12 & 14\nJakarta Barat 11730");
    expect($manifest->snapshot['shipment_details']['awb:000MANUAL1'])->toBe([
        'shipper_name' => '4000 VANNY SONGKET', 'consignee_address' => "Jl. Penerima No. 12 & 14\nJakarta Barat 11730",
        'destination_code' => 'DJJ21506', 'consignee_district' => 'BONGGO TIMUR', 'district_status' => 'MATCHED',
        'payment_type' => 'CASH', 'cod_flag' => 'N', 'source_amount_cents' => 1850050, 'amount_cents' => 1850050,
    ]);
    $source = JneReportAwb::where('awb', '000MANUAL1')->sole();
    $source->update(['shipper_name' => '4000 Pengirim berubah', 'raw_data' => [...$source->raw_data, 'ADDR1' => 'Alamat berubah', 'DEST' => 'MJK10022', 'AMOUNT' => '99999', 'COD_FLAG' => 'Y']]);

    app(ReconcilePickupProcessing::class)->handle($this->fixture['task']->id);
    app(RenderPickupAwbManifest::class)->handle($manifest->id);

    $this->assertDatabaseCount('pickup_awb_manifests', 1);
    expect($manifest->fresh()->status)->toBe('READY');
    $html = Storage::disk('local')->get(preg_replace('/\.pdf$/', '.html', $manifest->fresh()->pdf_path));
    expect($html)->toContain('4000 VANNY SONGKET')->toContain('BONGGO TIMUR')->toContain('18.500,50')
        ->not->toContain('Jl. Penerima')->not->toContain('MJK10022')->not->toContain('99.999')
        ->not->toContain('Alamat berubah')->not->toContain('Pengirim berubah');
});

test('PDF uses districts while Excel retains addresses and both include safe amounts', function () {
    $manifest = PickupAwbManifest::sole();
    $snapshot = $manifest->snapshot;
    $snapshot['shipment_details']['awb:000MANUAL2'] = ['shipper_name' => '<script>danger()</script>', 'consignee_address' => '=HYPERLINK("bad")'];
    $manifest->update(['snapshot' => $snapshot]);

    app(RenderPickupAwbManifest::class)->handle($manifest->id);

    $manifest->refresh();
    $zip = new ZipArchive;
    $zip->open(Storage::disk('local')->path($manifest->xlsx_path));
    $sheet = simplexml_load_string($zip->getFromName('xl/worksheets/sheet1.xml'));
    $styles = simplexml_load_string($zip->getFromName('xl/styles.xml'));
    $zip->close();
    $headers = array_map(fn ($cell): string => (string) $cell->is->t, iterator_to_array($sheet->sheetData->row[5]->c, false));
    expect($headers)->toBe(['No', 'Resi', 'Kategori', 'Pengirim', 'Penerima', 'Alamat penerima', 'Amount (Rp)']);
    expect((string) $sheet->sheetData->row[6]->c[1]->is->t)->toBe('000MANUAL1');
    expect((string) $sheet->sheetData->row[6]->c[2]->is->t)->toBe('Manual');
    expect((string) $sheet->sheetData->row[6]->c[3]->is->t)->toBe('4000 VANNY SONGKET');
    expect((string) $sheet->sheetData->row[6]->c[5]->is->t)->toBe("Jl. Penerima No. 12 & 14\nJakarta Barat 11730");
    expect((string) $sheet->sheetData->row[7]->c[5]->is->t)->toBe('=HYPERLINK("bad")');
    expect((string) $sheet->sheetData->row[8]->c[5]->is->t)->toBe('—');
    expect((string) $sheet->sheetData->row[6]->c[6]->v)->toBe('18500.5');
    expect((string) $sheet->sheetData->row[6]->c[6]['t'])->toBe('');
    expect((string) $sheet->sheetData->row[8]->c[6]->is->t)->toBe('—');
    expect((string) $sheet->autoFilter['ref'])->toBe('A6:G9');
    expect((string) $sheet->sheetViews->sheetView->pane['topLeftCell'])->toBe('A7');
    expect((string) $styles->cellXfs->xf[4]->alignment['wrapText'])->toBe('1');
    $html = Storage::disk('local')->get(preg_replace('/\.pdf$/', '.html', $manifest->pdf_path));
    expect((string) $styles->cellXfs->xf[6]['numFmtId'])->toBe('4');
    expect($html)->toContain('<th scope="col">Pengirim</th><th scope="col">Penerima</th><th scope="col">Kecamatan</th>')->toContain('Amount (Rp)')->toContain('&lt;script&gt;danger()&lt;/script&gt;')
        ->not->toContain('<script>danger()</script>');
});

test('large pickup recaps retain every address and sequential row number', function () {
    $manifest = PickupAwbManifest::sole();
    $snapshot = $manifest->snapshot;
    for ($number = 1; $number <= 60; $number++) {
        $awb = 'CM'.str_pad((string) $number, 11, '0', STR_PAD_LEFT);
        DB::table('pickup_awb_manifest_items')->insert(['pickup_awb_manifest_id' => $manifest->id, 'awb' => $awb,
            'category' => 'cashless_hybrid', 'consignee_name' => 'PT Penerima Distribusi Indonesia Cabang '.str_pad((string) $number, 2, '0', STR_PAD_LEFT)]);
        $snapshot['shipment_details']['awb:'.$awb] = ['shipper_name' => '4000 VANNY SONGKET - Pengiriman Cabang Jakarta',
            'destination_code' => 'CGK10104', 'consignee_district' => 'KEMBANGAN', 'district_status' => 'MATCHED',
            'consignee_address' => "Jl. Penerima No. {$number}, Gedung Distribusi Nusantara Lantai 12, Blok A RT 003/RW 004\nKelurahan Kembangan Selatan, Kecamatan Kembangan\nJakarta Barat, DKI Jakarta 11610"];
    }
    $manifest->update(['snapshot' => $snapshot]);

    app(RenderPickupAwbManifest::class)->handle($manifest->id);

    $manifest->refresh();
    expect($manifest->status)->toBe('READY');
    $zip = new ZipArchive;
    $zip->open(Storage::disk('local')->path($manifest->xlsx_path));
    $sheet = simplexml_load_string($zip->getFromName('xl/worksheets/sheet1.xml'));
    $zip->close();
    expect($sheet->sheetData->row)->toHaveCount(69);
    expect((string) $sheet->sheetData->row[68]->c[0]->v)->toBe('63');
    expect((string) $sheet->sheetData->row[68]->c[5]->is->t)->toContain('Jl. Penerima No. 60,');
    expect((string) $sheet->autoFilter['ref'])->toBe('A6:G69');
    $html = Storage::disk('local')->get(preg_replace('/\.pdf$/', '.html', $manifest->pdf_path));
    expect($html)->toContain('Total 63 AWB unik')->toContain('CM00000000060')->not->toContain('Jl. Penerima No. 60,');
});

test('rendered amounts keep cashless and COD at zero and flag ambiguous districts', function () {
    $manifest = PickupAwbManifest::sole();
    DB::table('pickup_awb_manifest_items')->where('awb', '000MANUAL2')->update(['category' => 'cashless_hybrid']);
    $snapshot = $manifest->snapshot;
    $snapshot['shipment_details']['awb:000MANUAL2'] = ['amount_cents' => 9900000, 'cod_flag' => 'N'];
    $snapshot['shipment_details']['awb:000ORION1'] = ['amount_cents' => 8800000, 'cod_flag' => 'Y',
        'destination_code' => 'MJK10022', 'district_status' => 'AMBIGUOUS'];
    $manifest->update(['snapshot' => $snapshot]);

    app(RenderPickupAwbManifest::class)->handle($manifest->id);

    $manifest->refresh();
    $zip = new ZipArchive;
    $zip->open(Storage::disk('local')->path($manifest->xlsx_path));
    $sheet = simplexml_load_string($zip->getFromName('xl/worksheets/sheet1.xml'));
    $zip->close();
    expect((string) $sheet->sheetData->row[7]->c[6]->v)->toBe('0');
    expect((string) $sheet->sheetData->row[8]->c[6]->v)->toBe('0');
    expect((string) $sheet->sheetData->row[8]->c[2]->is->t)->toBe('CSS / Orion · COD');
    $html = Storage::disk('local')->get(preg_replace('/\.pdf$/', '.html', $manifest->pdf_path));
    expect($html)->toContain('Belum pasti')->toContain('MJK10022')->toContain('>0,00</td>')
        ->not->toContain('88.000,00')->not->toContain('99.000,00');
});

test('recap template accepts rows from an already running document worker', function () {
    $manifest = PickupAwbManifest::sole();
    $items = DB::table('pickup_awb_manifest_items')->where('pickup_awb_manifest_id', $manifest->id)->orderBy('awb')->get();

    $html = view('pickup-awb-manifest', ['manifest' => $manifest, 'items' => $items])->render();

    expect($html)->toContain('4000 VANNY SONGKET')->toContain('BONGGO TIMUR')->toContain('18.500,50')
        ->toContain('CSS / Orion');
    $snapshot = $manifest->snapshot;
    unset($snapshot['shipment_details']);
    $manifest->snapshot = $snapshot;

    $legacyHtml = view('pickup-awb-manifest', ['manifest' => $manifest, 'items' => $items])->render();

    expect($legacyHtml)->toContain('000MANUAL1')->toContain('<td class="district">—</td>');
});

test('manifest renders immutable Excel text cells and a checked PDF without sending by default', function () {
    Mail::fake();
    DB::table('pickup_awb_manifest_items')->where('awb', '000MANUAL1')->update(['consignee_name' => '=HYPERLINK("bad")']);
    $manifest = PickupAwbManifest::sole();
    app(RenderPickupAwbManifest::class)->handle($manifest->id);
    $manifest->refresh();
    expect($manifest->status)->toBe('READY');
    $zip = new ZipArchive;
    expect($zip->open(Storage::disk('local')->path($manifest->xlsx_path)))->toBeTrue();
    $sheet = $zip->getFromName('xl/worksheets/sheet1.xml');
    $zip->close();
    expect($sheet)->toContain('000MANUAL1')->toContain('t="inlineStr"')->toContain('=HYPERLINK(')->not->toContain('<f>');
    expect(Storage::disk('local')->get($manifest->pdf_path))->toStartWith('%PDF-');
    expect($manifest->checksums['pdf'])->toBe(hash('sha256', Storage::disk('local')->get($manifest->pdf_path)));
    Mail::assertNothingSent();
});

test('recap downloads use the frozen customer name pickup date and revision', function (string $format) {
    $manifest = PickupAwbManifest::sole();
    app(RenderPickupAwbManifest::class)->handle($manifest->id);
    $this->fixture['customer']->update(['name' => 'Nama customer berubah']);

    $response = $this->actingAs($this->fixture['admin'])->get(route('pickup-automation.download', [
        'task' => $this->fixture['task']->id, 'manifest' => $manifest->id, 'format' => $format,
    ]));

    $response->assertOk()->assertDownload('Rekap Resi - Vanny - 26 Oktober 2026 - v1.'.$format);
})->with(['pdf', 'xlsx']);

test('recap email attachments use the same readable filenames as downloads', function () {
    $manifest = PickupAwbManifest::sole();
    app(RenderPickupAwbManifest::class)->handle($manifest->id);
    $manifest->refresh();

    $mail = new PickupAwbManifestMail($manifest, 'filename-test');

    $mail->assertHasAttachedData(Storage::disk('local')->get($manifest->pdf_path), 'Rekap Resi - Vanny - 26 Oktober 2026 - v1.pdf', ['mime' => 'application/pdf']);
    $mail->assertHasAttachedData(Storage::disk('local')->get($manifest->xlsx_path), 'Rekap Resi - Vanny - 26 Oktober 2026 - v1.xlsx', ['mime' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
});

test('recap filenames safely clean customer names without exposing the pickup identifier', function (string $name, string $expected) {
    $manifest = PickupAwbManifest::sole();
    $manifest->snapshot = [...$manifest->snapshot, 'customer_name' => $name, 'pickup_date' => '2026-11-20'];
    $manifest->revision = 2;

    expect($manifest->downloadFilename('pdf'))->toBe('Rekap Resi - '.$expected.' - 20 November 2026 - v2.pdf');
})->with([
    'path and control characters' => ["PT/UNO: Barat?\r\nCabang", 'PT UNO Barat Cabang'],
    'international customer name' => ['Étoile & Co.', 'Etoile & Co'],
    'empty safe name fallback' => ['<>:/|?*', 'Customer'],
]);

test('an uncertain send is recorded once and never retried by polling or queue replay', function () {
    config(['pickup.automation.enabled' => true, 'pickup.automation.send_enabled' => true, 'mail.default' => 'smtp']);
    CustomerAwbDeliveryPreference::factory()->create(['customer_id' => $this->fixture['customer']->id, 'enabled' => true, 'recipient' => 'vanny@example.test']);
    app(RenderPickupAwbManifest::class)->handle(PickupAwbManifest::sole()->id);
    Mail::fake();
    $action = app(DeliverPickupAwbManifest::class);
    $delivery = PickupAwbDelivery::sole();
    $action->handle($delivery->id);
    $action->queue(PickupAwbManifest::sole());
    $action->handle($delivery->id);
    expect($delivery->fresh()->status)->toBe('UNKNOWN');
    $this->assertDatabaseCount('pickup_awb_deliveries', 1);
    $this->assertDatabaseCount('pickup_awb_delivery_attempts', 1);
    Mail::assertSent(PickupAwbManifestMail::class, 1);
});

test('changed preference cancels a queued send before contacting the provider', function () {
    config(['pickup.automation.enabled' => true, 'pickup.automation.send_enabled' => true, 'mail.default' => 'smtp']);
    $preference = CustomerAwbDeliveryPreference::factory()->create(['customer_id' => $this->fixture['customer']->id, 'enabled' => true, 'recipient' => 'vanny@example.test']);
    app(RenderPickupAwbManifest::class)->handle(PickupAwbManifest::sole()->id);
    $preference->update(['revision' => 2, 'enabled' => false]);
    Mail::fake();
    app(DeliverPickupAwbManifest::class)->handle(PickupAwbDelivery::sole()->id);
    expect(PickupAwbDelivery::sole()->status)->toBe('CANCELLED');
    Mail::assertNothingSent();
});

test('a renderer completing after baseline correction cannot restore a superseded manifest', function () {
    Process::fake(function (PendingProcess $process) {
        $this->fixture['task']->proof->revisions()->create(['revision' => 1, 'values' => ['manual_hybrid' => 3], 'actor_id' => $this->fixture['admin']->id, 'reason' => 'Koreksi gudang']);
        app(ReconcilePickupProcessing::class)->handle($this->fixture['task']->id);
        file_put_contents($process->command[3], "%PDF-1.4\nfixture");

        return Process::result();
    });
    app(RenderPickupAwbManifest::class)->handle(PickupAwbManifest::sole()->id);
    expect(PickupAwbManifest::sole()->status)->toBe('REVIEW');
    $this->assertDatabaseCount('pickup_awb_deliveries', 0);
});

test('document failure is retryable without creating another manifest revision', function () {
    Process::fake([Process::result(exitCode: 1)]);
    $manifest = PickupAwbManifest::sole();
    expect(fn () => app(RenderPickupAwbManifest::class)->handle($manifest->id))->toThrow(RuntimeException::class);
    expect($manifest->fresh()->status)->toBe('FAILED');
    expect($manifest->fresh()->render_attempts)->toBe(1);
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
});

test('provider acceptance has one attempt and queue replay does not resend', function () {
    config(['pickup.automation.enabled' => true, 'pickup.automation.send_enabled' => true, 'mail.default' => 'smtp']);
    CustomerAwbDeliveryPreference::factory()->create(['customer_id' => $this->fixture['customer']->id, 'enabled' => true, 'recipient' => 'vanny@example.test']);
    app(RenderPickupAwbManifest::class)->handle(PickupAwbManifest::sole()->id);
    $email = (new Email)->from('retail@example.test')->to('vanny@example.test')->text('Daftar resi');
    $sent = new SentMessage(new Symfony\Component\Mailer\SentMessage($email, Envelope::create($email)));
    $pending = Mockery::mock(PendingMail::class);
    $pending->shouldReceive('send')->once()->with(Mockery::type(PickupAwbManifestMail::class))->andReturn($sent);
    Mail::shouldReceive('to')->once()->with('vanny@example.test')->andReturn($pending);
    $action = app(DeliverPickupAwbManifest::class);
    $delivery = PickupAwbDelivery::sole();
    $action->handle($delivery->id);
    $action->queue(PickupAwbManifest::sole());
    $action->handle($delivery->id);
    expect($delivery->fresh()->status)->toBe('ACCEPTED');
    expect($delivery->fresh()->provider_message_id)->not->toBeNull();
    $this->assertDatabaseCount('pickup_awb_delivery_attempts', 1);
});

test('locked documents retain approved recipient metadata without creating new versions', function () {
    $original = PickupAwbManifest::sole();
    $source = JneReportAwb::where('awb', '000MANUAL1')->sole();
    $source->update(['consignee_name' => 'Koreksi penerima']);
    app(ReconcilePickupProcessing::class)->handle($this->fixture['task']->id);
    $source->update(['consignee_name' => 'Penerima 1']);
    app(ReconcilePickupProcessing::class)->handle($this->fixture['task']->id);
    expect($original->fresh()->status)->toBe('PENDING');
    $this->assertDatabaseCount('pickup_awb_manifests', 1);
    $this->assertDatabaseHas('pickup_awb_manifest_items', ['pickup_awb_manifest_id' => $original->id, 'awb' => '000MANUAL1', 'consignee_name' => 'Penerima 1']);
    $monitor = app(QueryPickupAutomation::class)->handle(['date_from' => '2026-10-26', 'date_to' => '2026-10-26']);
    expect($monitor['rows']->items()[0]['manifest_id'])->toBe($original->id);
});

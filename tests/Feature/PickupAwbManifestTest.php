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
    app(ReconcilePickupProcessing::class)->handle($this->fixture['task']->id);
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
    expect(PickupAwbManifest::sole()->status)->toBe('SUPERSEDED');
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

test('restoring previous content supersedes newer documents and the monitor selects the active version', function () {
    $original = PickupAwbManifest::sole();
    $source = JneReportAwb::where('awb', '000MANUAL1')->sole();
    $source->update(['consignee_name' => 'Koreksi penerima']);
    app(ReconcilePickupProcessing::class)->handle($this->fixture['task']->id);
    $source->update(['consignee_name' => 'Penerima 1']);
    app(ReconcilePickupProcessing::class)->handle($this->fixture['task']->id);
    expect($original->fresh()->status)->toBe('PENDING');
    expect(PickupAwbManifest::where('id', '!=', $original->id)->sole()->status)->toBe('SUPERSEDED');
    $monitor = app(QueryPickupAutomation::class)->handle(['date_from' => '2026-10-26', 'date_to' => '2026-10-26']);
    expect($monitor['rows']->items()[0]['manifest_id'])->toBe($original->id);
});

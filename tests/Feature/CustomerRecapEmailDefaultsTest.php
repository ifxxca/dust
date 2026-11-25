<?php

use App\Actions\Pickup\DeliverPickupAwbManifest;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Pickup\RenderPickupAwbManifest;
use App\Jobs\DeliverPickupAwbManifestJob;
use App\Models\Customer;
use App\Models\CustomerAwbDeliveryPreference;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Mail\PendingMail;
use Illuminate\Mail\SentMessage;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Mailer\Envelope;
use Symfony\Component\Mime\Email;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    config(['pickup.email_recipients.enabled' => true, 'pickup.email_recipients.limit' => 5,
        'pickup.automation.enabled' => true, 'pickup.automation.send_enabled' => true, 'mail.default' => 'smtp']);
});

function defaultRecapManifest(Customer $customer): PickupAwbManifest
{
    $task = PickupTask::factory()->create(['customer_id' => $customer->id]);

    return PickupAwbManifest::factory()->create(['pickup_task_id' => $task->id, 'status' => 'READY', 'snapshot' => ['customer_id' => $customer->id]]);
}

/** @return array{customer: Customer, task: PickupTask, manifest: PickupAwbManifest} */
function renderedDefaultRecap(): array
{
    test()->travelTo('2026-10-26 08:00:00 UTC');
    config(['pickup.automation.enabled' => false, 'pickup.automation.send_enabled' => false,
        'jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    Storage::fake('local');
    Storage::fake('jne_reports');
    Queue::fake();
    Process::fake(function (PendingProcess $process) {
        file_put_contents($process->command[3], "%PDF-1.4\nfixture\n%%EOF");

        return Process::result();
    });
    $fixture = pickupAutomationFixture();
    importPickupAutomationReport($fixture);
    app(ReconcilePickupProcessing::class)->handle($fixture['task']->id);
    $manifest = PickupAwbManifest::sole();
    app(RenderPickupAwbManifest::class)->handle($manifest->id);
    $fixture['customer']->update(['email' => 'primary@example.test', 'additional_emails' => ['finance@example.test']]);
    config(['pickup.automation.enabled' => true, 'pickup.automation.send_enabled' => true]);

    return ['customer' => $fixture['customer'], 'task' => $fixture['task'], 'manifest' => $manifest->fresh()];
}

test('recaps inherit all five customer email addresses without a second configuration', function () {
    $customer = Customer::factory()->create(['email' => 'PRIMARY@example.test',
        'additional_emails' => ['finance@example.test', 'admin@example.test', 'pic@example.test', 'office@example.test']]);
    $manifest = defaultRecapManifest($customer);
    Queue::fake();

    app(DeliverPickupAwbManifest::class)->queue($manifest);

    Queue::assertPushed(DeliverPickupAwbManifestJob::class, 5);
    expect(PickupAwbDelivery::orderBy('id')->pluck('recipient')->all())->toBe([
        'primary@example.test', 'finance@example.test', 'admin@example.test', 'pic@example.test', 'office@example.test',
    ]);
    $this->assertDatabaseCount('customer_awb_delivery_preferences', 0);
    app(DeliverPickupAwbManifest::class)->queue($manifest);
    $this->assertDatabaseCount('pickup_awb_deliveries', 5);
    expect(CustomerAwbDeliveryPreference::effectiveForCustomer($customer->id)->deliverySettings()['uses_customer_emails'])->toBeTrue();
});

test('recaps skip empty invalid excessive or inactive customer destinations without guessing from contact', function (array $attributes) {
    $customer = Customer::factory()->create(['email' => 'primary@example.test', 'contact' => 'fallback@example.test', ...$attributes]);
    $manifest = defaultRecapManifest($customer);
    Queue::fake();

    app(DeliverPickupAwbManifest::class)->queue($manifest);

    Queue::assertNothingPushed();
    $this->assertDatabaseCount('pickup_awb_deliveries', 0);
})->with([
    'missing email' => [['email' => null]],
    'additional without primary' => [['email' => null, 'additional_emails' => ['finance@example.test']]],
    'invalid primary' => [['email' => 'wrong']],
    'two addresses in one field' => [['email' => 'one@example.test,two@example.test']],
    'invalid additional' => [['additional_emails' => ['wrong']]],
    'ambiguous additional shape' => [['additional_emails' => ['named' => 'finance@example.test']]],
    'too many recipients' => [['additional_emails' => array_map(fn ($i) => "pic{$i}@example.test", range(1, 5))]],
    'inactive customer' => [['is_active' => false]],
]);

test('explicitly disabled recap preferences are preserved', function () {
    $customer = Customer::factory()->create(['email' => 'primary@example.test']);
    $manifest = defaultRecapManifest($customer);
    CustomerAwbDeliveryPreference::factory()->create(['customer_id' => $customer->id, 'enabled' => false]);
    Queue::fake();

    app(DeliverPickupAwbManifest::class)->queue($manifest);

    Queue::assertNothingPushed();
    $this->assertDatabaseCount('pickup_awb_deliveries', 0);
});

test('explicit recap recipients remain authoritative and invalid overrides never fall back', function (array $recipients, int $expectedCount) {
    $customer = Customer::factory()->create(['email' => 'primary@example.test']);
    $manifest = defaultRecapManifest($customer);
    CustomerAwbDeliveryPreference::factory()->create(['customer_id' => $customer->id, 'enabled' => true, 'recipients' => $recipients]);
    Queue::fake();

    app(DeliverPickupAwbManifest::class)->queue($manifest);

    $this->assertDatabaseCount('pickup_awb_deliveries', $expectedCount);
    if ($expectedCount === 0) {
        Queue::assertNothingPushed();
    } else {
        Queue::assertPushed(DeliverPickupAwbManifestJob::class, 1);
        expect(PickupAwbDelivery::sole()->recipient)->toBe('custom@example.test');
    }
})->with([
    'valid override' => [['custom@example.test'], 1],
    'invalid override' => [['wrong'], 0],
    'empty override' => [[], 0],
]);

test('scheduler picks up ready recaps using customer emails without explicit preferences', function () {
    $fixture = renderedDefaultRecap();

    $this->artisan('pickups:queue-automation')->assertSuccessful();

    Queue::assertPushed(DeliverPickupAwbManifestJob::class, 2);
    $this->assertDatabaseCount('pickup_awb_deliveries', 2);
    $this->assertDatabaseCount('customer_awb_delivery_preferences', 0);
});

test('inherited recipients are checked again before sending and accepted recaps are not resent', function () {
    $fixture = renderedDefaultRecap();
    foreach (['primary@example.test', 'finance@example.test'] as $recipient) {
        $message = (new Email)->from('retail@example.test')->to($recipient)->text('Recap');
        $accepted = new SentMessage(new Symfony\Component\Mailer\SentMessage($message, Envelope::create($message)));
        $pending = Mockery::mock(PendingMail::class);
        $pending->shouldReceive('send')->once()->andReturn($accepted);
        Mail::shouldReceive('to')->with($recipient)->once()->andReturn($pending);
    }
    $action = app(DeliverPickupAwbManifest::class);

    $action->queue($fixture['manifest']);
    foreach (PickupAwbDelivery::all() as $delivery) {
        $action->handle($delivery->id);
        $action->handle($delivery->id);
    }
    $action->queue($fixture['manifest']);

    expect(PickupAwbDelivery::where('status', 'ACCEPTED')->count())->toBe(2);
    $this->assertDatabaseCount('pickup_awb_deliveries', 2);
    $this->assertDatabaseCount('pickup_awb_delivery_attempts', 2);
});

test('removing the customer email after queueing cancels the pending recap', function () {
    $fixture = renderedDefaultRecap();
    $action = app(DeliverPickupAwbManifest::class);
    $action->queue($fixture['manifest']);
    $fixture['customer']->update(['email' => null, 'additional_emails' => []]);
    Mail::fake();

    foreach (PickupAwbDelivery::all() as $delivery) {
        $action->handle($delivery->id);
    }

    Mail::assertNothingSent();
    expect(PickupAwbDelivery::where('status', 'CANCELLED')->count())->toBe(2);
    $this->assertDatabaseCount('pickup_awb_delivery_attempts', 0);
});

test('admin can retry a failed inherited recipient without requeueing the accepted address', function () {
    $fixture = renderedDefaultRecap();
    app(DeliverPickupAwbManifest::class)->queue($fixture['manifest']);
    $failed = PickupAwbDelivery::where('recipient', 'primary@example.test')->sole();
    $failed->update(['status' => 'FAILED']);
    $accepted = PickupAwbDelivery::where('recipient', 'finance@example.test')->sole();
    $accepted->update(['status' => 'ACCEPTED']);
    Queue::fake();

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->post(route('pickup-automation.retry-email', [
        'task' => $fixture['task'], 'delivery' => $failed,
    ]))->assertRedirect();

    Queue::assertPushed(DeliverPickupAwbManifestJob::class, fn ($job) => $job->deliveryId === $failed->id);
    Queue::assertPushed(DeliverPickupAwbManifestJob::class, 1);
    expect($failed->fresh()->status)->toBe('READY');
    expect($accepted->fresh()->status)->toBe('ACCEPTED');
});

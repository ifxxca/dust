<?php

use App\Actions\Pickup\DeliverPickupAwbManifest;
use App\Actions\Pickup\FinalizePickup;
use App\Actions\Pickup\ReconcilePickupProcessing;
use App\Actions\Pickup\RenderPickupAwbManifest;
use App\Jobs\DeliverPickupAwbManifestJob;
use App\Models\Customer;
use App\Models\CustomerAwbDeliveryPreference;
use App\Models\PickupAwbDelivery;
use App\Models\PickupAwbManifest;
use App\Models\PickupReceipt;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Mail\PendingMail;
use Illuminate\Mail\SentMessage;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\Mailer\Envelope;
use Symfony\Component\Mailer\Exception\UnexpectedResponseException;
use Symfony\Component\Mime\Email;

require_once __DIR__.'/../Fixtures/pickup-automation.php';

beforeEach(function () {
    config(['pickup.email_recipients.enabled' => true, 'pickup.email_recipients.limit' => 5]);
});

function multipleEmailAcceptance(string $recipient): SentMessage
{
    $mail = (new Email)->from('retail@example.test')->to($recipient)->text('Test');

    return new SentMessage(new Symfony\Component\Mailer\SentMessage($mail, Envelope::create($mail)));
}

test('customer saves five normalized email addresses and can remove additional recipients', function () {
    $actor = User::factory()->create(['role' => 'admin_supervisor']);
    $result = $this->actingAs($actor)->postJson(route('api.customers.store'), ['name' => 'Irfan', 'pickup_address' => 'Jl. Pickup 1',
        'email' => ' IRFAN@example.test ', 'additional_emails' => [' Finance@example.test ', 'admin@example.test', 'pic@example.test', 'office@example.test']])->assertCreated()
        ->assertJsonPath('data.email', 'irfan@example.test')->assertJsonPath('data.additional_emails.0', 'finance@example.test');
    $customer = Customer::findOrFail($result->json('data.id'));
    expect($customer->notificationEmails())->toHaveCount(5);
    $this->patchJson(route('api.customers.update', $customer), ['expected_version' => 1, 'additional_emails' => []])->assertOk()->assertJsonPath('data.additional_emails', []);
    expect($customer->fresh()->notificationEmails())->toBe(['irfan@example.test']);
});

test('customer rejects invalid duplicate or excessive email recipients', function (array $emails, string $field) {
    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->postJson(route('api.customers.store'),
        ['name' => 'Irfan', 'pickup_address' => 'Jl. Pickup 1', 'email' => 'irfan@example.test', 'additional_emails' => $emails])
        ->assertUnprocessable()->assertJsonValidationErrors($field);
    $this->assertDatabaseCount('customers', 0);
})->with([
    'six addresses' => [array_map(fn ($i) => "pic{$i}@example.test", range(1, 5)), 'additional_emails'],
    'invalid address' => [['not-an-email'], 'additional_emails.0'],
    'duplicate primary' => [[' IRFAN@example.test '], 'additional_emails.0'],
    'case duplicate' => [['pic@example.test', 'PIC@example.test'], 'additional_emails.0'],
    'empty additional address' => [[''], 'additional_emails.0'],
    'non-list array' => [['named' => 'pic@example.test'], 'additional_emails'],
]);

test('customer email limit follows configuration and respects existing additional recipients during partial updates', function () {
    config(['pickup.email_recipients.limit' => 2]);
    $actor = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create(['email' => 'primary@example.test', 'additional_emails' => ['second@example.test']]);
    $this->actingAs($actor)->patchJson(route('api.customers.update', $customer), ['expected_version' => 1, 'email' => 'SECOND@example.test'])
        ->assertUnprocessable()->assertJsonValidationErrors('additional_emails.0');
    $this->patchJson(route('api.customers.update', $customer), ['expected_version' => 1, 'additional_emails' => ['second@example.test', 'third@example.test']])
        ->assertUnprocessable()->assertJsonValidationErrors('additional_emails');
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']))->patchJson(route('api.customers.update', $customer), ['expected_version' => 1, 'additional_emails' => []])->assertForbidden();
});

test('finalized POP freezes all recipient addresses without changing contact or finalized quantities', function () {
    Storage::fake('local');
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $customer = Customer::factory()->create(['email' => 'pic@example.test', 'additional_emails' => ['finance@example.test']]);
    $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'assigned_staff_id' => $staff->id, 'status' => 'ASSIGNED', 'execution_started_at' => now(), 'contact_snapshot' => '081234567890']);
    $task->visits()->create(['staff_id' => $staff->id, 'outcome' => 'COLLECTED', 'started_at' => now(), 'recorded_at' => now()]);

    $record = app(FinalizePickup::class)->handle($staff, $task->id, ['expected_version' => 1, 'submission_key' => (string) Str::uuid(),
        'manual_hybrid' => 20, 'cashless_hybrid' => 0, 'css_orion' => 0, 'signature' => UploadedFile::fake()->create('signature.png', 1, 'image/png')]);
    $customer->update(['email' => 'changed@example.test', 'additional_emails' => []]);

    expect(array_keys($record->receipt->recipient_statuses))->toBe(['pic@example.test', 'finance@example.test']);
    expect($record->contact)->toBe('081234567890');
    expect($record->receipt->recipient)->toBe('pic@example.test');
    expect($record->manual_hybrid)->toBe(20);
});

test('one rejected pickup email does not block other recipients and retry sends only the failed address', function () {
    config(['pickup.receipt_channel' => 'email', 'mail.default' => 'smtp']);
    $actor = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $receipt = $proof->receipts()->create(['recipient' => 'one@example.test', 'status' => 'PENDING_CONFIGURATION',
        'recipient_statuses' => PickupReceipt::pendingRecipients(['one@example.test', 'two@example.test', 'three@example.test'])]);
    foreach (['one', 'two', 'three'] as $name) {
        $pending = Mockery::mock(PendingMail::class);
        if ($name === 'one') {
            $pending->shouldReceive('send')->once()->andThrow(new UnexpectedResponseException('Rejected', 550));
            $pending->shouldReceive('send')->once()->andReturn(multipleEmailAcceptance('one@example.test'));
        } else {
            $pending->shouldReceive('send')->once()->andReturn(multipleEmailAcceptance($name.'@example.test'));
        }
        Mail::shouldReceive('to')->with($name.'@example.test')->times($name === 'one' ? 2 : 1)->andReturn($pending);
    }
    $this->actingAs($actor)->postJson(route('api.tasks.receipt', $task))->assertOk()->assertJsonPath('data.status', 'FAILED')
        ->assertJsonPath('data.recipient_statuses', fn ($statuses) => $statuses['one@example.test']['status'] === 'FAILED');
    config(['pickup.email_recipients.enabled' => false]);
    $this->postJson(route('api.tasks.receipt', $task))->assertOk()->assertJsonPath('data.status', 'ACCEPTED_BY_PROVIDER');
    $this->postJson(route('api.tasks.receipt', $task))->assertOk();
    expect($receipt->attempts()->count())->toBe(4);
    expect($receipt->attempts()->where('recipient', 'two@example.test')->count())->toBe(1);
});

test('an uncertain pickup email stays held while remaining recipients still receive separate messages', function () {
    config(['pickup.receipt_channel' => 'email', 'mail.default' => 'smtp']);
    $actor = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $receipt = $proof->receipts()->create(['recipient' => 'one@example.test', 'status' => 'PENDING_CONFIGURATION',
        'recipient_statuses' => PickupReceipt::pendingRecipients(['one@example.test', 'two@example.test'])]);
    $first = Mockery::mock(PendingMail::class);
    $first->shouldReceive('send')->once()->andThrow(new RuntimeException('Connection lost'));
    $second = Mockery::mock(PendingMail::class);
    $second->shouldReceive('send')->once()->andReturn(multipleEmailAcceptance('two@example.test'));
    Mail::shouldReceive('to')->once()->with('one@example.test')->andReturn($first);
    Mail::shouldReceive('to')->once()->with('two@example.test')->andReturn($second);

    $this->actingAs($actor)->postJson(route('api.tasks.receipt', $task))->assertOk()->assertJsonPath('data.status', 'UNKNOWN');
    $this->postJson(route('api.tasks.receipt', $task))->assertConflict();

    expect($receipt->fresh()->recipient_statuses['two@example.test']['status'])->toBe('ACCEPTED_BY_PROVIDER');
    expect($receipt->attempts()->count())->toBe(2);
});

test('legacy uncertain receipts remain held after enabling multiple recipients', function () {
    config(['pickup.receipt_channel' => 'email', 'mail.default' => 'smtp']);
    Mail::fake();
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $proof->receipts()->create(['recipient' => 'old@example.test', 'status' => 'UNKNOWN']);

    $this->actingAs(User::factory()->create(['role' => 'admin_supervisor']))->postJson(route('api.tasks.receipt', $task))->assertConflict();

    Mail::assertNothingSent();
    expect($proof->receipt->attempts()->count())->toBe(0);
});

test('admin saves multiple recap recipients while rejecting duplicates excessive lists and stale updates', function () {
    Queue::fake();
    $actor = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create();
    $payload = ['enabled' => true, 'recipients' => [' PIC@example.test ', 'finance@example.test'], 'expected_revision' => 0, 'reason' => 'Tambah finance'];
    $this->actingAs($actor)->post(route('pickup-automation.preference', $task), $payload)->assertRedirect()->assertSessionHasNoErrors();
    $preference = CustomerAwbDeliveryPreference::sole();
    expect($preference->recipients)->toBe(['pic@example.test', 'finance@example.test']);
    expect($preference->recipient)->toBe('pic@example.test');
    $this->postJson(route('pickup-automation.preference', $task), [...$payload, 'expected_revision' => 1, 'recipients' => ['a@example.test', 'A@example.test']])->assertUnprocessable()->assertJsonValidationErrors('recipients.0');
    $this->postJson(route('pickup-automation.preference', $task), [...$payload, 'expected_revision' => 1, 'recipients' => array_map(fn ($i) => "pic{$i}@example.test", range(1, 6))])->assertUnprocessable()->assertJsonValidationErrors('recipients');
    $this->post(route('pickup-automation.preference', $task), $payload)->assertConflict();
    $this->assertDatabaseHas('customer_awb_delivery_preferences', ['id' => $preference->id, 'revision' => 1]);
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']))->postJson(route('pickup-automation.preference', $task), $payload)->assertForbidden();
});

test('recap fanout isolates rejected recipients and retries only one safe failed email', function () {
    $this->travelTo('2026-10-26 08:00:00 UTC');
    config(['jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true, 'pickup.automation.enabled' => false, 'pickup.automation.send_enabled' => false]);
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
    $preference = CustomerAwbDeliveryPreference::factory()->create(['customer_id' => $fixture['customer']->id, 'enabled' => true,
        'recipient' => 'one@example.test', 'recipients' => ['one@example.test', 'two@example.test', 'three@example.test']]);
    config(['pickup.automation.enabled' => true, 'pickup.automation.send_enabled' => true, 'mail.default' => 'smtp']);
    app(RenderPickupAwbManifest::class)->handle(PickupAwbManifest::sole()->id);
    Queue::assertPushed(DeliverPickupAwbManifestJob::class, 3);
    Process::assertRan(fn ($process) => str_contains($process->command[1], 'render-pickup-manifest.mjs'));
    foreach (['one', 'two', 'three'] as $name) {
        $pending = Mockery::mock(PendingMail::class);
        if ($name === 'one') {
            $pending->shouldReceive('send')->once()->andThrow(new UnexpectedResponseException('Rejected', 450));
            $pending->shouldReceive('send')->once()->andReturn(multipleEmailAcceptance('one@example.test'));
        } else {
            $pending->shouldReceive('send')->once()->andReturn(multipleEmailAcceptance($name.'@example.test'));
        }
        Mail::shouldReceive('to')->with($name.'@example.test')->times($name === 'one' ? 2 : 1)->andReturn($pending);
    }
    $action = app(DeliverPickupAwbManifest::class);
    foreach (PickupAwbDelivery::all() as $delivery) {
        $action->handle($delivery->id);
    }
    $failed = PickupAwbDelivery::where('recipient', 'one@example.test')->sole();
    expect($failed->status)->toBe('FAILED');
    expect(PickupAwbDelivery::where('status', 'ACCEPTED')->count())->toBe(2);
    $this->actingAs($fixture['admin'])->post(route('pickup-automation.retry-email', ['task' => $fixture['task'], 'delivery' => $failed]))->assertRedirect();
    $action->handle($failed->id);
    $action->queue(PickupAwbManifest::sole());
    foreach (PickupAwbDelivery::all() as $delivery) {
        $action->handle($delivery->id);
    }
    expect(PickupAwbDelivery::where('status', 'ACCEPTED')->count())->toBe(3);
    $this->assertDatabaseCount('pickup_awb_deliveries', 3);
    $this->assertDatabaseCount('pickup_awb_delivery_attempts', 4);
    $this->post(route('pickup-automation.retry-email', ['task' => $fixture['task'], 'delivery' => $failed]))->assertConflict();
    $failed->update(['status' => 'UNKNOWN']);
    $this->post(route('pickup-automation.retry-email', ['task' => $fixture['task'], 'delivery' => $failed]))->assertConflict();
    $failed->update(['status' => 'FAILED']);
    $preference->update(['recipients' => ['two@example.test', 'three@example.test'], 'revision' => 2]);
    $this->post(route('pickup-automation.retry-email', ['task' => $fixture['task'], 'delivery' => $failed]))->assertConflict();
    expect($failed->fresh()->status)->toBe('FAILED');
    $this->actingAs(User::factory()->create(['role' => 'retail_staff']))->post(route('pickup-automation.retry-email', ['task' => $fixture['task'], 'delivery' => $failed]))->assertForbidden();
});

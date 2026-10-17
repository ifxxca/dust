<?php

use App\Mail\PickupReceiptMail;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Mail\PendingMail;
use Illuminate\Mail\SentMessage;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Envelope;
use Symfony\Component\Mailer\SentMessage as SymfonySentMessage;
use Symfony\Component\Mime\Email;

test('unconfigured receipt never claims delivery or sends through the log mailer', function () {
    Mail::fake();
    config(['pickup.receipt_channel' => 'email', 'mail.default' => 'log']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $proof->receipts()->create(['recipient' => 'customer@example.test', 'status' => 'PENDING_CONFIGURATION']);
    $this->actingAs($admin)->postJson(route('api.tasks.receipt', $task))->assertOk()->assertJsonPath('data.status', 'PENDING_CONFIGURATION');
    Mail::assertNothingSent();
    expect($proof->receipt->attempts()->count())->toBe(0);
});

test('provider acceptance is idempotent and distinct from confirmed delivery', function () {
    config(['pickup.receipt_channel' => 'email', 'mail.default' => 'smtp']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $receipt = $proof->receipts()->create(['recipient' => 'customer@example.test', 'status' => 'PENDING_CONFIGURATION']);
    $email = (new Email)->from('retail@example.test')->to('customer@example.test')->text('Receipt');
    $sent = new SentMessage(new SymfonySentMessage($email, Envelope::create($email)));
    $pending = Mockery::mock(PendingMail::class);
    $pending->shouldReceive('send')->once()->with(Mockery::type(PickupReceiptMail::class))->andReturn($sent);
    Mail::shouldReceive('to')->once()->with('customer@example.test')->andReturn($pending);
    $this->actingAs($admin)->postJson(route('api.tasks.receipt', $task))->assertOk()->assertJsonPath('data.status', 'ACCEPTED_BY_PROVIDER')->assertJsonPath('data.delivered_at', null);
    $this->postJson(route('api.tasks.receipt', $task))->assertOk();
    expect($receipt->attempts()->sole()->actor_id)->toBe($admin->id)->and($receipt->fresh()->provider_message_id)->not->toBeNull();
});

test('ambiguous provider failure prevents silent resend while POP stays final', function () {
    config(['pickup.receipt_channel' => 'email', 'mail.default' => 'smtp']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $proof->receipts()->create(['recipient' => 'customer@example.test', 'status' => 'PENDING_CONFIGURATION']);
    $pending = Mockery::mock(PendingMail::class);
    $pending->shouldReceive('send')->once()->andThrow(new RuntimeException('Provider timeout'));
    Mail::shouldReceive('to')->once()->andReturn($pending);
    $this->actingAs($admin)->postJson(route('api.tasks.receipt', $task))->assertOk()->assertJsonPath('data.status', 'UNKNOWN');
    $this->postJson(route('api.tasks.receipt', $task))->assertConflict();
    expect($task->fresh()->status)->toBe('PICKED_UP');
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']))->postJson(route('api.tasks.receipt', $task))->assertForbidden();
});

<?php

use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

function mobileProofFixture(): array
{
    Storage::fake('local');
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id, 'execution_started_at' => now()]);
    $task->visits()->create(['staff_id' => $staff->id, 'started_at' => now(), 'outcome' => 'COLLECTED', 'recorded_at' => now()]);
    $token = $staff->createToken('mobile:'.Str::uuid().':Android', ['mobile:read', 'mobile:execute'], now()->addDay());

    return [$staff, $task, $token, ['expected_version' => 1, 'submission_key' => (string) Str::uuid(), 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0, 'signature' => UploadedFile::fake()->image('signature.png'), 'photos' => [UploadedFile::fake()->image('photo.jpg')]]];
}
test('mobile proof finalization lookup and exact replay create one POP with private bearer evidence', function () {
    [$staff,$task,$token,$body] = mobileProofFixture();
    $result = $this->withToken($token->plainTextToken)->postJson(route('mobile.tasks.proof', $task), $body)->assertCreated()->assertJsonPath('data.total', 3)->assertJsonPath('data.receipt.status', 'PENDING_CONFIGURATION');
    $this->postJson(route('mobile.tasks.proof', $task), $body)->assertOk()->assertJsonPath('data.id', $result->json('data.id'));
    $this->getJson(route('mobile.submissions.show', ['submission_key' => $body['submission_key'], 'kind' => 'proof']))->assertOk()->assertJsonPath('data.resource_id', $result->json('data.id'))->assertJsonPath('data.committed', true);
    $attachment = $task->proof()->first()->attachments()->first();
    $this->get(route('mobile.evidence', $attachment))->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
    expect($result->json('data.attachments.0.url'))->toStartWith('/api/mobile/v1/pickup-evidence/');
    expect($task->fresh()->status)->toBe('PICKED_UP');
    $this->assertDatabaseCount('pickup_records', 1);
    $this->assertDatabaseCount('pickup_attachments', 2);
    $this->assertDatabaseCount('pickup_task_events', 1);
    $this->postJson(route('mobile.tasks.proof', $task), [...$body, 'submission_key' => (string) Str::uuid()])->assertConflict();
    app('auth')->forgetGuards();
    $this->withHeader('Authorization', '')->getJson(route('mobile.evidence', $attachment))->assertUnauthorized();
});
test('mobile finalization accepts no photos and retains exactly one required signature on replay', function () {
    [$staff, $task, $token, $body] = mobileProofFixture();
    unset($body['photos']);

    $result = $this->withToken($token->plainTextToken)->postJson(route('mobile.tasks.proof', $task), $body)
        ->assertCreated()->assertJsonPath('data.total', 3)->assertJsonPath('data.attachments.0.kind', 'signature');
    $this->postJson(route('mobile.tasks.proof', $task), $body)->assertOk()->assertJsonPath('data.id', $result->json('data.id'));

    $this->assertDatabaseCount('pickup_records', 1);
    $this->assertDatabaseCount('pickup_attachments', 1);
    expect($task->fresh()->status)->toBe('PICKED_UP');
});

test('other pickup user cannot inspect submission keys or private finalized evidence', function () {
    [$staff,$task,$token,$body] = mobileProofFixture();
    $this->withToken($token->plainTextToken)->postJson(route('mobile.tasks.proof', $task), $body)->assertCreated();
    $other = User::factory()->create(['role' => 'pickup_staff']);
    $otherToken = $other->createToken('mobile:'.Str::uuid().':Other', ['mobile:read', 'mobile:execute'], now()->addDay());
    app('auth')->forgetGuards();
    $this->withToken($otherToken->plainTextToken)->getJson(route('mobile.submissions.show', ['submission_key' => $body['submission_key'], 'kind' => 'proof']))->assertNotFound();
    $this->getJson(route('mobile.evidence', $task->proof()->first()->attachments()->first()))->assertNotFound();
    $this->getJson(route('mobile.submissions.show', ['submission_key' => 'bad-key', 'kind' => 'proof']))->assertUnprocessable();
});
test('mobile proof reuses server validation and rejects readonly bearer', function () {
    [$staff,$task,$token,$body] = mobileProofFixture();
    $this->withToken($token->plainTextToken)->postJson(route('mobile.tasks.proof', $task), [...$body, 'manual_hybrid' => -1])->assertUnprocessable()->assertJsonValidationErrors('manual_hybrid');
    $this->postJson(route('mobile.tasks.proof', $task), [...$body, 'signature' => null])->assertUnprocessable()->assertJsonValidationErrors('signature');
    $this->postJson(route('mobile.tasks.proof', $task), [...$body, 'photos' => array_fill(0, 5, UploadedFile::fake()->image('photo.jpg'))])->assertUnprocessable();
    $readonly = $staff->createToken('mobile:'.Str::uuid().':Reader', ['mobile:read'], now()->addDay());
    app('auth')->forgetGuards();
    $this->withToken($readonly->plainTextToken)->postJson(route('mobile.tasks.proof', $task), $body)->assertForbidden();
    $this->assertDatabaseCount('pickup_records', 0);
});
test('absent submission lookup is readonly and is not proof an inflight request failed', function () {
    [$staff,$task,$token,$body] = mobileProofFixture();
    $this->withToken($token->plainTextToken)->getJson(route('mobile.submissions.show', ['submission_key' => $body['submission_key'], 'kind' => 'proof']))->assertNotFound();
    $this->assertDatabaseCount('pickup_records', 0);
    $this->postJson(route('mobile.tasks.proof', $task), $body)->assertCreated();
    $this->getJson(route('mobile.submissions.show', ['submission_key' => $body['submission_key'], 'kind' => 'proof']))->assertOk();
});

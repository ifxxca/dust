<?php

use App\Actions\Scheduling\GeneratePickupTasks;
use App\Models\Customer;
use App\Models\HandoverSession;
use App\Models\PickupSchedule;
use App\Models\PickupTask;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

test('CS creates edits and deactivates a schedule with stale protection', function () {
    $customer = Customer::factory()->create();
    $payload = ['customer_id' => $customer->id, 'pickup_address' => 'Jl. Regular', 'weekdays' => [1, 3], 'pickup_time' => '09:30', 'starts_on' => '2026-10-01', 'ends_on' => null, 'is_active' => true];
    $this->actingAs(User::factory()->create(['role' => 'cs']))->postJson(route('api.schedules.store'), $payload)->assertCreated();
    $schedule = PickupSchedule::sole();
    $this->patchJson(route('api.schedules.update', $schedule), [...$payload, 'is_active' => false, 'expected_version' => 1])->assertOk();
    $this->patchJson(route('api.schedules.update', $schedule), [...$payload, 'expected_version' => 1])->assertConflict();
    $this->postJson(route('api.schedules.store'), [...$payload, 'weekdays' => [1, 1]])->assertUnprocessable();
    $this->actingAs(User::factory()->create(['role' => 'retail_staff']))->getJson(route('api.schedules.index'))->assertForbidden();
});

test('occurrence generation preserves snapshots and is idempotent including cancelled occurrences', function () {
    $schedule = PickupSchedule::factory()->create(['starts_on' => '2026-10-01', 'weekdays' => [2]]);
    $day = CarbonImmutable::parse('2026-10-13', $schedule->timezone);
    $generator = app(GeneratePickupTasks::class);
    expect($generator->handle($schedule->id, $day))->toBe(1)->and($generator->handle($schedule->id, $day))->toBe(0);
    $task = PickupTask::sole();
    expect($task->pickup_type)->toBe('regular')->and($task->status)->toBe('SCHEDULED')->and($task->contact_snapshot)->toBe($schedule->customer->contact)->and($task->occurrence_date)->toBe('2026-10-13');
    $task->update(['status' => 'CANCELLED']);
    $schedule->update(['pickup_time' => '10:00']);
    expect($generator->handle($schedule->id, $day))->toBe(0)->and($task->fresh()->scheduled_at->setTimezone($schedule->timezone)->format('H:i'))->toBe('09:00');
    expect($generator->handle($schedule->id, $day->addDay()))->toBe(0);
    $schedule->update(['is_active' => false]);
    expect($generator->handle($schedule->id, $day->addWeek()))->toBe(0);
});

test('scheduler stays disabled without approved generation policy and only catches up within selected window', function () {
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2026-10-13 10:00', 'Asia/Jakarta'));
    PickupSchedule::factory()->create(['starts_on' => '2026-09-01', 'weekdays' => [1, 2, 3, 4, 5, 6, 7]]);
    config(['pickup.generation_policy' => null]);
    $this->artisan('pickups:generate')->assertExitCode(1);
    expect(PickupTask::count())->toBe(0);
    config(['pickup.generation_policy' => 'catchup_7_days']);
    $this->artisan('pickups:generate')->assertSuccessful();
    $this->artisan('pickups:generate')->assertSuccessful();
    expect(PickupTask::count())->toBe(7);
    expect(PickupTask::min('occurrence_date'))->toBe('2026-10-07');
    CarbonImmutable::setTestNow();
});

test('generated regular pickup follows the shared assignment execution proof and handover workflow', function () {
    Storage::fake('local');
    $cs = User::factory()->create(['role' => 'cs']);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $schedule = PickupSchedule::factory()->create(['created_by' => $cs->id, 'starts_on' => '2026-01-01', 'weekdays' => [1, 2, 3, 4, 5, 6, 7]]);
    app(GeneratePickupTasks::class)->handle($schedule->id, CarbonImmutable::now($schedule->timezone));
    $task = PickupTask::sole();
    $this->actingAs($cs)->getJson(route('api.tasks.index', ['schedule_id' => $schedule->id]))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.pickup_type', 'regular');
    $this->postJson(route('api.tasks.assign', $task), ['assigned_staff_id' => $staff->id, 'expected_version' => 1])->assertOk();
    $this->actingAs($staff)->postJson(route('api.tasks.start', $task), ['expected_version' => 2])->assertCreated();
    $this->postJson(route('api.tasks.visit', $task), ['expected_version' => 3, 'outcome' => 'COLLECTED'])->assertOk();
    $this->postJson(route('api.tasks.proof', $task), ['expected_version' => 4, 'submission_key' => (string) Str::uuid(), 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0, 'signature' => UploadedFile::fake()->image('signature.png')])->assertCreated();
    $this->postJson(route('api.handovers.store'), ['submission_key' => (string) Str::uuid(), 'task_ids' => [$task->id]])->assertCreated();
    $session = HandoverSession::sole();
    $this->actingAs(User::factory()->create(['role' => 'retail_staff']));
    $this->postJson(route('api.handovers.verify', [$session, $session->items()->sole()->id]), ['expected_version' => 1, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0])->assertOk();
    $this->postJson(route('api.handovers.close', $session), ['expected_version' => 2])->assertOk()->assertJsonPath('data.status', 'CLOSED');
});

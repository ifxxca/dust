<?php

use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

function proofFixture(): array
{
    Storage::fake('local');
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $task = PickupTask::factory()->create(['status' => 'ASSIGNED', 'assigned_staff_id' => $staff->id, 'execution_started_at' => now()]);
    $task->visits()->create(['staff_id' => $staff->id, 'started_at' => now(), 'outcome' => 'COLLECTED', 'recorded_at' => now()]);

    return [$staff, $task, ['expected_version' => 1, 'submission_key' => (string) Str::uuid(), 'manual_hybrid' => 2, 'cashless_hybrid' => 3, 'css_orion' => 1, 'signature' => UploadedFile::fake()->image('signature.png'), 'photos' => [UploadedFile::fake()->image('photo.jpg')]]];
}

test('successful proof finalizes atomically with private evidence and pending receipt', function () {
    [$staff, $task, $data] = proofFixture();
    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), $data)->assertCreated()->assertJsonPath('data.total', 6)->assertJsonPath('data.receipt.status', 'PENDING_CONFIGURATION');
    expect($task->fresh()->status)->toBe('PICKED_UP')->and($task->proof()->count())->toBe(1)->and($task->events()->count())->toBe(1);
    $this->postJson(route('api.tasks.proof', $task), $data)->assertOk();
    expect($task->proof->attachments()->count())->toBe(2);
    $file = $task->proof->attachments()->first();
    Storage::disk('local')->assertExists($file->path);
    $this->get(route('api.evidence', $file))->assertOk();
    $this->actingAs(User::factory()->create(['role' => 'retail_staff']))->get(route('api.evidence', $file))->assertNotFound();
    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), array_replace($data, ['submission_key' => (string) Str::uuid(), 'manual_hybrid' => 20]))->assertConflict();
    expect($task->proof->manual_hybrid)->toBe(2);
});

test('proof rejects invalid evidence quantities and stale or unauthorized finalization', function () {
    [$staff, $task, $data] = proofFixture();
    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), array_replace($data, ['signature' => null]))->assertUnprocessable();
    $this->postJson(route('api.tasks.proof', $task), array_replace($data, ['manual_hybrid' => 0, 'cashless_hybrid' => 0, 'css_orion' => 0]))->assertUnprocessable();
    $this->postJson(route('api.tasks.proof', $task), array_replace($data, ['photos' => array_fill(0, 5, UploadedFile::fake()->image('p.jpg'))]))->assertUnprocessable();
    $this->postJson(route('api.tasks.proof', $task), array_replace($data, ['expected_version' => 9]))->assertConflict();
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']))->postJson(route('api.tasks.proof', $task), $data)->assertForbidden();
    expect($task->proof()->count())->toBe(0)->and(Storage::disk('local')->allFiles())->toBe([]);
});

test('unsuccessful visit cannot produce successful proof', function () {
    [$staff, $task, $data] = proofFixture();
    $task->visits()->update(['outcome' => 'NO_PACKAGES', 'reason' => 'Tutup']);
    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), $data)->assertConflict();
    expect($task->fresh()->status)->toBe('ASSIGNED');
});

test('proof accepts canonical multipart integer strings and stores each category as one package', function () {
    [$staff, $task, $data] = proofFixture();

    $this->actingAs($staff)->post(route('api.tasks.proof', $task), array_replace($data, ['manual_hybrid' => '1', 'cashless_hybrid' => '1', 'css_orion' => '1']), ['Accept' => 'application/json'])
        ->assertCreated()->assertJsonPath('data.total', 3);
    $this->assertDatabaseHas('pickup_records', ['pickup_task_id' => $task->id, 'manual_hybrid' => 1, 'cashless_hybrid' => 1, 'css_orion' => 1]);
});

test('proof returns Indonesian integer validation messages without finalizing invalid quantities', function () {
    [$staff, $task, $data] = proofFixture();

    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), array_replace($data, ['manual_hybrid' => '1.5', 'cashless_hybrid' => 'abc', 'css_orion' => '01']))
        ->assertUnprocessable()->assertJsonValidationErrors(['manual_hybrid', 'cashless_hybrid', 'css_orion'])
        ->assertJsonPath('errors.manual_hybrid.0', 'Jumlah Manual Hybrid (Non-Cashless) harus berupa bilangan bulat.')
        ->assertJsonPath('errors.cashless_hybrid.0', 'Jumlah Cashless Hybrid harus berupa bilangan bulat.')
        ->assertJsonPath('errors.css_orion.0', 'Jumlah CSS / Orion harus berupa bilangan bulat.');
    $this->assertDatabaseMissing('pickup_records', ['pickup_task_id' => $task->id]);
    expect($task->fresh()->status)->toBe('ASSIGNED');
});

test('empty signature and non-image upload are rejected', function () {
    [$staff, $task, $data] = proofFixture();
    $image = imagecreatetruecolor(40, 20);
    imagefill($image, 0, 0, imagecolorallocate($image, 255, 255, 255));
    ob_start();
    imagepng($image);
    $content = ob_get_clean();
    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), array_replace($data, ['signature' => UploadedFile::fake()->createWithContent('signature.png', $content)]))->assertUnprocessable()->assertJsonValidationErrors('signature');
    $fake = UploadedFile::fake()->createWithContent('photo.jpg', '<?php echo 1;');
    $invalid = new UploadedFile($fake->getPathname(), 'photo.jpg', null, null, true);
    $this->postJson(route('api.tasks.proof', $task), array_replace($data, ['photos' => [$invalid]]))->assertUnprocessable();
    expect($task->proof()->count())->toBe(0);
});

test('storage failure rolls back proof task status and audit', function () {
    [$staff, $task, $data] = proofFixture();
    $disk = Mockery::mock(FilesystemAdapter::class);
    $disk->shouldReceive('putFileAs')->once()->andReturn(false);
    $disk->shouldReceive('delete')->once()->with([])->andReturn(true);
    Storage::shouldReceive('disk')->with('local')->andReturn($disk);
    $this->actingAs($staff)->postJson(route('api.tasks.proof', $task), $data)->assertServerError();
    expect($task->proof()->count())->toBe(0)->and($task->fresh()->status)->toBe('ASSIGNED')->and($task->events()->count())->toBe(0);
});

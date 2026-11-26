<?php

use App\Actions\Pickup\DeliverPickupAwbManifest;
use App\Actions\Pickup\FinalizePickup;
use App\Actions\Pickup\ManageWhatsappDelivery;
use App\Actions\Pickup\SendPickupReceipt;
use App\Actions\Pickup\ThrottleWhatsappDelivery;
use App\Jobs\DeliverPickupWhatsapp;
use App\Models\Customer;
use App\Models\PickupAwbManifest;
use App\Models\PickupProcessingReconciliation;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\PickupWhatsappDelivery;
use App\Models\User;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->withoutVite();
    $this->travelTo('2026-11-23 08:00:00 UTC');
    config(['services.waha.base_url' => 'http://waha.test', 'services.waha.api_key' => 'test-private-key', 'cache.default' => 'array']);
    Http::preventStrayRequests();
});

function whatsappSettings(): void
{
    DB::table('document_delivery_settings')->insert(['id' => 1, 'session' => 'office', 'enabled' => true, 'version' => 1, 'created_at' => now(), 'updated_at' => now()]);
}

/** @return array<string, mixed> */
function whatsappOptions(array $overrides = []): array
{
    return [...['receipt_email' => true, 'recap_email' => true, 'receipt_whatsapp' => true, 'recap_whatsapp' => true,
        'whatsapp_type' => 'contact', 'whatsapp_target' => '628123456789@c.us', 'whatsapp_label' => 'Customer Uji', 'whatsapp_consent_confirmed' => true], ...$overrides];
}

/** @return array{customer: Customer, task: PickupTask, proof: PickupRecord} */
function whatsappFixture(array $responses = []): array
{
    whatsappSettings();
    Storage::fake('local');
    Queue::fake([DeliverPickupWhatsapp::class]);
    $customer = Customer::factory()->create(['is_active' => true, 'document_delivery_settings' => whatsappOptions()]);
    $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $proof->receipts()->create(['recipient' => 'customer@example.test', 'status' => 'PENDING_CONFIGURATION', 'proof_revision' => 0]);
    Http::fake(['waha.test/api/sessions/office' => Http::response(['status' => 'WORKING']),
        'waha.test/api/office/chats/*/messages/read' => Http::response(['ids' => []]),
        'waha.test/api/sendText' => Http::response(['id' => 'message-text']), 'waha.test/api/sendFile' => Http::response(['id' => 'message-file']), ...$responses]);

    return compact('customer', 'task', 'proof');
}

function whatsappManifest(array $fixture): PickupAwbManifest
{
    Storage::disk('local')->put('private/test.pdf', '%PDF-test');
    Storage::disk('local')->put('private/test.xlsx', 'xlsx-test');
    PickupProcessingReconciliation::factory()->create(['pickup_task_id' => $fixture['task']->id, 'status' => 'DONE', 'input_version' => 1, 'evaluated_input_version' => 1]);

    return PickupAwbManifest::factory()->create(['pickup_task_id' => $fixture['task']->id, 'status' => 'READY', 'pdf_path' => 'private/test.pdf', 'xlsx_path' => 'private/test.xlsx',
        'snapshot' => ['customer_id' => $fixture['customer']->id, 'customer_name' => 'Customer Uji', 'reference' => $fixture['task']->reference, 'pickup_date' => '2026-11-23'],
        'checksums' => ['pdf' => hash('sha256', '%PDF-test'), 'xlsx' => hash('sha256', 'xlsx-test')]]);
}

function anotherWhatsappReceipt(Customer $customer): PickupWhatsappDelivery
{
    $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $proof->receipts()->create(['recipient' => 'customer@example.test', 'status' => 'PENDING_CONFIGURATION', 'proof_revision' => 0]);

    return app(ManageWhatsappDelivery::class)->queueReceipt($proof);
}

test('sending hours use WIB and resume at the next opening without attempting HTTP', function (string $time, ?int $wait) {
    $f = whatsappFixture();
    $this->travelTo($time);
    $row = app(ManageWhatsappDelivery::class)->queueReceipt($f['proof']);
    $delay = app(ManageWhatsappDelivery::class)->handle($row->id);
    expect($delay)->toBe($wait);
    expect($row->fresh()->status)->toBe($wait === null ? 'ACCEPTED' : 'WAITING');
    if ($wait !== null) {
        expect($row->fresh()->attempts)->toBe(0);
        Http::assertNothingSent();
        $this->travel($wait)->seconds();
        expect(app(ManageWhatsappDelivery::class)->handle($row->id))->toBeNull();
        expect($row->fresh()->status)->toBe('ACCEPTED');
    }
})->with([
    ['2026-11-23 00:59:00 UTC', 60],
    ['2026-11-23 01:00:00 UTC', null],
    ['2026-11-23 12:59:00 UTC', null],
    ['2026-11-23 13:00:00 UTC', 43200],
]);

test('session pacing holds other documents and a held attempt consumes no provider attempt', function () {
    $f = whatsappFixture();
    $action = app(ManageWhatsappDelivery::class);
    $first = $action->queueReceipt($f['proof']);
    $second = anotherWhatsappReceipt($f['customer']);
    $action->handle($first->id);
    expect($action->handle($second->id))->toBeBetween(30, 60);
    expect($second->fresh()->attempts)->toBe(0);
    Http::assertSentCount(3);
    $this->travel(61)->seconds();
    $action->handle($second->id);
    expect($second->fresh()->status)->toBe('ACCEPTED');
});

test('each configured quota delays other documents until its window resets', function (string $quota, int $seconds) {
    $f = whatsappFixture();
    config(['services.waha.delivery.'.$quota.'_limit' => 1]);
    $action = app(ManageWhatsappDelivery::class);
    $action->handle($action->queueReceipt($f['proof'])->id);
    $second = anotherWhatsappReceipt($f['customer']);
    expect($action->handle($second->id))->toBeBetween($seconds + 1, $seconds + 10);
    expect($second->fresh()->status)->toBe('WAITING');
    expect($second->fresh()->attempts)->toBe(0);
    Http::assertSentCount(3);
    $this->travel($seconds + 11)->seconds();
    $action->handle($second->id);
    expect($second->fresh()->status)->toBe('ACCEPTED');
})->with([
    ['recipient_hourly', 3600], ['recipient_daily', 86400],
]);

test('recipient quota and lock are shared across sending sessions', function () {
    $f = whatsappFixture();
    config(['services.waha.delivery.recipient_hourly_limit' => 1]);
    $action = app(ManageWhatsappDelivery::class);
    $first = $action->queueReceipt($f['proof']);
    $second = anotherWhatsappReceipt($f['customer']);
    $second->update(['session' => 'other']);
    $lock = Cache::lock('waha-recipient:'.hash('sha256', $first->target), 65);
    $lock->get();
    try {
        expect($action->handle($second->id))->toBe(10);
        Http::assertNothingSent();
    } finally {
        $lock->release();
    }
    $action->handle($first->id);
    expect($action->handle($second->id))->toBeBetween(3601, 3610);
    Http::assertSentCount(3);
});

test('legacy session quotas do not hold documents after the session cap is removed', function () {
    $f = whatsappFixture();
    config(['services.waha.delivery.session_hourly_limit' => 1, 'services.waha.delivery.session_daily_limit' => 1]);
    foreach (['hourly' => 3600, 'daily' => 86400] as $period => $window) {
        RateLimiter::hit('waha-throttle:session:'.$period.':'.hash('sha256', 'office'), $window);
    }
    $action = app(ManageWhatsappDelivery::class);
    $first = $action->queueReceipt($f['proof']);
    expect($action->handle($first->id))->toBeNull();
    expect($first->fresh()->status)->toBe('ACCEPTED');
    $this->travel(61)->seconds();
    $second = anotherWhatsappReceipt($f['customer']);
    expect($action->handle($second->id))->toBeNull();
    expect($second->fresh()->status)->toBe('ACCEPTED');
    Http::assertSentCount(6);
});

test('seen is sent only for the destination before the first document message', function (string $target) {
    $f = whatsappFixture(['waha.test/api/office/groups/12345%40g.us' => Http::response(['id' => '12345@g.us'])]);
    $f['customer']->update(['document_delivery_settings' => whatsappOptions(['whatsapp_target' => $target, 'whatsapp_type' => str_ends_with($target, '@g.us') ? 'group' : 'contact'])]);
    $action = app(ManageWhatsappDelivery::class);
    $row = $action->queueReceipt($f['proof']);
    $action->handle($row->id);
    $action->handle($row->id);
    $posts = collect(Http::recorded())->map(fn ($pair) => $pair[0])->filter(fn (HttpRequest $request): bool => $request->method() === 'POST')->values();
    expect($posts->map(fn (HttpRequest $request): string => $request->url())->all())->toBe(['http://waha.test/api/office/chats/'.rawurlencode($target).'/messages/read', 'http://waha.test/api/sendText']);
    expect($posts[0]->data())->toBe(['messages' => 30, 'days' => 7]);
    expect($row->fresh()->status)->toBe('ACCEPTED');
})->with(['628123456789@c.us', '12345@g.us']);

test('seen preflight failures never start document sending and can safely resume', function (string $kind, ?int $delay, string $status) {
    config(['services.waha.delivery.recipient_hourly_limit' => 1]);
    $seen = Http::sequence();
    match ($kind) {
        'timeout' => $seen->pushFailedConnection(),
        'rate limit' => $seen->push([], 429, ['Retry-After' => '120']),
        'access denied' => $seen->push([], 403),
        'unsupported' => $seen->push([], 422),
        'not implemented' => $seen->push([], 501),
        'invalid response' => $seen->push([]),
        default => $seen->push([], 500),
    };
    $seen->push(['ids' => []]);
    $f = whatsappFixture(['waha.test/api/office/chats/*/messages/read' => $seen]);
    $action = app(ManageWhatsappDelivery::class);
    $row = $action->queueReceipt($f['proof']);
    $actual = $action->handle($row->id);
    if ($kind === 'rate limit') {
        expect($actual)->toBeBetween(120, 130);
    } else {
        expect($actual)->toBe($delay);
    }
    expect($row->fresh()->status)->toBe($status);
    expect($row->fresh()->attempts)->toBe(0);
    expect($row->fresh()->parts[0]['status'])->toBe('PENDING');
    Http::assertNotSent(fn (HttpRequest $request): bool => str_ends_with($request->url(), '/api/sendText'));
    if ($delay !== null) {
        $this->travel(max(131, $actual + 1))->seconds();
        $action->handle($row->id);
        expect($row->fresh()->status)->toBe('ACCEPTED');
    } else {
        config(['services.waha.delivery.send_seen' => false]);
        $action->retry($row->fresh());
        $action->handle($row->id);
        expect($row->fresh()->status)->toBe('ACCEPTED');
    }
})->with([
    ['timeout', 60, 'WAITING'], ['rate limit', 120, 'WAITING'],
    ['access denied', 1800, 'WAITING'], ['unsupported', null, 'FAILED'], ['server error', 60, 'WAITING'],
    ['not implemented', null, 'FAILED'], ['invalid response', 60, 'WAITING'],
]);

test('send seen can be disabled without changing document idempotency', function () {
    $f = whatsappFixture();
    config(['services.waha.delivery.send_seen' => false]);
    $action = app(ManageWhatsappDelivery::class);
    $row = $action->queueReceipt($f['proof']);
    $action->handle($row->id);
    $action->handle($row->id);
    expect($row->fresh()->status)->toBe('ACCEPTED');
    Http::assertSentCount(2);
    Http::assertNotSent(fn (HttpRequest $request): bool => str_ends_with($request->url(), '/messages/read'));
});

test('switching sessions does not remove the minimum spacing for the same recipient', function () {
    $f = whatsappFixture();
    $action = app(ManageWhatsappDelivery::class);
    $first = $action->queueReceipt($f['proof']);
    $second = anotherWhatsappReceipt($f['customer']);
    $second->update(['session' => 'other']);
    $action->handle($first->id);
    expect($action->handle($second->id))->toBeBetween(30, 60);
    expect($second->fresh()->attempts)->toBe(0);
    Http::assertSentCount(3);
});

test('provider rejection pauses the whole session and honors numeric or date Retry-After', function (int $status, string $header, int $seconds) {
    $f = whatsappFixture(['waha.test/api/sendText' => Http::response([], $status, ['Retry-After' => $header])]);
    $action = app(ManageWhatsappDelivery::class);
    $first = $action->queueReceipt($f['proof']);
    $second = anotherWhatsappReceipt($f['customer']);
    $action->handle($first->id);
    expect($action->handle($second->id))->toBeBetween($seconds, $seconds + 10);
    expect($second->fresh()->attempts)->toBe(0);
    Http::assertSentCount(3);
})->with([
    [429, '120', 120], [429, 'Mon, 23 Nov 2026 08:02:00 GMT', 120],
    [401, '60', 1800], [403, '3600', 3600], [503, '172800', 172800],
]);

test('three uncertain results pause the session while success clears earlier failures', function () {
    $f = whatsappFixture(['waha.test/api/sendText' => Http::sequence()
        ->push([], 500)->push([], 500)->push(['id' => 'success'])->push([], 500)->push([], 500)->push([], 500)]);
    $action = app(ManageWhatsappDelivery::class);
    foreach (range(1, 6) as $index) {
        $row = anotherWhatsappReceipt($f['customer']);
        $action->handle($row->id);
        if ($index < 6) {
            expect(app(ThrottleWhatsappDelivery::class)->pause('office'))->toBeNull();
            $this->travel(61)->seconds();
        }
    }
    expect(app(ThrottleWhatsappDelivery::class)->pause('office')['until'])->toBe(now()->timestamp + 900);
    $held = anotherWhatsappReceipt($f['customer']);
    expect($action->handle($held->id))->toBe(900);
    expect($held->fresh()->attempts)->toBe(0);
    Http::assertSentCount(18);
});

test('missing consent holds legacy documents and disabling the channel cancels queued messages', function () {
    $f = whatsappFixture();
    $row = app(ManageWhatsappDelivery::class)->queueReceipt($f['proof']);
    $options = whatsappOptions();
    unset($options['whatsapp_consent_confirmed']);
    $f['customer']->update(['document_delivery_settings' => $options]);
    expect(app(ManageWhatsappDelivery::class)->handle($row->id))->toBe(3600);
    expect($row->fresh()->attempts)->toBe(0);
    Http::assertNothingSent();
    $f['customer']->update(['document_delivery_settings' => whatsappOptions(['receipt_whatsapp' => false])]);
    app(ManageWhatsappDelivery::class)->handle($row->id);
    expect($row->fresh()->status)->toBe('CANCELLED');
    Http::assertNothingSent();
});

test('customer consent is required and its actor and timestamp cannot be supplied by clients', function () {
    whatsappSettings();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create(['version' => 1]);
    $this->actingAs($admin)->patchJson(route('api.customers.update', $customer), ['expected_version' => 1,
        'document_delivery_settings' => whatsappOptions(['whatsapp_consent_confirmed' => false])])->assertUnprocessable()
        ->assertJsonValidationErrors('document_delivery_settings.whatsapp_consent_confirmed');
    $this->patchJson(route('api.customers.update', $customer), ['expected_version' => 1,
        'document_delivery_settings' => whatsappOptions(['whatsapp_consent_record' => ['actor_id' => 999]])])->assertUnprocessable();
    $this->patchJson(route('api.customers.update', $customer), ['expected_version' => 1,
        'document_delivery_settings' => whatsappOptions()])->assertOk()->assertJsonMissingPath('data.document_delivery_settings.whatsapp_consent_record');
    expect($customer->fresh()->document_delivery_settings['whatsapp_consent_record'])->toMatchArray([
        'actor_id' => $admin->id, 'confirmed_at' => now()->toIso8601String(), 'target' => '628123456789@c.us',
    ]);
    Http::assertNothingSent();
});

test('queue expiry before sending remains waiting but an interrupted send becomes unknown', function (string $status, string $expected) {
    $f = whatsappFixture();
    $row = app(ManageWhatsappDelivery::class)->queueReceipt($f['proof']);
    $row->update(['status' => $status]);
    (new DeliverPickupWhatsapp($row->id))->failed(new RuntimeException('Queue expired'));
    expect($row->fresh()->status)->toBe($expected);
    Http::assertNothingSent();
})->with([['WAITING', 'WAITING'], ['READY', 'WAITING'], ['SENDING', 'UNKNOWN'], ['ACCEPTED', 'ACCEPTED']]);

test('receipt WhatsApp queues once and records provider acceptance without claiming delivery', function () {
    $f = whatsappFixture();
    $action = app(ManageWhatsappDelivery::class);
    $row = $action->queueReceipt($f['proof']);
    Queue::assertPushed(DeliverPickupWhatsapp::class);
    expect($action->handle($row->id))->toBeNull();
    expect($row->fresh()->status)->toBe('ACCEPTED');
    expect($action->queueReceipt($f['proof'])->id)->toBe($row->id);
    $action->handle($row->id);
    Http::assertSentCount(3);
    Http::assertSent(fn (HttpRequest $request): bool => $request->url() === 'http://waha.test/api/sendText' && $request->hasHeader('X-Api-Key', 'test-private-key')
        && $request['session'] === 'office' && $request['chatId'] === '628123456789@c.us' && str_contains($request['text'], 'Bukti Pickup'));
    $this->assertDatabaseCount('pickup_whatsapp_deliveries', 1);
});

test('WhatsApp recap attaches private PDF and Excel and retries only the rejected part', function () {
    $f = whatsappFixture(['waha.test/api/sendFile' => Http::sequence()->push([], 422)->push(['id' => 'pdf-id'])->push(['id' => 'xlsx-id'])]);
    $manifest = whatsappManifest($f);
    $action = app(ManageWhatsappDelivery::class);
    $row = $action->queueManifest($manifest);
    expect($action->handle($row->id))->toBeBetween(30, 60);
    $this->travel(61)->seconds();
    $action->handle($row->id);
    expect($row->fresh()->status)->toBe('FAILED');
    $action->retry($row->fresh());
    $this->travel(61)->seconds();
    $action->handle($row->id);
    $this->travel(61)->seconds();
    $action->handle($row->id);
    expect($row->fresh()->status)->toBe('ACCEPTED');
    Http::assertSent(fn (HttpRequest $request): bool => $request->url() === 'http://waha.test/api/sendFile'
        && ($request['file']['data'] ?? '') === base64_encode('%PDF-test') && str_contains($request['file']['filename'], 'Customer Uji - 23 November 2026'));
    expect(collect(Http::recorded())->filter(fn ($pair) => $pair[0]->url() === 'http://waha.test/api/sendText'))->toHaveCount(1);
    expect($row->fresh()->parts[0]['message_id'])->toBe('message-text');
    expect(array_column($row->fresh()->parts[1]['attempt_history'], 'status'))->toBe(['FAILED', 'ACCEPTED']);
    expect(collect(Http::recorded())->filter(fn ($pair) => str_ends_with($pair[0]->url(), '/messages/read')))->toHaveCount(1);
});

test('finalizing POP automatically queues its WhatsApp proof and attachments once', function () {
    whatsappSettings();
    Storage::fake('local');
    Queue::fake([DeliverPickupWhatsapp::class]);
    $staff = User::factory()->create(['role' => 'pickup_staff', 'is_active' => true]);
    $customer = Customer::factory()->create(['is_active' => true, 'document_delivery_settings' => whatsappOptions()]);
    $task = PickupTask::factory()->create(['customer_id' => $customer->id, 'assigned_staff_id' => $staff->id,
        'status' => 'ASSIGNED', 'execution_started_at' => now()]);
    $task->visits()->create(['staff_id' => $staff->id, 'outcome' => 'COLLECTED', 'started_at' => now(), 'recorded_at' => now()]);
    $data = ['expected_version' => 1, 'submission_key' => (string) Str::uuid(), 'manual_hybrid' => 2, 'cashless_hybrid' => 0, 'css_orion' => 0,
        'signature' => UploadedFile::fake()->image('signature.png'), 'photos' => [UploadedFile::fake()->image('photo.jpg')]];
    $proof = app(FinalizePickup::class)->handle($staff, $task->id, $data);
    $row = PickupWhatsappDelivery::sole();
    expect($row->pickup_receipt_id)->toBe($proof->receipt->id)->and($row->parts)->toHaveCount(3);
    app(FinalizePickup::class)->handle($staff, $task->id, $data);
    $this->assertDatabaseCount('pickup_whatsapp_deliveries', 1);
    Queue::assertPushed(DeliverPickupWhatsapp::class, 1);
    Http::assertNothingSent();
});

test('real HTTP WhatsApp simulation preserves serialization and prevents resend after lost acceptance', function (string $scenario) {
    $base = getenv('WAHA_SIMULATION_URL');
    if (! $base) {
        $this->markTestSkipped('Run the local WAHA simulation and set WAHA_SIMULATION_URL.');
    }
    expect(parse_url($base, PHP_URL_HOST))->toBe('127.0.0.1');
    $f = whatsappFixture();
    Http::allowStrayRequests([$base.'/*']);
    config(['services.waha.base_url' => $base]);
    Http::post($base.'/fixture/reset', ['scenario' => $scenario])->throw();
    $action = app(ManageWhatsappDelivery::class);
    $row = $scenario === 'success' ? $action->queueManifest(whatsappManifest($f)) : $action->queueReceipt($f['proof']);
    $action->handle($row->id);
    $this->travel(61)->seconds();
    $action->handle($row->id);
    $this->travel(61)->seconds();
    $action->handle($row->id);
    $state = Http::get($base.'/fixture/state')->throw()->json();
    $messages = $state['messages'];
    expect($row->fresh()->status)->toBe($scenario === 'success' ? 'ACCEPTED' : ($scenario === 'read_then_disconnect' ? 'WAITING' : 'UNKNOWN'));
    expect($messages)->toHaveCount($scenario === 'success' ? 3 : ($scenario === 'read_then_disconnect' ? 0 : 1));
    expect($state['reads'])->toHaveCount($scenario === 'read_then_disconnect' ? 3 : 1);
    if ($scenario === 'success') {
        expect($messages[1]['file']['data'])->toBe(base64_encode('%PDF-test'));
        expect($messages[1]['file']['mimetype'])->toBe('application/pdf');
    }
})->with(['success', 'accepted_then_disconnect', 'read_then_disconnect']);

test('uncertain WhatsApp results are held without automatic or manual resending', function (string $kind) {
    $f = whatsappFixture(['waha.test/api/sendText' => match ($kind) {
        'timeout' => Http::failedConnection(), 'server error' => Http::response([], 500), default => Http::response([])
    }]);
    $row = app(ManageWhatsappDelivery::class)->queueReceipt($f['proof']);
    app(ManageWhatsappDelivery::class)->handle($row->id);
    expect($row->fresh()->status)->toBe('UNKNOWN');
    expect(app(ManageWhatsappDelivery::class)->handle($row->id))->toBeNull();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $this->actingAs($admin)->postJson(route('document-delivery.retry', ['task' => $f['task'], 'delivery' => $row]))->assertConflict();
})->with(['timeout', 'server error', 'missing message id']);

test('offline or disabled WhatsApp waits in queue before any send', function (string $kind) {
    $f = whatsappFixture($kind === 'offline' ? ['waha.test/api/sessions/office' => Http::response(['status' => 'STOPPED'])] : []);
    if ($kind === 'disabled') {
        DB::table('document_delivery_settings')->update(['enabled' => false]);
    }
    $row = app(ManageWhatsappDelivery::class)->queueReceipt($f['proof']);
    expect(app(ManageWhatsappDelivery::class)->handle($row->id))->toBe(60);
    expect($row->fresh()->status)->toBe('WAITING');
    Http::assertNotSent(fn (HttpRequest $request): bool => $request->method() === 'POST');
})->with(['offline', 'disabled']);

test('rate limiting honors Retry-After with delayed attempts and stops after three rejections', function () {
    $f = whatsappFixture(['waha.test/api/sendText' => Http::response([], 429, ['Retry-After' => '120'])]);
    $row = app(ManageWhatsappDelivery::class)->queueReceipt($f['proof']);
    expect(app(ManageWhatsappDelivery::class)->handle($row->id))->toBeBetween(120, 130);
    $this->travel(131)->seconds();
    expect(app(ManageWhatsappDelivery::class)->handle($row->id))->toBeBetween(120, 130);
    $this->travel(131)->seconds();
    expect(app(ManageWhatsappDelivery::class)->handle($row->id))->toBeNull();
    expect($row->fresh()->status)->toBe('FAILED');
    expect(app(ThrottleWhatsappDelivery::class)->pause('office')['until'])->toBeGreaterThanOrEqual(now()->timestamp + 120);
});

test('offline sessions pause other documents without repeated session HTTP checks', function () {
    $f = whatsappFixture(['waha.test/api/sessions/office' => Http::response(['status' => 'STOPPED'])]);
    $action = app(ManageWhatsappDelivery::class);
    $first = $action->queueReceipt($f['proof']);
    $second = anotherWhatsappReceipt($f['customer']);
    expect($action->handle($first->id))->toBe(60);
    expect($action->handle($second->id))->toBe(60);
    Http::assertSentCount(1);
    Http::assertNotSent(fn (HttpRequest $request): bool => $request->method() === 'POST');
});

test('per-session lock prevents parallel WhatsApp sends', function () {
    $f = whatsappFixture();
    $row = app(ManageWhatsappDelivery::class)->queueReceipt($f['proof']);
    $lock = Cache::lock('waha-send:'.hash('sha256', 'office'), 65);
    $lock->get();
    try {
        expect(app(ManageWhatsappDelivery::class)->handle($row->id))->toBe(10);
        Http::assertNothingSent();
    } finally {
        $lock->release();
    }
});

test('changed destination disabled customer or corrected POP cancels queued WhatsApp', function (string $kind) {
    $f = whatsappFixture();
    $row = app(ManageWhatsappDelivery::class)->queueReceipt($f['proof']);
    if ($kind === 'inactive') {
        $f['customer']->update(['is_active' => false]);
    } elseif ($kind === 'correction') {
        $f['proof']->revisions()->create(['revision' => 1, 'actor_id' => User::factory()->create()->id, 'reason' => 'Koreksi uji', 'values' => ['manual_hybrid' => 3]]);
    } else {
        $f['customer']->update(['document_delivery_settings' => whatsappOptions(['whatsapp_target' => '628987654321@c.us'])]);
    }
    app(ManageWhatsappDelivery::class)->handle($row->id);
    expect($row->fresh()->status)->toBe('CANCELLED');
    Http::assertNothingSent();
})->with(['inactive', 'correction', 'destination']);

test('stale reconciliation or changed private file prevents WhatsApp recap send', function (string $kind) {
    $f = whatsappFixture();
    $manifest = whatsappManifest($f);
    $row = app(ManageWhatsappDelivery::class)->queueManifest($manifest);
    if ($kind === 'stale') {
        PickupProcessingReconciliation::where('pickup_task_id', $f['task']->id)->update(['input_version' => 2]);
    } else {
        Storage::disk('local')->put('private/test.pdf', 'changed');
    }
    app(ManageWhatsappDelivery::class)->handle($row->id);
    expect($row->fresh()->status)->toBe($kind === 'stale' ? 'CANCELLED' : 'FAILED');
    Http::assertNotSent(fn (HttpRequest $request): bool => $request->method() === 'POST');
})->with(['stale', 'file']);

test('customer delivery preferences normalize contact numbers and validate group destinations', function () {
    whatsappSettings();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create(['version' => 1]);
    $this->actingAs($admin)->patchJson(route('api.customers.update', $customer), ['expected_version' => $customer->version, 'document_delivery_settings' => whatsappOptions(['whatsapp_target' => '0812 3456 789'])])
        ->assertOk()->assertJsonPath('data.document_delivery_settings.whatsapp_target', '628123456789@c.us');
    Http::fake(['waha.test/api/office/groups/12345%40g.us' => Http::response(['id' => '12345@g.us'])]);
    $this->patchJson(route('api.customers.update', $customer), ['expected_version' => 2, 'document_delivery_settings' => whatsappOptions(['whatsapp_type' => 'group', 'whatsapp_target' => '12345@g.us'])])->assertOk();
    $this->patchJson(route('api.customers.update', $customer), ['expected_version' => 3, 'document_delivery_settings' => whatsappOptions(['whatsapp_type' => 'group', 'whatsapp_target' => 'an arbitrary group name'])])->assertUnprocessable()->assertJsonValidationErrors('document_delivery_settings.whatsapp_target');
});

test('customer rejects a destination that disagrees with the WhatsApp destination type', function (string $type, string $target) {
    whatsappSettings();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create(['version' => 1]);

    $this->actingAs($admin)->patchJson(route('api.customers.update', $customer), [
        'expected_version' => 1,
        'document_delivery_settings' => whatsappOptions(['whatsapp_type' => $type, 'whatsapp_target' => $target]),
    ])->assertUnprocessable()->assertJsonValidationErrors('document_delivery_settings.whatsapp_target');

    expect($customer->fresh()->version)->toBe(1);
    Http::assertNothingSent();
})->with([
    ['contact', '120363046678445460@g.us'],
    ['group', '628123456789@c.us'],
]);

test('manual group ID saves without querying WAHA and still requires consent', function () {
    whatsappSettings();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $customer = Customer::factory()->create(['version' => 1]);
    $options = whatsappOptions(['whatsapp_type' => 'group', 'whatsapp_target' => ' 120363046678445460@g.us ']);

    $this->actingAs($admin)->patchJson(route('api.customers.update', $customer), [
        'expected_version' => 1, 'document_delivery_settings' => $options,
    ])->assertOk()->assertJsonPath('data.document_delivery_settings.whatsapp_target', '120363046678445460@g.us');

    expect($customer->fresh()->documentDeliveryOptions()['whatsapp_type'])->toBe('group');
    $this->patchJson(route('api.customers.update', $customer), [
        'expected_version' => 2,
        'document_delivery_settings' => [...$options, 'whatsapp_consent_confirmed' => false],
    ])->assertUnprocessable()->assertJsonValidationErrors('document_delivery_settings.whatsapp_consent_confirmed');
    Http::assertNothingSent();
});

test('worker blocks legacy mismatched destinations before any WAHA request', function (string $type, string $target) {
    $f = whatsappFixture();
    $f['customer']->update(['document_delivery_settings' => whatsappOptions(['whatsapp_type' => $type, 'whatsapp_target' => $target])]);
    $action = app(ManageWhatsappDelivery::class);
    $row = $action->queueReceipt($f['proof']);

    expect($action->handle($row->id))->toBeNull();
    expect($row->fresh()->status)->toBe('FAILED');
    expect($row->fresh()->last_error)->toContain('Jenis tujuan WhatsApp tidak sesuai');
    Http::assertNothingSent();
})->with([
    ['contact', '120363046678445460@g.us'],
    ['group', '628123456789@c.us'],
]);

test('settings reject unconnected sessions and stale versions without exposing API keys', function () {
    whatsappSettings();
    Http::fake(['waha.test/api/sessions' => Http::response([['name' => 'office', 'status' => 'WORKING', 'config' => ['secret' => 'must-not-show']]]), 'waha.test/api/sessions/office' => Http::sequence()->push(['status' => 'WORKING'])->push(['status' => 'STOPPED'])]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $response = $this->actingAs($admin)->get(route('document-delivery.edit'))->assertOk()->assertInertia(fn (Assert $page) => $page->component('settings/document-delivery')->where('sessions.0.name', 'office')->missing('sessions.0.config')
        ->where('limits.send_seen', true)->missing('limits.session_hourly_limit')->missing('limits.session_daily_limit'));
    expect($response->getContent())->not->toContain('test-private-key', 'must-not-show');
    $this->patch(route('document-delivery.update'), ['session' => 'office', 'enabled' => true, 'expected_version' => 1])->assertRedirect();
    $this->patchJson(route('document-delivery.update'), ['session' => 'office', 'enabled' => false, 'expected_version' => 1])->assertConflict();
    $this->patchJson(route('document-delivery.update'), ['session' => 'office', 'enabled' => true, 'expected_version' => 2])->assertUnprocessable()->assertJsonValidationErrors('session');
});

test('only admin can change the sending session', function (string $role) {
    $user = User::factory()->create(['role' => $role]);
    $this->actingAs($user)->get(route('document-delivery.edit'))->assertForbidden();
    $this->patchJson(route('document-delivery.update'), ['session' => 'office', 'enabled' => true, 'expected_version' => 1])->assertForbidden();
    Http::assertNothingSent();
})->with(['cs', 'pickup_staff', 'retail_staff', 'customer']);

test('delivery history and retry remain scoped and never expose stored files', function () {
    $f = whatsappFixture();
    $manifest = whatsappManifest($f);
    $row = app(ManageWhatsappDelivery::class)->queueManifest($manifest);
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $this->actingAs($staff)->getJson(route('document-delivery.history', $f['task']))->assertNotFound();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $response = $this->actingAs($admin)->getJson(route('document-delivery.history', $f['task']))->assertOk()->assertJsonPath('deliveries.data.0.session', 'office');
    expect($response->getContent())->not->toContain('private/test.pdf', 'sha256', 'test-private-key');
    $foreign = PickupTask::factory()->create();
    $this->postJson(route('document-delivery.retry', ['task' => $foreign, 'delivery' => $row]))->assertNotFound();
});

test('unchecked customer email channels stop POP and recap email independently of WhatsApp', function () {
    $f = whatsappFixture();
    $f['customer']->update(['document_delivery_settings' => whatsappOptions(['receipt_email' => false, 'recap_email' => false])]);
    Mail::fake();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    expect(app(SendPickupReceipt::class)->handle($admin, $f['task']->id)->status)->toBe('SKIPPED');
    app(DeliverPickupAwbManifest::class)->queue(whatsappManifest($f));
    $this->assertDatabaseCount('pickup_awb_deliveries', 0);
    $this->assertDatabaseCount('pickup_whatsapp_deliveries', 1);
    Mail::assertNothingSent();
});

test('document buttons queue both WhatsApp documents idempotently and reject disabled customer channels', function () {
    $f = whatsappFixture();
    $f['customer']->update(['document_delivery_settings' => whatsappOptions(['receipt_email' => false, 'recap_email' => false])]);
    whatsappManifest($f);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    foreach (['receipt', 'recap', 'receipt', 'recap'] as $document) {
        $this->actingAs($admin)->postJson(route('document-delivery.send', $f['task']), ['document' => $document])->assertAccepted();
    }
    $this->assertDatabaseCount('pickup_whatsapp_deliveries', 2);
    $f['customer']->update(['document_delivery_settings' => whatsappOptions(['receipt_email' => false, 'receipt_whatsapp' => false])]);
    $this->postJson(route('document-delivery.send', $f['task']), ['document' => 'receipt'])->assertUnprocessable();
    $staff = User::factory()->create(['role' => 'pickup_staff']);
    $this->actingAs($staff)->postJson(route('document-delivery.send', $f['task']), ['document' => 'recap'])->assertForbidden();
    Http::assertNothingSent();
});

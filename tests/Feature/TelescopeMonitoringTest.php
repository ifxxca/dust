<?php

use App\Models\User;
use App\Providers\AppServiceProvider;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Mail\Message;
use Illuminate\Queue\Queue;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Laravel\Telescope\Contracts\EntriesRepository;
use Laravel\Telescope\IncomingEntry;
use Laravel\Telescope\Telescope;
use Laravel\Telescope\TelescopeServiceProvider;

class TelescopeDiagnosticJob implements ShouldQueue
{
    use Queueable;

    /** @param array<string, mixed> $details */
    public function __construct(public array $details = [], public bool $fail = false) {}

    public function handle(): void
    {
        if ($this->fail) {
            throw new RuntimeException('Diagnostic job failure');
        }
    }
}

function enableTestTelescope(): void
{
    app()->detectEnvironment(fn (): string => 'local');
    config(['telescope.enabled' => true, 'database.connections.telescope.database' => ':memory:']);
    $migration = require base_path('vendor/laravel/telescope/database/migrations/2018_08_08_100000_create_telescope_entries_table.php');
    $migration->up();
    app()->getProvider(AppServiceProvider::class)->register();
    Telescope::startRecording(false);
}

beforeEach(function () {
    $this->withSession(['_token' => 'diagnostic-csrf']);
    Telescope::stopRecording();
    Telescope::$entriesQueue = [];
    Telescope::$updatesQueue = [];
    Telescope::$filterUsing = [];
});

afterEach(function () {
    Telescope::stopRecording();
    Telescope::$entriesQueue = [];
    Telescope::$updatesQueue = [];
    Telescope::$filterUsing = [];
    Queue::createPayloadUsing(null);
    DB::purge('telescope');
});

test('Telescope is disabled by default without changing the application queue', function () {
    $this->withoutVite();

    $this->get('/telescope')->assertNotFound();

    expect(config('telescope.enabled'))->toBeFalse();
    expect(config('queue.default'))->toBe('sync');
    expect(Schema::hasTable('telescope_entries'))->toBeFalse();
});

test('production does not register Telescope even when its switch is enabled', function () {
    $this->withoutVite();
    app()->detectEnvironment(fn (): string => 'production');
    config(['telescope.enabled' => true]);
    app()->getProvider(AppServiceProvider::class)->register();

    $this->get('/telescope')->assertNotFound();

    expect(app()->getProvider(TelescopeServiceProvider::class))->toBeNull();
});

test('guests cannot access the local Telescope dashboard or mail API', function () {
    enableTestTelescope();

    $this->get('/telescope')->assertRedirect(route('login'));
    $this->postJson('/telescope/telescope-api/mail', ['_token' => 'diagnostic-csrf'])->assertUnauthorized();
});

test('only active admins can access Telescope including its mail API', function (string $role, bool $active) {
    $user = User::factory()->create(['role' => $role, 'is_active' => $active]);
    enableTestTelescope();

    $this->actingAs($user)->get('/telescope')->assertForbidden();
    $this->postJson('/telescope/telescope-api/mail', ['_token' => 'diagnostic-csrf'])->assertForbidden();
})->with([
    'CS' => ['cs', true],
    'pickup staff' => ['pickup_staff', true],
    'retail staff' => ['retail_staff', true],
    'customer' => ['customer', true],
    'inactive admin' => ['admin_supervisor', false],
]);

test('admin can preview a captured email while mail stays in the array transport', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    enableTestTelescope();

    Mail::html('<p>Bukti pickup simulasi</p>', function (Message $message): void {
        $message->to('customer@example.test')->subject('Bukti pickup simulasi');
    });
    Telescope::store(app(EntriesRepository::class));

    $this->actingAs($admin)->get('/telescope')->assertOk();
    $this->postJson('/telescope/telescope-api/mail', ['_token' => 'diagnostic-csrf'])->assertOk()
        ->assertJsonPath('entries.0.content.subject', 'Bukti pickup simulasi');
    $uuid = DB::connection('telescope')->table('telescope_entries')->where('type', 'mail')->value('uuid');
    $this->get('/telescope/telescope-api/mail/'.$uuid.'/preview')->assertOk()->assertSee('Bukti pickup simulasi');
    expect(config('mail.default'))->toBe('array');
    expect(Schema::hasTable('telescope_entries'))->toBeFalse();
});

test('Telescope records queued job outcomes and masks nested credentials', function (bool $fail, string $expectedStatus) {
    enableTestTelescope();

    Bus::dispatch((new TelescopeDiagnosticJob([
        'deliveryId' => 42,
        'hybrid_password' => 'do-not-record',
        'nested' => ['accessToken' => 'private-token', 'server' => 'PM'],
    ], $fail))->onConnection('database')->onQueue('monitoring-test'));
    Telescope::store(app(EntriesRepository::class));
    $this->artisan('queue:work', ['connection' => 'database', '--queue' => 'monitoring-test', '--once' => true, '--tries' => 1, '--timeout' => 10, '--sleep' => 0])->assertSuccessful();
    Telescope::store(app(EntriesRepository::class));

    $content = DB::connection('telescope')->table('telescope_entries')->where('type', 'job')->value('content');
    $entry = json_decode($content, true, flags: JSON_THROW_ON_ERROR);
    expect($entry['status'])->toBe($expectedStatus);
    expect($entry['data']['details'])->toBe([
        'deliveryId' => 42, 'hybrid_password' => '********',
        'nested' => ['accessToken' => '********', 'server' => 'PM'],
    ]);
    expect($content)->not->toContain('do-not-record', 'private-token');
    $this->assertDatabaseCount('jobs', 0);
    $this->assertDatabaseCount('failed_jobs', $fail ? 1 : 0);
})->with([
    'processed' => [false, 'processed'],
    'failed' => [true, 'failed'],
]);

test('Telescope pruning removes old diagnostics and retains recent entries', function () {
    $this->freezeTime();
    enableTestTelescope();
    Telescope::recordMail(IncomingEntry::make(['subject' => 'old']));
    Telescope::store(app(EntriesRepository::class));
    DB::connection('telescope')->table('telescope_entries')->update(['created_at' => now()->subHours(25)]);
    Telescope::recordMail(IncomingEntry::make(['subject' => 'recent']));
    Telescope::store(app(EntriesRepository::class));

    $this->artisan('telescope:prune', ['--hours' => 24])->assertSuccessful();

    $entries = DB::connection('telescope')->table('telescope_entries')->where('type', 'mail')->pluck('content');
    expect($entries)->toHaveCount(1);
    expect(json_decode($entries->sole(), true)['subject'])->toBe('recent');
});

test('reported exceptions appear in local diagnostics', function () {
    enableTestTelescope();

    report(new RuntimeException('Simulated monitoring exception'));
    Telescope::store(app(EntriesRepository::class));

    $content = DB::connection('telescope')->table('telescope_entries')->where('type', 'exception')->value('content');
    expect(json_decode($content, true)['message'])->toBe('Simulated monitoring exception');
});

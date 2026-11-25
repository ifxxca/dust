<?php

use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\JneShipmentObservation;
use App\Models\PickupAttachment;
use App\Models\PickupAwbManifest;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->travelTo('2026-11-20 08:00:00 UTC');
    $this->withoutVite();
});

/** @return array{Customer, User} */
function portalIdentity(): array
{
    $customer = Customer::factory()->create(['is_active' => true]);
    $user = User::factory()->create(['role' => 'customer', 'customer_id' => $customer->id, 'is_active' => true]);

    return [$customer, $user];
}

function portalAwb(Customer $customer, string $category = 'manual_hybrid', ?string $cod = 'N', ?int $amount = 1200000, array $attributes = []): JneShipment
{
    if (! array_key_exists('pickup_task_id', $attributes)) {
        $task = PickupTask::factory()->create(['customer_id' => $customer->id]);
        PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => 1, 'cashless_hybrid' => 0, 'css_orion' => 0]);
        $attributes['pickup_task_id'] = $task->id;
    }
    $source = JneReportAwb::factory()->create(['amount_cents' => $amount, 'entry_at' => now(), 'raw_data' => ['COD_FLAG' => $cod, 'PAYMENT_TYPE' => 'CREDIT']]);

    return JneShipment::factory()->create(['awb' => $source->awb, 'customer_id' => $customer->id, 'latest_report_awb_id' => $source->id,
        'customer_match_status' => 'MATCHED', 'category' => $category, 'category_status' => 'MATCHED', 'tracking_status' => 'IN_TRANSIT', 'match_status' => 'MATCHED', ...$attributes]);
}

test('customer portal requires authentication', function (string $route) {
    $this->get(route($route))->assertRedirect(route('login'));
})->with(['portal.dashboard', 'portal.monitoring', 'portal.history']);

test('customers see only verified own shipments and correct amount rules', function () {
    [$customer, $user] = portalIdentity();
    portalAwb($customer);
    portalAwb($customer, 'cashless_hybrid');
    portalAwb($customer, 'css_orion', 'Y');
    portalAwb($customer, 'css_orion', 'N', 5600000);
    portalAwb($customer, 'manual_hybrid', null);
    portalAwb($customer, attributes: ['customer_match_status' => 'CANDIDATE']);
    portalAwb(Customer::factory()->create());

    $this->actingAs($user)->get(route('portal.dashboard'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('customer-portal-dashboard')->where('customer.id', $customer->id)->where('summary.total', 5)
        ->missing('summary.amount_cents')->missing('summary.amount_complete')->where('isAdmin', false));
    $this->get(route('portal.monitoring'))->assertOk()->assertInertia(fn (Assert $page) => $page->has('shipments.data', 5)->where('shipments.total', 5)
        ->where('shipments.data', fn ($rows) => collect($rows)->pluck('amount_cents')->all() === [null, 5600000, 0, 0, 1200000]));
});

test('dashboard groups all statuses and categories within the customer pickup period', function () {
    [$customer, $user] = portalIdentity();
    foreach (JneShipment::STATUSES as $status) {
        portalAwb($customer, 'cashless_hybrid', attributes: ['tracking_status' => $status]);
    }
    portalAwb(Customer::factory()->create());
    $outside = portalAwb($customer);
    PickupRecord::where('pickup_task_id', $outside->pickup_task_id)->update(['picked_up_at' => '2026-11-20 17:00:00']);

    $this->actingAs($user)->get(route('portal.dashboard', ['date_from' => '2026-11-20', 'date_to' => '2026-11-20']))
        ->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('summary.total', 6)->has('summary.by_status', 6)
        ->where('summary.by_status', fn ($rows) => collect($rows)->every(fn ($row) => $row['total'] === 1))
        ->where('summary.groups.cashless', 6)->where('summary.groups.manual', 0));
});

test('dashboard groups manual and cashless and limits COD breakdown to the selected period and customer', function (bool $hasCod) {
    [$customer, $user] = portalIdentity();
    foreach ([['manual_hybrid', 'N'], ['manual_hybrid', null], ['css_orion', $hasCod ? ' y ' : 'N'], ['cashless_hybrid', 'Y']] as [$category, $cod]) {
        $shipment = portalAwb($customer, $category, $cod);
        PickupRecord::where('pickup_task_id', $shipment->pickup_task_id)->update(['picked_up_at' => '2027-01-07 16:59:59']);
    }
    $outside = portalAwb($customer, cod: 'Y');
    PickupRecord::where('pickup_task_id', $outside->pickup_task_id)->update(['picked_up_at' => '2027-01-07 17:00:00']);
    $foreign = portalAwb(Customer::factory()->create(), cod: 'Y');
    PickupRecord::where('pickup_task_id', $foreign->pickup_task_id)->update(['picked_up_at' => '2027-01-01 00:00:00']);

    $this->actingAs($user)->get(route('portal.dashboard', ['date_from' => '2027-01-01', 'date_to' => '2027-01-07']))
        ->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('summary.total', 4)->where('summary.groups.manual', 3)->where('summary.groups.cashless', 1)
        ->where('summary.groups.cod', $hasCod ? 1 : 0)->where('summary.groups.non_cod', $hasCod ? 1 : 2)
        ->where('summary.groups.cod_unknown', 1)->missing('summary.amount_cents')->missing('summary.exceptions'));
})->with(['with COD' => true, 'without COD' => false]);

test('dashboard shows the latest five finalized pickups by pickup time without leaking another customer', function () {
    [$customer, $user] = portalIdentity();
    $newest = null;
    for ($i = 0; $i < 6; $i++) {
        $task = PickupTask::factory()->create(['customer_id' => $customer->id]);
        PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'picked_up_at' => '2026-11-'.(20 - $i).' 08:00:00']);
        $newest ??= $task;
    }
    $foreign = PickupTask::factory()->create();
    PickupRecord::factory()->create(['pickup_task_id' => $foreign->id]);

    $this->actingAs($user)->get(route('portal.dashboard'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('summary.pickups', 6)->has('summary.recent_pickups', 5)->where('summary.recent_pickups.0.id', $newest->id));
});

test('shipment detail includes useful shipment fields and deduplicated paginated report history', function () {
    [$customer, $user] = portalIdentity();
    $awb = portalAwb($customer, 'cashless_hybrid');
    $awb->latestSource->update(['weight_grams' => 1500, 'quantity' => 2, 'delivered_at' => '2026-11-20 07:30:00',
        'destination_name' => 'SURABAYA', 'raw_data' => ['ADDR1' => 'Jalan Uji 1', 'ADDR2' => 'Blok A', 'private_token' => 'never-expose']]);
    for ($i = 0; $i < 22; $i++) {
        $source = JneReportAwb::factory()->create(['awb' => $awb->awb, 'status_web' => 'Report status '.$i, 'status_pod' => null, 'source_status_at' => '2026-11-20 07:00:00']);
        JneShipmentObservation::factory()->create(['jne_shipment_id' => $awb->id, 'jne_report_awb_id' => $source->id,
            'tracking_status' => 'IN_TRANSIT', 'status_signature' => hash('sha256', (string) $i), 'observed_at' => now()->subMinutes($i)]);
    }
    $duplicate = JneReportAwb::factory()->create(['awb' => $awb->awb, 'status_web' => 'Report status 0', 'status_pod' => null, 'source_status_at' => '2026-11-20 07:00:00']);
    JneShipmentObservation::factory()->create(['jne_shipment_id' => $awb->id, 'jne_report_awb_id' => $duplicate->id,
        'tracking_status' => 'IN_TRANSIT', 'status_signature' => hash('sha256', '0'), 'observed_at' => now()->addMinute()]);

    $response = $this->actingAs($user)->getJson(route('portal.shipment', $awb))->assertOk()
        ->assertJsonPath('address', "Jalan Uji 1\nBlok A")->assertJsonPath('weight_grams', 1500)->assertJsonPath('quantity', 2)
        ->assertJsonPath('destination', 'SURABAYA')->assertJsonPath('delivered_at', '2026-11-20 07:30:00')
        ->assertJsonCount(20, 'history.data')->assertJsonPath('history.total', 22)->assertJsonPath('history.data.0.description', 'Report status 0');
    expect($response->getContent())->not->toContain('never-expose', 'raw_data', 'customer_account', 'status_signature');
    $this->getJson(route('portal.shipment', ['shipment' => $awb, 'page' => 2]))->assertOk()->assertJsonCount(2, 'history.data');
});

test('empty portal and shipment history expose empty results without fabricated events', function () {
    [$customer, $user] = portalIdentity();
    $this->actingAs($user)->get(route('portal.dashboard'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('summary.total', 0)->has('summary.recent_pickups', 0)->where('summary.groups.manual', 0));
    $awb = portalAwb($customer);
    $this->getJson(route('portal.shipment', $awb))->assertOk()->assertJsonCount(0, 'history.data')->assertJsonPath('history.total', 0);
});

test('customer cannot override selected customer', function () {
    [, $user] = portalIdentity();
    $other = Customer::factory()->create();

    $this->actingAs($user)->get(route('portal.monitoring', ['customer_id' => $other->id]))->assertNotFound();
});

test('customer cannot access internal operational pages', function (string $path) {
    [, $user] = portalIdentity();

    $this->actingAs($user)->get($path)->assertForbidden();
})->with(['/admin/jne-monitoring/customer-dashboard', '/operations/customers', '/api/v1/customers', '/portal/accounts']);

test('customer login and dashboard route lead to the portal', function () {
    [, $user] = portalIdentity();

    $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password'])->assertRedirect(route('portal.dashboard'));
    $this->get(route('dashboard'))->assertRedirect(route('portal.dashboard'));
});

test('unverified customer must verify email before accessing shipments', function () {
    [, $user] = portalIdentity();
    $user->forceFill(['email_verified_at' => null])->save();

    $this->actingAs($user)->get(route('portal.dashboard'))->assertRedirect(route('verification.notice'));
});

test('inactive or unlinked customer cannot access the portal', function (string $field, mixed $value) {
    [, $user] = portalIdentity();
    $user->update([$field => $value]);

    $this->actingAs($user)->get(route('portal.dashboard'))->assertForbidden();
})->with([['is_active', false], ['customer_id', null]]);

test('admin can preview a selected customer while other internal roles are refused', function () {
    $customer = Customer::factory()->create();
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->get(route('portal.dashboard', ['customer_id' => $customer->id]))->assertOk()->assertInertia(fn (Assert $page) => $page->where('customer.id', $customer->id)->where('isAdmin', true));
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']))->get(route('portal.dashboard'))->assertForbidden();
});

test('monitoring dashboard and history use finalized pickup date instead of AWB entry date', function () {
    [$customer, $user] = portalIdentity();
    $task = PickupTask::factory()->create(['customer_id' => $customer->id]);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => 2, 'cashless_hybrid' => 0, 'css_orion' => 0, 'picked_up_at' => '2026-11-19 17:30:00']);
    $proof->revisions()->create(['revision' => 1, 'actor_id' => $user->id, 'reason' => 'Koreksi jumlah uji', 'values' => ['manual_hybrid' => 3]]);
    $shipment = portalAwb($customer, attributes: ['pickup_task_id' => $task->id]);
    $shipment->latestSource->update(['entry_at' => '2026-11-10 08:00:00']);

    $this->actingAs($user)->get(route('portal.history', ['date_from' => '2026-11-20', 'date_to' => '2026-11-20']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->has('pickups.data', 1)->where('pickups.data.0.manual', 3)->where('pickups.data.0.amount_cents', 1200000)->where('pickups.data.0.amount_complete', false));
    $this->get(route('portal.monitoring', ['date_from' => '2026-11-19', 'date_to' => '2026-11-19']))->assertOk()->assertInertia(fn (Assert $page) => $page->has('shipments.data', 0));
    $this->get(route('portal.monitoring', ['date_from' => '2026-11-20', 'date_to' => '2026-11-20']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->has('shipments.data', 1)->where('shipments.data.0.picked_up_at', '2026-11-19 17:30:00'));
    $this->get(route('portal.dashboard', ['date_from' => '2026-11-20', 'date_to' => '2026-11-20']))->assertOk()->assertInertia(fn (Assert $page) => $page->where('summary.total', 1));
    $this->getJson(route('portal.shipment', $shipment))->assertOk()->assertJsonPath('picked_up_at', '2026-11-19 17:30:00');
});

test('pickup date filtering never falls back to AWB dates or unverified pickup links', function () {
    [$customer, $user] = portalIdentity();
    $valid = portalAwb($customer);
    portalAwb($customer, attributes: ['pickup_task_id' => null]);
    portalAwb($customer, attributes: ['match_status' => 'CANDIDATE']);
    $unfinished = PickupTask::factory()->create(['customer_id' => $customer->id]);
    portalAwb($customer, attributes: ['pickup_task_id' => $unfinished->id]);
    $foreign = PickupTask::factory()->create();
    PickupRecord::factory()->create(['pickup_task_id' => $foreign->id]);
    $wrongLink = portalAwb($customer, attributes: ['pickup_task_id' => $foreign->id]);

    $this->actingAs($user)->get(route('portal.dashboard'))->assertOk()->assertInertia(fn (Assert $page) => $page->where('summary.total', 1));
    $this->get(route('portal.monitoring'))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->has('shipments.data', 1)->where('shipments.data.0.awb', $valid->awb));
    $this->getJson(route('portal.shipment', $wrongLink))->assertOk()->assertJsonPath('picked_up_at', null)->assertJsonPath('pickup', null);
});

test('search filters shipments and server pagination limits the returned rows', function () {
    [$customer, $user] = portalIdentity();
    for ($i = 0; $i < 21; $i++) {
        portalAwb($customer);
    }
    $awb = portalAwb($customer, 'cashless_hybrid');

    $this->actingAs($user)->get(route('portal.monitoring'))->assertOk()->assertInertia(fn (Assert $page) => $page->has('shipments.data', 20)->where('shipments.total', 22));
    $this->get(route('portal.monitoring', ['q' => $awb->awb, 'category' => 'cashless_hybrid']))->assertOk()->assertInertia(fn (Assert $page) => $page->has('shipments.data', 1)->where('shipments.data.0.amount_cents', 0));
});

test('foreign shipment pickup attachment and manifest details stay private', function () {
    [, $user] = portalIdentity();
    [$other] = portalIdentity();
    $task = PickupTask::factory()->create(['customer_id' => $other->id]);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $awb = portalAwb($other, attributes: ['pickup_task_id' => $task->id]);
    $manifest = PickupAwbManifest::factory()->create(['pickup_task_id' => $task->id, 'snapshot' => ['customer_id' => $other->id]]);
    $attachment = PickupAttachment::create(['pickup_record_id' => $proof->id, 'kind' => 'signature', 'path' => 'private.png', 'mime_type' => 'image/png', 'size' => 5]);

    $this->actingAs($user)->getJson(route('portal.shipment', $awb))->assertNotFound();
    $this->getJson(route('portal.pickup', $task))->assertNotFound();
    $this->get(route('portal.download', ['manifest' => $manifest, 'format' => 'pdf']))->assertNotFound();
    $this->get(route('portal.attachment', $attachment))->assertNotFound();
});

test('customer can download own immutable document with readable name and checksum verification', function () {
    Storage::fake('local');
    [$customer, $user] = portalIdentity();
    $task = PickupTask::factory()->create(['customer_id' => $customer->id]);
    Storage::disk('local')->put('portal/manifest.pdf', '%PDF-fixture');
    $manifest = PickupAwbManifest::factory()->create(['pickup_task_id' => $task->id, 'status' => 'READY', 'pdf_path' => 'portal/manifest.pdf',
        'snapshot' => ['customer_id' => $customer->id, 'customer_name' => 'Irfan', 'pickup_date' => '2026-11-20'], 'checksums' => ['pdf' => hash('sha256', '%PDF-fixture')]]);

    $this->actingAs($user)->get(route('portal.download', ['manifest' => $manifest, 'format' => 'pdf']))->assertOk()->assertDownload('Rekap Resi - Irfan - 20 November 2026 - v1.pdf');
    Storage::disk('local')->put('portal/manifest.pdf', 'changed');
    $this->get(route('portal.download', ['manifest' => $manifest, 'format' => 'pdf']))->assertConflict();
});

test('admin creates independent customer accounts without operational privileges', function () {
    $customer = Customer::factory()->create(['is_active' => true]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->post(route('portal.accounts.store'), ['customer_id' => $customer->id, 'name' => 'Finance Irfan', 'email' => 'finance@example.test',
        'password' => 'Strong-Password-2026!', 'password_confirmation' => 'Strong-Password-2026!', 'role' => 'admin_supervisor'])->assertRedirect();

    $user = User::where('email', 'finance@example.test')->sole();
    expect($user->role)->toBe('customer');
    expect($user->customer_id)->toBe($customer->id);
    expect($user->email_verified_at)->toBeNull();
    expect(Hash::check('Strong-Password-2026!', $user->password))->toBeTrue();
    $this->patch(route('portal.accounts.update', $user), ['is_active' => false])->assertRedirect();
    expect($user->fresh()->is_active)->toBeFalse();
});

test('own pickup detail contains only scoped paginated AWBs and finalized proof', function () {
    [$customer, $user] = portalIdentity();
    $task = PickupTask::factory()->create(['customer_id' => $customer->id]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => 1, 'cashless_hybrid' => 0, 'css_orion' => 0]);
    $awb = portalAwb($customer, attributes: ['pickup_task_id' => $task->id]);
    portalAwb($customer);

    $this->actingAs($user)->getJson(route('portal.pickup', $task))->assertOk()->assertHeader('Cache-Control', 'no-store, private')->assertJsonPath('pickup.amount_complete', true)->assertJsonPath('shipments.total', 1)->assertJsonPath('shipments.data.0.awb', $awb->awb);
    $this->getJson(route('portal.shipment', $awb))->assertOk()->assertJsonPath('amount_cents', 1200000)->assertJsonMissingPath('raw_data');
    $uncompleted = PickupTask::factory()->create(['customer_id' => $customer->id]);
    $this->getJson(route('portal.pickup', $uncompleted))->assertNotFound();
});

test('admin can open an empty customer selector and customer account management', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);

    $this->actingAs($admin)->get(route('portal.dashboard'))->assertOk()->assertInertia(fn (Assert $page) => $page->where('customer', null)->where('summary', null));
    $this->get(route('portal.accounts'))->assertOk()->assertInertia(fn (Assert $page) => $page->component('customer-portal-accounts')->where('ready', true)->has('accounts', 0));
});

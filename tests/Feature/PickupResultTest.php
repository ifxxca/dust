<?php

use App\Actions\Handover\CloseSession;
use App\Actions\Handover\CorrectVerification;
use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\PickupVisit;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-19 05:00:00', 'UTC'));
});

test('summary separates POP, waiting handover, verification and discrepancies without duplicate pickups', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    PickupTask::factory()->state(['scheduled_at' => now()])->create();
    $empty = PickupTask::factory()->state(['scheduled_at' => now()])->create(['status' => 'NO_PACKAGES']);
    PickupVisit::factory()->create(['pickup_task_id' => $empty->id, 'outcome' => 'NO_PACKAGES', 'recorded_at' => now()]);
    $tasks = PickupTask::factory()->state(['scheduled_at' => now()])->count(5)->create(['status' => 'PICKED_UP']);
    foreach ($tasks as $task) {
        PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    }
    foreach ([1 => 3, 2 => 2, 3 => 4, 4 => null] as $index => $actual) {
        $session = app(CreateSession::class)->handle($admin, [$tasks[$index]->id], (string) Str::uuid());
        if ($actual !== null) {
            $session = app(VerifyItem::class)->handle($admin, $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => $actual, 'cashless_hybrid' => 1, 'css_orion' => 0, 'discrepancy_notes' => 'Hasil hitung']);
        }
        if ($index === 2) {
            app(CloseSession::class)->handle($admin, $session->id, 2);
        }
    }
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup']))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->component('pickup-results')->where('summary', ['total' => 7, 'pop_final' => 5, 'incomplete' => 1, 'waiting_handover' => 1, 'unverified' => 1, 'verified' => 3, 'discrepancy' => 2, 'closed' => 1])
        ->where('pickups.total', 7)->has('pickups.data', 7));
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'verification_status' => 'verified', 'discrepancy_status' => 'yes']))->assertInertia(fn (Assert $page) => $page->where('summary.total', 2)->where('summary.verified', 2)->where('pickups.total', 2));
    $this->get(route('pickup-results.show', $tasks[0]))->assertOk()->assertInertia(fn (Assert $page) => $page->component('pickup-result-detail')->where('session', null)->where('result.finalized_at', fn ($date) => $date !== null)->where('capabilities.correct_pop', true));
});

test('filters use operational local schedule boundaries, stable sorting, search and pagination', function () {
    config(['pickup.timezone' => 'Asia/Jakarta']);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $staff = User::factory()->create(['role' => 'pickup_staff', 'name' => 'Petugas Utama']);
    $task = PickupTask::factory()->state(['scheduled_at' => now()])->create(['scheduled_at' => '2026-10-18 22:00:00', 'customer_name_snapshot' => 'Toko Target', 'assigned_staff_id' => $staff->id]);
    PickupTask::factory()->state(['scheduled_at' => now()])->create(['scheduled_at' => '2026-10-18 21:59:59', 'customer_name_snapshot' => 'Toko Target']);
    PickupTask::factory()->state(['scheduled_at' => now()])->create(['scheduled_at' => '2026-10-19 22:00:00', 'customer_name_snapshot' => 'Toko Target']);
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup', 'date_from' => '2026-10-19', 'date_to' => '2026-10-19', 'customer' => 'Target', 'staff' => 'Utama', 'pop_status' => 'incomplete', 'visit_outcome' => 'not_visited', 'handover_status' => 'none', 'verification_status' => 'none', 'q' => $task->reference]))
        ->assertOk()->assertInertia(fn (Assert $page) => $page->where('summary.total', 1)->where('pickups.data.0.id', $task->id)->where('pickups.data.0.scheduled_at', '2026-10-18T22:00:00+00:00'));
    PickupTask::factory()->state(['scheduled_at' => now()])->count(21)->create(['customer_name_snapshot' => 'Pagination']);
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'customer' => 'Pagination', 'per_page' => 10, 'page' => 2, 'sort' => 'reference', 'direction' => 'asc']))->assertInertia(fn (Assert $page) => $page->where('pickups.total', 21)->where('pickups.current_page', 2)->has('pickups.data', 10)->where('pickups.next_page_url', fn ($url) => str_contains($url, 'customer=Pagination') && str_contains($url, 'sort=reference')));
    $this->getJson(route('pickup-results.index', ['monitoring' => 'pickup', 'sort' => 'password']))->assertUnprocessable();
    $this->getJson(route('pickup-results.index', ['monitoring' => 'pickup', 'date_from' => '2026-10-20', 'date_to' => '2026-10-19']))->assertUnprocessable();
});

test('admin-only results reject other roles and inactive administrators', function (string $role, bool $active) {
    $actor = User::factory()->create(['role' => $role, 'is_active' => $active]);
    $task = PickupTask::factory()->state(['scheduled_at' => now()])->create();
    $this->actingAs($actor)->get(route('pickup-results.index', ['monitoring' => 'pickup']))->assertForbidden();
    $this->get(route('pickup-results.show', $task))->assertForbidden();
})->with([['cs', true], ['retail_staff', true], ['pickup_staff', true], ['admin_supervisor', false]]);

test('detail preserves verification baseline and chronological existing audit after POP revision', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->state(['scheduled_at' => now()])->create(['status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'staff_id' => $admin->id]);
    $session = app(CreateSession::class)->handle($admin, [$task->id], (string) Str::uuid());
    app(VerifyItem::class)->handle($admin, $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0]);
    $proof->revisions()->create(['revision' => 1, 'values' => ['manual_hybrid' => 5], 'actor_id' => $admin->id, 'reason' => 'Koreksi jumlah']);
    $this->actingAs($admin)->get(route('pickup-results.show', $task))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('result.needs_review', true)->where('session.items.0.verified_pickup.manual_hybrid', 2)
        ->where('session.items.0.pickup.manual_hybrid', 5)->where('session.items.0.verified_differences.manual_hybrid', 0)
        ->where('capabilities.close', false)->where('capabilities.correct_verification', true)
        ->where('task.proof.original.manual_hybrid', 2)->where('task.proof.manual_hybrid', 5)->has('timeline', 4)
        ->where('actors.'.$admin->id, $admin->name));
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'verification_status' => 'review']))->assertInertia(fn (Assert $page) => $page->where('summary.unverified', 1)->where('summary.verified', 0));
});

test('detail uses authenticated evidence routes without revealing private storage paths', function () {
    Storage::fake('local');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->state(['scheduled_at' => now()])->create(['status' => 'PICKED_UP']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $file = $proof->attachments()->create(['kind' => 'signature', 'path' => 'private/pop/signature.png', 'mime_type' => 'image/png', 'size' => 8]);
    Storage::disk('local')->put($file->path, 'evidence');
    $this->actingAs($admin)->get(route('pickup-results.show', $task))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('task.proof.attachments.0.url', route('api.evidence', $file))->missing('task.proof.attachments.0.path'));
    $this->get(route('api.evidence', $file))->assertOk()->assertHeader('Cache-Control', 'no-store, private');
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']))->get(route('api.evidence', $file))->assertNotFound();
    $this->app['auth']->forgetGuards();
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup']))->assertRedirect(route('login'));
});

test('latest visit and effective verification corrections filter without counting historical rows twice', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->state(['scheduled_at' => now()])->create(['status' => 'PICKED_UP']);
    PickupVisit::factory()->create(['pickup_task_id' => $task->id, 'outcome' => 'NO_PACKAGES', 'recorded_at' => now()->subDay()]);
    PickupVisit::factory()->create(['pickup_task_id' => $task->id, 'outcome' => 'COLLECTED', 'recorded_at' => now()]);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $session = app(CreateSession::class)->handle($admin, [$task->id], (string) Str::uuid());
    $item = $session->items()->sole();
    app(VerifyItem::class)->handle($admin, $session->id, $item->id, ['expected_version' => 1, 'manual_hybrid' => 4, 'cashless_hybrid' => 1, 'css_orion' => 0, 'discrepancy_notes' => 'Lebih']);
    app(CorrectVerification::class)->handle($admin, $session->id, $item->id, ['expected_version' => 2, 'reason' => 'Hitung ulang', 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0]);
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup', 'visit_outcome' => 'COLLECTED', 'discrepancy_status' => 'no', 'verification_status' => 'verified']))->assertInertia(fn (Assert $page) => $page->where('summary.total', 1)->where('summary.discrepancy', 0)->where('pickups.data.0.verification_status', 'VERIFIED'));
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'visit_outcome' => 'NO_PACKAGES']))->assertInertia(fn (Assert $page) => $page->where('summary.total', 0));
});

test('monitoring query count stays constant as page size grows and ordering is deterministic', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $tasks = PickupTask::factory()->state(['scheduled_at' => now()])->count(51)->create(['customer_name_snapshot' => 'Query Budget', 'scheduled_at' => '2026-10-19 01:00:00']);
    $this->actingAs($admin);
    DB::enableQueryLog();
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'per_page' => 10, 'direction' => 'asc']))->assertInertia(fn (Assert $page) => $page->where('pickups.data.0.id', $tasks->first()->id)->where('pickups.data.9.id', $tasks[9]->id));
    $small = count(DB::getQueryLog());
    DB::flushQueryLog();
    $this->get(route('pickup-results.index', ['monitoring' => 'pickup', 'per_page' => 50, 'direction' => 'asc']))->assertInertia(fn (Assert $page) => $page->has('pickups.data', 50));
    $large = count(DB::getQueryLog());
    DB::disableQueryLog();
    expect($large)->toBe($small)->toBeLessThanOrEqual(13);
});

test('admin detail exposes only eligible actions throughout existing verification closure and reopen workflows', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->state(['scheduled_at' => now()])->create(['status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $session = app(CreateSession::class)->handle($admin, [$task->id], (string) Str::uuid());
    $item = $session->items()->sole();
    $detail = route('pickup-results.show', $task);
    $this->actingAs($admin)->get($detail)->assertInertia(fn (Assert $page) => $page->where('capabilities.verify', true)->where('capabilities.close', false)->where('capabilities.correct_verification', false)->where('capabilities.reopen', false));
    $this->postJson(route('api.handovers.verify', [$session, $item->id]), ['expected_version' => 1, 'expected_pickup_revision' => 0, 'manual_hybrid' => 4, 'cashless_hybrid' => 1, 'css_orion' => 0])->assertUnprocessable()->assertJsonValidationErrors('discrepancy_notes');
    $this->postJson(route('api.handovers.verify', [$session, $item->id]), ['expected_version' => 1, 'expected_pickup_revision' => 0, 'manual_hybrid' => 4, 'cashless_hybrid' => 1, 'css_orion' => 0, 'discrepancy_notes' => 'Fisik lebih dua'])->assertOk();
    $this->get($detail)->assertInertia(fn (Assert $page) => $page->where('capabilities.verify', false)->where('capabilities.close', true)->where('capabilities.correct_verification', true)->where('result.verification_status', 'DISCREPANCY')->where('session.status', 'IN_VERIFICATION'));
    $this->postJson(route('api.handovers.correct', [$session, $item->id]), ['expected_version' => 1, 'reason' => 'Stale form', 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0])->assertConflict();
    $this->postJson(route('api.handovers.close', $session), ['expected_version' => 2])->assertOk();
    $this->get($detail)->assertInertia(fn (Assert $page) => $page->where('capabilities.close', false)->where('capabilities.reopen', true)->where('capabilities.correct_verification', false)->where('session.status', 'CLOSED'));
    $this->postJson(route('api.handovers.reopen', $session), ['expected_version' => 3, 'reason' => 'Tinjau hasil fisik'])->assertOk();
    $this->postJson(route('api.handovers.correct', [$session, $item->id]), ['expected_version' => 4, 'reason' => 'Hitung ulang', 'manual_hybrid' => 1, 'cashless_hybrid' => 1, 'css_orion' => 0, 'discrepancy_notes' => 'Fisik kurang satu'])->assertOk();
    $this->get($detail)->assertInertia(fn (Assert $page) => $page->where('session.items.0.original_retail.manual_hybrid', 4)->where('session.items.0.retail.manual_hybrid', 1)->where('session.items.0.verified_differences.manual_hybrid', -1)->where('capabilities.close', true)->has('session.items.0.revisions', 1));
    expect($item->fresh()->manual_hybrid)->toBe(4);
    $this->assertDatabaseHas('handover_events', ['handover_session_id' => $session->id, 'action' => 'reopened', 'actor_id' => $admin->id, 'reason' => 'Tinjau hasil fisik']);
});

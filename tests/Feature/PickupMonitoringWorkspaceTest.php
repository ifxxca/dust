<?php

use App\Actions\Handover\CloseSession;
use App\Actions\Handover\CreateSession;
use App\Actions\Handover\VerifyItem;
use App\Models\CashlessEntryBatch;
use App\Models\CashlessEntryItem;
use App\Models\PickupCashlessAwb;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\PickupVisit;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

test('monitoring shows only the selected books active scanned AWBs with pagination and supervisor authorization', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create();
    PickupCashlessAwb::factory()->count(51)->create(['pickup_task_id' => $task->id, 'created_by' => $admin->id]);
    PickupCashlessAwb::factory()->create(['pickup_task_id' => $task->id, 'awb' => null]);
    $foreign = PickupCashlessAwb::factory()->create();
    $url = route('pickup-results.quick', [$task, 'view' => 'cashless']);

    $this->actingAs($admin)->getJson($url)->assertOk()->assertHeader('Cache-Control', 'no-store, private')
        ->assertJsonPath('task.id', $task->id)->assertJsonPath('awbs.total', 51)->assertJsonCount(50, 'awbs.data')
        ->assertJsonMissing(['awb' => $foreign->awb])->assertJsonMissingPath('awbs.data.0.raw_awb')->assertJsonMissingPath('processing');
    $this->getJson($url.'&awb_page=2')->assertOk()->assertJsonCount(1, 'awbs.data');
    $this->getJson($url.'&awb_page=0')->assertUnprocessable();
    $empty = PickupTask::factory()->create();
    $this->getJson(route('pickup-results.quick', [$empty, 'view' => 'cashless']))->assertOk()->assertJsonCount(0, 'awbs.data');
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']))->getJson($url)->assertForbidden();
    $admin->update(['is_active' => false]);
    $this->actingAs($admin)->getJson($url)->assertForbidden();
});

beforeEach(function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-19 05:00:00', 'UTC'));
});

test('scanned AWBs show their latest matching processing attempt without leaking another pickup or old connote result', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create();
    $awbs = PickupCashlessAwb::factory()->count(4)->create(['pickup_task_id' => $task->id]);
    $failed = CashlessEntryBatch::factory()->create(['pickup_task_id' => $task->id, 'status' => 'FAILED']);
    $done = CashlessEntryBatch::factory()->create(['pickup_task_id' => $task->id, 'status' => 'DONE', 'ho_number' => 'HO-OK', 'approved_at' => now()]);
    CashlessEntryItem::factory()->create(['batch_id' => $failed->id, 'pickup_cashless_awb_id' => $awbs[0]->id, 'awb' => $awbs[0]->awb, 'status' => 'NOT_FOUND', 'message' => 'Kesalahan lama']);
    CashlessEntryItem::factory()->create(['batch_id' => $done->id, 'pickup_cashless_awb_id' => $awbs[0]->id, 'awb' => $awbs[0]->awb, 'status' => 'ACCEPTED']);
    CashlessEntryItem::factory()->create(['batch_id' => $failed->id, 'pickup_cashless_awb_id' => $awbs[1]->id, 'awb' => $awbs[1]->awb, 'status' => 'ORION_REJECTED', 'message' => 'Sudah dientry di Orion']);
    CashlessEntryItem::factory()->create(['batch_id' => $done->id, 'pickup_cashless_awb_id' => $awbs[2]->id, 'awb' => 'OLD-CONNOTE', 'status' => 'ACCEPTED']);
    CashlessEntryItem::factory()->create(['pickup_cashless_awb_id' => $awbs[3]->id, 'awb' => $awbs[3]->awb, 'status' => 'ACCEPTED']);

    $this->actingAs($admin)->getJson(route('pickup-results.quick', [$task, 'view' => 'cashless']))
        ->assertOk()->assertJsonCount(4, 'awbs.data')->assertJsonPath('awbs.total', 4)
        ->assertJsonPath('awbs.data.0.entry.status', 'ACCEPTED')->assertJsonPath('awbs.data.0.entry.batch_status', 'DONE')
        ->assertJsonPath('awbs.data.0.entry.ho_number', 'HO-OK')->assertJsonPath('awbs.data.0.entry.batch_id', $done->id)
        ->assertJsonPath('awbs.data.1.entry.status', 'ORION_REJECTED')->assertJsonPath('awbs.data.1.entry.message', 'Sudah dientry di Orion')
        ->assertJsonPath('awbs.data.2.entry', null)->assertJsonPath('awbs.data.3.entry', null);
});

test('attention queues include older unfinished visits and POP while excluding future and terminal visits', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $old = PickupTask::factory()->create(['scheduled_at' => now()->subDays(3), 'customer_name_snapshot' => 'Antrean Lama']);
    $empty = PickupTask::factory()->create(['scheduled_at' => now(), 'status' => 'NO_PACKAGES']);
    PickupVisit::factory()->create(['pickup_task_id' => $empty->id, 'outcome' => 'NO_PACKAGES', 'recorded_at' => now()]);
    PickupTask::factory()->create(['scheduled_at' => now(), 'status' => 'CANCELLED']);
    PickupTask::factory()->create(['scheduled_at' => now()->addDay()]);
    $earlyFinal = PickupTask::factory()->create(['scheduled_at' => now()->addDay(), 'status' => 'PICKED_UP']);
    PickupRecord::factory()->create(['pickup_task_id' => $earlyFinal->id]);
    $earlyVisit = PickupTask::factory()->create(['scheduled_at' => now()->addDay(), 'status' => 'ASSIGNED']);
    PickupVisit::factory()->create(['pickup_task_id' => $earlyVisit->id, 'outcome' => 'COLLECTED', 'recorded_at' => now()]);
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup']))->assertInertia(fn (Assert $page) => $page->where('queues.not_visited', 1)->where('queues.incomplete', 2)->where('queues.waiting_handover', 1)->where('pickups.total', 4));
    $filters = ['monitoring' => 'pickup', 'scope' => 'outstanding', 'pickup_queue' => 'not_visited'];
    $this->get(route('pickup-results.index', $filters))->assertInertia(fn (Assert $page) => $page->where('pickups.total', 1)->where('pickups.data.0.id', $old->id)->where('filters.date_from', '2026-10-19'));
    $csv = $this->get(route('pickup-results.export', $filters))->assertOk()->streamedContent();
    expect($csv)->toContain($old->reference)->toContain('outstanding')->toContain('Asia/Jakarta');
    $this->get(route('pickup-results.index', [...$filters, 'pickup_queue' => 'waiting_handover']))->assertInertia(fn (Assert $page) => $page->where('pickups.total', 1)->where('pickups.data.0.id', $earlyFinal->id));
    $this->get(route('pickup-results.index', [...$filters, 'q' => 'tidak ditemukan']))->assertInertia(fn (Assert $page) => $page->where('queues.not_visited', 0)->where('pickups.total', 0));
    $this->getJson(route('pickup-results.index', ['pickup_queue' => 'invented']))->assertUnprocessable();
});

test('queue totals and filtered CSV use effective verification including review and closed discrepancies', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $tasks = PickupTask::factory()->count(4)->create(['scheduled_at' => now()->subDays(2), 'status' => 'PICKED_UP']);
    foreach ($tasks as $task) {
        PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'finalized_at' => now()->subDays(2), 'picked_up_at' => now()->subDays(2)]);
    }
    foreach ([1, 2, 3] as $index) {
        $session = app(CreateSession::class)->handle($admin, [$tasks[$index]->id], (string) Str::uuid());
        if ($index === 1) {
            continue;
        }
        $session = app(VerifyItem::class)->handle($admin, $session->id, $session->items()->sole()->id, ['expected_version' => 1, 'manual_hybrid' => $index === 2 ? 2 : 5, 'cashless_hybrid' => 1, 'css_orion' => 0, 'discrepancy_notes' => 'Lebih tiga']);
        if ($index === 2) {
            $tasks[$index]->proof->revisions()->create(['revision' => 1, 'values' => ['manual_hybrid' => 4], 'actor_id' => $admin->id, 'reason' => 'Jumlah POP dikoreksi']);
        } else {
            app(CloseSession::class)->handle($admin, $session->id, 2);
        }
    }
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup']))->assertInertia(fn (Assert $page) => $page->where('pickups.total', 0)->where('queues.waiting_handover', 1)->where('queues.unverified', 2)->where('queues.discrepancy', 1));
    $filters = ['monitoring' => 'pickup', 'scope' => 'outstanding', 'pickup_queue' => 'unverified'];
    $this->get(route('pickup-results.index', $filters))->assertInertia(fn (Assert $page) => $page->where('pickups.total', 2)->where('summary.unverified', 2));
    $csv = $this->get(route('pickup-results.export', $filters))->assertOk()->streamedContent();
    expect($csv)->toContain($tasks[1]->reference)->toContain($tasks[2]->reference)->not->toContain($tasks[3]->reference);
    $this->getJson(route('pickup-results.quick', [$tasks[2], 'view' => 'pickup']))->assertOk()->assertJsonPath('result.needs_review', true)->assertJsonPath('proof.manual_hybrid', 4)->assertJsonPath('handover.verified_pickup_revision', 0)->assertJsonPath('handover.differences.manual_hybrid', 0)->assertJsonPath('capabilities.correct_verification', true);
    $this->getJson(route('pickup-results.quick', [$tasks[3], 'view' => 'pickup']))->assertOk()->assertJsonPath('result.verification_status', 'DISCREPANCY')->assertJsonPath('handover.status', 'CLOSED')->assertJsonPath('handover.total_received', 6)->assertJsonPath('handover.differences.manual_hybrid', 3)->assertJsonPath('capabilities.verify', false)->assertJsonPath('capabilities.correct_verification', false);
});

test('pickup quick detail returns latest visit and protected evidence metadata without audit or private paths', function () {
    Storage::fake('local');
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create(['scheduled_at' => now(), 'status' => 'PICKED_UP']);
    PickupVisit::factory()->create(['pickup_task_id' => $task->id, 'outcome' => 'NO_PACKAGES', 'reason' => 'Tutup', 'recorded_at' => now()->subDay()]);
    PickupVisit::factory()->create(['pickup_task_id' => $task->id, 'outcome' => 'COLLECTED', 'notes' => 'Dua karung', 'recorded_at' => now()]);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id]);
    $file = $proof->attachments()->create(['kind' => 'signature', 'path' => 'private/signature.png', 'mime_type' => 'image/png', 'size' => 8]);
    Storage::disk('local')->put($file->path, 'evidence');
    $this->actingAs($admin)->getJson(route('pickup-results.quick', [$task, 'view' => 'pickup']))->assertOk()->assertHeader('Cache-Control', 'no-store, private')->assertJsonPath('visit.outcome', 'COLLECTED')->assertJsonPath('visit.notes', 'Dua karung')->assertJsonPath('proof.revision', 0)->assertJsonPath('proof.attachments.0.url', route('api.evidence', $file))->assertJsonPath('capabilities.correct_pop', true)->assertJsonPath('handover', null)->assertJsonMissingPath('timeline')->assertJsonMissingPath('proof.attachments.0.path')->assertJsonMissingPath('proof.contact')->assertJsonMissingPath('processing');
    $this->get(route('api.evidence', $file))->assertOk();
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']))->getJson(route('pickup-results.quick', [$task, 'view' => 'pickup']))->assertForbidden();
    $this->get(route('api.evidence', $file))->assertNotFound();
    $this->assertDatabaseCount('pickup_record_revisions', 0);
});

test('pickup quick detail distinguishes no visit and no packages without fabricated POP', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $task = PickupTask::factory()->create();
    $this->actingAs($admin)->getJson(route('pickup-results.quick', [$task, 'view' => 'pickup']))->assertOk()->assertJsonPath('visit', null)->assertJsonPath('proof', null)->assertJsonPath('capabilities.correct_pop', false)->assertJsonPath('capabilities.verify', false);
    $empty = PickupTask::factory()->create(['status' => 'NO_PACKAGES']);
    PickupVisit::factory()->create(['pickup_task_id' => $empty->id, 'outcome' => 'NO_PACKAGES', 'reason' => 'Paket belum siap', 'recorded_at' => now()]);
    $this->getJson(route('pickup-results.quick', [$empty, 'view' => 'pickup']))->assertOk()->assertJsonPath('visit.outcome', 'NO_PACKAGES')->assertJsonPath('visit.reason', 'Paket belum siap')->assertJsonPath('proof', null);
    $this->getJson(route('pickup-results.quick', [$task, 'view' => 'unknown']))->assertUnprocessable();
    $this->getJson(route('pickup-results.quick', [999999, 'view' => 'pickup']))->assertNotFound();
});

test('monitoring staff choices include historical assignees without exposing unrelated users', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $historical = User::factory()->create(['name' => 'Archived courier', 'role' => 'pickup_staff', 'is_active' => false]);
    User::factory()->create(['role' => 'pickup_staff']);
    PickupTask::factory()->create(['assigned_staff_id' => $historical->id]);

    $this->actingAs($admin)->get(route('pickup-results.index'))->assertOk()
        ->assertInertia(fn (Assert $page) => $page->has('staffOptions', 1)
            ->where('staffOptions.0.id', $historical->id)->where('staffOptions.0.name', 'Archived courier')
            ->missing('staffOptions.0.email'));
});

test('selected pickup export stays within the active date and identity filters', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $chosen = PickupTask::factory()->create(['scheduled_at' => '2026-10-26 06:00:00']);
    $unselected = PickupTask::factory()->create(['customer_id' => $chosen->customer_id, 'scheduled_at' => '2026-10-26 07:00:00']);
    $outside = PickupTask::factory()->create(['customer_id' => $chosen->customer_id, 'scheduled_at' => '2026-10-24 06:00:00']);
    $otherCustomer = PickupTask::factory()->create(['scheduled_at' => '2026-10-26 07:00:00']);

    $csv = $this->actingAs($admin)->get(route('pickup-results.export', [
        'date_from' => '2026-10-26', 'date_to' => '2026-10-26', 'customer_id' => $chosen->customer_id,
        'selected_ids' => [$chosen->id, $outside->id, $otherCustomer->id],
    ]))->assertOk()->streamedContent();

    expect($csv)->toContain($chosen->reference)->not->toContain($unselected->reference)->not->toContain($outside->reference)->not->toContain($otherCustomer->reference);
});

test('primary activity and cohort cards remain distinct from selected state filters and drawer state never spreads into pagination', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    PickupTask::factory()->count(11)->create(['scheduled_at' => now()]);
    $this->actingAs($admin)->get(route('pickup-results.index', ['monitoring' => 'pickup', 'per_page' => 10, 'quick_pickup' => 1, 'pop_status' => 'incomplete']))->assertInertia(fn (Assert $page) => $page->where('operations.activity.scheduled', 11)->where('overview.total', 11)->where('summary.incomplete', 11)->where('pickups.next_page_url', fn ($url) => ! str_contains($url, 'quick_pickup=')));
});

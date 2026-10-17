<?php

use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;

test('category monitoring shows only differing categories with signed quantities and retains closed sessions', function () {
    $staff = User::factory()->create(['role' => 'retail_staff', 'name' => 'Petugas Test']);
    $task = PickupTask::factory()->create(['status' => 'PICKED_UP', 'assigned_staff_id' => $staff->id]);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'manual_hybrid' => 10, 'cashless_hybrid' => 5, 'css_orion' => 3]);
    $session = HandoverSession::factory()->create(['status' => 'CLOSED']);
    $session->items()->create(['pickup_task_id' => $task->id, 'pickup_record_id' => $proof->id, 'status' => 'DISCREPANCY', 'manual_hybrid' => 9, 'cashless_hybrid' => 6, 'css_orion' => 3, 'discrepancy_notes' => 'Kategori berbeda meskipun total sesuai', 'verified_at' => now()]);
    $url = route('api.discrepancies.index', ['view' => 'categories', 'summary' => 1]);
    $this->actingAs($staff)->getJson($url)->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('meta.total', 2)
        ->assertJsonPath('data.0.category', 'cashless_hybrid')->assertJsonPath('data.0.pickup_quantity', 5)->assertJsonPath('data.0.received_quantity', 6)->assertJsonPath('data.0.difference', 1)
        ->assertJsonPath('data.1.category', 'manual_hybrid')->assertJsonPath('data.1.difference', -1)->assertJsonPath('data.1.session_status', 'CLOSED')
        ->assertJsonPath('data.1.pickup_address', $proof->pickup_address)->assertJsonPath('data.1.staff_name', 'Petugas Test')
        ->assertJsonPath('summary', ['active' => 0, 'closed' => 1, 'discrepancies' => 1])->assertJsonMissingPath('data.0.contact')->assertJsonMissingPath('data.0.attachments');
    $this->getJson(route('api.discrepancies.index'))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 1);
    expect($session->fresh()->status)->toBe('CLOSED');
});

test('category monitoring uses latest corrections and flags stale verification without overwriting originals', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $proof = PickupRecord::factory()->create(['manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0]);
    $session = HandoverSession::factory()->create(['status' => 'IN_VERIFICATION']);
    $item = $session->items()->create(['pickup_task_id' => $proof->pickup_task_id, 'pickup_record_id' => $proof->id, 'status' => 'VERIFIED', 'manual_hybrid' => 2, 'cashless_hybrid' => 1, 'css_orion' => 0, 'verified_at' => now()]);
    $item->revisions()->create(['revision' => 1, 'pickup_revision' => 0, 'actor_id' => $admin->id, 'reason' => 'Angka fisik salah', 'values' => ['manual_hybrid' => 1, 'status' => 'DISCREPANCY', 'discrepancy_notes' => 'Satu paket kurang']]);
    $proof->revisions()->create(['revision' => 1, 'actor_id' => $admin->id, 'reason' => 'Jumlah pickup salah', 'values' => ['manual_hybrid' => 4, 'customer_name' => 'Customer Terkoreksi', 'pickup_address' => 'Alamat Terkoreksi']]);
    $url = route('api.discrepancies.index', ['view' => 'categories', 'review_only' => 1]);
    $this->actingAs($admin)->getJson($url)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.pickup_quantity', 4)->assertJsonPath('data.0.received_quantity', 1)
        ->assertJsonPath('data.0.difference', -3)->assertJsonPath('data.0.needs_review', true)->assertJsonPath('data.0.customer_name', 'Customer Terkoreksi');
    $this->getJson(route('api.discrepancies.index', ['view' => 'categories', 'q' => 'Alamat Terkoreksi']))->assertOk()->assertJsonPath('meta.total', 1);
    $item->revisions()->create(['revision' => 2, 'pickup_revision' => 1, 'actor_id' => $admin->id, 'reason' => 'Pemeriksaan ulang', 'values' => ['manual_hybrid' => 4, 'status' => 'VERIFIED']]);
    $this->getJson($url)->assertOk()->assertJsonPath('meta.total', 0);
    expect($proof->fresh()->manual_hybrid)->toBe(2);
    expect($item->fresh()->manual_hybrid)->toBe(2);
});

test('monitoring searches display references staff and addresses and filters categories and local verification dates', function () {
    config(['pickup.timezone' => 'Asia/Jakarta']);
    $staff = User::factory()->create(['role' => 'pickup_staff', 'name' => 'Operator Unik']);
    $other = User::factory()->create(['role' => 'retail_staff']);
    $task = PickupTask::factory()->create(['assigned_staff_id' => $staff->id, 'pickup_address' => 'Alamat Unik%']);
    $proof = PickupRecord::factory()->create(['pickup_task_id' => $task->id, 'pickup_address' => 'Alamat Unik%', 'customer_name' => 'Customer Unik']);
    $session = HandoverSession::factory()->create(['status' => 'CLOSED']);
    $session->items()->create(['pickup_task_id' => $task->id, 'pickup_record_id' => $proof->id, 'status' => 'DISCREPANCY', 'manual_hybrid' => 1, 'cashless_hybrid' => 1, 'css_orion' => 0, 'verified_at' => '2026-10-12 17:30:00']);
    $this->actingAs($staff);
    foreach (['HO-'.str_pad((string) $session->id, 4, '0', STR_PAD_LEFT), 'PCK-'.str_pad((string) $task->id, 4, '0', STR_PAD_LEFT), $session->reference, $task->reference, 'Operator Unik', 'Customer Unik', 'Alamat Unik%'] as $search) {
        $this->getJson(route('api.discrepancies.index', ['view' => 'categories', 'q' => $search]))->assertOk()->assertJsonPath('meta.total', 1);
    }
    $this->getJson(route('api.discrepancies.index', ['view' => 'categories', 'category' => 'manual_hybrid', 'staff_id' => $staff->id, 'session_status' => 'CLOSED', 'date_from' => '2026-10-13', 'date_to' => '2026-10-13']))->assertOk()->assertJsonPath('meta.total', 1);
    foreach (['category' => 'css_orion', 'staff_id' => $other->id, 'session_status' => 'IN_VERIFICATION', 'q' => "%' OR 1=1 --", 'date_to' => '2026-10-12'] as $key => $value) {
        $this->getJson(route('api.discrepancies.index', ['view' => 'categories', $key => $value]))->assertOk()->assertJsonPath('meta.total', 0);
    }
});

test('category monitoring paginates category rows rather than tasks without duplicate rows between pages', function () {
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $session = HandoverSession::factory()->create(['status' => 'IN_VERIFICATION']);
    foreach (range(1, 12) as $number) {
        $proof = PickupRecord::factory()->create(['manual_hybrid' => 2, 'cashless_hybrid' => 2, 'css_orion' => 2]);
        $session->items()->create(['pickup_task_id' => $proof->pickup_task_id, 'pickup_record_id' => $proof->id, 'status' => 'DISCREPANCY', 'manual_hybrid' => 1, 'cashless_hybrid' => 1, 'css_orion' => 1, 'verified_at' => now()]);
    }
    $firstPage = $this->actingAs($admin)->getJson(route('api.discrepancies.index', ['view' => 'categories', 'per_page' => 10]))
        ->assertOk()->assertJsonCount(10, 'data')->assertJsonPath('meta.total', 36)->assertJsonPath('meta.last_page', 4)->assertJsonPath('meta.from', 1)->assertJsonPath('meta.to', 10);
    $secondPage = $this->getJson(route('api.discrepancies.index', ['view' => 'categories', 'per_page' => 10, 'page' => 2]))->assertOk()->assertJsonCount(10, 'data');
    $keys = fn (array $rows) => array_map(fn (array $row) => $row['id'].'-'.$row['category'], $rows);
    expect(array_intersect($keys($firstPage->json('data')), $keys($secondPage->json('data'))))->toBeEmpty();
    $this->getJson(route('api.discrepancies.index', ['view' => 'categories', 'per_page' => 10, 'page' => 4]))
        ->assertOk()->assertJsonCount(6, 'data')->assertJsonPath('meta.from', 31)->assertJsonPath('meta.to', 36);
});

test('monitoring refuses invalid filters with 422', function (array $query, string $field) {
    $staff = User::factory()->create(['role' => 'retail_staff']);
    $this->actingAs($staff)->getJson(route('api.discrepancies.index', ['view' => 'categories', ...$query]))->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    'unknown category' => [['category' => 'awb'], 'category'],
    'unsupported page size' => [['per_page' => 10000], 'per_page'],
    'unknown view' => [['view' => 'all-data'], 'view'],
    'invalid staff' => [['staff_id' => -1], 'staff_id'],
    'invalid review option' => [['review_only' => 'yes'], 'review_only'],
    'reversed dates' => [['date_from' => '2026-10-14', 'date_to' => '2026-10-13'], 'date_to'],
]);

test('category monitoring remains authenticated and inaccessible to CS with 403', function () {
    $url = route('api.discrepancies.index', ['view' => 'categories', 'summary' => 1]);
    $this->getJson($url)->assertUnauthorized();
    $this->actingAs(User::factory()->create(['role' => 'cs']))->getJson($url)->assertForbidden();
    $this->get(route('discrepancies'))->assertForbidden();
    $this->actingAs(User::factory()->create(['role' => 'pickup_staff']))->getJson($url)->assertOk();
});

<?php

namespace App\Actions\Pickup;

use App\Actions\Handover\CompareQuantities;
use App\Models\Customer;
use App\Models\HandoverSession;
use App\Models\PickupRecord;
use App\Models\PickupTask;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ImportPickupHistory
{
    public function __construct(private CompareQuantities $compareQuantities) {}

    /**
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function handle(array $input, int $actorId, bool $apply = false, bool $archiveCustomers = false, bool $followMaster = false): array
    {
        if ($archiveCustomers && $followMaster) {
            throw ValidationException::withMessages(['customers' => 'Pilih mengikuti master atau membuat arsip terpisah.']);
        }
        $data = Validator::make($input, [
            'source_name' => ['required', 'string', 'max:200'],
            'source_sha256' => ['required', 'regex:/^[a-f0-9]{64}$/'],
            'rows' => ['required', 'array', 'min:1', 'max:5000'],
            'rows.*.row' => ['required', 'integer', 'min:2'],
            'rows.*.reference' => ['required', 'string', 'max:26', 'distinct:strict'],
            'rows.*.type' => ['required', Rule::in(['Pickup', 'Member Direct', 'Walk-In'])],
            'rows.*.customer_code' => ['present', 'nullable', 'string', 'max:64'],
            'rows.*.customer_name' => ['required', 'string', 'max:255'],
            'rows.*.staff' => ['required', 'string', 'max:255', 'not_in:-'],
            'rows.*.quantities' => ['required', 'array', 'list', 'size:3'],
            'rows.*.quantities.*' => ['required', 'integer', 'min:0', 'max:1000000'],
            'rows.*.total' => ['required', 'integer', 'min:0', 'max:3000000'],
            'rows.*.verified' => ['required', 'boolean'],
            'rows.*.verifier' => ['required_if:rows.*.verified,true', 'nullable', 'string', 'max:255', 'not_in:-'],
            'rows.*.warehouse' => ['required_if:rows.*.verified,true', 'nullable', 'array', 'list', 'size:3'],
            'rows.*.warehouse.*' => ['required', 'integer', 'min:0', 'max:1000000'],
            'rows.*.warehouse_total' => ['required_if:rows.*.verified,true', 'nullable', 'integer', 'min:0', 'max:3000000'],
            'rows.*.picked_up_at' => ['required', 'date_format:Y-m-d H:i:s'],
            'rows.*.raw' => ['required', 'array', 'max:30'],
        ])->validate();
        foreach ($data['rows'] as $row) {
            if (array_sum($row['quantities']) !== $row['total'] || ($row['verified'] && array_sum($row['warehouse']) !== $row['warehouse_total'])) {
                throw ValidationException::withMessages(['rows' => 'Total kategori tidak sesuai pada baris '.$row['row'].'.']);
            }
        }

        return Model::withoutEvents(fn (): array => DB::transaction(function () use ($data, $actorId, $apply, $archiveCustomers, $followMaster): array {
            $actor = User::whereKey($actorId)->lockForUpdate()->firstOrFail();
            abort_unless($actor->is_active && $actor->role === 'admin_supervisor', 403);
            $customers = Customer::orderBy('id')->lockForUpdate()->get()->keyBy('customer_code');
            $users = User::orderBy('id')->get()->groupBy(fn (User $user): string => $this->normalize($user->name));
            $existing = PickupTask::with('events')->whereIn('reference', array_column($data['rows'], 'reference'))->lockForUpdate()->get()->keyBy('reference');
            $summary = ['source_rows' => count($data['rows']), 'pickups_new' => 0, 'pickups_existing' => 0, 'pickups_held' => 0,
                'conflicts' => 0, 'customers_archived' => 0, 'users_archived' => 0, 'total_awb' => 0,
                'manual_hybrid' => 0, 'cashless_hybrid' => 0, 'css_orion' => 0, 'warehouse_verified' => 0, 'warehouse_discrepancies' => 0, 'zero_quantity_rows' => 0];
            $issues = [];
            $plannedCustomers = [];
            $plannedUsers = [];
            $sessions = [];
            foreach ($data['rows'] as $row) {
                $fingerprint = hash('sha256', json_encode($row, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
                $marker = 'row_sha256='.$fingerprint;
                if ($task = $existing->get($row['reference'])) {
                    $same = $task->events->contains(fn ($event): bool => $event->action === 'history_imported' && str_contains($event->reason ?? '', $marker));
                    $summary[$same ? 'pickups_existing' : 'conflicts']++;
                    if (! $same) {
                        $issues[] = ['row' => $row['row'], 'reference' => $row['reference'], 'kind' => 'EXISTING_REFERENCE_CONFLICT'];
                    }

                    continue;
                }
                $customer = $customers->get($row['customer_code']);
                if (! $customer || (! $followMaster && $this->normalize($customer->name) !== $this->normalize($row['customer_name']) && ! ($customer->customer_code === '00' && $this->normalize($row['customer_name']) === 'WALK-IN PM1'))) {
                    if (! $archiveCustomers) {
                        $summary['pickups_held']++;
                        $issues[] = ['row' => $row['row'], 'reference' => $row['reference'], 'kind' => 'CUSTOMER_IDENTITY_UNRESOLVED', 'name' => $row['customer_name']];

                        continue;
                    }
                    $archiveCode = 'HIST-'.substr(hash('sha256', $this->normalize((string) ($row['raw']['Kode Customer'] ?? '')).'|'.$this->normalize($row['customer_name'])), 0, 24);
                    $customer = $customers->get($archiveCode);
                    if (! $customer && ! isset($plannedCustomers[$archiveCode])) {
                        $summary['customers_archived']++;
                        $plannedCustomers[$archiveCode] = true;
                        if ($apply) {
                            $customer = Customer::create(['customer_code' => $archiveCode, 'name' => $row['customer_name'], 'pickup_address' => '', 'contact' => '',
                                'is_active' => false, 'created_by' => $actor->id, 'updated_by' => $actor->id]);
                            $customers->put($archiveCode, $customer);
                        }
                    }
                }
                $staff = $this->resolveUser($row['staff'], $users, $plannedUsers, $apply, $summary);
                $verifier = $row['verified'] ? $this->resolveUser($row['verifier'], $users, $plannedUsers, $apply, $summary) : null;
                $financeName = $row['raw']['Diverif Finance Oleh'] ?? null;
                if (is_string($financeName) && ! in_array(trim($financeName), ['', '-'], true)) {
                    $this->resolveUser($financeName, $users, $plannedUsers, $apply, $summary);
                }
                $pickup = $this->categories($row['quantities']);
                $warehouse = $row['verified'] ? $this->categories($row['warehouse']) : null;
                $comparison = $warehouse ? $this->compareQuantities->handle($pickup, $warehouse) : null;
                $summary['pickups_new']++;
                $summary['total_awb'] += $row['total'];
                foreach ($pickup as $key => $quantity) {
                    $summary[$key] += $quantity;
                }
                $summary['zero_quantity_rows'] += $row['total'] === 0 ? 1 : 0;
                $summary['warehouse_verified'] += $row['verified'] ? 1 : 0;
                $summary['warehouse_discrepancies'] += ($comparison['status'] ?? null) === 'DISCREPANCY' ? 1 : 0;
                if (! $apply) {
                    continue;
                }
                $timestamp = CarbonImmutable::createFromFormat('!Y-m-d H:i:s', $row['picked_up_at'], PickupResultPeriod::TIMEZONE)->utc();
                $notes = 'Impor riwayat '.$data['source_name'].' baris '.$row['row'].'. Waktu pickup dari sumber; waktu finalisasi adalah waktu impor. Foto, tanda tangan, waktu verifikasi dan penutupan tidak tersedia. Status finance/PDF berikut adalah riwayat sumber, bukan hasil rekonsiliasi atau pengiriman sistem baru.';
                $notes .= "\n".json_encode($row['raw'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
                $customerName = $followMaster ? $customer->name : $row['customer_name'];
                $task = PickupTask::create(['reference' => $row['reference'], 'customer_id' => $customer->id, 'customer_name_snapshot' => $customerName,
                    'pickup_address' => '', 'contact_snapshot' => '', 'scheduled_at' => $timestamp, 'notes' => $notes, 'status' => 'PICKED_UP',
                    'assigned_staff_id' => $staff->id, 'created_by' => $actor->id, 'version' => 1,
                    'pickup_type' => match ($row['type']) {
                        'Member Direct' => 'member_direct', 'Walk-In' => 'walk_in', default => 'on_demand'
                    }]);
                $proof = PickupRecord::create(['pickup_task_id' => $task->id, 'staff_id' => $staff->id, 'submission_key' => (string) Str::uuid(),
                    'customer_name' => $customerName, 'pickup_address' => '', 'contact' => '', ...$pickup,
                    'picked_up_at' => $timestamp, 'finalized_at' => now(), 'notes' => $notes]);
                $task->events()->create(['action' => 'history_imported', 'actor_id' => $actor->id, 'task_version' => 1, 'occurred_at' => now(),
                    'reason' => $marker.'; source_sha256='.$data['source_sha256'].'; row='.$row['row'].'; file='.$data['source_name'].'; identity='.($followMaster ? 'master' : 'source')]);
                if ($warehouse) {
                    $sessionKey = PickupResultPeriod::date($timestamp)->toDateString().'|'.$staff->id.'|'.$verifier->id;
                    if (! isset($sessions[$sessionKey])) {
                        $sessions[$sessionKey] = HandoverSession::create(['reference' => (string) Str::ulid(), 'submission_key' => (string) Str::uuid(),
                            'status' => 'IN_VERIFICATION', 'version' => 1, 'created_by' => $actor->id]);
                    }
                    $session = $sessions[$sessionKey];
                    $item = $session->items()->create(['pickup_task_id' => $task->id, 'pickup_record_id' => $proof->id, ...$warehouse,
                        'status' => $comparison['status'], 'verified_by' => $verifier->id, 'verified_pickup_revision' => 0,
                        'discrepancy_notes' => $comparison['status'] === 'DISCREPANCY' ? 'Selisih kategori kurir dan SPV pada file impor. Catatan sumber: '.($row['raw']['Catatan Verifikasi'] ?? '-') : null]);
                    $session->increment('version');
                    $session->events()->create(['handover_item_id' => $item->id, 'actor_id' => $actor->id, 'action' => 'history_imported',
                        'session_version' => $session->version, 'occurred_at' => now(), 'reason' => 'Kelompok impor berdasarkan hari operasional, kurir dan pemeriksa; bukan nomor sesi gudang asli. Waktu verifikasi tidak tersedia.',
                        'changes' => ['source_name' => $data['source_name'], 'row' => $row['row'], 'pickup' => $pickup, 'retail' => $warehouse, 'source' => $row['raw']]]);
                }
            }

            return ['source_name' => $data['source_name'], 'source_sha256' => $data['source_sha256'], 'applied' => $apply, 'summary' => $summary, 'issues' => $issues];
        }));
    }

    /**
     * @param  Collection<string, \Illuminate\Database\Eloquent\Collection<int, User>>  $users
     * @param  array<string, bool>  $planned
     * @param  array<string, int>  $summary
     */
    private function resolveUser(string $name, Collection $users, array &$planned, bool $apply, array &$summary): ?User
    {
        $key = $this->normalize($name);
        $matches = $users->get($key, collect());
        if ($matches->count() > 1) {
            throw ValidationException::withMessages(['staff' => 'Nama petugas ambigu: '.trim($name)]);
        }
        if ($matches->count() === 1) {
            return $matches->first();
        }
        if (! isset($planned[$key])) {
            $planned[$key] = true;
            $summary['users_archived']++;
        }
        if (! $apply) {
            return null;
        }
        $user = User::create(['name' => trim($name), 'email' => 'legacy-pickup-'.hash('sha256', $key).'@history.invalid',
            'password' => Str::random(64), 'role' => 'pickup_staff', 'is_active' => false]);
        $users->put($key, new \Illuminate\Database\Eloquent\Collection([$user]));

        return $user;
    }

    private function normalize(string $name): string
    {
        return mb_strtoupper(Str::squish($name));
    }

    /**
     * @param  list<int>  $values
     * @return array{manual_hybrid: int, cashless_hybrid: int, css_orion: int}
     */
    private function categories(array $values): array
    {
        return ['manual_hybrid' => $values[0], 'cashless_hybrid' => $values[1], 'css_orion' => $values[2]];
    }
}

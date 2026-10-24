<?php

namespace App\Actions\Reports;

use App\Models\Customer;
use App\Models\JneShipment;
use App\Models\JneShipmentMatchEvent;
use App\Models\PickupCashlessAwb;
use App\Models\PickupProcessingRecord;
use App\Models\PickupTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class ReviewJneExceptions
{
    /** @param array<string, mixed> $input */
    public function handle(User $actor, array $input): void
    {
        DB::transaction(function () use ($actor, $input): void {
            abort_unless(User::whereKey($actor->id)->where('is_active', true)->where('role', 'admin_supervisor')->lockForUpdate()->exists(), 403);
            abort_unless(config('jne-reports.evidence_policies_enabled'), 409, 'Review bukti belum diaktifkan.');
            $data = Validator::make($input, [
                'items' => ['required', 'array', 'min:1', 'max:100'], 'items.*.id' => ['required', 'integer', 'distinct'], 'items.*.version' => ['required', 'integer', 'min:1'],
                'group_key' => ['required', 'string', 'size:64'], 'reason' => ['required', 'string', 'max:500'], 'action' => ['required', Rule::in(['CONFIRM', 'RELEASE'])],
                'customer_id' => ['nullable', 'integer'], 'pickup_reference' => ['nullable', 'string', 'max:100'], 'category' => ['nullable', Rule::in(PickupProcessingRecord::CATEGORIES)],
            ])->validate();
            $rows = JneShipment::whereIn('id', array_column($data['items'], 'id'))->orderBy('id')->lockForUpdate()->get();
            abort_unless($rows->count() === count($data['items']), 404);
            $rows->load('sources.reportJob', 'latestSource', 'pickup', 'cashlessClaim');
            $versions = array_column($data['items'], 'version', 'id');
            foreach ($rows as $row) {
                abort_unless($row->version === (int) $versions[$row->id] && self::groupKey($row) === $data['group_key'], 409, 'Bukti atau kelompok berubah. Muat ulang; batch hanya untuk bukti setara.');
            }
            $customer = empty($data['customer_id']) ? null : Customer::whereKey($data['customer_id'])->where('is_active', true)->lockForUpdate()->firstOrFail();
            $task = empty($data['pickup_reference']) ? null : PickupTask::where('reference', $data['pickup_reference'])->whereHas('proof', fn ($query) => $query->whereNotNull('finalized_at'))->lockForUpdate()->firstOrFail();
            abort_if($task && $task->customer_id !== $customer?->id, 422, 'Customer dan pickup berbeda.');
            abort_if($data['action'] === 'CONFIRM' && ! $customer && empty($data['category']), 422, 'Pilih keputusan customer atau kategori.');
            abort_if(! empty($data['category']) && ! ResolveJneCategories::enabled(), 409, 'Klasifikasi kategori belum diaktifkan.');
            $matcher = app(MatchJneShipments::class);
            $candidates = $matcher->candidates($rows->map->latestSource->filter()->values());
            $claims = PickupCashlessAwb::whereIn('awb', $rows->pluck('awb'))->get()->keyBy('awb');
            foreach ($rows as $row) {
                $before = $row->only(['customer_id', 'customer_match_status', 'pickup_task_id', 'match_status', 'category', 'category_status', 'version']);
                if ($data['action'] === 'RELEASE') {
                    $row->fill(['match_method' => 'REFERENCE', 'customer_match_method' => 'NONE', 'identity_review_hash' => null, 'category_method' => null, 'category_review_hash' => null])->save();
                    app(ReevaluateJneAwbs::class)->handle([$row->awb]);
                    $row->refresh();
                } else {
                    $claim = $claims->get($row->awb);
                    abort_if($claim && (($customer && $claim->customer_id !== $customer->id) || ($task && $claim->pickup_task_id !== $task->id) || (! empty($data['category']) && $data['category'] !== 'cashless_hybrid')), 409, 'Keputusan bertentangan dengan Sertim aktif. Gunakan koreksi Sertim yang diaudit terlebih dahulu.');
                    if ($customer) {
                        $row->fill(['customer_id' => $customer->id, 'customer_match_status' => 'MATCHED', 'customer_match_method' => 'REVIEW', 'customer_match_note' => $data['reason'],
                            'pickup_task_id' => $task?->id, 'match_status' => $task ? 'MATCHED' : 'UNMATCHED', 'match_method' => 'REVIEW', 'match_note' => $data['reason'], 'customer_match_candidates' => [],
                            'identity_review_hash' => self::identityHash($candidates[$row->latest_report_awb_id] ?? [])]);
                    }
                    if (! empty($data['category'])) {
                        $row->fill(['category' => $data['category'], 'category_status' => 'MATCHED', 'category_method' => 'REVIEW', 'category_review_hash' => ResolveJneCategories::fingerprint($row->category_evidence ?? [])]);
                    }
                }
                $row->fill(['version' => $row->version + 1])->save();
                JneShipmentMatchEvent::create(['jne_shipment_id' => $row->id, 'previous_customer_id' => $before['customer_id'], 'customer_id' => $row->customer_id,
                    'previous_pickup_task_id' => $before['pickup_task_id'], 'pickup_task_id' => $row->pickup_task_id, 'customer_match_status' => $row->customer_match_status,
                    'match_status' => $row->match_status, 'method' => 'REVIEW', 'actor_id' => $actor->id, 'reason' => $data['reason'],
                    'evidence' => [['review_action' => $data['action'], 'group_key' => $data['group_key'], 'before' => $before,
                        'after' => $row->only(array_keys($before)), 'source_decision' => $candidates[$row->latest_report_awb_id] ?? [], 'affected_awb' => $row->awb]]]);
            }
        }, 3);
    }

    /** @param array<string, mixed> $decision */
    public static function identityHash(array $decision): string
    {
        return hash('sha256', json_encode($decision, JSON_THROW_ON_ERROR));
    }

    public static function groupKey(JneShipment $shipment): string
    {
        $shipment->loadMissing('sources.reportJob', 'cashlessClaim');
        $evidence = $shipment->sources->sortBy('id')->map(function ($source): array {
            $raw = $source->raw_data ?? [];
            foreach (array_keys($raw) as $key) {
                if (in_array(mb_strtoupper((string) $key), ['AWB', 'CONNOTE', 'CN_NO'], true)) {
                    unset($raw[$key]);
                }
            }
            ksort($raw);

            return [$source->report_job_id, $source->customer_account, $source->shipper_name, $source->reference, $source->entry_at?->toIso8601String(), $raw];
        })->values()->all();
        $claim = $shipment->cashlessClaim?->only(['customer_id', 'pickup_task_id']);

        return hash('sha256', json_encode([$evidence, $claim, $shipment->only(['customer_id', 'pickup_task_id', 'customer_match_status', 'match_status', 'category', 'category_status'])], JSON_THROW_ON_ERROR));
    }
}

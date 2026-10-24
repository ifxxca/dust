<?php

namespace App\Actions\Reports;

use App\Models\Customer;
use App\Models\JneCustomerCodeAlias;
use App\Models\JneShipperAlias;
use App\Models\JneSourceContract;
use App\Models\PickupProcessingRecord;
use App\Models\ReportJob;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class ManageJneEvidenceRules
{
    /** @param array<string, mixed> $input */
    public function store(User $actor, string $kind, array $input): Model
    {
        return DB::transaction(function () use ($actor, $kind, $input): Model {
            $this->authorize($actor);
            $base = ['reason' => ['required', 'string', 'max:500'], 'verified' => ['sometimes', 'boolean']];
            if ($kind === 'contract') {
                $data = Validator::make($input, [...$base, 'source' => ['required', Rule::in(array_keys(ReportJob::REPORT_TYPES))], 'report_type' => ['required', 'string'],
                    'definition' => ['required', 'array:customer_code_column,category_column,category_values,hybrid_categories,collection_requirements'],
                    'definition.customer_code_column' => ['nullable', 'string', 'max:120'], 'definition.category_column' => ['nullable', 'string', 'max:120'],
                    'definition.category_values' => ['sometimes', 'array', 'max:100'], 'definition.category_values.*' => [Rule::in(PickupProcessingRecord::CATEGORIES)],
                    'definition.hybrid_categories' => ['sometimes', 'array', 'max:4'], 'definition.hybrid_categories.*' => [Rule::in(PickupProcessingRecord::CATEGORIES)],
                    'definition.collection_requirements' => ['sometimes', 'array', 'max:10'], 'definition.collection_requirements.*' => ['string', 'max:160', 'distinct']])->validate();
                abort_unless(in_array($data['report_type'], ReportJob::REPORT_TYPES[$data['source']], true), 422);
                foreach (array_keys($data['definition']['hybrid_categories'] ?? []) as $key) {
                    abort_unless(in_array($key, array_map(fn (array $part): string => implode(':', $part), ReportJob::HYBRID_PARTS), true), 422, 'Proses Hybrid tidak terdaftar.');
                }
                foreach ($data['definition']['collection_requirements'] ?? [] as $requirement) {
                    $parts = explode(':', $requirement, 3);
                    abort_unless(count($parts) >= 2 && in_array($parts[1], ReportJob::REPORT_TYPES[$parts[0]] ?? [], true) && (! isset($parts[2]) || trim($parts[2]) !== ''), 422, 'Sumber koleksi harus source:type atau source:type:account yang terdaftar.');
                }
                $verified = $this->verified($data);
                $previous = JneSourceContract::where('source', $data['source'])->where('report_type', $data['report_type'])->lockForUpdate()->get();
                if ($verified) {
                    foreach ($previous->whereNotNull('active_key') as $old) {
                        $before = $old->getAttributes();
                        $old->update(['active_key' => null]);
                        $this->audit($actor, 'contract', $old, $before, $data['reason']);
                    }
                }
                $row = new JneSourceContract(['source' => $data['source'], 'report_type' => $data['report_type'], 'definition' => $data['definition'],
                    'revision' => (int) $previous->max('revision') + 1, 'active_key' => $verified ? JneSourceContract::key($data['source'], $data['report_type']) : null,
                    'created_by' => $actor->id, 'verified_by' => $verified ? $actor->id : null, 'verified_at' => $verified ? now() : null, 'reason' => $data['reason']]);
            } else {
                abort_unless(in_array($kind, ['code_alias', 'shipper_alias'], true), 422);
                $field = $kind === 'code_alias' ? 'code' : 'shipper_name';
                $data = Validator::make($input, [...$base, 'customer_id' => ['required', 'integer', 'exists:customers,id'],
                    $field => ['required', 'string', 'max:'.($kind === 'code_alias' ? 64 : 500)],
                    'account_scope' => ['nullable', 'string', 'max:100'], 'valid_from' => ['nullable', 'date_format:Y-m-d'], 'valid_thru' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:valid_from']])->validate();
                abort_unless(Customer::whereKey($data['customer_id'])->where('is_active', true)->lockForUpdate()->exists(), 422);
                $verified = $this->verified($data);
                $attributes = ['customer_id' => $data['customer_id'], $field => trim($data[$field]), 'account_scope' => filled($data['account_scope'] ?? null) ? mb_strtoupper(trim($data['account_scope'])) : null,
                    'valid_from' => $data['valid_from'] ?? null, 'valid_thru' => $data['valid_thru'] ?? null, 'is_active' => $verified, 'created_by' => $actor->id,
                    'verified_by' => $verified ? $actor->id : null, 'verified_at' => $verified ? now() : null];
                $row = $kind === 'code_alias' ? new JneCustomerCodeAlias([...$attributes, 'reason' => $data['reason']])
                    : new JneShipperAlias([...$attributes, 'updated_by' => $actor->id, 'verification_reason' => $data['reason']]);
            }
            try {
                $row->save();
            } catch (UniqueConstraintViolationException) {
                abort(409, 'Pemetaan dengan scope yang sama sudah tercatat. Periksa aturan sebelumnya.');
            }
            $this->audit($actor, $kind, $row, [], $data['reason']);
            if ($verified) {
                app(QueueJneCustomerMappings::class)->handle([], $actor->id, true);
            }

            return $row;
        }, 3);
    }

    public function disable(User $actor, string $kind, int $id, int $version, string $reason): void
    {
        DB::transaction(function () use ($actor, $kind, $id, $version, $reason): void {
            $this->authorize($actor);
            abort_unless(trim($reason) !== '' && mb_strlen($reason) <= 500, 422);
            $class = match ($kind) {
                'contract' => JneSourceContract::class, 'code_alias' => JneCustomerCodeAlias::class, 'shipper_alias' => JneShipperAlias::class, default => abort(422)
            };
            $row = $class::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless(($row instanceof JneSourceContract ? $row->revision : $row->version) === $version, 409);
            $before = $row->getAttributes();
            $row->update($kind === 'contract' ? ['active_key' => null] : ['is_active' => false, 'version' => $version + 1]);
            $this->audit($actor, $kind, $row, $before, $reason);
            if (config('jne-reports.evidence_policies_enabled')) {
                app(QueueJneCustomerMappings::class)->handle([], $actor->id, true);
            }
        }, 3);
    }

    public function activate(User $actor, string $kind, int $id, int $version, string $reason): void
    {
        DB::transaction(function () use ($actor, $kind, $id, $version, $reason): void {
            $this->authorize($actor);
            abort_unless(config('jne-reports.evidence_policies_enabled'), 409, 'Gate aktivasi belum dibuka.');
            abort_unless(trim($reason) !== '' && mb_strlen($reason) <= 500, 422);
            $class = match ($kind) {
                'contract' => JneSourceContract::class, 'code_alias' => JneCustomerCodeAlias::class, 'shipper_alias' => JneShipperAlias::class, default => abort(422)
            };
            $row = $class::whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless(($row instanceof JneSourceContract ? $row->revision : $row->version) === $version, 409);
            $before = $row->getAttributes();
            if ($row instanceof JneSourceContract) {
                $latest = JneSourceContract::where('source', $row->source)->where('report_type', $row->report_type)->max('revision');
                abort_unless($row->revision === $latest, 409, 'Gunakan revisi kontrak terbaru; definisi lama tidak diaktifkan kembali.');
                foreach (JneSourceContract::where('source', $row->source)->where('report_type', $row->report_type)->whereNotNull('active_key')->whereKeyNot($id)->lockForUpdate()->get() as $old) {
                    $oldBefore = $old->getAttributes();
                    $old->update(['active_key' => null]);
                    $this->audit($actor, 'contract', $old, $oldBefore, $reason);
                }
                $row->fill(['active_key' => JneSourceContract::key($row->source, $row->report_type)]);
            } else {
                abort_unless(Customer::whereKey($row->customer_id)->where('is_active', true)->lockForUpdate()->exists(), 422);
                $row->fill(['is_active' => true, 'version' => $version + 1]);
            }
            $row->fill(['verified_by' => $actor->id, 'verified_at' => now()])->save();
            $this->audit($actor, $kind, $row, $before, $reason);
            app(QueueJneCustomerMappings::class)->handle([], $actor->id, true);
        }, 3);
    }

    /** @param array<string, mixed> $data */
    private function verified(array $data): bool
    {
        $verified = (bool) ($data['verified'] ?? false);
        abort_if($verified && ! config('jne-reports.evidence_policies_enabled'), 409, 'Aktivasi aturan belum dibuka pada lingkungan ini. Simpan draft untuk UAT.');

        return $verified;
    }

    private function authorize(User $actor): void
    {
        abort_unless(User::whereKey($actor->id)->where('is_active', true)->where('role', 'admin_supervisor')->lockForUpdate()->exists(), 403);
        abort_unless(Schema::hasTable('jne_evidence_rule_events'), 409, 'Migrasi konfigurasi bukti perlu dipasang pada lingkungan UAT.');
    }

    /** @param array<string, mixed> $before */
    private function audit(User $actor, string $kind, Model $row, array $before, string $reason): void
    {
        DB::table('jne_evidence_rule_events')->insert(['kind' => $kind, 'rule_id' => $row->getKey(), 'actor_id' => $actor->id, 'reason' => $reason,
            'before' => json_encode($before, JSON_THROW_ON_ERROR), 'after' => json_encode($row->getAttributes(), JSON_THROW_ON_ERROR), 'created_at' => now()]);
    }
}

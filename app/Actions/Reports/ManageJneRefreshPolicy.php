<?php

namespace App\Actions\Reports;

use App\Models\JneReportProfile;
use App\Models\JneShipment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class ManageJneRefreshPolicy
{
    /** @param array<string, mixed> $input */
    public function handle(User $actor, int $profileId, array $input): void
    {
        DB::transaction(function () use ($actor, $profileId, $input): void {
            abort_unless(User::whereKey($actor->id)->where('role', 'admin_supervisor')->where('is_active', true)->lockForUpdate()->exists(), 403);
            abort_unless(Schema::hasColumn('jne_report_profiles', 'refresh_policy') && Schema::hasTable('jne_evidence_rule_events'), 409);
            $data = Validator::make($input, ['version' => ['required', 'integer', 'min:1'], 'reason' => ['required', 'string', 'max:500'], 'verified' => ['required', 'boolean'],
                'definition' => ['required', 'array:enabled,intervals,terminal_statuses,terminal_confirmations,sla_after_days,sla_interval_minutes,priority_statuses,availability_hours,failure_backoff_minutes,max_failure_backoff_minutes'],
                'definition.enabled' => ['required', 'boolean'], 'definition.intervals' => ['sometimes', 'array:'.implode(',', JneShipment::STATUSES)], 'definition.intervals.*' => ['integer', 'min:5', 'max:10080'],
                'definition.terminal_statuses' => ['sometimes', 'array', 'max:6'], 'definition.terminal_statuses.*' => ['distinct', Rule::in(JneShipment::STATUSES)],
                'definition.terminal_confirmations' => ['nullable', 'integer', 'min:2', 'max:10'], 'definition.sla_after_days' => ['nullable', 'integer', 'min:1', 'max:366'],
                'definition.sla_interval_minutes' => ['nullable', 'integer', 'min:5', 'max:10080'], 'definition.priority_statuses' => ['sometimes', 'array', 'max:6'], 'definition.priority_statuses.*' => ['distinct', Rule::in(JneShipment::STATUSES)],
                'definition.availability_hours' => ['sometimes', 'array', 'max:24'], 'definition.availability_hours.*' => ['integer', 'min:0', 'max:23', 'distinct'],
                'definition.failure_backoff_minutes' => ['required', 'integer', 'min:5', 'max:1440'], 'definition.max_failure_backoff_minutes' => ['required', 'integer', 'min:5', 'max:10080', 'gte:definition.failure_backoff_minutes']])->validate();
            $definition = $data['definition'];
            abort_if($definition['enabled'] && (! $data['verified'] || ! config('jne-reports.tracking_policies_enabled')), 409, 'Aktivasi memerlukan verifikasi dan gate lingkungan UAT.');
            abort_if(($definition['terminal_statuses'] ?? []) !== [] && empty($definition['terminal_confirmations']), 422, 'Jumlah konfirmasi terminal wajib ditetapkan.');
            abort_if(! empty($definition['sla_after_days']) && empty($definition['sla_interval_minutes']), 422, 'Interval SLA wajib ditetapkan.');
            $profile = JneReportProfile::whereKey($profileId)->lockForUpdate()->firstOrFail();
            abort_unless($profile->source === 'apex' && $profile->report_type === 'unresolved', 422);
            abort_unless($profile->version === (int) $data['version'], 409);
            $before = $profile->refresh_policy;
            $after = ['definition' => $definition, 'verified_by' => $data['verified'] ? $actor->id : null, 'verified_at' => $data['verified'] ? now()->toIso8601String() : null];
            $profile->update(['refresh_policy' => $after, 'version' => $profile->version + 1]);
            DB::table('jne_evidence_rule_events')->insert(['kind' => 'tracking_policy', 'rule_id' => $profileId, 'actor_id' => $actor->id, 'reason' => $data['reason'],
                'before' => json_encode($before, JSON_THROW_ON_ERROR), 'after' => json_encode($after, JSON_THROW_ON_ERROR), 'created_at' => now()]);
        }, 3);
    }

    /** @return array<string, mixed>|null */
    public static function active(JneReportProfile $profile): ?array
    {
        $policy = $profile->refresh_policy;

        return config('jne-reports.tracking_policies_enabled') && ! empty($policy['verified_at']) && ! empty($policy['definition']['enabled']) ? $policy['definition'] : null;
    }
}

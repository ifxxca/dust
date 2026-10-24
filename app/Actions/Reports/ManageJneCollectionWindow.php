<?php

namespace App\Actions\Reports;

use App\Models\JneCollectionWindow;
use App\Models\JneReportAwb;
use App\Models\JneSourceContract;
use App\Models\PickupCashlessAwb;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class ManageJneCollectionWindow
{
    /** @param array<string, mixed> $input */
    public function handle(User $actor, int $taskId, array $input): JneCollectionWindow
    {
        return DB::transaction(function () use ($actor, $taskId, $input): JneCollectionWindow {
            abort_unless(User::whereKey($actor->id)->where('is_active', true)->where('role', 'admin_supervisor')->lockForUpdate()->exists(), 403);
            abort_unless(QueryJneCollectionWindows::enabled(), 409, 'Pengesahan koleksi belum diaktifkan pada lingkungan ini.');
            $data = Validator::make($input, ['status' => ['required', Rule::in(['OPEN', 'COMPLETE'])], 'expected_version' => ['required', 'integer', 'min:0'], 'submission_key' => ['required', 'uuid'],
                'reason' => ['required', 'string', 'max:500'], 'contract_id' => ['required_if:status,COMPLETE', 'nullable', 'integer'],
                'report_job_ids' => ['required_if:status,COMPLETE', 'array', 'max:200'], 'report_job_ids.*' => ['integer', 'distinct'],
                'cutoff_at' => ['required_if:status,COMPLETE', 'nullable', 'date'], 'confirmed_scope' => ['exclude_if:status,OPEN', 'required', 'accepted']])->validate();
            $payload = hash('sha256', json_encode([$taskId, $data], JSON_THROW_ON_ERROR));
            $event = DB::table('jne_reconciliation_events')->where('submission_key', $data['submission_key'])->first();
            if ($event) {
                abort_unless($event->actor_id === $actor->id && $event->payload_hash === $payload, 409);

                return JneCollectionWindow::where('pickup_task_id', $taskId)->firstOrFail();
            }
            $task = PickupTask::whereKey($taskId)->lockForUpdate()->firstOrFail();
            $window = JneCollectionWindow::where('pickup_task_id', $taskId)->lockForUpdate()->first();
            abort_unless(($window->version ?? 0) === (int) $data['expected_version'], 409, 'Versi pengesahan berubah. Muat ulang terlebih dahulu.');
            $before = $window?->toArray() ?? [];
            $attributes = ['status' => $data['status'], 'updated_by' => $actor->id, 'version' => ($window->version ?? 0) + 1];
            if ($data['status'] === 'COMPLETE') {
                $task->load('proof.revisions');
                abort_unless($task->proof?->finalized_at !== null, 409, 'POP harus final sebelum pengesahan koleksi.');
                $contract = JneSourceContract::whereKey($data['contract_id'])->whereNotNull('active_key')->whereNotNull('verified_at')->lockForUpdate()->firstOrFail();
                $required = $contract->definition['collection_requirements'] ?? [];
                abort_unless(is_array($required) && $required !== [], 422, 'Kontrak belum menetapkan sumber koleksi yang wajib lengkap.');
                $jobs = ReportJob::whereIn('id', $data['report_job_ids'])->orderBy('id')->lockForUpdate()->get();
                abort_unless($jobs->count() === count($data['report_job_ids']) && $jobs->every(QueryJneCollectionWindows::ready(...)), 409, 'Seluruh laporan yang dipilih harus selesai dan siap digunakan.');
                foreach ($required as $requirement) {
                    $parts = explode(':', $requirement, 3);
                    abort_unless(count($parts) >= 2 && $jobs->contains(fn (ReportJob $job): bool => $job->source === $parts[0] && $job->report_type === $parts[1] && (! isset($parts[2]) || $job->customer_account === $parts[2])), 422, 'Sumber wajib belum terwakili: '.$requirement);
                }
                $cutoff = CarbonImmutable::parse($data['cutoff_at'], config('jne-reports.source_timezone'))->utc();
                abort_if($cutoff->isFuture(), 422, 'Cutoff pengesahan tidak boleh di masa depan.');
                $attributes = [...$attributes, 'jne_source_contract_id' => $contract->id, 'required_sources' => $required, 'report_job_ids' => $jobs->modelKeys(),
                    'report_evidence' => QueryJneCollectionWindows::reportEvidence($jobs), 'source_high_water_id' => JneReportAwb::max('id') ?? 0,
                    'proof_hash' => QueryJneCollectionWindows::proofHash($task), 'sertim_hash' => QueryJneCollectionWindows::sertimHash(PickupCashlessAwb::where('pickup_task_id', $taskId)->orderBy('id')->get()),
                    'cutoff_at' => $cutoff, 'attested_at' => now()];
            }
            $window ??= new JneCollectionWindow(['pickup_task_id' => $taskId]);
            $window->fill($attributes)->save();
            DB::table('jne_reconciliation_events')->insert(['pickup_task_id' => $taskId, 'actor_id' => $actor->id, 'submission_key' => $data['submission_key'], 'payload_hash' => $payload,
                'reason' => $data['reason'], 'before' => json_encode($before, JSON_THROW_ON_ERROR), 'after' => json_encode($window->toArray(), JSON_THROW_ON_ERROR), 'created_at' => now()]);

            return $window;
        }, 3);
    }
}

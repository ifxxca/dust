<?php

namespace App\Actions\Reports;

use App\Models\JneReportProfile;
use App\Models\JneShipment;
use App\Models\ReportJob;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class QueueScheduledJneReports
{
    public function handle(): int
    {
        $created = 0;
        $ids = JneReportProfile::where('enabled', true)->where('next_run_at', '<=', now())->orderBy('next_run_at')->limit(20)->pluck('id');
        foreach ($ids as $id) {
            try {
                $created += $this->queueProfile($id);
            } catch (Throwable $exception) {
                app(ReportPipelineFailure::class)->handle($exception, 'queue_profile', profileId: $id);
                JneReportProfile::whereKey($id)->update(['last_error' => 'Gagal membuat antrean report. Periksa konfigurasi dan database.', 'next_run_at' => now()->addMinutes(15)]);
            }
        }

        return $created;
    }

    public function queueProfile(int $id, bool $force = false, ?string $forDate = null): int
    {
        return DB::transaction(function () use ($id, $force, $forDate): int {
            $profile = JneReportProfile::whereKey($id)->lockForUpdate()->firstOrFail();
            if (! $force && (! $profile->enabled || $profile->next_run_at === null || $profile->next_run_at->isFuture())) {
                return 0;
            }
            $actorActive = User::whereKey($profile->updated_by)->where('is_active', true)->where('role', 'admin_supervisor')->exists();
            if (! $actorActive) {
                $profile->update(['enabled' => false, 'last_error' => 'Pengelola jadwal tidak lagi Admin aktif. Simpan ulang konfigurasi oleh Admin aktif.']);

                return 0;
            }
            $local = CarbonImmutable::now('Asia/Jakarta');
            $policy = $profile->report_type === 'unresolved' ? ManageJneRefreshPolicy::active($profile) : null;
            if ($policy !== null && ($policy['availability_hours'] ?? []) !== [] && ! in_array($local->hour, $policy['availability_hours'], true)) {
                $next = $local->startOfHour()->addHour();
                while (! in_array($next->hour, $policy['availability_hours'], true)) {
                    $next = $next->addHour();
                }
                $profile->update(['last_error' => 'Di luar jam ketersediaan sumber pada kebijakan terverifikasi.', 'next_run_at' => $profile->enabled ? $next->utc() : null]);

                return 0;
            }
            if ($forDate !== null && $profile->source !== 'hybrid') {
                throw ValidationException::withMessages(['for_date' => 'Tanggal khusus tersedia untuk Hybrid gabungan.']);
            }
            if ($profile->source !== 'apex' && $local->hour === 0 && $local->minute < 30) {
                $profile->update(['last_error' => 'Menunggu login ulang Hybrid pukul 00:30 WIB.', 'next_run_at' => $profile->enabled ? $local->startOfDay()->addMinutes(30)->utc() : null]);

                return 0;
            }
            $blocked = ReportJob::where('source', $profile->source)->where('report_type', $profile->report_type)->where('customer_account', $profile->customer_account)->where(function ($query): void {
                $query->whereIn('status', ['QUEUED', 'COLLECTING_SOURCES', 'WAITING_APEX', ...ReportJob::ACTIVE_STATUSES])
                    ->orWhere(fn ($query) => $query->whereIn('status', ['FAILED', 'NEEDS_ATTENTION'])->whereNull('reviewed_at'))
                    ->orWhere(fn ($query) => $query->where('status', 'COMPLETED')->where(fn ($query) => $query->where('import_status', 'QUEUED')->orWhere('projection_status', 'QUEUED')))
                    ->orWhere(fn ($query) => $query->where('status', 'COMPLETED')->whereNull('reviewed_at')->where(fn ($query) => $query->where('import_status', 'FAILED')->orWhere('projection_status', 'FAILED')));
            })->exists();
            if ($blocked) {
                $minutes = 15;
                if ($policy !== null) {
                    $recent = ReportJob::where('source', $profile->source)->where('report_type', $profile->report_type)->where('customer_account', $profile->customer_account)->orderByDesc('id')->limit(10)->get();
                    $failures = $recent->takeUntil(fn (ReportJob $job): bool => ! in_array($job->status, ['FAILED', 'NEEDS_ATTENTION'], true) && $job->import_status !== 'FAILED' && $job->projection_status !== 'FAILED')->count();
                    $minutes = min($policy['max_failure_backoff_minutes'], $policy['failure_backoff_minutes'] * (2 ** max(0, $failures - 1)));
                }
                $profile->update(['last_error' => 'Masih ada report diproses atau kegagalan yang belum diperiksa Admin. Tinjau daftar report sebelum siklus baru.', 'next_run_at' => $profile->enabled ? now()->addMinutes($minutes) : null]);

                return 0;
            }
            if ($profile->report_type === 'unresolved') {
                return $this->queueActiveAwbs($profile, $force, $local);
            }
            try {
                $date = $forDate ?? $local->toDateString();
                $periods = $profile->source === 'apex' ? $this->periods($this->windows($profile)) : [[$date, $date]];
            } catch (ValidationException) {
                $profile->update(['last_error' => 'Periode pemantauan tidak valid atau terlalu banyak tanggal aktif. Periksa mode/rentang jadwal.', 'next_run_at' => $profile->enabled ? now()->addMinutes(15) : null]);

                return 0;
            }
            $cycle = $force ? (string) Str::uuid() : $profile->next_run_at->toIso8601String();
            $requestKey = (string) Str::uuid();
            foreach ($periods as [$from, $thru]) {
                $job = ReportJob::firstOrCreate(['schedule_key' => hash('sha256', $profile->id.'|'.$cycle.'|'.$from.'|'.$thru)], [
                    'request_key' => $requestKey, 'jne_report_profile_id' => $profile->id, 'customer_account' => $profile->customer_account,
                    'national_account' => $profile->national_account,
                    'source' => $profile->source, 'report_type' => $profile->report_type,
                    'date_from' => $from, 'date_thru' => $thru, 'report_mode' => config('jne-reports.report_mode'), 'status' => $profile->source === 'hybrid' ? 'COLLECTING_SOURCES' : 'QUEUED', 'created_by' => $profile->updated_by,
                ]);
                if ($profile->source === 'hybrid') {
                    foreach (ReportJob::hybridParts($profile->customer_account) as [$source, $kind]) {
                        ReportJob::firstOrCreate(['schedule_key' => hash('sha256', $job->id.'|'.$source.'|'.$kind)], [
                            'hybrid_batch_id' => $job->id, 'request_key' => $requestKey, 'source' => $source,
                            'report_type' => $kind, 'customer_account' => strtoupper($source),
                            'date_from' => $from, 'date_thru' => $thru, 'report_mode' => 'P', 'status' => 'QUEUED', 'created_by' => $profile->updated_by,
                        ]);
                    }
                }
            }
            $profile->update(['last_run_at' => now(), 'next_run_at' => $profile->enabled ? now()->addMinutes($profile->interval_minutes) : null, 'last_error' => null]);

            return count($periods);
        });
    }

    private function queueActiveAwbs(JneReportProfile $profile, bool $force, CarbonImmutable $local): int
    {
        $maximum = config('jne-reports.max_scheduled_jobs_per_cycle') * config('jne-reports.max_awbs');
        $selector = app(QueryActiveJneAwbs::class);
        $policy = ManageJneRefreshPolicy::active($profile);
        $query = $force ? $selector->handle($profile->lookback_days, $policy) : $selector->due($profile->lookback_days, $profile->interval_minutes, $policy);
        $query->select('awb');
        if ($policy !== null) {
            $query->withMax('observations', 'created_at')->orderByRaw('case when not exists (select 1 from jne_shipment_observations o where o.jne_shipment_id = jne_shipments.id) then 0 else 1 end');
            foreach ($policy['priority_statuses'] ?? [] as $status) {
                $query->orderByRaw('case when tracking_status = ? then 0 else 1 end', [$status]);
            }
            if (! empty($policy['sla_after_days'])) {
                $query->orderByRaw('case when exists (select 1 from jne_report_awbs a where a.id = jne_shipments.latest_report_awb_id and a.entry_at <= ?) then 0 else 1 end', [now()->subDays($policy['sla_after_days'])]);
            }
            $query->orderBy('observations_max_created_at');
        }
        $awbs = $query->orderBy('awb')->limit($maximum + 1)->pluck('awb')->all();
        if (count($awbs) > $maximum || array_any($awbs, fn (string $awb): bool => preg_match('/^[A-Z0-9_-]{1,100}$/D', $awb) !== 1)) {
            $profile->update(['last_error' => 'Daftar AWB aktif terlalu besar atau berisi format AWB yang tidak didukung. Periksa data sumber.', 'next_run_at' => $profile->enabled ? now()->addMinutes(15) : null]);

            return 0;
        }
        $cycle = $force ? (string) Str::uuid() : $profile->next_run_at->toIso8601String();
        $requestKey = (string) Str::uuid();
        $batches = array_chunk($awbs, config('jne-reports.max_awbs')) ?: [[]];
        foreach ($batches as $index => $batch) {
            $job = ReportJob::firstOrCreate(['schedule_key' => hash('sha256', $profile->id.'|'.$cycle.'|active|'.$index)], [
                'request_key' => $requestKey, 'jne_report_profile_id' => $profile->id, 'customer_account' => $profile->customer_account,
                'source' => 'apex', 'report_type' => 'unresolved', 'report_mode' => 'A',
                'date_from' => $local->toDateString(), 'date_thru' => $local->toDateString(), 'parameters' => ['awbs' => $batch], 'awb_count' => count($batch),
                'status' => $batch === [] ? 'NO_DATA' : 'QUEUED', 'completed_at' => $batch === [] ? now() : null, 'created_by' => $profile->updated_by,
            ]);
            if ($job->wasRecentlyCreated) {
                $job->recordEvent($batch === [] ? 'Tidak ada resi aktif yang memenuhi batas usia dan interval pembaruan.' : count($batch).' AWB aktif diantrekan untuk Upload Connote APEX.'.($policy === null ? ' Delivered dan cancel dikecualikan.' : ' Seleksi menggunakan kebijakan tracking terverifikasi.'));
            }
        }
        $profile->update(['last_run_at' => now(), 'next_run_at' => $profile->enabled ? now()->addMinutes($profile->interval_minutes) : null, 'last_error' => null]);

        return count($batches);
    }

    /** @return iterable<array{string|null, string|null}> */
    private function windows(JneReportProfile $profile): iterable
    {
        if ($profile->mode === 'fixed') {
            yield [$profile->date_from?->toDateString(), $profile->date_thru?->toDateString()];

            return;
        }
        $today = CarbonImmutable::now(config('pickup.timezone'))->startOfDay();
        yield [$today->subDays($profile->lookback_days - 1)->toDateString(), $today->toDateString()];
        $open = JneShipment::where('customer_account', $profile->customer_account)->whereNotIn('tracking_status', JneShipment::TERMINAL_STATUSES)
            ->select(['id', 'latest_report_awb_id'])->with(['latestSource:id,report_job_id,entry_at', 'latestSource.reportJob:id,date_from,date_thru'])->lazyById(250);
        foreach ($open as $shipment) {
            $source = $shipment->latestSource;
            if ($source?->entry_at) {
                $date = $source->entry_at->setTimezone(config('jne-reports.source_timezone'))->toDateString();
                yield [$date, $date];
            } elseif ($source?->reportJob) {
                yield [$source->reportJob->date_from->toDateString(), $source->reportJob->date_thru->toDateString()];
            }
        }
    }

    /**
     * @param  iterable<array{string|null, string|null}>  $windows
     * @return list<array{string, string}>
     */
    public function periods(iterable $windows): array
    {
        $days = [];
        $maximum = config('jne-reports.max_scheduled_jobs_per_cycle') * config('jne-reports.max_report_days');
        foreach ($windows as [$from, $thru]) {
            if (! $from || ! $thru || $from > $thru) {
                throw ValidationException::withMessages(['date_thru' => 'Periode tidak valid.']);
            }
            $end = CarbonImmutable::parse($thru);
            for ($date = CarbonImmutable::parse($from); $date->lessThanOrEqualTo($end); $date = $date->addDay()) {
                $days[$date->toDateString()] = true;
                if (count($days) > $maximum) {
                    throw ValidationException::withMessages(['date_thru' => 'Terlalu banyak tanggal aktif.']);
                }
            }
        }
        ksort($days);
        $periods = [];
        foreach (array_keys($days) as $day) {
            $last = count($periods) - 1;
            if ($last >= 0 && CarbonImmutable::parse($periods[$last][1])->addDay()->toDateString() === $day
                && CarbonImmutable::parse($periods[$last][0])->diffInDays(CarbonImmutable::parse($day)) < config('jne-reports.max_report_days')) {
                $periods[$last] = [$periods[$last][0], $day];
            } else {
                $periods[] = [$day, $day];
            }
        }
        if (count($periods) > config('jne-reports.max_scheduled_jobs_per_cycle')) {
            throw ValidationException::withMessages(['date_thru' => 'Terlalu banyak periode aktif.']);
        }

        return $periods;
    }
}

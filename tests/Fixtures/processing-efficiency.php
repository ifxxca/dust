<?php

use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Database\Events\TransactionCommitted;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

/** @return Closure(string, callable): array<string, mixed> */
function processingEfficiencyProbe(): Closure
{
    $active = false;
    $stats = [];
    $starts = [];
    $fingerprints = [];
    $thread = DB::selectOne('SELECT THREAD_ID AS id FROM performance_schema.threads WHERE PROCESSLIST_ID=CONNECTION_ID()')->id;
    $server = DB::connection('eff_observer');
    $counters = fn (): array => $server->select('SELECT EVENT_NAME,COUNT_STAR,SUM_ROWS_AFFECTED,SUM_ROWS_EXAMINED FROM performance_schema.events_statements_summary_by_thread_by_event_name WHERE THREAD_ID=? AND COUNT_STAR>0', [$thread]);
    $locks = fn (): object => $server->selectOne("SELECT SUM(VARIABLE_VALUE) AS wait_ms FROM performance_schema.global_status WHERE VARIABLE_NAME='Innodb_row_lock_time'");
    $state = fn (): array => DB::table('jne_shipments')->orderBy('id')->get(['id', 'version', 'latest_report_awb_id', 'tracking_status'])->mapWithKeys(fn ($row): array => [$row->id => json_encode($row, JSON_THROW_ON_ERROR)])->all();
    DB::listen(function (QueryExecuted $event) use (&$active, &$stats, &$fingerprints): void {
        if (! $active) {
            return;
        }
        $verb = strtolower(strtok(ltrim($event->sql), " \n"));
        $stats['statements']++;
        $stats[$verb] = ($stats[$verb] ?? 0) + 1;
        $stats['sql_ms'] += $event->time;
        $sql = preg_replace('/\?(?:,\s*\?)+/', '?list', $event->sql);
        $fingerprints[$sql] ??= ['calls' => 0, 'total_ms' => 0, 'max_ms' => 0];
        $fingerprints[$sql]['calls']++;
        $fingerprints[$sql]['total_ms'] += $event->time;
        $fingerprints[$sql]['max_ms'] = max($fingerprints[$sql]['max_ms'], $event->time);
    });
    Event::listen(TransactionBeginning::class, function () use (&$active, &$starts): void {
        if ($active) {
            $starts[] = hrtime(true);
        }
    });
    Event::listen(TransactionCommitted::class, function () use (&$active, &$starts, &$stats): void {
        if ($active && $starts !== []) {
            $started = array_pop($starts);
            if ($starts === []) {
                $stats['outer_transaction_ms'] += (hrtime(true) - $started) / 1e6;
            }
        }
    });

    return function (string $phase, callable $operation) use (&$active, &$stats, &$starts, &$fingerprints, $counters, $locks, $state): array {
        $beforeState = $state();
        $beforeEvents = DB::table('jne_shipment_match_events')->count();
        $beforeObservations = DB::table('jne_shipment_observations')->count();
        $beforeCounters = collect($counters())->keyBy('EVENT_NAME');
        $beforeLocks = $locks()->wait_ms;
        $stats = ['statements' => 0, 'select' => 0, 'insert' => 0, 'update' => 0, 'delete' => 0, 'sql_ms' => 0, 'outer_transaction_ms' => 0];
        $starts = [];
        $fingerprints = [];
        memory_reset_peak_usage();
        $allocated = memory_get_usage(true);
        $started = hrtime(true);
        $active = true;
        try {
            $operation();
        } finally {
            $active = false;
        }
        $duration = (hrtime(true) - $started) / 1e6;
        $peak = memory_get_peak_usage(true);
        $afterCounters = $counters();
        $counterDelta = [];
        foreach ($afterCounters as $row) {
            $previous = $beforeCounters->get($row->EVENT_NAME);
            $count = (int) $row->COUNT_STAR - (int) ($previous->COUNT_STAR ?? 0);
            if ($count > 0) {
                $counterDelta[] = ['event_name' => $row->EVENT_NAME, 'count' => $count,
                    'rows_affected' => (int) $row->SUM_ROWS_AFFECTED - (int) ($previous->SUM_ROWS_AFFECTED ?? 0),
                    'rows_examined' => (int) $row->SUM_ROWS_EXAMINED - (int) ($previous->SUM_ROWS_EXAMINED ?? 0)];
            }
        }
        uasort($fingerprints, fn (array $a, array $b): int => $b['total_ms'] <=> $a['total_ms']);
        $afterState = $state();

        return ['phase' => $phase, ...$stats, 'duration_ms' => $duration, 'allocated_before_bytes' => $allocated, 'peak_php_bytes' => $peak,
            'events_created' => DB::table('jne_shipment_match_events')->count() - $beforeEvents,
            'observations_created' => DB::table('jne_shipment_observations')->count() - $beforeObservations,
            'shipment_rows_changed' => count(array_diff_assoc($afterState, $beforeState)),
            'innodb_row_lock_wait_ms_global_delta' => (int) $locks()->wait_ms - (int) $beforeLocks,
            'server_statement_counters' => $counterDelta, 'fingerprints' => $fingerprints, 'transaction_level_after' => DB::transactionLevel()];
    };
}

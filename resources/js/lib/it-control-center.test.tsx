import { renderToStaticMarkup } from 'react-dom/server';
import ServerHeartbeatPanel from '@/components/server-heartbeat-panel';
import { expect, test } from 'vitest';
import {
    ControlCenterContent,
    monitorDuration,
    monitorNumber,
    MonitorState,
} from '@/components/it-control-center-content';
import {
    filterMonitorServices,
    serviceNeedsReview,
    serviceStatusText,
} from '@/components/it-control-center-overview';
import type {
    ControlCenterData,
    MonitorService,
    MonitorHost,
} from '@/types/it-control-center';

test('unknown measurements are distinct from measured zero', () => {
    expect(monitorNumber(null)).toBe('UNKNOWN');
    expect(monitorNumber(0)).toBe('0');
    expect(monitorDuration(null)).toBe('Belum terukur');
    expect(monitorDuration(0)).toBe('0 ms');
});

test('host dashboard preserves measured zero and identifies stale values and missing telemetry', () => {
    const host: MonitorHost = {
        host: 'abcd1234',
        state: 'HEALTHY',
        observed_at: '2026-11-06T08:00:00Z',
        age_seconds: 5,
        stale: false,
        platform: 'win32',
        cpu_percent: 0,
        cpu_count: 8,
        memory_total_bytes: 1024 ** 3,
        memory_free_bytes: 1024 ** 3,
        memory_percent: 0,
        disk_total_bytes: 1024 ** 3,
        disk_free_bytes: 1024 ** 3,
        disk_percent: 0,
        uptime_seconds: 86400,
        workers_online: 2,
        warnings: [],
        history: [
            {
                observed_at: '2026-11-06T07:59:45Z',
                cpu_percent: 1,
                memory_percent: 0,
            },
            {
                observed_at: '2026-11-06T08:00:00Z',
                cpu_percent: 0,
                memory_percent: 0,
            },
        ],
    };
    const html = renderToStaticMarkup(<ServerHeartbeatPanel hosts={[host]} />);
    expect(html).toContain('Online');
    expect(html).toContain('0%');
    expect(html).toContain('Riwayat CPU server abcd1234');
    expect(html).toContain('2 proses');
    const stale = renderToStaticMarkup(
        <ServerHeartbeatPanel
            hosts={[{ ...host, state: 'STALE', stale: true }]}
        />,
    );
    expect(stale).toContain('Heartbeat terlambat');
    expect(stale).toContain('pengukuran terakhir');
    expect(stale).not.toContain('>Online<');
    expect(renderToStaticMarkup(<ServerHeartbeatPanel hosts={[]} />)).toContain(
        'Belum ada pengukuran server',
    );
});

test('state text remains accessible without relying on color', () => {
    for (const state of ['BUSY', 'IDLE', 'STOPPED', 'UNHEALTHY', 'UNKNOWN']) {
        expect(renderToStaticMarkup(<MonitorState value={state} />)).toContain(
            state,
        );
    }
});

test('diagnostic search is local and raw markup is escaped', () => {
    const data = {
        diagnostics: [
            {
                id: 'report:15',
                source: '<script>unsafe</script>',
                observed_at: null,
                code: 'TIMEOUT',
                summary: 'Periksa sumber',
            },
        ],
    } as ControlCenterData;
    const html = renderToStaticMarkup(
        <ControlCenterContent data={data} section="diagnostics" />,
    );
    expect(html).toContain('Cari diagnostik');
    expect(html).toContain('tidak memicu query setiap huruf');
    expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('Retry All');
});

test('missing process evidence displays UNKNOWN with contextual explanation', () => {
    const data = {
        workers: [
            {
                identity: 'expected-worker',
                runtime: 'PHP queue',
                state: 'UNKNOWN',
                observed_at: null,
                stale: true,
                queue: 'default',
                connection: 'database',
                job: null,
                job_id: null,
                timeout: null,
                evidence: 'Missing',
            },
        ],
        queues: { rows: [], default_connection: 'database', connections: [] },
    } as unknown as ControlCenterData;
    const html = renderToStaticMarkup(
        <ControlCenterContent data={data} section="workers" />,
    );
    expect(html).toContain('UNKNOWN');
    expect(html).toContain('Tidak ada bukti terkini');
    expect(html).toContain('Tabel Worker');
    expect(html).not.toContain('STOPPED</span>');
});

test('retired process records are disclosed as historical events outside the current worker table', () => {
    const data = {
        workers: [],
        retired_workers_count: 60,
        retired_workers: [
            {
                identity: 'old-recycled-worker',
                runtime: 'PHP queue',
                state: 'STOPPED',
                observed_at: null,
                queue: 'default',
            },
        ],
        queues: { rows: [], default_connection: 'database', connections: [] },
    } as unknown as ControlCenterData;
    const html = renderToStaticMarkup(
        <ControlCenterContent data={data} section="workers" />,
    );
    expect(html).toContain('Riwayat worker berhenti (60)');
    expect(html).toContain('tidak dihitung sebagai worker aktif atau UNKNOWN');
    expect(html).toContain('old-recycled-worker');
    expect(html.slice(0, html.indexOf('</section>'))).not.toContain(
        'old-recycled-worker',
    );
});

test('service and integration health include their evidence instead of presenting an unexplained status', () => {
    const data = {
        services: [
            {
                name: 'CSV import',
                runtime: 'PHP queue',
                state: 'HEALTHY',
                coverage: 'PARTIAL',
                evidence: 'Worker aktif melayani queue default',
                observed_at: null,
                last_success: null,
                last_failure: null,
                error: null,
            },
        ],
        integrations: [
            {
                name: 'Hybrid PM',
                source: 'roberto',
                state: 'UNKNOWN',
                evidence: 'Pemeriksaan sesi kedaluwarsa',
                observed_at: null,
                last_success: null,
                last_failure: null,
                recorded_endpoint: null,
                duration_ms: null,
                recent_failures: 0,
                failovers: [],
            },
        ],
        backlogs: [],
        window: 'Bounded sample',
    } as unknown as ControlCenterData;
    expect(
        renderToStaticMarkup(
            <ControlCenterContent data={data} section="overview" />,
        ),
    ).toContain('Bukti &amp; detail');
    const integrations = renderToStaticMarkup(
        <ControlCenterContent data={data} section="integrations" />,
    );
    expect(integrations).toContain('Bukti &amp; detail');
    expect(integrations).toContain('NOT VERIFIED');
});

const healthyService: MonitorService = {
    name: 'CSV import',
    runtime: 'PHP queue',
    state: 'HEALTHY',
    runtime_state: 'HEALTHY',
    readiness_state: 'UNKNOWN',
    execution_state: 'HEALTHY',
    readiness_observed_at: null,
    execution_observed_at: null,
    recent_failures: 0,
    coverage: 'PARTIAL',
    evidence: 'Heartbeat',
    observed_at: null,
    last_success: null,
    last_failure: null,
    error: null,
};

test('service filters retain independent runtime and execution health without treating missing readiness as a fault', () => {
    const failedExecution = {
        ...healthyService,
        name: 'Rekonsiliasi',
        execution_state: 'NEEDS_ATTENTION',
    };
    expect(serviceNeedsReview(healthyService)).toBe(false);
    expect(serviceNeedsReview(failedExecution)).toBe(true);
    expect(
        filterMonitorServices(
            [healthyService, failedExecution],
            '',
            'attention',
        ),
    ).toEqual([failedExecution]);
    expect(
        filterMonitorServices([healthyService, failedExecution], '', 'healthy'),
    ).toEqual([healthyService, failedExecution]);
    expect(filterMonitorServices([healthyService], '', 'unknown')).toEqual([]);
    expect(
        filterMonitorServices(
            [healthyService, failedExecution],
            ' rekonsiliasi ',
            '',
        ),
    ).toEqual([failedExecution]);
});

test('service labels distinguish missing instrumentation unused checks and missing job outcomes', () => {
    expect(serviceStatusText(healthyService, 'readiness')).toBe(
        'Tidak berlaku',
    );
    expect(
        serviceStatusText(
            { ...healthyService, name: 'SMTP email' },
            'readiness',
        ),
    ).toBe('Belum diuji');
    expect(
        serviceStatusText(
            { ...healthyService, execution_state: 'UNKNOWN' },
            'execution',
        ),
    ).toBe('Belum ada hasil');
    expect(
        serviceStatusText(
            { ...healthyService, runtime: 'Not Instrumented' },
            'runtime',
        ),
    ).toBe('Belum dipantau');
    expect(
        serviceStatusText({ ...healthyService, runtime: 'PHP CLI' }, 'runtime'),
    ).toBe('Proses sesaat');
});

test('overview presents unavailable queue measurements as UNKNOWN in one summary', () => {
    const data = {
        services: [healthyService],
        overview: {
            healthy: 1,
            degraded: 0,
            unhealthy: 0,
            unknown: 0,
            workers_available: 1,
            workers_unknown: 0,
            active_reports: 0,
            errors_in_sample: 0,
        },
        queues: {
            rows: null,
            failed_rows: [],
            sources: [{ available: false }],
        },
    } as unknown as ControlCenterData;
    const html = renderToStaticMarkup(
        <ControlCenterContent data={data} section="overview" />,
    );
    expect(html.match(/aria-label="Ringkasan monitoring"/g)).toHaveLength(1);
    expect(html).toContain('UNKNOWN');
    expect(html).toContain('Cari layanan');
    expect(html).toContain('Status layanan');
    expect(html).toContain('Bukti &amp; detail: CSV import');
});

test('Attention Queue shows final retry failures and links the exact run without exposing worker evidence', () => {
    const data = {
        report_retries: {
            enabled: true,
            waiting: 2,
            attention_total: 1,
            attention: [
                {
                    id: 91,
                    run_id: 90,
                    source: 'apex',
                    account: '<script>unsafe</script>',
                    attempts: 3,
                    code: 'NETWORK_TIMEOUT',
                    classification: 'EXHAUSTED',
                    failed_at: '2026-11-06T00:00:00Z',
                },
            ],
        },
    } as ControlCenterData;
    const html = renderToStaticMarkup(
        <ControlCenterContent data={data} section="attention" />,
    );
    expect(html).toContain('Attention Queue (1)');
    expect(html).toContain('3 / 3');
    expect(html).toContain('NETWORK_TIMEOUT');
    expect(html).toContain('run_id=90');
    expect(html).toContain('2 job menunggu retry');
    expect(html).not.toContain('<script>unsafe</script>');
    expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
});

import { Disclosure, DisclosureSummary } from '@/components/ui/disclosure';
import { useState, type ReactNode } from 'react';
import { Link } from '@inertiajs/react';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ControlCenterOverview } from '@/components/it-control-center-overview';
import {
    DataGrid,
    Evidence,
    MonitorState,
    monitorDuration,
    monitorNumber,
    monitorTime,
} from '@/components/it-control-center-ui';
import type { ControlCenterData } from '@/types/it-control-center';
import { index as reportRuns } from '@/routes/report-runs';

export {
    MonitorState,
    monitorDuration,
    monitorNumber,
    monitorTime,
} from '@/components/it-control-center-ui';

function SearchableGrid({
    title,
    headers,
    data,
    render,
    searchable,
}: {
    title: string;
    headers: string[];
    data: ControlCenterData['pipelines'] | ControlCenterData['diagnostics'];
    render: (index: number) => ReactNode[];
    searchable: (index: number) => string;
}) {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const matches = data
        .map((_, index) => index)
        .filter((index) =>
            searchable(index)
                .toLocaleLowerCase()
                .includes(query.toLocaleLowerCase()),
        );
    const current = Math.min(page, Math.max(1, Math.ceil(matches.length / 20)));
    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="flex max-w-xl flex-col gap-1.5">
                <Label htmlFor={`search-${title}`}>
                    Cari {title.toLocaleLowerCase()}
                </Label>
                <div className="relative">
                    <Search
                        aria-hidden="true"
                        className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
                    />
                    <Input
                        id={`search-${title}`}
                        name="monitor_search"
                        autoComplete="off"
                        spellCheck={false}
                        className="pl-9"
                        placeholder="ID, proses, status, atau kode error…"
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setPage(1);
                        }}
                    />
                </div>
            </div>
            <DataGrid
                title={title}
                headers={headers}
                rows={matches
                    .slice((current - 1) * 20, current * 20)
                    .map(render)}
                note="Pencarian lokal pada sampel tersimpan; tidak memicu query setiap huruf."
            />
            <div className="flex items-center justify-between gap-3">
                <span
                    className="text-xs text-muted-foreground"
                    aria-live="polite"
                >
                    {matches.length} catatan · halaman {current}
                </span>
                <div className="flex gap-2">
                    <Button
                        size="icon"
                        className="min-h-11 min-w-11"
                        variant="outline"
                        aria-label={`Halaman ${title} sebelumnya`}
                        disabled={current === 1}
                        onClick={() => setPage(current - 1)}
                    >
                        <ArrowLeft aria-hidden="true" />
                    </Button>
                    <Button
                        size="icon"
                        className="min-h-11 min-w-11"
                        variant="outline"
                        aria-label={`Halaman ${title} berikutnya`}
                        disabled={current * 20 >= matches.length}
                        onClick={() => setPage(current + 1)}
                    >
                        <ArrowRight aria-hidden="true" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

export function ControlCenterContent({
    data,
    section,
}: {
    data: ControlCenterData;
    section: string;
}) {
    switch (section) {
        case 'attention':
            return (
                <DataGrid
                    title={`Attention Queue (${data.report_retries?.attention_total ?? 0})`}
                    headers={[
                        'Run',
                        'Sumber / account',
                        'Percobaan',
                        'Penyebab',
                        'Gagal terakhir (WIB)',
                        'Tindakan',
                    ]}
                    note={
                        data.report_retries?.enabled
                            ? `${data.report_retries.waiting} job menunggu retry. Menampilkan 100 kegagalan final tertua yang belum ditinjau, termasuk sebelum 24 jam.`
                            : 'Automatic retry belum diaktifkan.'
                    }
                    rows={(data.report_retries?.attention ?? []).map((row) => [
                        `#${row.id}`,
                        <div>
                            <p>{row.source}</p>
                            <p>{row.account}</p>
                        </div>,
                        `${row.attempts} / 3`,
                        <div>
                            <p>{row.code}</p>
                            <p className="text-xs text-muted-foreground">
                                {row.classification}
                            </p>
                        </div>,
                        monitorTime(row.failed_at),
                        <Button variant="outline" className="min-h-11" asChild>
                            <Link
                                href={reportRuns({
                                    query: { run_id: row.run_id },
                                })}
                            >
                                Detail &amp; log
                            </Link>
                        </Button>,
                    ])}
                />
            );
        case 'workers':
            return (
                <div className="flex min-w-0 flex-col gap-5">
                    <DataGrid
                        title="Worker"
                        headers={[
                            'Identitas / runtime',
                            'Status',
                            'Heartbeat (WIB)',
                            'Queue / koneksi',
                            'Pekerjaan aktif',
                            'Timeout',
                        ]}
                        note="Heartbeat kedaluwarsa menjadi UNKNOWN. STOPPED memerlukan event penghentian proses."
                        rows={data.workers.map((row) => [
                            <div>
                                <p>{row.runtime}</p>
                                <Evidence label="Identitas & host">
                                    <p className="break-all">{row.identity}</p>
                                    <p>Host: {row.host ?? 'UNKNOWN'}</p>
                                    <p>
                                        Konfigurasi runtime cocok:{' '}
                                        {row.configuration_matches === null ||
                                        row.configuration_matches === undefined
                                            ? 'NOT VERIFIED'
                                            : row.configuration_matches
                                              ? 'Ya'
                                              : 'Tidak'}
                                    </p>
                                </Evidence>
                            </div>,
                            <div className="flex flex-col items-start gap-1">
                                <MonitorState value={row.state} />
                                <span className="text-xs text-muted-foreground">
                                    {row.stale
                                        ? 'Tidak ada bukti terkini'
                                        : row.evidence}
                                </span>
                            </div>,
                            monitorTime(row.observed_at),
                            <span className="break-all">
                                {row.queue ?? '—'} / {row.connection ?? '—'}
                            </span>,
                            row.job ? (
                                <div>
                                    <p>{row.job}</p>
                                    <p>
                                        {monitorNumber(row.elapsed_seconds)} s ·
                                        attempt {monitorNumber(row.attempts)}
                                    </p>
                                    <Evidence label="ID pekerjaan">
                                        {row.job_id ?? 'UNKNOWN'}
                                    </Evidence>
                                </div>
                            ) : (
                                'Belum terukur / tidak ada job aktif'
                            ),
                            row.timeout === null
                                ? 'UNKNOWN'
                                : `${row.timeout} s`,
                        ])}
                    />
                    {data.queues.rows === null ? (
                        <div>
                            <p role="alert">
                                Queue database tidak dapat dibaca. Pending /
                                reserved / delayed UNKNOWN. Periksa Errors untuk
                                diagnosis.
                            </p>
                            <DataGrid
                                title="Failed jobs · sumber terpisah"
                                headers={['Koneksi / queue', 'Failed 24 jam']}
                                rows={(data.queues.failed_rows ?? []).map(
                                    (row) => [
                                        `${row.connection} / ${row.name}`,
                                        monitorNumber(row.failed),
                                    ],
                                )}
                            />
                        </div>
                    ) : (
                        <DataGrid
                            title="Antrean Laravel · database"
                            headers={[
                                'Queue',
                                'Siap',
                                'Reserved',
                                'Delayed',
                                'Failed 24 jam',
                                'Attempt > 1',
                                'Tertua siap',
                                'Lease kedaluwarsa',
                                'Timeout / retry_after',
                            ]}
                            note={`Koneksi default: ${data.queues.default_connection}. Metrik hanya database. Siap, reserved, dan delayed terpisah; failed adalah arsip 24 jam.`}
                            rows={data.queues.rows.map((row) => [
                                <div>
                                    {row.name}
                                    <p className="text-xs text-muted-foreground">
                                        {row.connection}
                                    </p>
                                    <p className="text-xs">
                                        Concurrency teramati:{' '}
                                        {monitorNumber(
                                            row.observed_concurrency,
                                        )}
                                    </p>
                                </div>,
                                monitorNumber(row.pending),
                                monitorNumber(row.reserved),
                                monitorNumber(row.delayed),
                                monitorNumber(row.failed),
                                monitorNumber(row.retries),
                                row.oldest_pending_seconds === null
                                    ? '—'
                                    : `${monitorNumber(row.oldest_pending_seconds)} s`,
                                monitorNumber(row.expired_reservations),
                                <div>
                                    {row.worker_timeout ?? 'UNKNOWN'} /{' '}
                                    {row.retry_after} s
                                    {row.timeout_risk && (
                                        <p className="text-destructive">
                                            Risiko eksekusi ganda
                                        </p>
                                    )}
                                </div>,
                            ])}
                        />
                    )}
                    {data.retired_workers_count > 0 && (
                        <Disclosure>
                            <DisclosureSummary className="cursor-pointer">
                                Riwayat worker berhenti (
                                {monitorNumber(data.retired_workers_count)})
                            </DisclosureSummary>
                            <div className="mt-3 min-w-0">
                                <DataGrid
                                    title="Event penghentian worker"
                                    headers={[
                                        'Identitas / runtime',
                                        'Event terakhir',
                                        'Waktu event (WIB)',
                                        'Queue',
                                    ]}
                                    note="Maksimum 20 event berhenti terbaru yang tersimpan. Riwayat ini tidak dihitung sebagai worker aktif atau UNKNOWN."
                                    rows={data.retired_workers.map((row) => [
                                        <div>
                                            <p className="font-mono text-xs break-all">
                                                {row.identity}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {row.runtime}
                                            </p>
                                        </div>,
                                        <MonitorState value="STOPPED" />,
                                        monitorTime(row.observed_at),
                                        <span className="break-all">
                                            {row.queue ?? '—'}
                                        </span>,
                                    ])}
                                />
                            </div>
                        </Disclosure>
                    )}
                    <Disclosure>
                        <DisclosureSummary className="cursor-pointer">
                            Koneksi terdaftar
                        </DisclosureSummary>
                        <ul className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground">
                            {data.queues.sources?.map((source) => (
                                <li key={source.connection}>
                                    {source.connection} → DB{' '}
                                    {source.database_connection} /{' '}
                                    {source.table} ·{' '}
                                    {source.available ? 'Terbaca' : 'UNKNOWN'}
                                </li>
                            ))}
                            {data.queues.connections.map((row) => (
                                <li key={row.name}>
                                    {row.name} · {row.driver}
                                    {row.selected
                                        ? ' · default'
                                        : ' · konfigurasi, belum tentu digunakan'}
                                </li>
                            ))}
                        </ul>
                    </Disclosure>
                </div>
            );
        case 'scheduler':
            return (
                <DataGrid
                    title="Scheduler"
                    headers={[
                        'Command / jadwal',
                        'Hasil terakhir',
                        'Mulai terakhir (WIB)',
                        'Sukses / gagal terakhir (WIB)',
                        'Durasi',
                        'Berikutnya (WIB) / missed',
                    ]}
                    note="Jadwal terdaftar tidak membuktikan eksekusi. Kondisi when dan overlap dapat melewati jadwal; missed belum diinstrumentasi."
                    rows={data.scheduler.map((row) => [
                        <div>
                            <p className="font-mono text-xs">{row.name}</p>
                            <p className="text-xs text-muted-foreground">
                                {row.expression} · {row.timezone || 'UTC'} ·
                                overlap{' '}
                                {row.overlap_protection
                                    ? 'dilindungi'
                                    : 'tidak dilindungi'}
                            </p>
                        </div>,
                        <div>
                            <MonitorState value={row.state} />
                            {row.stale && row.last_state && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Event terakhir: {row.last_state};
                                    kedaluwarsa
                                </p>
                            )}
                        </div>,
                        monitorTime(row.last_run),
                        <div>
                            <p>Sukses: {monitorTime(row.last_success)}</p>
                            <p>Gagal: {monitorTime(row.last_failure)}</p>
                        </div>,
                        monitorDuration(row.duration_ms),
                        <div>
                            {monitorTime(row.next_expected_at)}
                            <p>Missed: UNKNOWN</p>
                        </div>,
                    ])}
                />
            );
        case 'integrations':
            return (
                <div className="flex min-w-0 flex-col gap-5">
                    <DataGrid
                        title="Integrasi"
                        headers={[
                            'Sumber',
                            'Health',
                            'Sukses / gagal terakhir (WIB)',
                            'Durasi operasi',
                            'Endpoint tercatat',
                            'Gagal 24 jam dalam sampel',
                        ]}
                        note="Health memakai hasil pemeriksaan sesi oleh worker yang masih berlaku. Heartbeat saja tidak membuktikan koneksi. Tidak ada probe eksternal dari halaman ini."
                        rows={data.integrations.map((row) => [
                            row.name,
                            <div className="max-w-xs whitespace-normal">
                                <MonitorState
                                    value={
                                        row.state === 'UNKNOWN'
                                            ? 'NOT VERIFIED'
                                            : row.state
                                    }
                                />
                                <Evidence>{row.evidence}</Evidence>
                                <p className="text-xs text-muted-foreground">
                                    {monitorTime(row.observed_at)}
                                </p>
                            </div>,
                            <div>
                                <p>Sukses: {monitorTime(row.last_success)}</p>
                                <p>Gagal: {monitorTime(row.last_failure)}</p>
                                <p className="text-xs text-muted-foreground">
                                    {row.error?.code}
                                </p>
                            </div>,
                            monitorDuration(row.duration_ms),
                            row.recorded_endpoint ?? 'UNKNOWN',
                            monitorNumber(row.recent_failures),
                        ])}
                    />
                    <DataGrid
                        title="Backlog report · terpisah dari queue Laravel"
                        headers={['Sumber', 'Tahap', 'Jumlah']}
                        note="Hitungan langsung semua status aktif / menunggu pada report_jobs."
                        rows={(data.backlogs ?? []).map((row) => [
                            row.source,
                            row.status,
                            monitorNumber(row.count),
                        ])}
                    />
                    <DataGrid
                        title="Failover APEX teramati"
                        headers={['Waktu (WIB)', 'Dari', 'Ke']}
                        note="Maksimum 20 per proses dalam 24 jam. Riwayat sebelum instrumentasi tidak tersedia."
                        rows={data.integrations.flatMap((row) =>
                            row.failovers.map((event) => [
                                monitorTime(event.observed_at),
                                event.from ?? 'UNKNOWN',
                                event.to ?? 'UNKNOWN',
                            ]),
                        )}
                    />
                </div>
            );
        case 'pipelines':
            return (
                <div className="flex min-w-0 flex-col gap-4">
                    <SearchableGrid
                        title="Pipeline"
                        data={data.pipelines}
                        headers={[
                            'ID / proses',
                            'Tahap',
                            'Waktu (WIB)',
                            'Durasi',
                            'Record / duplikat',
                            'Attempt / lease',
                            'Error',
                        ]}
                        searchable={(index) => {
                            const row = data.pipelines[index];
                            return `${row.id} ${row.name} ${row.stage} ${row.error?.code ?? ''}`;
                        }}
                        render={(index) => {
                            const row = data.pipelines[index];
                            return [
                                <div>
                                    <p className="font-mono text-xs">
                                        {row.id}
                                    </p>
                                    <p>{row.name}</p>
                                </div>,
                                <div className="flex flex-col items-start gap-1">
                                    <MonitorState value={row.outcome} />
                                    <span className="text-xs">{row.stage}</span>
                                </div>,
                                <div>
                                    <p>Mulai: {monitorTime(row.started_at)}</p>
                                    <p>
                                        Selesai: {monitorTime(row.finished_at)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Teramati: {monitorTime(row.observed_at)}
                                    </p>
                                </div>,
                                monitorDuration(row.duration_ms),
                                `${monitorNumber(row.records)} / ${monitorNumber(row.duplicates)}`,
                                <div>
                                    {monitorNumber(row.attempts)}
                                    {row.lease_until && (
                                        <p
                                            className={
                                                row.lease_expired
                                                    ? 'text-destructive'
                                                    : 'text-muted-foreground'
                                            }
                                        >
                                            Lease:{' '}
                                            {monitorTime(row.lease_until)}
                                            {row.lease_expired &&
                                                ' · kedaluwarsa'}
                                        </p>
                                    )}
                                </div>,
                                row.error?.code ?? '—',
                            ];
                        }}
                    />
                    <Disclosure className="min-w-0">
                        <DisclosureSummary className="min-h-11 cursor-pointer">
                            Scheduler · expected / actual
                        </DisclosureSummary>
                        <ControlCenterContent data={data} section="scheduler" />
                    </Disclosure>
                    <Disclosure className="min-w-0">
                        <DisclosureSummary className="min-h-11 cursor-pointer">
                            Durasi & performa
                        </DisclosureSummary>
                        <ControlCenterContent
                            data={data}
                            section="performance"
                        />
                    </Disclosure>
                    <DataGrid
                        title="CLI import & maintenance"
                        headers={[
                            'Command',
                            'Hasil',
                            'Teramati (WIB)',
                            'Durasi / exit',
                        ]}
                        note="Event command allowlist; argumen, output dan payload tidak dicatat. Tidak ada catatan bukan bukti command tidak berjalan."
                        rows={(data.commands ?? []).map((row) => [
                            row.name,
                            <MonitorState value={row.state} />,
                            monitorTime(row.observed_at),
                            `${monitorDuration(row.duration_ms)} / ${monitorNumber(row.exit_code)}`,
                        ])}
                    />
                </div>
            );
        case 'diagnostics':
            return (
                <div className="flex min-w-0 flex-col gap-4">
                    <DataGrid
                        title="Diagnostik sumber"
                        headers={[
                            'Sumber',
                            'Status',
                            'Kategori / kode',
                            'Teramati (WIB)',
                            'Durasi',
                        ]}
                        note="Diagnosis terisolasi per sumber. SQL, bindings, payload, host database dan kredensial tidak ditampilkan."
                        rows={(data.source_diagnostics ?? [])
                            .filter((row) => row.state !== 'HEALTHY')
                            .map((row) => [
                                row.source,
                                <MonitorState value={row.state} />,
                                <div>
                                    {row.category}
                                    <p>
                                        {row.exception_type} · {row.sqlstate} /{' '}
                                        {row.driver_code}
                                    </p>
                                </div>,
                                monitorTime(row.observed_at),
                                monitorDuration(row.duration_ms),
                            ])}
                    />
                    {data.error_summary && (
                        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                            {[
                                [
                                    'Error events',
                                    data.error_summary.error_events,
                                ],
                                [
                                    'Failed attempts',
                                    data.error_summary.failed_attempts,
                                ],
                                ['Failed jobs', data.error_summary.failed_jobs],
                                ['Failed runs', data.error_summary.failed_runs],
                                [
                                    'Business attention',
                                    data.error_summary.attention_records,
                                ],
                                [
                                    'Grup bukti',
                                    data.error_summary.incident_groups,
                                ],
                                ['Insiden unik', null],
                            ].map(([label, count]) => (
                                <div key={label}>
                                    <dt className="text-xs text-muted-foreground">
                                        {label}
                                    </dt>
                                    <dd>
                                        {monitorNumber(count as number | null)}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}
                    <SearchableGrid
                        title="Diagnostik"
                        data={data.diagnostics}
                        headers={[
                            'Pertama / terakhir (WIB)',
                            'Korelasi / jenis',
                            'Komponen',
                            'Kode / fingerprint',
                            'Bukti / attempt',
                        ]}
                        searchable={(index) => {
                            const row = data.diagnostics[index];
                            return `${row.id} ${row.source} ${row.code} ${row.summary} ${row.fingerprint} ${row.exception_type} ${row.kind}`;
                        }}
                        render={(index) => {
                            const row = data.diagnostics[index];
                            return [
                                <div>
                                    <p>
                                        {monitorTime(
                                            row.first_at ?? row.observed_at,
                                        )}
                                    </p>
                                    <p>
                                        {monitorTime(
                                            row.last_at ?? row.observed_at,
                                        )}
                                    </p>
                                </div>,
                                <div>
                                    <code className="text-xs">
                                        {row.correlation_id ?? row.id}
                                    </code>
                                    <p>{row.kind}</p>
                                </div>,
                                <div>
                                    {row.source}
                                    <p className="text-xs">
                                        {row.exception_type ??
                                            'Exception NOT VERIFIED'}
                                    </p>
                                </div>,
                                <div>
                                    <MonitorState value={row.code} />
                                    <Evidence label="Fingerprint">
                                        {row.fingerprint}
                                        <p>{row.summary}</p>
                                    </Evidence>
                                </div>,
                                <div>
                                    {monitorNumber(row.occurrences)} bukti
                                    <p>
                                        Attempt:{' '}
                                        {row.attempts?.join(', ') || 'UNKNOWN'}
                                    </p>
                                </div>,
                            ];
                        }}
                    />
                    <Disclosure>
                        <DisclosureSummary className="min-h-11 cursor-pointer">
                            Semua sumber & timing
                        </DisclosureSummary>
                        <DataGrid
                            title="Timing sumber"
                            headers={['Sumber', 'Status', 'Durasi']}
                            rows={(data.source_diagnostics ?? []).map((row) => [
                                row.source,
                                row.state,
                                monitorDuration(row.duration_ms),
                            ])}
                        />
                    </Disclosure>
                </div>
            );
        case 'performance':
            return (
                <DataGrid
                    title="Performa job PHP terukur"
                    headers={['Pengukuran', 'Nilai', 'Cakupan']}
                    note="Sampel lifecycle 24 jam, maksimum 30 attempt per proses. P50/P95 memerlukan minimal 5 sampel."
                    rows={[
                        [
                            'Attempt berdurasi',
                            monitorNumber(data.performance.sample_count),
                            'Sampel tersimpan; bukan seluruh throughput',
                        ],
                        [
                            'Durasi job P50',
                            monitorDuration(data.performance.duration_p50_ms),
                            'Nearest-rank',
                        ],
                        [
                            'Durasi job P95',
                            monitorDuration(data.performance.duration_p95_ms),
                            'Nearest-rank',
                        ],
                        [
                            'Waktu tunggu P50',
                            monitorDuration(data.performance.wait_p50_ms),
                            `${data.performance.wait_sample_count} attempt pertama memiliki createdAt`,
                        ],
                        [
                            'Attempt gagal',
                            data.performance.failed_attempt_percent === null
                                ? 'UNKNOWN'
                                : `${monitorNumber(data.performance.failed_attempt_percent)}%`,
                            'Rasio attempt dalam sampel; bukan kegagalan bisnis',
                        ],
                        [
                            'Throughput / tren backlog',
                            'Not Instrumented',
                            'Belum tersedia deret waktu yang lengkap',
                        ],
                        [
                            'Penyusunan snapshot',
                            monitorDuration(data.performance.query_ms),
                            'Server; tidak termasuk jaringan dan render',
                        ],
                    ]}
                />
            );
        default:
            return <ControlCenterOverview data={data} />;
    }
}

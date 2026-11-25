import { useState } from 'react';
import {
    ArrowRight,
    CheckCircle2,
    CircleAlert,
    Cloud,
    Cpu,
    Database,
    FileText,
    Gauge,
    Layers,
    ListTodo,
    Mail,
    Search,
    Server,
    Settings2,
    ShieldCheck,
    Terminal,
    Users,
    Workflow,
    type LucideIcon,
} from 'lucide-react';
import FilterSelect from '@/components/filter-select';
import ServerHeartbeatPanel from '@/components/server-heartbeat-panel';
import SecondaryDisclosure from '@/components/secondary-disclosure';
import {
    DataGrid,
    MonitorState,
    monitorNumber,
    monitorTime,
} from '@/components/it-control-center-ui';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type {
    ControlCenterData,
    MonitorService,
} from '@/types/it-control-center';

export function serviceNeedsReview(row: MonitorService): boolean {
    return (
        ['DEGRADED', 'UNHEALTHY'].includes(row.runtime_state ?? row.state) ||
        ['DEGRADED', 'UNHEALTHY'].includes(row.readiness_state) ||
        [
            'NEEDS_ATTENTION',
            'DEGRADED',
            'UNHEALTHY',
            'FAILED',
            'ATTENTION',
        ].includes(row.execution_state)
    );
}

export function serviceStatusText(
    row: MonitorService,
    dimension: 'runtime' | 'readiness' | 'execution',
): string {
    if (dimension === 'runtime') {
        if (row.runtime === 'Not Instrumented') return 'Belum dipantau';
        if (row.runtime === 'PHP CLI') return 'Proses sesaat';
        return row.runtime_state ?? row.state;
    }
    if (dimension === 'readiness') {
        if (row.readiness_state && row.readiness_state !== 'UNKNOWN')
            return row.readiness_state;
        return [
            'APEX JNE CCC',
            'Hybrid PM',
            'Hybrid Puman',
            'Cashless entry',
            'SMTP email',
            'FCM push',
        ].includes(row.name)
            ? 'Belum diuji'
            : 'Tidak berlaku';
    }
    if (row.execution_state && row.execution_state !== 'UNKNOWN')
        return row.execution_state;
    return [
        'Web application',
        'Database',
        'PHP queues',
        'Infrastructure / CPU / RAM / disk',
        'Cache / locks',
    ].includes(row.name)
        ? 'Tidak berlaku'
        : 'Belum ada hasil';
}

export function filterMonitorServices(
    services: MonitorService[],
    query: string,
    status: string,
): MonitorService[] {
    const search = query.trim().toLocaleLowerCase();
    return services.filter((row) => {
        const matchesQuery = `${row.name} ${row.runtime}`
            .toLocaleLowerCase()
            .includes(search);
        const matchesStatus =
            !status ||
            (status === 'attention' && serviceNeedsReview(row)) ||
            (status === 'healthy' &&
                (row.runtime_state ?? row.state) === 'HEALTHY') ||
            (status === 'unknown' &&
                (['runtime', 'readiness', 'execution'] as const).some(
                    (dimension) =>
                        [
                            'UNKNOWN',
                            'Belum dipantau',
                            'Belum diuji',
                            'Belum ada hasil',
                        ].includes(serviceStatusText(row, dimension)),
                ));
        return matchesQuery && matchesStatus;
    });
}

function serviceIcon(row: MonitorService): LucideIcon {
    if (row.runtime.includes('Node')) return Cloud;
    if (row.name === 'Database') return Database;
    if (row.name === 'Web application') return Layers;
    if (row.name === 'Scheduler') return Workflow;
    if (row.name.includes('Infrastructure')) return Gauge;
    if (row.name.includes('Cache')) return ShieldCheck;
    if (row.name.includes('CLI')) return Terminal;
    if (row.name.includes('email')) return Mail;
    if (row.name.includes('Dokumen')) return FileText;
    return Cpu;
}

const clock = new Intl.DateTimeFormat('id-ID', {
    timeStyle: 'medium',
    timeZone: 'Asia/Jakarta',
});
function Freshness({ value }: { value: string | null }) {
    return value ? (
        <time
            dateTime={value}
            title={`${monitorTime(value)} WIB`}
            className="mt-1 block text-xs text-muted-foreground"
        >
            {clock.format(new Date(value))} WIB
        </time>
    ) : null;
}

function ServiceEvidence({
    row,
    compact = false,
}: {
    row: MonitorService;
    compact?: boolean;
}) {
    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    className="min-h-11 gap-2 px-2 text-xs"
                    aria-label={`Bukti & detail: ${row.name}`}
                >
                    <FileText aria-hidden="true" />
                    {compact ? 'Bukti' : 'Bukti & detail'}
                    {!compact && <ArrowRight aria-hidden="true" />}
                </Button>
            </SheetTrigger>
            <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
                <SheetHeader>
                    <SheetTitle>{row.name}</SheetTitle>
                    <SheetDescription>
                        {row.runtime} · bukti pada snapshot terakhir
                    </SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-6 px-4 pb-6 text-sm">
                    <dl className="flex flex-col divide-y rounded-lg border px-4">
                        {[
                            [
                                'Runtime health',
                                serviceStatusText(row, 'runtime'),
                                row.observed_at,
                            ],
                            [
                                'Integration readiness',
                                serviceStatusText(row, 'readiness'),
                                row.readiness_observed_at,
                            ],
                            [
                                'Execution health',
                                serviceStatusText(row, 'execution'),
                                row.execution_observed_at,
                            ],
                        ].map(([label, state, date]) => (
                            <div
                                key={label}
                                className="flex flex-wrap items-start justify-between gap-2 py-3"
                            >
                                <dt className="font-medium">{label}</dt>
                                <dd className="text-right">
                                    <MonitorState value={state ?? 'UNKNOWN'} />
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {monitorTime(date ?? null)} WIB
                                    </p>
                                </dd>
                            </div>
                        ))}
                    </dl>
                    <div>
                        <h3 className="font-semibold">Bukti runtime</h3>
                        <p className="mt-2 text-muted-foreground">
                            {row.evidence}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                            Cakupan: {row.coverage}
                        </p>
                    </div>
                    <dl className="grid gap-4">
                        <div>
                            <dt className="text-xs text-muted-foreground">
                                Sukses terakhir
                            </dt>
                            <dd>{monitorTime(row.last_success)} WIB</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">
                                Kegagalan / perhatian historis
                            </dt>
                            <dd>{monitorTime(row.last_failure)} WIB</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">
                                Gagal / perhatian dalam sampel 24 jam
                            </dt>
                            <dd>{monitorNumber(row.recent_failures)}</dd>
                        </div>
                    </dl>
                    {row.error && (
                        <Alert variant="destructive">
                            <CircleAlert aria-hidden="true" />
                            <AlertTitle>{row.error.code}</AlertTitle>
                            <AlertDescription>
                                {row.error.summary}
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

function ServiceStatus({
    row,
    dimension,
}: {
    row: MonitorService;
    dimension: 'runtime' | 'readiness' | 'execution';
}) {
    const state = serviceStatusText(row, dimension);
    const date =
        dimension === 'runtime'
            ? row.observed_at
            : dimension === 'readiness'
              ? row.readiness_observed_at
              : row.execution_observed_at;
    return (
        <div>
            <MonitorState value={state} />
            {dimension === 'execution' && row.recent_failures > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                    {monitorNumber(row.recent_failures)} gagal / perhatian 24j
                </p>
            )}
            <Freshness value={date} />
        </div>
    );
}

function ServiceInventory({ data }: { data: ControlCenterData }) {
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('');
    const services = filterMonitorServices(data.services, query, status);
    return (
        <section
            aria-label="Layanan sistem"
            className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-xs"
        >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b p-4">
                <div className="flex items-center gap-3">
                    <Server
                        aria-hidden="true"
                        className="size-5 text-primary"
                    />
                    <div>
                        <h2 className="text-sm font-semibold">
                            Layanan sistem
                        </h2>
                        <p
                            className="mt-0.5 text-xs text-muted-foreground"
                            aria-live="polite"
                        >
                            {services.length} dari {data.services.length}{' '}
                            layanan
                        </p>
                    </div>
                </div>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
                    <div className="relative min-w-0 sm:w-56">
                        <Label htmlFor="service-search" className="sr-only">
                            Cari layanan
                        </Label>
                        <Search
                            aria-hidden="true"
                            className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground"
                        />
                        <Input
                            id="service-search"
                            name="service_search"
                            autoComplete="off"
                            spellCheck={false}
                            className="min-h-11 pl-9"
                            placeholder="Cari layanan…"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </div>
                    <div className="sm:w-52">
                        <FilterSelect
                            id="service-status"
                            label="Status layanan"
                            value={status}
                            all="Semua status"
                            options={[
                                ['attention', 'Perlu ditinjau'],
                                ['healthy', 'Runtime sehat'],
                                ['unknown', 'Bukti belum lengkap'],
                            ]}
                            onChange={setStatus}
                        />
                    </div>
                </div>
            </div>
            <div
                className="hidden overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:block"
                role="region"
                tabIndex={0}
                aria-label="Tabel Layanan sistem, geser untuk kolom lainnya"
            >
                <Table className="min-w-200">
                    <TableHeader className="bg-muted/40">
                        <TableRow>
                            {[
                                'Layanan / runtime',
                                'Runtime',
                                'Readiness',
                                'Execution',
                                'Bukti',
                            ].map((label) => (
                                <TableHead
                                    key={label}
                                    className="px-4 text-xs"
                                    scope="col"
                                >
                                    {label}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {services.map((row) => {
                            const Icon = serviceIcon(row);
                            return (
                                <TableRow key={row.name}>
                                    <TableCell className="px-4 py-2.5 align-top">
                                        <div className="flex items-start gap-3">
                                            <Icon
                                                aria-hidden="true"
                                                className="mt-0.5 size-4 shrink-0 text-primary"
                                            />
                                            <div>
                                                <p className="font-medium">
                                                    {row.name}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {row.runtime}
                                                </p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-4 py-2.5 align-top">
                                        <ServiceStatus
                                            row={row}
                                            dimension="runtime"
                                        />
                                    </TableCell>
                                    <TableCell className="px-4 py-2.5 align-top">
                                        <ServiceStatus
                                            row={row}
                                            dimension="readiness"
                                        />
                                    </TableCell>
                                    <TableCell className="px-4 py-2.5 align-top">
                                        <ServiceStatus
                                            row={row}
                                            dimension="execution"
                                        />
                                    </TableCell>
                                    <TableCell className="px-3 py-1 align-top">
                                        <ServiceEvidence row={row} />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {services.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={5}
                                    className="px-4 py-8 text-center text-muted-foreground"
                                >
                                    Tidak ada layanan yang cocok. Ubah pencarian
                                    atau filter.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <ul className="divide-y md:hidden" aria-label="Daftar layanan">
                {services.map((row) => {
                    const Icon = serviceIcon(row);
                    return (
                        <li key={row.name} className="flex flex-col gap-2 p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-start gap-2">
                                    <Icon
                                        aria-hidden="true"
                                        className="mt-0.5 size-4 shrink-0 text-primary"
                                    />
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-semibold">
                                            {row.name}
                                        </h3>
                                        <p className="text-xs text-muted-foreground">
                                            {row.runtime}
                                        </p>
                                    </div>
                                </div>
                                <ServiceEvidence row={row} compact />
                            </div>
                            <dl className="flex flex-col gap-1.5">
                                {(
                                    [
                                        'runtime',
                                        'readiness',
                                        'execution',
                                    ] as const
                                ).map((dimension) => (
                                    <div
                                        key={dimension}
                                        className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1"
                                    >
                                        <dt className="text-xs text-muted-foreground">
                                            {dimension === 'runtime'
                                                ? 'Runtime'
                                                : dimension === 'readiness'
                                                  ? 'Readiness'
                                                  : 'Execution'}
                                        </dt>
                                        <dd className="text-right">
                                            <ServiceStatus
                                                row={row}
                                                dimension={dimension}
                                            />
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </li>
                    );
                })}
                {services.length === 0 && (
                    <li className="p-6 text-sm text-muted-foreground">
                        Tidak ada layanan yang cocok. Ubah pencarian atau
                        filter.
                    </li>
                )}
            </ul>
        </section>
    );
}

export function ControlCenterOverview({ data }: { data: ControlCenterData }) {
    const [showAllIssues, setShowAllIssues] = useState(false);
    const queues = data.queues?.rows;
    const queueAvailable = !data.queues?.sources?.some(
        (source) => !source.available,
    );
    const pending = queueAvailable
        ? (queues?.reduce((total, row) => total + row.pending, 0) ?? null)
        : null;
    const reserved = queueAvailable
        ? (queues?.reduce((total, row) => total + row.reserved, 0) ?? null)
        : null;
    const failedRows = data.queues?.failed_rows;
    const failed =
        failedRows?.length && failedRows.every((row) => row.failed !== null)
            ? failedRows.reduce((total, row) => total + (row.failed ?? 0), 0)
            : null;
    const issues = [
        ...(data.source_diagnostics ?? [])
            .filter((row) => row.state !== 'HEALTHY')
            .map((row) => ({
                key: `source:${row.source}`,
                name: row.source,
                state: 'UNKNOWN',
                detail: row.category ?? 'Sumber belum tersedia',
                href: '#diagnostics',
                action: 'Periksa sumber',
            })),
        ...(queues ?? [])
            .filter((row) => row.timeout_risk || row.expired_reservations > 0)
            .map((row) => ({
                key: `queue:${row.connection}:${row.name}`,
                name: row.name,
                state: 'NEEDS_ATTENTION',
                detail: row.timeout_risk
                    ? 'Timeout worker ≥ retry_after'
                    : `${row.expired_reservations} reservasi kedaluwarsa`,
                href: '#workers',
                action: 'Periksa queue',
            })),
        ...data.services.filter(serviceNeedsReview).map((row) => {
            const runtime = row.runtime_state ?? row.state;
            const dimension = ['DEGRADED', 'UNHEALTHY'].includes(runtime)
                ? 'Runtime'
                : ['DEGRADED', 'UNHEALTHY'].includes(row.readiness_state)
                  ? 'Readiness'
                  : 'Execution';
            const state =
                dimension === 'Runtime'
                    ? runtime
                    : dimension === 'Readiness'
                      ? row.readiness_state
                      : row.execution_state;
            return {
                key: row.name,
                name: row.name,
                state,
                detail: `${dimension}${row.recent_failures > 0 ? ` · ${monitorNumber(row.recent_failures)} gagal / perhatian 24j` : ''}`,
                href:
                    dimension === 'Execution'
                        ? '#pipelines'
                        : dimension === 'Readiness'
                          ? '#integrations'
                          : '#workers',
                action: 'Tinjau bukti',
            };
        }),
    ];
    const visibleIssues = showAllIssues ? issues : issues.slice(0, 3);
    const stats: {
        label: string;
        value: string;
        detail: string;
        icon: LucideIcon;
    }[] = data.overview
        ? [
              {
                  label: 'Runtime sehat',
                  value: `${data.overview.healthy} / ${data.services.length}`,
                  detail: `${data.overview.degraded + data.overview.unhealthy} bermasalah · ${data.overview.unknown} unknown`,
                  icon: ShieldCheck,
              },
              {
                  label: 'Worker online',
                  value: monitorNumber(data.overview.workers_available),
                  detail: `${data.overview.workers_unknown} unknown`,
                  icon: Users,
              },
              {
                  label: 'Queue siap',
                  value: monitorNumber(pending),
                  detail: `Reserved ${monitorNumber(reserved)} · failed 24j ${monitorNumber(failed)}`,
                  icon: ListTodo,
              },
              {
                  label: 'Report aktif',
                  value: monitorNumber(data.overview.active_reports),
                  detail: '',
                  icon: FileText,
              },
              {
                  label: 'Bukti 24 jam',
                  value: monitorNumber(
                      data.error_summary?.evidence_rows ??
                          data.overview.errors_in_sample,
                  ),
                  detail: 'Error / perhatian',
                  icon: CircleAlert,
              },
          ]
        : [];
    return (
        <div className="flex min-w-0 flex-col gap-4">
            <ServerHeartbeatPanel hosts={data.hosts ?? []} />
            {issues.length > 0 ? (
                <DataGrid
                    title="Perlu ditinjau"
                    icon={CircleAlert}
                    headers={['Sumber', 'Bukti terbaru', 'Tindak lanjut']}
                    toolbar={
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">
                                {issues.length} masalah
                            </Badge>
                            {issues.length > 3 && (
                                <Button
                                    className="min-h-11"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        setShowAllIssues(!showAllIssues)
                                    }
                                    aria-expanded={showAllIssues}
                                >
                                    {showAllIssues
                                        ? 'Ringkas'
                                        : `Lihat semua (${issues.length})`}
                                </Button>
                            )}
                        </div>
                    }
                    mobileRows={visibleIssues.map((issue) => (
                        <div key={issue.key} className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold">
                                    {issue.name}
                                </p>
                                <MonitorState value={issue.state} />
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">
                                    {issue.detail}
                                </p>
                                <Button
                                    asChild
                                    variant="link"
                                    className="min-h-11 px-0"
                                >
                                    <a href={issue.href}>
                                        {issue.action}
                                        <ArrowRight aria-hidden="true" />
                                    </a>
                                </Button>
                            </div>
                        </div>
                    ))}
                    rows={visibleIssues.map((issue) => [
                        <span className="font-medium">{issue.name}</span>,
                        <div>
                            <MonitorState value={issue.state} />
                            <p className="mt-1 text-xs text-muted-foreground">
                                {issue.detail}
                            </p>
                        </div>,
                        <Button
                            asChild
                            variant="link"
                            className="min-h-11 px-0"
                        >
                            <a href={issue.href}>
                                {issue.action}
                                <ArrowRight aria-hidden="true" />
                            </a>
                        </Button>,
                    ])}
                />
            ) : (
                <Alert>
                    <CheckCircle2 aria-hidden="true" className="text-success" />
                    <AlertTitle>Tidak ada masalah teramati</AlertTitle>
                    <AlertDescription>
                        Berdasarkan bukti pada snapshot ini. Layanan tanpa bukti
                        tetap UNKNOWN.
                    </AlertDescription>
                </Alert>
            )}
            {stats.length > 0 && (
                <div
                    role="group"
                    aria-label="Ringkasan monitoring"
                    className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] overflow-hidden rounded-xl border bg-card shadow-xs"
                >
                    {stats.map(({ label, value, detail, icon: Icon }) => (
                        <div
                            key={label}
                            className="flex gap-3 border-b p-3 last:col-span-2 last:border-b-0 sm:p-4 sm:last:col-span-1 xl:border-b-0"
                        >
                            <div className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
                                <Icon aria-hidden="true" className="size-4" />
                            </div>
                            <dl className="min-w-0">
                                <dt className="text-xs text-muted-foreground">
                                    {label}
                                </dt>
                                <dd className="mt-1 text-lg font-semibold tracking-tight tabular-nums">
                                    {value}
                                    {detail && (
                                        <span className="mt-1 block text-xs font-normal tracking-normal text-muted-foreground">
                                            {detail}
                                        </span>
                                    )}
                                </dd>
                            </dl>
                        </div>
                    ))}
                </div>
            )}
            <ServiceInventory data={data} />
            {data.instrumentation && (
                <SecondaryDisclosure
                    title={
                        <span className="flex flex-wrap items-center gap-2">
                            <Settings2
                                aria-hidden="true"
                                className="size-4 text-primary"
                            />
                            Infrastruktur & cache
                            <Badge variant="secondary">Bukti parsial</Badge>
                        </span>
                    }
                >
                    <DataGrid
                        title="Instrumentasi runtime monitoring"
                        headers={['Pengukuran', 'Nilai', 'Cakupan']}
                        rows={[
                            [
                                'Disk kosong / total (GiB)',
                                `${monitorNumber(data.instrumentation.disk_free_bytes === null ? null : data.instrumentation.disk_free_bytes / 1024 ** 3)} / ${monitorNumber(data.instrumentation.disk_total_bytes === null ? null : data.instrumentation.disk_total_bytes / 1024 ** 3)}`,
                                data.instrumentation.scope,
                            ],
                            [
                                'Memori PHP (MiB)',
                                monitorNumber(
                                    data.instrumentation.php_memory_bytes /
                                        1024 ** 2,
                                ),
                                'Proses request ini; bukan RAM host',
                            ],
                            [
                                'CPU % / RAM host',
                                'Lihat Heartbeat server',
                                'Pengukuran host dipisahkan dari memori proses PHP',
                            ],
                            [
                                'Load average 1m',
                                monitorNumber(data.instrumentation.load_1m),
                                'Bukan persentase CPU; UNKNOWN bila OS tidak mendukung',
                            ],
                            [
                                'Cache read',
                                data.instrumentation.cache_read_state,
                                data.instrumentation.cache_store,
                            ],
                            [
                                'Distributed locks',
                                'NOT VERIFIED',
                                data.instrumentation.cache_evidence,
                            ],
                        ]}
                    />
                    <p className="text-xs text-muted-foreground">
                        Host {data.instrumentation.host} ·{' '}
                        {monitorTime(data.instrumentation.observed_at)} WIB
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {data.window}
                    </p>
                </SecondaryDisclosure>
            )}
        </div>
    );
}

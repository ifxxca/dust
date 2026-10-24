import { Link, router, useForm, usePage } from '@inertiajs/react';
import { useRef, useState } from 'react';
import {
    ArrowDownUp,
    ArrowUpRight,
    Filter,
    PanelRightOpen,
    Search,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/operational-ui';
import {
    MonitoringWorkspaceHeader,
    MonitoringMetric,
} from '@/components/monitoring-workspace';
import { cohortScope, dateBases } from '@/components/pickup-monitoring-period';
import type { MonitoringOperations } from '@/components/pickup-monitoring-period';
import { ResultStatus, metricDefinitions } from '@/components/pickup-result-ui';
import PickupResultDrawer from '@/components/pickup-result-drawer';
import MonitoringInsights from '@/components/monitoring-insights';
import { quickPickupId } from '@/lib/pickup-monitoring-navigation';
import {
    pickupQueueFilters,
    pickupQueueLabels,
} from '@/lib/pickup-work-queues';
import * as routes from '@/routes/pickup-results';
import type { ResultPage } from '@/types/pickup-result';

export type PickupReportPage = Omit<ResultPage, 'data'> & {
    data: (Record<string, number | string | null> & {
        label: string | null;
        total: number;
    })[];
};
const options: Record<string, [string, string][]> = {
    visit_outcome: [
        ['not_visited', 'Belum dikunjungi'],
        ['visited', 'Sudah dikunjungi'],
        ['in_progress', 'Kunjungan berjalan'],
        ['COLLECTED', 'Paket diambil'],
        ['NO_PACKAGES', 'Tidak ada paket'],
    ],
    pop_status: [
        ['final', 'POP Final'],
        ['incomplete', 'Belum final POP'],
    ],
    handover_status: [
        ['none', 'Belum ada handover'],
        ['waiting', 'Menunggu handover'],
        ['DRAFT', 'Menunggu penerimaan'],
        ['IN_VERIFICATION', 'Dalam verifikasi'],
        ['CLOSED', 'Ditutup'],
    ],
    verification_status: [
        ['none', 'Belum ada handover'],
        ['pending', 'Menunggu verifikasi'],
        ['verified', 'Sudah diverifikasi'],
        ['review', 'Perlu tinjau ulang'],
    ],
    discrepancy_status: [
        ['yes', 'Ada selisih'],
        ['no', 'Tidak tercatat selisih'],
    ],
    date_basis: Object.entries(dateBases),
    sort: [
        ['scheduled_at', 'Jadwal'],
        ['period_at', 'Tanggal acuan'],
        ['reference', 'Referensi'],
        ['customer_name', 'Customer'],
        ['staff_name', 'Petugas'],
    ],
    direction: [
        ['desc', 'Menurun'],
        ['asc', 'Menaik'],
    ],
    per_page: [
        ['10', '10'],
        ['20', '20'],
        ['50', '50'],
    ],
    group_by: [
        ['date', 'Laporan per tanggal'],
        ['staff', 'Laporan per petugas'],
        ['customer', 'Laporan per customer'],
    ],
};
const fields = [
    ['reference', 'Referensi Pickup'],
    ['customer', 'Customer'],
    ['staff', 'Pickup Staff'],
    ['visit_outcome', 'Hasil Kunjungan'],
    ['pop_status', 'Status POP'],
    ['handover_status', 'Status Handover'],
    ['verification_status', 'Status Verifikasi'],
    ['discrepancy_status', 'Selisih'],
    ['sort', 'Urutkan'],
    ['direction', 'Arah'],
    ['per_page', 'Baris per halaman'],
    ['group_by', 'Tampilan'],
] as const;
const defaults: Record<string, string> = {
    date_basis: 'pickup',
    sort: 'scheduled_at',
    direction: 'desc',
    per_page: '20',
    scope: 'daily',
};

export function PickupPrimaryMetrics({
    filters,
    operations,
    overview,
}: {
    filters: Record<string, string>;
    operations: MonitoringOperations;
    overview: Record<string, number>;
}) {
    const period = `${filters.date_from} – ${filters.date_to} WIB`;
    const items = [
        {
            label: 'Pickup Dijadwalkan',
            value: operations.activity.scheduled,
            hint: `Pickup & rencana · ${period}`,
            query: {
                ...pickupQueueFilters(filters, ''),
                date_basis: 'pickup',
            },
        },
        {
            label: 'Pickup Dikunjungi',
            value: operations.activity.visited,
            hint: `Kunjungan · hari operasional dipilih`,
            query: {
                ...pickupQueueFilters(filters, ''),
                date_basis: 'pickup',
                visit_outcome: 'visited',
            },
        },
        {
            label: 'POP Final',
            value: overview.pop_final,
            hint: 'Status terbaru · periode dipilih',
            query: { ...pickupQueueFilters(filters, ''), pop_status: 'final' },
        },
        {
            label: 'Menunggu Handover',
            value: overview.waiting_handover,
            hint: 'POP final, belum masuk sesi',
            query: pickupQueueFilters(filters, 'waiting_handover'),
        },
        {
            label: 'Menunggu Verifikasi',
            value: overview.unverified,
            hint: 'Belum diperiksa / perlu tinjau ulang',
            query: pickupQueueFilters(filters, 'unverified'),
        },
    ];
    return (
        <section
            aria-label="Ringkasan operasional"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
            {items.map((item) => (
                <MonitoringMetric
                    key={item.label}
                    label={item.label}
                    value={item.value ?? 0}
                    hint={item.hint}
                    href={routes.index.url({ query: item.query })}
                />
            ))}
        </section>
    );
}

export default function PickupMonitoring({
    pickups,
    report,
    summary,
    overview,
    queues,
    filters,
    timezone,
    operations,
}: {
    pickups: ResultPage | null;
    report: PickupReportPage | null;
    summary: Record<string, number>;
    overview: Record<string, number>;
    queues: Record<string, number>;
    filters: Record<string, string>;
    timezone: string;
    operations: MonitoringOperations;
}) {
    const form = useForm<Record<string, string>>({
        ...Object.fromEntries(
            fields.map(([key]) => [key, defaults[key] ?? '']),
        ),
        q: '',
        ...Object.fromEntries(
            Object.entries(filters).map(([key, value]) => [key, String(value)]),
        ),
        monitoring: 'pickup',
    });
    const [advanced, setAdvanced] = useState(false);
    const [rangeOpen, setRangeOpen] = useState(false);
    const [error, setError] = useState('');
    const origin = useRef<HTMLElement | null>(null);
    const pageUrl = usePage().url;
    const selectedId = quickPickupId(pageUrl);
    const currentPage = pickups ?? report;
    const context = routes.index.url({
        query: { ...filters, page: currentPage?.current_page ?? 1 },
    });
    const openQuick = (id: number, element: HTMLElement | null) => {
        origin.current = element;
        router.push({
            url: routes.index.url({
                query: {
                    ...filters,
                    page: currentPage?.current_page ?? 1,
                    quick_pickup: id,
                },
            }),
            preserveState: true,
            preserveScroll: true,
        });
    };
    const submit = (values = form.data) => {
        setError('');
        form.transform(() =>
            Object.fromEntries(
                Object.entries({
                    ...values,
                    monitoring: 'pickup',
                    page: '1',
                }).filter(([, value]) => value !== ''),
            ),
        );
        form.get(routes.index.url(), {
            preserveState: 'errors',
            preserveScroll: true,
            onError: () => {
                setAdvanced(true);
                setError(
                    'Filter belum diterapkan. Periksa rentang tanggal dan isian.',
                );
            },
            onNetworkError: () => {
                setError('Koneksi terputus. Coba kembali.');
                return false;
            },
        });
    };
    const applied = Object.entries(filters).filter(
        ([key, value]) =>
            value &&
            ![
                'date_from',
                'date_to',
                'monitoring',
                'page',
                'quick_pickup',
                'q',
            ].includes(key) &&
            String(value) !== defaults[key],
    );
    const chips = [...applied, ...(filters.q ? [['q', filters.q]] : [])];
    const clear = () =>
        submit({
            date_from: filters.date_from,
            date_to: filters.date_to,
            date_basis: filters.date_basis,
            scope: 'daily',
        });
    const scope = cohortScope(filters, operations.today);
    return (
        <div className="space-y-4">
            <MonitoringWorkspaceHeader
                insights={
                    <MonitoringInsights
                        key={selectedId ?? 'closed'}
                        operations={operations}
                        filters={filters}
                        disabled={selectedId !== null}
                        pickupSummary={summary}
                        timezone={timezone}
                    />
                }
                current="pickup"
                subtitle="Pantau kunjungan, POP, dan serah terima Retail."
                filters={filters}
                operations={operations}
                busy={form.processing}
                rangeOpen={rangeOpen}
                toggleRange={() => setRangeOpen(!rangeOpen)}
                openAdvanced={() => setAdvanced(true)}
                refresh={() =>
                    router.visit(routes.index({ query: filters }), {
                        preserveState: true,
                        preserveScroll: true,
                        fresh: true,
                    })
                }
                submit={submit}
                dates={form.data}
                setDate={(key, value) =>
                    form.setData((current) => ({
                        ...current,
                        [key]: value,
                        scope: 'daily',
                    }))
                }
            />
            <PickupPrimaryMetrics
                filters={filters}
                operations={operations}
                overview={overview}
            />
            <section
                aria-label="Perlu Ditindaklanjuti"
                className="rounded-xl border bg-card px-4 py-3"
            >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
                    <h2 className="text-sm font-semibold">
                        Perlu Ditindaklanjuti
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        Lintas hari · hingga hari operasional {operations.today}{' '}
                        · status terkini
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {Object.entries(pickupQueueLabels).map(([key, label]) => (
                        <Link
                            key={key}
                            preserveScroll
                            href={routes.index({
                                query: pickupQueueFilters(filters, key, true),
                            })}
                            className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary ${queues[key] ? 'border-amber-200 bg-amber-50/50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200' : 'text-muted-foreground'}`}
                        >
                            <span>{label}</span>
                            <strong className="tabular-nums">
                                {(queues[key] ?? 0).toLocaleString('id-ID')}
                            </strong>
                            <ArrowUpRight className="size-3" />
                        </Link>
                    ))}
                </div>
            </section>
            <section
                aria-label="Daftar pickup"
                className="space-y-3"
                aria-busy={form.processing}
            >
                <form
                    className="space-y-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        submit();
                    }}
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-48 flex-1">
                            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
                            <Input
                                id="pickup-search"
                                className="pl-9"
                                aria-label="Cari referensi, customer, atau petugas"
                                placeholder="Cari referensi, customer, atau petugas…"
                                value={form.data.q}
                                onChange={(event) =>
                                    form.setData('q', event.target.value)
                                }
                            />
                        </div>
                        <Button size="sm" disabled={form.processing}>
                            {form.processing ? 'Memuat…' : 'Cari'}
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            aria-expanded={advanced}
                            aria-controls="pickup-advanced"
                            onClick={() => setAdvanced(!advanced)}
                        >
                            <Filter className="size-4" />
                            Filter{applied.length ? ` (${applied.length})` : ''}
                        </Button>
                        {chips.length > 0 && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={form.processing}
                                onClick={clear}
                            >
                                Bersihkan
                            </Button>
                        )}
                    </div>
                    <div
                        id="pickup-advanced"
                        hidden={!advanced}
                        className="rounded-xl border bg-card p-4"
                    >
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {fields.map(([key, label]) => (
                                <div key={key} className="space-y-1.5">
                                    <Label htmlFor={`pickup-${key}`}>
                                        {label}
                                    </Label>
                                    {options[key] ? (
                                        <select
                                            id={`pickup-${key}`}
                                            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                                            value={form.data[key]}
                                            onChange={(event) =>
                                                form.setData(
                                                    key,
                                                    event.target.value,
                                                )
                                            }
                                        >
                                            {![
                                                'per_page',
                                                'sort',
                                                'direction',
                                                'date_basis',
                                            ].includes(key) && (
                                                <option value="">
                                                    {key === 'group_by'
                                                        ? 'Daftar pickup'
                                                        : 'Semua'}
                                                </option>
                                            )}
                                            {options[key].map(
                                                ([value, text]) => (
                                                    <option
                                                        key={value}
                                                        value={value}
                                                    >
                                                        {text}
                                                    </option>
                                                ),
                                            )}
                                        </select>
                                    ) : (
                                        <Input
                                            id={`pickup-${key}`}
                                            value={form.data[key]}
                                            onChange={(event) =>
                                                form.setData(
                                                    key,
                                                    event.target.value,
                                                )
                                            }
                                        />
                                    )}
                                    {form.errors[key] && (
                                        <p className="text-xs text-destructive">
                                            {form.errors[key]}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                        <Button
                            className="mt-4"
                            size="sm"
                            disabled={form.processing}
                        >
                            Terapkan filter
                        </Button>
                    </div>
                    {chips.length > 0 && (
                        <div
                            aria-label="Filter aktif"
                            className="flex flex-wrap gap-2"
                        >
                            {chips.map(([key, value]) => (
                                <button
                                    key={key}
                                    type="button"
                                    disabled={form.processing}
                                    className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent"
                                    aria-label={`Hapus filter ${fields.find(([field]) => field === key)?.[1] ?? key}`}
                                    onClick={() => {
                                        const next = { ...filters };
                                        delete next[key];
                                        if (
                                            key === 'pickup_queue' ||
                                            key === 'scope'
                                        ) {
                                            delete next.pickup_queue;
                                            delete next.scope;
                                        }
                                        submit(next);
                                    }}
                                >
                                    {fields.find(
                                        ([field]) => field === key,
                                    )?.[1] ??
                                        (
                                            {
                                                q: 'Cari',
                                                scope: 'Cakupan',
                                                pickup_queue: 'Antrean',
                                                customer_id: 'Customer ID',
                                                staff_id: 'Petugas ID',
                                            } as Record<string, string>
                                        )[key] ??
                                        key}
                                    :{' '}
                                    <span>
                                        {options[key]?.find(
                                            ([option]) =>
                                                option === String(value),
                                        )?.[1] ??
                                            (key === 'pickup_queue'
                                                ? pickupQueueLabels[value]
                                                : key === 'scope' &&
                                                    value === 'outstanding'
                                                  ? 'Lintas hari hingga hari ini'
                                                  : value)}
                                    </span>
                                    <X className="size-3" />
                                </button>
                            ))}
                        </div>
                    )}
                    {(error ||
                        form.errors.date_from ||
                        form.errors.date_to) && (
                        <p role="alert" className="text-sm text-destructive">
                            {form.errors.date_from ||
                                form.errors.date_to ||
                                error}
                        </p>
                    )}
                </form>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold">
                        {report ? 'Ringkasan operasional' : 'Daftar Pickup'}{' '}
                        <span className="ml-1 font-normal text-muted-foreground">
                            {currentPage?.total ?? 0}{' '}
                            {report ? 'kelompok' : 'pickup'}
                        </span>
                    </h2>
                    <p className="text-xs text-muted-foreground">{scope}</p>
                </div>
                {pickups && (
                    <div
                        className={`overflow-hidden rounded-xl border bg-card ${form.processing ? 'pointer-events-none opacity-60' : ''}`}
                    >
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {[
                                        ['customer_name', 'Pickup / Customer'],
                                        ['scheduled_at', 'Jadwal'],
                                        ['staff_name', 'Petugas'],
                                    ].map(([key, label]) => (
                                        <TableHead
                                            key={key}
                                            className={
                                                key === 'staff_name'
                                                    ? 'hidden 2xl:table-cell'
                                                    : ''
                                            }
                                        >
                                            <button
                                                type="button"
                                                className="flex items-center gap-1"
                                                onClick={() =>
                                                    submit({
                                                        ...filters,
                                                        sort: key,
                                                        direction:
                                                            (filters.sort ??
                                                                'scheduled_at') ===
                                                                key &&
                                                            (filters.direction ??
                                                                'desc') !==
                                                                'asc'
                                                                ? 'asc'
                                                                : 'desc',
                                                    })
                                                }
                                            >
                                                {label}
                                                <ArrowDownUp className="size-3" />
                                            </button>
                                        </TableHead>
                                    ))}
                                    {[
                                        'Kunjungan',
                                        'POP',
                                        'Paket',
                                        'Handover',
                                        'Verifikasi',
                                        'Selisih',
                                        'Aksi',
                                    ].map((label) => (
                                        <TableHead
                                            key={label}
                                            className={
                                                label === 'Aksi'
                                                    ? 'sticky right-0 z-10 bg-card'
                                                    : ''
                                            }
                                        >
                                            {label}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pickups.data.map((result) => (
                                    <TableRow
                                        key={result.id}
                                        className="cursor-pointer focus-within:bg-accent/50 hover:bg-accent/50"
                                        onClick={(event) => {
                                            if (
                                                (
                                                    event.target as HTMLElement
                                                ).closest(
                                                    'a,button,input,select,textarea,[role="button"]',
                                                )
                                            )
                                                return;
                                            openQuick(
                                                result.id,
                                                event.currentTarget.querySelector<HTMLButtonElement>(
                                                    '[data-quick]',
                                                ),
                                            );
                                        }}
                                    >
                                        <TableCell className="max-w-56">
                                            <p
                                                className="truncate font-medium"
                                                title={result.customer_name}
                                            >
                                                {result.customer_name}
                                            </p>
                                            <button
                                                data-quick
                                                type="button"
                                                className="mt-0.5 max-w-full truncate text-xs text-primary hover:underline"
                                                aria-label={`Detail pickup ${result.reference}`}
                                                onClick={(event) =>
                                                    openQuick(
                                                        result.id,
                                                        event.currentTarget,
                                                    )
                                                }
                                            >
                                                {result.reference}
                                            </button>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground 2xl:hidden">
                                                {result.staff_name ??
                                                    'Belum ditugaskan'}
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            <span className="block">
                                                {new Date(
                                                    result.scheduled_at,
                                                ).toLocaleDateString('id-ID', {
                                                    timeZone: timezone,
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric',
                                                })}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {new Date(
                                                    result.scheduled_at,
                                                ).toLocaleTimeString('id-ID', {
                                                    timeZone: timezone,
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </span>
                                        </TableCell>
                                        <TableCell className="hidden 2xl:table-cell">
                                            {result.staff_name ??
                                                'Belum ditugaskan'}
                                        </TableCell>
                                        {(['visit', 'pop'] as const).map(
                                            (dimension) => (
                                                <TableCell key={dimension}>
                                                    <ResultStatus
                                                        result={result}
                                                        dimension={dimension}
                                                    />
                                                </TableCell>
                                            ),
                                        )}
                                        <TableCell className="text-right font-medium tabular-nums">
                                            {result.finalized_at
                                                ? result.total_packages.toLocaleString(
                                                      'id-ID',
                                                  )
                                                : '—'}
                                        </TableCell>
                                        {(
                                            [
                                                'handover',
                                                'verification',
                                                'discrepancy',
                                            ] as const
                                        ).map((dimension) => (
                                            <TableCell key={dimension}>
                                                <ResultStatus
                                                    result={result}
                                                    dimension={dimension}
                                                />
                                            </TableCell>
                                        ))}
                                        <TableCell className="sticky right-0 bg-card">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                title="Detail Cepat"
                                                aria-label={`Detail Cepat ${result.reference}`}
                                                onClick={(event) =>
                                                    openQuick(
                                                        result.id,
                                                        event.currentTarget,
                                                    )
                                                }
                                            >
                                                <PanelRightOpen className="size-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        {pickups.data.length === 0 && (
                            <EmptyState
                                title="Tidak ada pickup sesuai filter"
                                description="Ubah pencarian, rentang tanggal, atau buka antrean lintas hari."
                            />
                        )}
                    </div>
                )}
                {report && (
                    <div className="overflow-hidden rounded-xl border bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Kelompok</TableHead>
                                    {metricDefinitions.map(([key, label]) => (
                                        <TableHead key={key}>{label}</TableHead>
                                    ))}
                                    <TableHead>Handover ditutup</TableHead>
                                    <TableHead>Frekuensi selisih</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {report.data.map((row, index) => (
                                    <TableRow key={index}>
                                        <TableCell>
                                            {row.label ?? 'Belum ditugaskan'}
                                        </TableCell>
                                        {metricDefinitions.map(([key]) => (
                                            <TableCell key={key}>
                                                {row[key]}
                                            </TableCell>
                                        ))}
                                        <TableCell>{row.closed}</TableCell>
                                        <TableCell>
                                            {row.total
                                                ? (
                                                      (Number(row.discrepancy) /
                                                          row.total) *
                                                      100
                                                  ).toLocaleString('id-ID', {
                                                      maximumFractionDigits: 1,
                                                  })
                                                : 0}
                                            %
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        {report.data.length === 0 && (
                            <EmptyState title="Tidak ada kelompok sesuai filter" />
                        )}
                    </div>
                )}
                {currentPage && (
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                        <span>
                            Halaman {currentPage.current_page} /{' '}
                            {currentPage.last_page} · {currentPage.total}{' '}
                            {report ? 'kelompok' : 'pickup'}
                        </span>
                        <div className="flex gap-2">
                            {(
                                [
                                    ['prev_page_url', 'Sebelumnya'],
                                    ['next_page_url', 'Berikutnya'],
                                ] as const
                            ).map(([key, label]) => (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    key={key}
                                    disabled={
                                        !currentPage[key] || form.processing
                                    }
                                    onClick={() => {
                                        const url = currentPage[key];
                                        if (url)
                                            router.visit(url, {
                                                preserveScroll: true,
                                            });
                                    }}
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}
            </section>
            <PickupResultDrawer
                key={selectedId ?? 'closed'}
                id={selectedId}
                context={routes.index.url({
                    query: {
                        ...filters,
                        page: currentPage?.current_page ?? 1,
                        ...(selectedId ? { quick_pickup: selectedId } : {}),
                    },
                })}
                origin={origin}
                close={() =>
                    router.replace({
                        url: context,
                        preserveState: true,
                        preserveScroll: true,
                    })
                }
            />
        </div>
    );
}

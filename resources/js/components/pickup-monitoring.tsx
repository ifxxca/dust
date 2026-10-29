import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { useRef, useState, type CSSProperties } from 'react';
import {
    ArrowDown,
    ArrowDownUp,
    ArrowUp,
    ArrowUpRight,
    CalendarDays,
    CheckCheck,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    CircleAlert,
    Clock3,
    Columns3,
    Download,
    Filter,
    Inbox,
    LayoutGrid,
    Package,
    PanelRightOpen,
    RefreshCw,
    Search,
    Truck,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ResultStatus, metricDefinitions } from '@/components/pickup-result-ui';
import {
    cohortScope,
    dateBases,
    type MonitoringOperations,
} from '@/components/pickup-monitoring-period';
import PickupResultDrawer from '@/components/pickup-result-drawer';
import MonitoringInsights from '@/components/monitoring-insights';
import { quickPickupId } from '@/lib/pickup-monitoring-navigation';
import {
    pickupQueueFilters,
    pickupQueueLabels,
} from '@/lib/pickup-work-queues';
import { cn } from '@/lib/utils';
import * as routes from '@/routes/pickup-results';
import type { PickupResult, ResultPage } from '@/types/pickup-result';

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
    const items = [
        {
            label: 'Pickup Dijadwalkan',
            value: operations.activity.scheduled,
            detail: 'Dari periode terpilih',
            icon: Truck,
            tone: 'bg-primary/10 text-primary',
            query: { ...pickupQueueFilters(filters, ''), date_basis: 'pickup' },
        },
        {
            label: 'Pickup Dikunjungi',
            value: operations.activity.visited,
            detail: 'Dari yang dijadwalkan',
            icon: CheckCheck,
            tone: 'bg-success/10 text-success',
            query: {
                ...pickupQueueFilters(filters, ''),
                date_basis: 'pickup',
                visit_outcome: 'visited',
            },
        },
        {
            label: 'POP Final',
            value: overview.pop_final,
            detail: 'Dari yang dikunjungi',
            icon: Package,
            tone: 'bg-warning/10 text-warning',
            query: { ...pickupQueueFilters(filters, ''), pop_status: 'final' },
        },
        {
            label: 'Menunggu Handover',
            value: overview.waiting_handover,
            detail: 'Dalam proses',
            icon: Clock3,
            tone: 'bg-warning/10 text-warning',
            query: pickupQueueFilters(filters, 'waiting_handover'),
        },
        {
            label: 'Menunggu Verifikasi',
            value: overview.unverified,
            detail: 'Dalam proses',
            icon: CircleAlert,
            tone: 'bg-destructive/10 text-destructive',
            query: pickupQueueFilters(filters, 'unverified'),
        },
    ];
    return (
        <section
            aria-label="Ringkasan operasional"
            className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5"
        >
            {items.map(({ label, value, detail, icon: Icon, tone, query }) => (
                <Link
                    key={label}
                    preserveScroll
                    href={routes.index.url({ query })}
                    className="min-w-0 rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
                >
                    <Card className="h-full gap-0 py-3.5 shadow-none transition-colors hover:bg-accent/30">
                        <CardContent className="flex min-w-0 items-start gap-3 px-3 sm:gap-4 sm:px-4">
                            <span
                                className={cn(
                                    'flex size-9 shrink-0 items-center justify-center rounded-2xl sm:size-12',
                                    tone,
                                )}
                            >
                                <Icon
                                    className="size-5 sm:size-6"
                                    aria-hidden="true"
                                />
                            </span>
                            <div className="flex min-w-0 flex-col gap-2">
                                <p className="text-xs text-muted-foreground">
                                    {label}
                                </p>
                                <div className="flex items-center gap-3">
                                    <p className="text-2xl font-semibold tabular-nums sm:text-3xl">
                                        {(value ?? 0).toLocaleString('id-ID')}
                                    </p>
                                    <span
                                        className="text-xs text-muted-foreground"
                                        title="Perbandingan periode belum tersedia"
                                    >
                                        —
                                    </span>
                                </div>
                                <p className="text-xs leading-5 text-muted-foreground">
                                    {detail}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            ))}
        </section>
    );
}

const tableColumns = [
    ['staff', 'Petugas'],
    ['visit', 'Kunjungan'],
    ['pop', 'POP'],
    ['packages', 'Paket'],
    ['handover', 'Handover'],
    ['verification', 'Verifikasi'],
    ['discrepancy', 'Selisih'],
    ['status', 'Status'],
] as const;
const stateKeys = [
    'visit_outcome',
    'pop_status',
    'handover_status',
    'verification_status',
    'discrepancy_status',
];
const statusOptions = [
    ['visit_outcome:not_visited', 'Belum dikunjungi'],
    ['visit_outcome:visited', 'Sudah dikunjungi'],
    ['pop_status:incomplete', 'POP belum final'],
    ['pop_status:final', 'POP final'],
    ['handover_status:waiting', 'Menunggu handover'],
    ['verification_status:pending', 'Menunggu verifikasi'],
    ['verification_status:verified', 'Sudah diverifikasi'],
    ['discrepancy_status:yes', 'Ada selisih'],
    ['handover_status:CLOSED', 'Handover ditutup'],
];
const formatSchedule = (value: string, timezone: string, time = false) =>
    new Intl.DateTimeFormat(
        'id-ID',
        time
            ? { timeZone: timezone, hour: '2-digit', minute: '2-digit' }
            : {
                  timeZone: timezone,
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
              },
    ).format(new Date(value));

export default function PickupMonitoring({
    pickups,
    report,
    summary,
    overview,
    queues,
    filters,
    timezone,
    operations,
    staffOptions = [],
}: {
    pickups: ResultPage | null;
    report: PickupReportPage | null;
    summary: Record<string, number>;
    overview: Record<string, number>;
    queues: Record<string, number>;
    filters: Record<string, string>;
    timezone: string;
    operations: MonitoringOperations;
    staffOptions?: { id: number; name: string }[];
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
    const [checked, setChecked] = useState<number[]>([]);
    const [visible, setVisible] = useState<string[]>(
        tableColumns.map(([key]) => key),
    );
    const origin = useRef<HTMLElement | null>(null);
    const selectedId = quickPickupId(usePage().url);
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
            onError: (errors) => {
                setAdvanced(true);
                if (errors.date_from || errors.date_to) setRangeOpen(true);
                setError(
                    'Filter belum diterapkan. Periksa isian yang ditandai.',
                );
                requestAnimationFrame(() =>
                    document
                        .getElementById('pickup-' + Object.keys(errors)[0])
                        ?.focus(),
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
                'pickup_queue',
                'scope',
            ].includes(key) &&
            String(value) !== defaults[key],
    );
    const chips = [...applied, ...(filters.q ? [['q', filters.q]] : [])];
    const clear = () =>
        submit({
            date_from: filters.date_from,
            date_to: filters.date_to,
            date_basis: 'pickup',
            scope: 'daily',
            per_page: filters.per_page ?? '20',
        });
    const goPage = (page: number) =>
        router.get(
            routes.index.url(),
            { ...filters, page },
            { preserveScroll: true },
        );
    const toggleRow = (id: number, selected: boolean) =>
        setChecked((current) =>
            selected
                ? [...new Set([...current, id])]
                : current.filter((value) => value !== id),
        );
    const allSelected =
        !!pickups?.data.length &&
        pickups.data.every((row) => checked.includes(row.id));
    const statusValue = stateKeys.find((key) => filters[key]) ?? '';
    const statusSelection = statusValue
        ? statusValue + ':' + filters[statusValue]
        : '';
    const shown = tableColumns.filter(([key]) => visible.includes(key));
    const scope = cohortScope(filters, operations.today);
    const lastPage = currentPage?.last_page ?? 1;
    const page = currentPage?.current_page ?? 1;
    const pages = Array.from(
        { length: Math.min(5, lastPage) },
        (_, index) => Math.max(1, Math.min(page - 2, lastPage - 4)) + index,
    );
    const sort = (key: string) =>
        submit({
            ...filters,
            sort: key,
            direction:
                (filters.sort ?? 'scheduled_at') === key &&
                (filters.direction ?? 'desc') !== 'asc'
                    ? 'asc'
                    : 'desc',
        });
    const sortHeading = (key: string, label: string) => (
        <TableHead
            aria-sort={
                (filters.sort ?? 'scheduled_at') === key
                    ? (filters.direction ?? 'desc') === 'asc'
                        ? 'ascending'
                        : 'descending'
                    : undefined
            }
        >
            <button
                type="button"
                className="flex min-h-11 items-center gap-1 focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => sort(key)}
            >
                {label}
                {(filters.sort ?? 'scheduled_at') !== key ? (
                    <ArrowDownUp className="size-3" aria-hidden="true" />
                ) : filters.direction === 'asc' ? (
                    <ArrowUp className="size-3" aria-hidden="true" />
                ) : (
                    <ArrowDown className="size-3" aria-hidden="true" />
                )}
            </button>
        </TableHead>
    );
    const cell = (result: PickupResult, key: string) => {
        if (key === 'staff') return result.staff_name ?? 'Belum ditugaskan';
        if (key === 'packages')
            return (
                <span className="tabular-nums">
                    {result.finalized_at
                        ? result.total_packages.toLocaleString('id-ID')
                        : '—'}
                </span>
            );
        if (key === 'status')
            return (
                <span className="whitespace-normal">{result.next_action}</span>
            );
        return (
            <ResultStatus
                result={result}
                dimension={
                    key as
                        | 'visit'
                        | 'pop'
                        | 'handover'
                        | 'verification'
                        | 'discrepancy'
                }
            />
        );
    };
    return (
        <div
            className="flex min-w-0 flex-col gap-3"
            style={
                {
                    '--muted-foreground':
                        'color-mix(in oklab, var(--foreground) 60%, var(--background))',
                    '--color-muted-foreground':
                        'color-mix(in oklab, var(--foreground) 60%, var(--background))',
                } as CSSProperties
            }
        >
            <Head title="Monitoring Pickup" />
            <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Hasil Pickup
                    </h1>
                    <p className="text-xs text-muted-foreground">
                        Pantau status pickup dari jadwal, kunjungan, hingga
                        handover dan verifikasi.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        className="min-h-11 flex-1 sm:flex-none"
                        aria-expanded={rangeOpen}
                        aria-haspopup="dialog"
                        aria-controls={
                            rangeOpen ? 'pickup-date-range' : undefined
                        }
                        onClick={() => setRangeOpen(true)}
                    >
                        <CalendarDays
                            data-icon="inline-start"
                            aria-hidden="true"
                        />
                        <span>
                            {filters.date_from} – {filters.date_to}{' '}
                            <span className="text-xs text-muted-foreground">
                                WIB
                            </span>
                        </span>
                        <ChevronDown
                            data-icon="inline-end"
                            aria-hidden="true"
                        />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="size-11"
                        aria-label="Muat ulang monitoring"
                        disabled={form.processing}
                        onClick={() =>
                            router.visit(routes.index({ query: filters }), {
                                preserveState: true,
                                preserveScroll: true,
                                fresh: true,
                            })
                        }
                    >
                        <RefreshCw aria-hidden="true" />
                    </Button>
                    <Button asChild className="min-h-11">
                        <a
                            href={routes.exportMethod.url({
                                query: {
                                    ...filters,
                                    ...(checked.length
                                        ? { selected_ids: checked }
                                        : {}),
                                },
                            })}
                        >
                            <Download
                                data-icon="inline-start"
                                aria-hidden="true"
                            />
                            Ekspor CSV
                            {checked.length ? ' (' + checked.length + ')' : ''}
                        </a>
                    </Button>
                </div>
            </header>
            <div
                className="flex flex-wrap gap-2"
                aria-label="Periode monitoring"
            >
                {Object.entries(operations.presets).map(([key, dates]) => {
                    const selected =
                        (!filters.scope || filters.scope === 'daily') &&
                        filters.date_from === dates.date_from &&
                        filters.date_to === dates.date_to;
                    return (
                        <Button
                            key={key}
                            variant={selected ? 'default' : 'outline'}
                            className="min-h-11"
                            disabled={form.processing}
                            aria-pressed={selected}
                            onClick={() =>
                                submit({
                                    ...filters,
                                    ...dates,
                                    scope: 'daily',
                                    pickup_queue: '',
                                })
                            }
                        >
                            {
                                (
                                    {
                                        today: 'Hari Ini',
                                        yesterday: 'Kemarin',
                                        week: '7 Hari',
                                    } as Record<string, string>
                                )[key]
                            }
                        </Button>
                    );
                })}
                <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setRangeOpen(true)}
                >
                    Rentang tanggal
                </Button>
            </div>
            <PickupPrimaryMetrics
                filters={filters}
                operations={operations}
                overview={overview}
            />
            <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                }}
            >
                <div className="grid grid-cols-2 items-center gap-2 xl:grid-cols-[minmax(15rem,1fr)_11rem_11rem_auto]">
                    <div className="relative col-span-2 min-w-0 xl:col-span-1">
                        <Search
                            className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            id="pickup-search"
                            className="min-h-11 pr-12 pl-9"
                            aria-label="Cari referensi, customer, atau petugas"
                            placeholder="Cari referensi, customer, atau petugas…"
                            value={form.data.q}
                            onChange={(event) =>
                                form.setData('q', event.target.value)
                            }
                        />
                        <Button
                            type="submit"
                            size="icon"
                            variant="ghost"
                            className="absolute top-0.5 right-0.5 size-10"
                            aria-label="Terapkan pencarian"
                            disabled={form.processing}
                        >
                            <ArrowUpRight aria-hidden="true" />
                        </Button>
                    </div>
                    <select
                        aria-label="Petugas pickup"
                        className="h-11 min-w-0 rounded-md border border-input bg-card px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        value={filters.staff_id ?? ''}
                        onChange={(event) =>
                            submit({
                                ...form.data,
                                staff_id: event.target.value,
                                staff: '',
                            })
                        }
                    >
                        <option value="">Semua petugas</option>
                        {staffOptions.map((staff) => (
                            <option key={staff.id} value={staff.id}>
                                {staff.name}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label="Status pickup"
                        className="h-11 min-w-0 rounded-md border border-input bg-card px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        value={statusSelection}
                        onChange={(event) => {
                            const [key, value] = event.target.value.split(':');
                            submit({
                                ...form.data,
                                ...Object.fromEntries(
                                    stateKeys.map((name) => [name, '']),
                                ),
                                pickup_queue: '',
                                ...(key ? { [key]: value } : {}),
                            });
                        }}
                    >
                        <option value="">Semua status</option>
                        {statusOptions.map(([key, label]) => (
                            <option key={key} value={key}>
                                {label}
                            </option>
                        ))}
                    </select>
                    <Button
                        variant="outline"
                        type="button"
                        className="col-span-2 min-h-11 xl:col-span-1"
                        aria-expanded={advanced}
                        aria-controls="pickup-advanced"
                        onClick={() => setAdvanced(!advanced)}
                    >
                        <Filter data-icon="inline-start" aria-hidden="true" />
                        Filter
                        {applied.length ? ' (' + applied.length + ')' : ''}
                        <ChevronDown
                            data-icon="inline-end"
                            aria-hidden="true"
                        />
                    </Button>
                </div>
                <div
                    id="pickup-advanced"
                    hidden={!advanced}
                    className="rounded-xl border bg-card p-4"
                >
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {fields
                            .filter(
                                ([key]) =>
                                    !['per_page', 'group_by'].includes(key),
                            )
                            .map(([key, label]) => (
                                <div
                                    key={key}
                                    className="flex min-w-0 flex-col gap-1.5"
                                >
                                    <Label htmlFor={'pickup-' + key}>
                                        {label}
                                    </Label>
                                    {options[key] ? (
                                        <select
                                            id={'pickup-' + key}
                                            className="h-11 min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                            value={form.data[key]}
                                            aria-invalid={!!form.errors[key]}
                                            onChange={(event) =>
                                                form.setData(
                                                    key,
                                                    event.target.value,
                                                )
                                            }
                                        >
                                            {![
                                                'sort',
                                                'direction',
                                                'date_basis',
                                            ].includes(key) && (
                                                <option value="">Semua</option>
                                            )}
                                            {options[key].map(
                                                ([value, label]) => (
                                                    <option
                                                        key={value}
                                                        value={value}
                                                    >
                                                        {label}
                                                    </option>
                                                ),
                                            )}
                                        </select>
                                    ) : (
                                        <Input
                                            id={'pickup-' + key}
                                            className="min-h-11"
                                            value={form.data[key]}
                                            aria-invalid={!!form.errors[key]}
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
                        className="mt-4 min-h-11"
                        disabled={form.processing}
                    >
                        Terapkan filter
                    </Button>
                </div>
                {chips.length > 0 && (
                    <div
                        aria-label="Filter aktif"
                        className="flex flex-wrap items-center gap-2"
                    >
                        {chips.map(([key, value]) => (
                            <Button
                                key={key}
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-auto min-h-10 max-w-full gap-2 whitespace-normal"
                                disabled={form.processing}
                                aria-label={
                                    'Hapus filter ' +
                                    (fields.find(
                                        ([field]) => field === key,
                                    )?.[1] ?? key)
                                }
                                onClick={() => {
                                    const next = { ...filters };
                                    delete next[key];
                                    submit(next);
                                }}
                            >
                                {fields.find(([field]) => field === key)?.[1] ??
                                    (
                                        {
                                            q: 'Cari',
                                            staff_id: 'Petugas',
                                            customer_id: 'Customer',
                                        } as Record<string, string>
                                    )[key] ??
                                    key}
                                :{' '}
                                {options[key]?.find(
                                    ([option]) => option === String(value),
                                )?.[1] ??
                                    (key === 'staff_id'
                                        ? (staffOptions.find(
                                              (staff) =>
                                                  String(staff.id) ===
                                                  String(value),
                                          )?.name ?? value)
                                        : value)}
                                <X data-icon="inline-end" aria-hidden="true" />
                            </Button>
                        ))}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-10"
                            type="button"
                            onClick={clear}
                        >
                            Bersihkan
                        </Button>
                    </div>
                )}
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
            </form>
            <section
                aria-label="Antrean pickup"
                className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center xl:justify-between"
            >
                <nav
                    aria-label="Status antrean pickup"
                    className="flex min-w-0 flex-wrap gap-1"
                >
                    <Button
                        variant={
                            !filters.pickup_queue &&
                            (!filters.scope || filters.scope === 'daily')
                                ? 'secondary'
                                : 'outline'
                        }
                        className="min-h-11"
                        asChild
                    >
                        <Link
                            preserveScroll
                            href={routes.index({
                                query: pickupQueueFilters(filters, ''),
                            })}
                        >
                            Semua
                            <Badge variant="secondary">
                                {(overview.total ?? 0).toLocaleString('id-ID')}
                            </Badge>
                        </Link>
                    </Button>
                    {Object.entries(pickupQueueLabels).map(([key, label]) => (
                        <Button
                            key={key}
                            variant={
                                filters.pickup_queue === key
                                    ? 'secondary'
                                    : 'outline'
                            }
                            className="min-h-11 px-3"
                            asChild
                        >
                            <Link
                                preserveScroll
                                aria-current={
                                    filters.pickup_queue === key
                                        ? 'page'
                                        : undefined
                                }
                                href={routes.index({
                                    query: pickupQueueFilters(
                                        filters,
                                        key,
                                        true,
                                    ),
                                })}
                            >
                                {label}
                                <Badge variant="secondary">
                                    {(queues[key] ?? 0).toLocaleString('id-ID')}
                                </Badge>
                            </Link>
                        </Button>
                    ))}
                </nav>
                <p
                    className="shrink-0 text-xs text-muted-foreground"
                    title={scope}
                >
                    Lintas hari · hingga {operations.today}
                </p>
            </section>
            <section
                aria-label="Daftar pickup"
                className="min-w-0 overflow-hidden rounded-xl border bg-card"
                aria-busy={form.processing}
            >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
                    <h2 className="text-lg font-semibold">
                        {report ? 'Ringkasan operasional' : 'Daftar pickup'} (
                        {(currentPage?.total ?? 0).toLocaleString('id-ID')})
                    </h2>
                    <div className="flex flex-wrap items-center gap-2">
                        {checked.length > 0 && (
                            <>
                                <span className="text-xs text-muted-foreground">
                                    {checked.length} dipilih
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="min-h-10"
                                    onClick={() => setChecked([])}
                                >
                                    Batal pilih
                                </Button>
                            </>
                        )}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="min-h-10">
                                    <LayoutGrid
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                    />
                                    Tampilan
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>
                                    Tampilan laporan
                                </DropdownMenuLabel>
                                <DropdownMenuRadioGroup
                                    value={filters.group_by ?? ''}
                                    onValueChange={(value) =>
                                        submit({ ...filters, group_by: value })
                                    }
                                >
                                    {[
                                        ['', 'Daftar pickup'],
                                        ...options.group_by,
                                    ].map(([key, label]) => (
                                        <DropdownMenuRadioItem
                                            key={key}
                                            value={key}
                                        >
                                            {label}
                                        </DropdownMenuRadioItem>
                                    ))}
                                </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {!report && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className="min-h-10"
                                    >
                                        <Columns3
                                            data-icon="inline-start"
                                            aria-hidden="true"
                                        />
                                        Kolom
                                        <ChevronDown
                                            data-icon="inline-end"
                                            aria-hidden="true"
                                        />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>
                                        Kolom tabel
                                    </DropdownMenuLabel>
                                    <DropdownMenuGroup>
                                        {tableColumns.map(([key, label]) => (
                                            <DropdownMenuCheckboxItem
                                                key={key}
                                                checked={visible.includes(key)}
                                                onSelect={(event) =>
                                                    event.preventDefault()
                                                }
                                                onCheckedChange={(checked) =>
                                                    setVisible((current) =>
                                                        checked
                                                            ? [...current, key]
                                                            : current.filter(
                                                                  (value) =>
                                                                      value !==
                                                                      key,
                                                              ),
                                                    )
                                                }
                                            >
                                                {label}
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                    </DropdownMenuGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </div>
                {pickups && (
                    <div
                        className={cn(
                            'min-w-0',
                            form.processing && 'pointer-events-none opacity-60',
                        )}
                    >
                        <div className="hidden lg:block">
                            <Table className="text-xs">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10">
                                            <Checkbox
                                                aria-label="Pilih semua pickup di halaman ini"
                                                checked={
                                                    allSelected
                                                        ? true
                                                        : checked.length
                                                          ? 'indeterminate'
                                                          : false
                                                }
                                                disabled={!pickups.data.length}
                                                onCheckedChange={(value) =>
                                                    setChecked(
                                                        value
                                                            ? pickups.data.map(
                                                                  (row) =>
                                                                      row.id,
                                                              )
                                                            : [],
                                                    )
                                                }
                                            />
                                        </TableHead>
                                        {sortHeading(
                                            'customer_name',
                                            'Pickup / Customer',
                                        )}
                                        {sortHeading('scheduled_at', 'Jadwal')}
                                        {shown.map(([key, label]) => (
                                            <TableHead key={key}>
                                                {label}
                                            </TableHead>
                                        ))}
                                        <TableHead className="sticky right-0 bg-card">
                                            Aksi
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pickups.data.map((result) => (
                                        <TableRow
                                            key={result.id}
                                            className={cn(
                                                'cursor-pointer focus-within:bg-accent/50',
                                                checked.includes(result.id) &&
                                                    'bg-primary/5',
                                            )}
                                            onClick={(event) => {
                                                if (
                                                    (
                                                        event.target as HTMLElement
                                                    ).closest(
                                                        'a,button,input,select,textarea,[role="button"],[role="checkbox"]',
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
                                            <TableCell>
                                                <Checkbox
                                                    aria-label={
                                                        'Pilih pickup ' +
                                                        result.reference
                                                    }
                                                    checked={checked.includes(
                                                        result.id,
                                                    )}
                                                    onCheckedChange={(value) =>
                                                        toggleRow(
                                                            result.id,
                                                            !!value,
                                                        )
                                                    }
                                                />
                                            </TableCell>
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
                                                    className="mt-1 max-w-full truncate text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                                                    aria-label={
                                                        'Detail pickup ' +
                                                        result.reference
                                                    }
                                                    onClick={(event) =>
                                                        openQuick(
                                                            result.id,
                                                            event.currentTarget,
                                                        )
                                                    }
                                                >
                                                    {result.reference}
                                                </button>
                                            </TableCell>
                                            <TableCell>
                                                <span className="block">
                                                    {formatSchedule(
                                                        result.scheduled_at,
                                                        timezone,
                                                    )}
                                                </span>
                                                <span className="text-muted-foreground">
                                                    {formatSchedule(
                                                        result.scheduled_at,
                                                        timezone,
                                                        true,
                                                    )}
                                                </span>
                                            </TableCell>
                                            {shown.map(([key]) => (
                                                <TableCell
                                                    key={key}
                                                    className={cn(
                                                        'max-w-40',
                                                        key === 'packages' &&
                                                            'text-right font-medium',
                                                    )}
                                                >
                                                    {cell(result, key)}
                                                </TableCell>
                                            ))}
                                            <TableCell className="sticky right-0 bg-card">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-10"
                                                    aria-label={
                                                        'Detail Cepat ' +
                                                        result.reference
                                                    }
                                                    onClick={(event) =>
                                                        openQuick(
                                                            result.id,
                                                            event.currentTarget,
                                                        )
                                                    }
                                                >
                                                    <PanelRightOpen aria-hidden="true" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="flex flex-col lg:hidden">
                            {pickups.data.map((result) => (
                                <article
                                    key={result.id}
                                    className="flex flex-col gap-3 border-b p-4 last:border-0"
                                >
                                    <div className="flex items-start gap-3">
                                        <Checkbox
                                            className="mt-3"
                                            aria-label={
                                                'Pilih pickup ' +
                                                result.reference
                                            }
                                            checked={checked.includes(
                                                result.id,
                                            )}
                                            onCheckedChange={(value) =>
                                                toggleRow(result.id, !!value)
                                            }
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">
                                                {result.customer_name}
                                            </p>
                                            <button
                                                data-quick
                                                type="button"
                                                className="inline-flex min-h-11 max-w-full items-center truncate text-xs text-primary"
                                                aria-label={
                                                    'Detail pickup ' +
                                                    result.reference
                                                }
                                                onClick={(event) =>
                                                    openQuick(
                                                        result.id,
                                                        event.currentTarget,
                                                    )
                                                }
                                            >
                                                {result.reference}
                                            </button>
                                            <p className="text-xs text-muted-foreground">
                                                {result.staff_name ??
                                                    'Belum ditugaskan'}{' '}
                                                ·{' '}
                                                {formatSchedule(
                                                    result.scheduled_at,
                                                    timezone,
                                                )}{' '}
                                                {formatSchedule(
                                                    result.scheduled_at,
                                                    timezone,
                                                    true,
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(
                                            [
                                                'visit',
                                                'pop',
                                                'handover',
                                                'verification',
                                                'discrepancy',
                                            ] as const
                                        )
                                            .filter((key) =>
                                                visible.includes(key),
                                            )
                                            .map((key) => (
                                                <ResultStatus
                                                    key={key}
                                                    result={result}
                                                    dimension={key}
                                                />
                                            ))}
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-xs text-muted-foreground">
                                            {result.finalized_at
                                                ? result.total_packages.toLocaleString(
                                                      'id-ID',
                                                  ) + ' paket'
                                                : 'POP belum final'}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="min-h-11"
                                            onClick={(event) =>
                                                openQuick(
                                                    result.id,
                                                    event.currentTarget,
                                                )
                                            }
                                        >
                                            <PanelRightOpen
                                                data-icon="inline-start"
                                                aria-hidden="true"
                                            />
                                            Lihat detail
                                        </Button>
                                    </div>
                                </article>
                            ))}
                        </div>
                        {pickups.data.length === 0 && (
                            <div className="flex min-h-64 flex-col items-center justify-center gap-4 px-4 py-10 text-center sm:min-h-[300px]">
                                <span className="flex size-16 items-center justify-center rounded-3xl bg-muted text-muted-foreground">
                                    <Inbox
                                        className="size-8"
                                        aria-hidden="true"
                                    />
                                </span>
                                <div className="flex flex-col gap-2">
                                    <h3 className="text-base font-semibold">
                                        Tidak ada pickup sesuai filter
                                    </h3>
                                    <p className="max-w-xl text-sm text-muted-foreground">
                                        Ubah pencarian, rentang tanggal, atau
                                        buka antrean lintas hari untuk melihat
                                        data.
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    className="min-h-11"
                                    onClick={clear}
                                >
                                    <RefreshCw
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                    />
                                    Reset filter
                                </Button>
                            </div>
                        )}
                    </div>
                )}
                {report && (
                    <div className="min-w-0">
                        <Table className="text-xs">
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
                            <p className="py-20 text-center text-sm text-muted-foreground">
                                Tidak ada kelompok sesuai filter.
                            </p>
                        )}
                    </div>
                )}
            </section>
            {currentPage && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <p className="text-muted-foreground">
                        Menampilkan {currentPage.from ?? 0}–
                        {currentPage.to ?? 0} dari{' '}
                        {currentPage.total.toLocaleString('id-ID')}{' '}
                        {report ? 'kelompok' : 'pickup'}
                        <span className="sr-only">
                            {' '}
                            · Halaman {page} / {lastPage}
                        </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            aria-label="Baris per halaman"
                            className="h-11 rounded-md border border-input bg-card px-3 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            value={filters.per_page ?? '20'}
                            onChange={(event) =>
                                submit({
                                    ...filters,
                                    per_page: event.target.value,
                                })
                            }
                        >
                            {options.per_page.map(([key, label]) => (
                                <option key={key} value={key}>
                                    {label} per halaman
                                </option>
                            ))}
                        </select>
                        <nav
                            aria-label="Halaman pickup"
                            className="flex flex-wrap gap-1"
                        >
                            <Button
                                variant="outline"
                                size="icon"
                                className="size-10"
                                aria-label="Halaman pertama"
                                disabled={page <= 1 || form.processing}
                                onClick={() => goPage(1)}
                            >
                                <ChevronsLeft aria-hidden="true" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="size-10"
                                aria-label="Halaman sebelumnya"
                                disabled={page <= 1 || form.processing}
                                onClick={() => goPage(page - 1)}
                            >
                                <ChevronLeft aria-hidden="true" />
                            </Button>
                            {pages.map((value) => (
                                <Button
                                    key={value}
                                    variant={
                                        value === page ? 'default' : 'outline'
                                    }
                                    size="icon"
                                    className="size-10"
                                    aria-label={'Halaman ' + value}
                                    aria-current={
                                        value === page ? 'page' : undefined
                                    }
                                    disabled={form.processing}
                                    onClick={() => goPage(value)}
                                >
                                    {value}
                                </Button>
                            ))}
                            <Button
                                variant="outline"
                                size="icon"
                                className="size-10"
                                aria-label="Halaman berikutnya"
                                disabled={page >= lastPage || form.processing}
                                onClick={() => goPage(page + 1)}
                            >
                                <ChevronRight aria-hidden="true" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="size-10"
                                aria-label="Halaman terakhir"
                                disabled={page >= lastPage || form.processing}
                                onClick={() => goPage(lastPage)}
                            >
                                <ChevronsRight aria-hidden="true" />
                            </Button>
                        </nav>
                    </div>
                </div>
            )}
            <details>
                <summary className="min-h-11 cursor-pointer py-3 text-xs text-muted-foreground">
                    Rincian monitoring
                </summary>
                <MonitoringInsights
                    key={selectedId ?? 'closed'}
                    operations={operations}
                    filters={filters}
                    disabled={selectedId !== null}
                    pickupSummary={summary}
                    timezone={timezone}
                />
            </details>
            <Dialog open={rangeOpen} onOpenChange={setRangeOpen}>
                <DialogContent id="pickup-date-range" className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Rentang tanggal pickup</DialogTitle>
                        <DialogDescription>
                            Hari operasional berlangsung pukul 05.00–04.59 WIB
                            keesokan hari.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            submit({
                                ...form.data,
                                scope: 'daily',
                                pickup_queue: '',
                            });
                        }}
                    >
                        {['date_from', 'date_to'].map((key) => (
                            <div key={key} className="flex flex-col gap-2">
                                <Label htmlFor={'pickup-' + key}>
                                    {key === 'date_from'
                                        ? 'Tanggal awal'
                                        : 'Tanggal akhir'}
                                </Label>
                                <Input
                                    id={'pickup-' + key}
                                    type="date"
                                    className="min-h-11"
                                    required
                                    min={
                                        key === 'date_to'
                                            ? form.data.date_from
                                            : undefined
                                    }
                                    value={form.data[key]}
                                    aria-invalid={!!form.errors[key]}
                                    aria-describedby={
                                        form.errors[key]
                                            ? key + '-error'
                                            : undefined
                                    }
                                    onChange={(event) =>
                                        form.setData(key, event.target.value)
                                    }
                                />
                                {form.errors[key] && (
                                    <p
                                        id={key + '-error'}
                                        className="text-xs text-destructive"
                                    >
                                        {form.errors[key]}
                                    </p>
                                )}
                            </div>
                        ))}
                        <Button className="min-h-11" disabled={form.processing}>
                            Terapkan rentang
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
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

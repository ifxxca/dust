import { Link, router, useForm, usePage } from '@inertiajs/react';
import { useRef, useState } from 'react';
import { ArrowUpRight, Filter, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/operational-ui';
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from '@/components/ui/table';
import { categories } from '@/components/pickup-result-ui';
import { MonitoringWorkspaceHeader } from '@/components/monitoring-workspace';
import { dateBases, cohortScope } from '@/components/pickup-monitoring-period';
import type { MonitoringOperations } from '@/components/pickup-monitoring-period';
import {
    ProcessingStatus,
    ProcessingMetrics,
    ProcessingDeclarations,
    ProcessingPager,
    processingLabels,
    processingDate,
    categoryName,
    quantity,
} from '@/components/package-processing-ui';
import { quickPickupId } from '@/lib/pickup-monitoring-navigation';
import PickupProcessingDrawer from '@/components/pickup-processing-drawer';
import MonitoringInsights from '@/components/monitoring-insights';
import * as routes from '@/routes/pickup-results';
import type { ProcessingMonitor } from '@/types/package-processing';

export {
    ProcessingSource,
    ProcessingMetrics,
    ProcessingPager,
    processingDate,
} from '@/components/package-processing-ui';

const options: Record<string, [string, string][]> = {
    date_basis: Object.entries(dateBases),
    category: categories.map(([key, label]) => [key, label]),
    processing_system: [
        ['JNE_HYBRID', 'JNE Hybrid'],
        ['MYORION', 'MyORION'],
    ],
    processing_status: [
        'NOT_RECORDED',
        'MANUAL_RECORDED',
        'PENDING',
        'FAILED',
        'UNKNOWN',
        'RECONCILIATION_REQUIRED',
    ].map((key) => [key, processingLabels[key]]),
    provenance: [
        ['MANUAL', 'Dicatat Manual'],
        ['NOT_RECORDED', 'Belum Ada Konfirmasi'],
        ['EXTERNAL', 'Dikonfirmasi Sistem — belum tersedia'],
    ],
    reconciliation: [
        ['yes', 'Perlu rekonsiliasi'],
        ['no', 'Tidak terdeteksi konflik'],
    ],
    processing_sort: [
        ['scheduled_at', 'Jadwal'],
        ['period_at', 'Tanggal acuan'],
        ['reference', 'Referensi'],
        ['customer_name', 'Customer'],
        ['staff_name', 'Petugas'],
        ['unconfirmed_quantity', 'Belum terkonfirmasi'],
        ['manual_quantity', 'Berhasil manual'],
        ['last_updated_at', 'Pembaruan terakhir'],
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
};
const fields = [
    ['reference', 'Referensi Pickup'],
    ['customer', 'Customer'],
    ['staff', 'Pickup Staff'],
    ['category', 'Kategori'],
    ['processing_system', 'Sistem'],
    ['processing_status', 'Status pemrosesan'],
    ['provenance', 'Sumber data'],
    ['reconciliation', 'Rekonsiliasi'],
    ['processing_sort', 'Urutkan'],
    ['direction', 'Arah'],
    ['per_page', 'Baris per halaman'],
] as const;
const defaults: Record<string, string> = {
    date_basis: 'pickup',
    processing_sort: 'scheduled_at',
    direction: 'desc',
    per_page: '20',
    scope: 'daily',
};

export default function PackageProcessingMonitoring({
    data,
    filters,
    timezone,
    operations,
}: {
    data: ProcessingMonitor;
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
        monitoring: 'processing',
    });
    const [advanced, setAdvanced] = useState(false);
    const [rangeOpen, setRangeOpen] = useState(false);
    const [error, setError] = useState('');
    const scope = cohortScope(filters, operations.today);
    const context = routes.index.url({
        query: { ...filters, page: data.rows.current_page },
    });
    const selectedId = quickPickupId(usePage().url);
    const origin = useRef<HTMLElement | null>(null);
    const openQuick = (id: number, element: HTMLElement | null) => {
        origin.current = element;
        router.push({
            url: routes.index.url({
                query: {
                    ...filters,
                    page: data.rows.current_page,
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
                    monitoring: 'processing',
                    page: '1',
                }).filter(([, value]) => value !== ''),
            ),
        );
        form.get(routes.index.url(), {
            preserveState: 'errors',
            preserveScroll: true,
            onError: () =>
                setError(
                    'Filter belum diterapkan. Periksa rentang tanggal dan isian.',
                ),
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
    const clear = () =>
        submit({
            monitoring: 'processing',
            date_from: filters.date_from,
            date_to: filters.date_to,
            date_basis: filters.date_basis,
        });
    const periodText =
        filters.date_from === filters.date_to
            ? filters.date_from
            : `${filters.date_from} – ${filters.date_to}`;
    return (
        <div className="space-y-4">
            <MonitoringWorkspaceHeader
                insights={
                    <MonitoringInsights
                        key={selectedId ?? 'closed'}
                        operations={operations}
                        filters={filters}
                        disabled={selectedId !== null}
                        processing={data}
                        timezone={timezone}
                    />
                }
                current="processing"
                subtitle="Pantau penerimaan dan pemrosesan paket Retail."
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
            <ProcessingMetrics
                summary={data.summary}
                received={data.summary.received_quantity}
                confirmed={operations.activity.confirmed_processed_quantity}
                periodText={periodText}
            />
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-2 text-sm">
                <ProcessingDeclarations summary={data.summary} />
                <Link
                    className="font-medium text-amber-800 hover:underline dark:text-amber-300"
                    href={routes.index({
                        query: {
                            ...Object.fromEntries(
                                Object.entries(filters).filter(
                                    ([key]) =>
                                        ![
                                            'processing_status',
                                            'provenance',
                                            'reconciliation',
                                            'group_by',
                                            'visit_outcome',
                                            'pop_status',
                                            'handover_status',
                                            'verification_status',
                                            'discrepancy_status',
                                        ].includes(key),
                                ),
                            ),
                            scope: 'backlog',
                            page: 1,
                        },
                    })}
                >
                    Backlog keseluruhan{' '}
                    <strong>
                        {quantity(operations.backlog.unconfirmed_quantity)}
                    </strong>
                    <ArrowUpRight className="ml-1 inline size-3" />
                </Link>
            </div>
            <p className="text-xs text-muted-foreground">
                {scope}. Backlog: pickup sebelum hari operasional{' '}
                {operations.today}; terpisah dari periode pilihan.
            </p>
            <section
                className="overflow-hidden rounded-xl border bg-card"
                aria-label="Ringkasan kategori"
            >
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="pl-4">Kategori</TableHead>
                            {[
                                'POP',
                                'Retail',
                                'Terkonfirmasi',
                                'Manual',
                                'Belum terkonfirmasi',
                                'Perhatian',
                            ].map((label) => (
                                <TableHead key={label} className="text-right">
                                    {label}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.categories.map((row) => (
                            <TableRow key={row.category}>
                                <TableCell className="py-2 pl-4 font-medium">
                                    {categoryName(row.category)}
                                </TableCell>
                                {[
                                    'pop_quantity',
                                    'received_quantity',
                                    'confirmed_quantity',
                                    'manual_quantity',
                                    'unconfirmed_quantity',
                                    'attention_count',
                                ].map((key) => (
                                    <TableCell
                                        key={key}
                                        className="py-2 text-right tabular-nums"
                                    >
                                        {quantity(row[key])}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </section>
            <section className="space-y-3" aria-label="Daftar pemrosesan">
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
                                id="processing-search"
                                aria-label="Cari pickup, customer, atau petugas"
                                placeholder="Cari pickup, customer, atau petugas…"
                                className="pl-9"
                                value={form.data.q}
                                onChange={(event) =>
                                    form.setData('q', event.target.value)
                                }
                            />
                        </div>
                        <Button disabled={form.processing} size="sm">
                            {form.processing ? 'Memuat…' : 'Cari'}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={advanced ? 'secondary' : 'outline'}
                            aria-expanded={advanced}
                            aria-controls="processing-advanced"
                            onClick={() => setAdvanced(!advanced)}
                        >
                            <Filter className="size-4" />
                            Filter{applied.length > 0 && ` (${applied.length})`}
                        </Button>
                        {applied.length > 0 || filters.q ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={form.processing}
                                onClick={clear}
                            >
                                Bersihkan
                            </Button>
                        ) : null}
                    </div>
                    <div
                        id="processing-advanced"
                        hidden={!advanced}
                        className="space-y-3 rounded-lg border bg-card p-4"
                    >
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {fields.map(([key, label]) => (
                                <div className="space-y-1" key={key}>
                                    <Label htmlFor={`processing-${key}`}>
                                        {label}
                                    </Label>
                                    {options[key] ? (
                                        <select
                                            id={`processing-${key}`}
                                            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                                            value={form.data[key]}
                                            onChange={(event) =>
                                                form.setData(
                                                    key,
                                                    event.target.value,
                                                )
                                            }
                                        >
                                            {!defaults[key] && (
                                                <option value="">Semua</option>
                                            )}
                                            {options[key].map(
                                                ([value, title]) => (
                                                    <option
                                                        key={value}
                                                        value={value}
                                                    >
                                                        {title}
                                                    </option>
                                                ),
                                            )}
                                        </select>
                                    ) : (
                                        <Input
                                            id={`processing-${key}`}
                                            value={form.data[key]}
                                            onChange={(event) =>
                                                form.setData(
                                                    key,
                                                    event.target.value,
                                                )
                                            }
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                        <Button size="sm" disabled={form.processing}>
                            Terapkan filter
                        </Button>
                    </div>
                </form>
                {(applied.length > 0 || filters.q) && (
                    <div
                        className="flex flex-wrap gap-2"
                        aria-label="Filter aktif"
                    >
                        {[
                            ...applied,
                            ...(filters.q ? [['q', filters.q]] : []),
                        ].map(([key, value]) => (
                            <button
                                key={key}
                                className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
                                aria-label={`Hapus filter ${fields.find(([field]) => field === key)?.[1] ?? key}`}
                                onClick={() =>
                                    submit({
                                        ...filters,
                                        [key]: defaults[key] ?? '',
                                    })
                                }
                            >
                                {fields.find(([field]) => field === key)?.[1] ??
                                    {
                                        q: 'Cari',
                                        scope: 'Cakupan',
                                        customer_id: 'Customer ID',
                                        staff_id: 'Petugas ID',
                                    }[key] ??
                                    key}
                                :{' '}
                                <span className="max-w-52 truncate">
                                    {options[key]?.find(
                                        ([option]) => option === String(value),
                                    )?.[1] ?? value}
                                </span>
                                <X className="size-3 shrink-0" />
                            </button>
                        ))}
                    </div>
                )}
                {Object.entries(form.errors).map(([key, message]) => (
                    <p
                        role="alert"
                        key={key}
                        className="text-sm text-destructive"
                    >
                        {message}
                    </p>
                ))}
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
                <div
                    className="rounded-xl border bg-card"
                    aria-busy={form.processing}
                >
                    <Table
                        className={
                            form.processing
                                ? 'pointer-events-none min-w-[980px] opacity-50'
                                : 'min-w-[980px]'
                        }
                    >
                        <TableHeader>
                            <TableRow>
                                <TableHead className="pl-4">
                                    Pickup / Customer
                                </TableHead>
                                <TableHead className="hidden 2xl:table-cell">
                                    Petugas
                                </TableHead>
                                <TableHead>Kategori</TableHead>
                                {[
                                    'POP',
                                    'Retail',
                                    'Konfirmasi sistem',
                                    'Manual',
                                    'Belum terkonfirmasi',
                                ].map((label) => (
                                    <TableHead
                                        key={label}
                                        className="text-right"
                                    >
                                        {label}
                                    </TableHead>
                                ))}
                                <TableHead>Status</TableHead>
                                <TableHead className="hidden 2xl:table-cell">
                                    Pembaruan
                                </TableHead>
                                <TableHead className="pr-4 text-right">
                                    Aksi
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.rows.data.map((row) => (
                                <TableRow
                                    key={`${row.id}-${row.category}`}
                                    className="cursor-pointer focus-within:bg-blue-50/50 hover:bg-blue-50/50 dark:hover:bg-muted"
                                    onClick={(event) => {
                                        if (
                                            (event.target as Element).closest(
                                                'button,a,input,select,textarea,summary',
                                            )
                                        )
                                            return;
                                        openQuick(
                                            row.id,
                                            event.currentTarget.querySelector<HTMLElement>(
                                                '[data-quick]',
                                            ),
                                        );
                                    }}
                                >
                                    <TableCell className="pl-4">
                                        <p
                                            className="max-w-44 truncate font-medium"
                                            title={row.customer_name}
                                        >
                                            {row.customer_name}
                                        </p>
                                        <button
                                            onClick={(event) =>
                                                openQuick(
                                                    row.id,
                                                    event.currentTarget,
                                                )
                                            }
                                            className="mt-0.5 block max-w-44 truncate font-mono text-xs text-primary"
                                            title={row.reference}
                                        >
                                            {row.reference}
                                        </button>
                                    </TableCell>
                                    <TableCell className="hidden 2xl:table-cell">
                                        {row.staff_name ?? '—'}
                                    </TableCell>
                                    <TableCell>
                                        <span
                                            className="whitespace-nowrap"
                                            title={categoryName(row.category)}
                                        >
                                            {row.category === 'manual_hybrid'
                                                ? 'Manual Hybrid'
                                                : categoryName(row.category)}
                                        </span>
                                    </TableCell>
                                    {[
                                        'pop_quantity',
                                        'received_quantity',
                                        'confirmed_quantity',
                                        'manual_quantity',
                                        'unconfirmed_quantity',
                                    ].map((key) => (
                                        <TableCell
                                            key={key}
                                            className="text-right tabular-nums"
                                        >
                                            {quantity(
                                                row[key as 'pop_quantity'],
                                            )}
                                        </TableCell>
                                    ))}
                                    <TableCell>
                                        <ProcessingStatus
                                            status={row.processing_status}
                                        />
                                    </TableCell>
                                    <TableCell className="hidden text-xs text-muted-foreground 2xl:table-cell">
                                        {processingDate(
                                            row.last_updated_at,
                                            timezone,
                                        )}
                                    </TableCell>
                                    <TableCell className="pr-4 text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            data-quick
                                            aria-label={`Detail Cepat ${row.reference} ${categoryName(row.category)}`}
                                            onClick={(event) =>
                                                openQuick(
                                                    row.id,
                                                    event.currentTarget,
                                                )
                                            }
                                        >
                                            Detail Cepat
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {data.rows.data.length === 0 && (
                        <EmptyState
                            title="Belum ada paket sesuai filter"
                            description="Ubah tanggal atau bersihkan filter. Pekerjaan hari sebelumnya tetap tersedia melalui backlog."
                        />
                    )}
                </div>
                <ProcessingPager page={data.rows} />
            </section>
            <PickupProcessingDrawer
                key={selectedId ?? 'closed'}
                id={selectedId}
                context={
                    selectedId
                        ? routes.index.url({
                              query: {
                                  ...filters,
                                  page: data.rows.current_page,
                                  quick_pickup: selectedId,
                              },
                          })
                        : context
                }
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

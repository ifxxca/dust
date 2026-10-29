import {
    Head,
    router,
    useForm,
    useHttp,
    usePage,
    usePoll,
} from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AlertCircle,
    CalendarDays,
    CheckCircle2,
    ListChecks,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Clock3,
    Download,
    Filter,
    Files,
    Package,
    RefreshCw,
    Search,
    PanelRightOpen,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import PickupReconciliationDetail, {
    ReconciliationStatus,
} from '@/components/pickup-reconciliation-detail';
import PickupPendingQueue from '@/components/pickup-pending-queue';
import { cn } from '@/lib/utils';
import {
    deliveryLabels,
    reconciliationCategories as categories,
    reconciliationLabels,
    reconciliationTime,
    rowPackageTotal,
} from '@/lib/pickup-reconciliation';
import type {
    AutomationMonitor,
    ReconciliationDetail,
    ReconciliationRow,
} from '@/types/pickup-reconciliation';
import * as routes from '@/routes/pickup-automation';
export type { AutomationMonitor } from '@/types/pickup-reconciliation';

function Differences({ row }: { row: ReconciliationRow }) {
    const differences = categories.flatMap(([key, label]) => {
        const count = row.categories[key];
        if (count?.expected == null || count.confirmed === count.expected)
            return [];
        return [
            {
                label: label.replace(' Hybrid', '').replace('CSS / ', ''),
                delta: count.confirmed - count.expected,
            },
        ];
    });
    if (row.last_error)
        return (
            <p className="max-w-56 text-xs whitespace-normal text-destructive">
                {row.last_error}
            </p>
        );
    if (
        ['UNKNOWN', 'FAILED', 'DOCUMENT_FAILED', 'REVIEW'].includes(
            row.delivery_status,
        )
    )
        return (
            <p className="flex items-center gap-2 text-xs text-destructive">
                <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
                {deliveryLabels[row.delivery_status]}
            </p>
        );
    if (differences.length)
        return (
            <ul className="flex flex-col gap-1">
                {differences.map(({ label, delta }) => (
                    <li key={label} className="flex items-center gap-2 text-xs">
                        <span
                            className={cn(
                                'size-1.5 shrink-0 rounded-full',
                                delta > 0 ? 'bg-destructive' : 'bg-warning',
                            )}
                        />
                        <span>
                            {label}{' '}
                            <span
                                className={cn(
                                    'font-medium tabular-nums',
                                    delta > 0
                                        ? 'text-destructive'
                                        : 'text-warning',
                                )}
                            >
                                {delta > 0 ? '+' : ''}
                                {delta}
                            </span>
                        </span>
                    </li>
                ))}
            </ul>
        );
    return (
        <p className="flex max-w-64 items-start gap-2 text-xs leading-5 whitespace-normal text-muted-foreground">
            <span
                className={cn(
                    'mt-1.5 size-1.5 shrink-0 rounded-full',
                    row.automation_status === 'DONE'
                        ? 'bg-success'
                        : 'bg-muted-foreground/50',
                )}
            />
            {row.reasons[0] ??
                (row.automation_status === 'DONE'
                    ? 'Tidak ada selisih'
                    : row.automation_status === 'NOT_EVALUATED'
                      ? 'Menunggu evaluasi pertama'
                      : 'Belum ada target sah')}
        </p>
    );
}

export default function PickupAutomationMonitoring({
    data,
    filters,
    timezone,
    staffOptions = [],
}: {
    data: AutomationMonitor;
    filters: Record<string, string>;
    timezone: string;
    staffOptions?: { id: number; name: string }[];
}) {
    const selected =
        usePage<{ selectedPickup: number | null }>().props.selectedPickup ??
        null;
    const selectedRef = useRef(selected);
    selectedRef.current = selected;
    const [detail, setDetail] = useState<ReconciliationDetail | null>(null);
    const detailRef = useRef(detail);
    detailRef.current = detail;
    const [error, setError] = useState('');
    const [refreshError, setRefreshError] = useState('');
    const [busy, setBusy] = useState(false);
    const navigating = useRef(false);
    const detailTrigger = useRef<HTMLElement | null>(null);
    const [checked, setChecked] = useState<number[]>([]);
    const [bulkNotice, setBulkNotice] = useState('');
    const [bulkError, setBulkError] = useState('');
    const bulk = useHttp<
        Record<string, string | number[]>,
        { queued_count: number; message: string }
    >({});
    const validateBulk = async (selectedOnly: boolean) => {
        setBulkNotice('');
        setBulkError('');
        bulk.transform(() => ({
            ...filters,
            ...(selectedOnly ? { selected_ids: checked } : {}),
        }));
        try {
            const result = await bulk.post(routes.bulkRecheck.url());
            setBulkNotice(result.message);
            router.reload({ only: ['automation'] });
        } catch {
            setBulkError(
                'Validasi massal belum dapat diantrekan. Periksa koneksi atau sesi, lalu coba lagi.',
            );
        }
    };
    const dateDetails = useRef<HTMLDetailsElement>(null);
    const request = useHttp<Record<string, never>, ReconciliationDetail>({});
    const requestRef = useRef(request);
    requestRef.current = request;
    const detailVersion = useRef(0);
    const filter = useForm({
        q: filters.q ?? '',
        category: filters.category ?? '',
        staff_id: filters.staff_id ?? '',
        staff: filters.staff ?? '',
        automation_status: filters.automation_status ?? '',
        delivery_status: filters.delivery_status ?? '',
        reconciliation_group: filters.reconciliation_group ?? '',
        date_from: filters.date_from,
        date_to: filters.date_to,
        scope: filters.scope ?? 'daily',
        per_page: filters.per_page ?? '10',
    });
    const loadDetail = useCallback(
        async (id: number, pages: Record<string, string | number> = {}) => {
            const token = ++detailVersion.current;
            const current = detailRef.current;
            requestRef.current.cancel();
            if ((current?.selected_task_id ?? current?.task.id) !== id)
                setDetail(null);
            setError('');
            const pagination =
                current && (current.selected_task_id ?? current.task.id) === id
                    ? {
                          page: current.shipments.current_page,
                          shipment_q: current.shipment_query,
                          attached_page:
                              current.assigned_shipments.current_page,
                          manifest_page: current.manifests.current_page,
                          history_page: current.history.current_page,
                          pending_page: current.pending_items.current_page,
                          excluded_page: current.excluded.current_page,
                          review_page: current.review_events.current_page,
                          view: current.customer_day
                              ? 'customer_day'
                              : 'pickup',
                          member_task: current.task.id,
                      }
                    : { view: 'customer_day' };
            try {
                const response = await requestRef.current.get(
                    routes.show.url(id, { query: { ...pagination, ...pages } }),
                );
                if (
                    token === detailVersion.current &&
                    selectedRef.current === id &&
                    (response.selected_task_id ?? response.task.id) === id
                )
                    setDetail(response);
            } catch {
                if (
                    token === detailVersion.current &&
                    selectedRef.current === id
                )
                    setError(
                        'Detail belum dapat dimuat. Periksa koneksi atau sesi, lalu coba lagi.',
                    );
            }
        },
        [],
    );
    useEffect(() => {
        if (selected) void loadDetail(selected);
        else {
            detailVersion.current++;
            requestRef.current.cancel();
            setDetail(null);
            setError('');
        }
        return () => {
            detailVersion.current++;
            requestRef.current.cancel();
        };
    }, [selected, loadDetail]);
    usePoll(15000, {
        only: ['automation'],
        onBefore: () =>
            selectedRef.current === null &&
            !navigating.current &&
            !dateDetails.current?.open,
        onError: () =>
            setRefreshError(
                'Pembaruan belum berhasil. Data terakhir tetap ditampilkan.',
            ),
        onSuccess: () => setRefreshError(''),
    });
    const select = (id: number | null) => {
        router.cancelAll();
        if (id !== null && document.activeElement instanceof HTMLElement) {
            detailTrigger.current = document.activeElement;
        }
        router.replace({
            url: routes.index.url({
                query: { ...filters, quick_pickup: id ?? undefined },
            }),
            preserveScroll: true,
            preserveState: true,
            props: (props) => ({ ...props, selectedPickup: id }),
        });
    };
    const navigate = (values: Record<string, string | number>) => {
        router.cancelAll();
        const next = { ...filter.data, ...values };
        filter.setData(
            Object.fromEntries(
                Object.entries(next).map(([key, value]) => [
                    key,
                    String(value),
                ]),
            ) as typeof filter.data,
        );
        setChecked([]);
        router.get(
            routes.index.url(),
            { ...filters, ...next, page: 1 },
            {
                preserveScroll: true,
                preserveState: true,
                onStart: () => {
                    navigating.current = true;
                    setBusy(true);
                },
                onFinish: () => {
                    navigating.current = false;
                    setBusy(false);
                },
                onSuccess: () => {
                    filter.clearErrors();
                    setRefreshError('');
                    if (dateDetails.current) dateDetails.current.open = false;
                },
                onError: (errors) => {
                    filter.setError(errors);
                    setRefreshError(
                        'Periksa filter tanggal dan nilai yang dipilih.',
                    );
                    document
                        .getElementById(
                            errors.date_from
                                ? 'recon-date-from'
                                : 'recon-date-to',
                        )
                        ?.focus();
                },
            },
        );
    };
    const changePage = (page: number) => {
        router.cancelAll();
        router.get(
            routes.index.url(),
            { ...filters, page, quick_pickup: selected ?? undefined },
            {
                preserveScroll: true,
                preserveState: true,
                onStart: () => {
                    navigating.current = true;
                    setBusy(true);
                },
                onFinish: () => {
                    navigating.current = false;
                    setBusy(false);
                },
            },
        );
    };
    const visibleIds = data.rows.data.map((row) => row.id);
    const allChecked =
        visibleIds.length > 0 && visibleIds.every((id) => checked.includes(id));
    const chooseRow = (id: number, enabled: boolean) =>
        setChecked((current) =>
            enabled
                ? [...new Set([...current, id])].slice(0, 200)
                : current.filter((value) => value !== id),
        );
    const summaryCards = [
        {
            key: 'review',
            label: 'Perlu diperiksa',
            count: data.summary.review,
            description: 'Memerlukan tindakan',
            icon: AlertCircle,
            tone: 'text-destructive bg-destructive/10',
        },
        {
            key: 'waiting',
            label: 'Menunggu data',
            count: data.summary.waiting,
            description: 'Bukti belum lengkap',
            icon: Clock3,
            tone: 'text-warning bg-warning/10',
        },
        {
            key: 'done',
            label: 'Selesai',
            count: data.summary.done,
            description: 'Rekonsiliasi lengkap',
            icon: CheckCircle2,
            tone: 'text-success bg-success/10',
        },
        {
            key: '',
            label: 'Customer / hari',
            count: data.summary.total,
            description: 'Dalam periode ini',
            icon: Package,
            tone: 'text-muted-foreground bg-muted',
        },
    ];
    const group = filters.reconciliation_group ?? '';
    const groupChange = (reconciliation_group: string) =>
        navigate({
            reconciliation_group,
            automation_status: '',
            delivery_status: '',
        });
    const statusValue = filter.data.delivery_status
        ? `delivery:${filter.data.delivery_status}`
        : filter.data.automation_status
          ? `reconciliation:${filter.data.automation_status}`
          : '';
    const rangeLabel = (value: string) => {
        const parts = value?.split('-');
        return parts?.length === 3
            ? `${parts[2]}/${parts[1]}/${parts[0]}`
            : value;
    };
    const pages = [
        ...new Set([
            1,
            ...Array.from(
                { length: 3 },
                (_, index) => data.rows.current_page - 1 + index,
            ),
            data.rows.last_page,
        ]),
    ].filter((page) => page > 0 && page <= data.rows.last_page);
    const panel = selected ? (
        <PickupReconciliationDetail
            key={selected}
            detail={detail}
            error={error}
            timezone={timezone}
            enabled={data.enabled}
            close={() => select(null)}
            reload={() => void loadDetail(selected)}
            loadPage={(pages) => void loadDetail(selected, pages)}
        />
    ) : null;
    return (
        <div
            aria-busy={busy}
            className="reconciliation-workspace flex min-w-0 flex-col gap-4"
        >
            <Head title="Rekonsiliasi Paket" />
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl leading-7 font-semibold tracking-tight">
                        Rekonsiliasi Paket
                    </h1>
                    <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
                        Cocokkan jumlah paket dengan data JNE dan identifikasi
                        selisih atau data yang belum lengkap.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <PickupPendingQueue
                        count={data.pending_count}
                        select={select}
                    />
                    <details ref={dateDetails} className="relative">
                        <summary
                            className={cn(
                                buttonVariants({ variant: 'outline' }),
                                'cursor-pointer list-none gap-2 bg-card [&::-webkit-details-marker]:hidden',
                            )}
                        >
                            <CalendarDays
                                className="size-4"
                                aria-hidden="true"
                            />
                            <span className="text-xs">
                                {rangeLabel(filters.date_from)} –{' '}
                                {rangeLabel(filters.date_to)}
                            </span>
                            <ChevronDown className="ml-2 size-3.5" />
                        </summary>
                        <form
                            className="mt-2 flex w-full max-w-full min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 shadow-lg sm:absolute sm:right-0 sm:z-10 sm:w-80"
                            onSubmit={(event) => {
                                event.preventDefault();
                                navigate(filter.data);
                            }}
                        >
                            {[
                                ['date_from', 'Dari tanggal pickup'],
                                ['date_to', 'Sampai tanggal pickup'],
                            ].map(([key, label]) => (
                                <div
                                    key={key}
                                    className="flex flex-col gap-1.5"
                                >
                                    <Label
                                        htmlFor={`recon-${key === 'date_from' ? 'date-from' : 'date-to'}`}
                                    >
                                        {label}
                                    </Label>
                                    <Input
                                        id={`recon-${key === 'date_from' ? 'date-from' : 'date-to'}`}
                                        name={key}
                                        type="date"
                                        value={
                                            filter.data[
                                                key as 'date_from' | 'date_to'
                                            ]
                                        }
                                        aria-invalid={
                                            !!filter.errors[
                                                key as 'date_from' | 'date_to'
                                            ]
                                        }
                                        aria-describedby={
                                            filter.errors[
                                                key as 'date_from' | 'date_to'
                                            ]
                                                ? `recon-${key}-error`
                                                : undefined
                                        }
                                        onChange={(event) =>
                                            filter.setData(
                                                key as 'date_from' | 'date_to',
                                                event.target.value,
                                            )
                                        }
                                    />
                                    {filter.errors[
                                        key as 'date_from' | 'date_to'
                                    ] && (
                                        <p
                                            id={`recon-${key}-error`}
                                            className="text-xs text-destructive"
                                        >
                                            {
                                                filter.errors[
                                                    key as
                                                        | 'date_from'
                                                        | 'date_to'
                                                ]
                                            }
                                        </p>
                                    )}
                                </div>
                            ))}
                            <Button type="submit" disabled={busy}>
                                Terapkan periode
                            </Button>
                        </form>
                    </details>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                disabled={
                                    !data.enabled ||
                                    !data.rows.total ||
                                    busy ||
                                    bulk.processing
                                }
                            >
                                <ListChecks
                                    data-icon="inline-start"
                                    aria-hidden="true"
                                />
                                {bulk.processing
                                    ? 'Mengantrekan…'
                                    : 'Validasi massal'}
                                <ChevronDown
                                    data-icon="inline-end"
                                    aria-hidden="true"
                                />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                                <DropdownMenuItem
                                    disabled={!checked.length}
                                    onSelect={() => void validateBulk(true)}
                                >
                                    Validasi pilihan ({checked.length})
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onSelect={() => void validateBulk(false)}
                                >
                                    Validasi semua hasil filter (
                                    {data.rows.total})
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label="Muat ulang rekonsiliasi"
                        disabled={busy}
                        onClick={() =>
                            router.reload({
                                only: ['automation'],
                                onSuccess: () => {
                                    if (selected) void loadDetail(selected);
                                },
                            })
                        }
                    >
                        <RefreshCw className="size-4" />
                    </Button>
                    <Button
                        asChild
                        disabled={!data.rows.total}
                        className="size-9 p-0 sm:h-9 sm:w-auto sm:px-4"
                    >
                        <a
                            aria-label={
                                checked.length
                                    ? `Ekspor CSV (${checked.length} pickup dipilih)`
                                    : 'Ekspor CSV'
                            }
                            title="Ekspor CSV"
                            href={routes.exportMethod.url({
                                query: {
                                    ...filters,
                                    ...(checked.length
                                        ? { selected_ids: checked }
                                        : {}),
                                },
                            })}
                        >
                            <Download className="size-4" />
                            <span className="hidden sm:inline">
                                Ekspor CSV
                                {checked.length ? ` (${checked.length})` : ''}
                            </span>
                        </a>
                    </Button>
                </div>
            </header>
            {busy && (
                <p role="status" className="text-sm text-muted-foreground">
                    Memuat rekonsiliasi…
                </p>
            )}
            {bulkNotice && (
                <p
                    role="status"
                    aria-live="polite"
                    className="text-xs text-muted-foreground"
                >
                    {bulkNotice}
                </p>
            )}
            {bulkError && (
                <p role="alert" className="text-xs text-destructive">
                    {bulkError}
                </p>
            )}
            <p className="text-xs leading-5 text-muted-foreground">
                Hari operasional 05.00–04.59 WIB · Target pickup{' '}
                {data.processing.regular_target ?? '—'} + pending masuk{' '}
                {data.processing.pending_incoming} ={' '}
                {data.processing.target ?? '—'} AWB · Diproses{' '}
                {data.processing.processed} AWB
            </p>
            {refreshError && (
                <p role="alert" className="text-sm text-destructive">
                    {refreshError}
                </p>
            )}
            {!data.enabled && (
                <p role="status" className="text-xs text-muted-foreground">
                    Validasi otomatis belum aktif. Hasil evaluasi terakhir tetap
                    ditampilkan.
                </p>
            )}
            <div className="min-w-0">
                <section
                    aria-label="Daftar rekonsiliasi"
                    className="flex min-w-0 flex-col gap-5"
                >
                    <section
                        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
                        aria-label="Ringkasan rekonsiliasi"
                    >
                        {summaryCards.map((card) => (
                            <button
                                type="button"
                                key={card.key}
                                disabled={busy}
                                onClick={() => groupChange(card.key)}
                                className="flex min-w-0 items-start gap-2 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:p-4"
                            >
                                <span
                                    className={cn(
                                        'flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-11 sm:rounded-xl',
                                        card.tone,
                                    )}
                                >
                                    <card.icon
                                        className="size-5 sm:size-6"
                                        aria-hidden="true"
                                    />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[11px] text-muted-foreground sm:text-xs">
                                        {card.label}
                                    </span>
                                    <span className="mt-1 block text-xl leading-6 font-semibold tabular-nums sm:text-2xl sm:leading-8">
                                        {card.count}
                                    </span>
                                    <span className="mt-1 hidden text-[11px] text-muted-foreground sm:block">
                                        {card.description}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </section>
                    <nav
                        className="flex flex-wrap gap-2"
                        aria-label="Status rekonsiliasi paket"
                    >
                        {[
                            ['', 'Semua', data.summary.total],
                            ['review', 'Perlu diperiksa', data.summary.review],
                            ['waiting', 'Menunggu data', data.summary.waiting],
                            ['done', 'Selesai', data.summary.done],
                        ].map(([key, label, count]) => (
                            <Button
                                key={key}
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                aria-current={
                                    group === key ? 'page' : undefined
                                }
                                onClick={() => groupChange(String(key))}
                                className={cn(
                                    'gap-2 bg-card',
                                    group === key &&
                                        'border-primary/40 bg-primary/5 text-primary',
                                )}
                            >
                                <span>{label}</span>
                                <span
                                    className={cn(
                                        'rounded px-1.5 py-0.5 text-[10px] tabular-nums',
                                        group === key
                                            ? 'bg-primary/10'
                                            : 'bg-muted',
                                    )}
                                >
                                    {count}
                                </span>
                            </Button>
                        ))}
                    </nav>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            navigate(filter.data);
                        }}
                        className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
                        aria-label="Filter rekonsiliasi paket"
                    >
                        <div className="relative col-span-2 min-w-48 flex-1">
                            <Search
                                className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <Input
                                name="q"
                                aria-label="Cari customer, kode pickup, atau keterangan"
                                className="h-10 bg-card pl-9"
                                placeholder="Cari customer, kode pickup, atau keterangan…"
                                autoComplete="off"
                                value={filter.data.q}
                                onChange={(event) =>
                                    filter.setData('q', event.target.value)
                                }
                            />
                        </div>
                        <select
                            aria-label="Kategori paket"
                            className="h-10 min-w-0 rounded-md border bg-card px-3 text-xs sm:max-w-36"
                            value={filter.data.category}
                            onChange={(event) =>
                                navigate({ category: event.target.value })
                            }
                        >
                            <option value="">Semua kategori</option>
                            {categories.map(([key, label]) => (
                                <option key={key} value={key}>
                                    {label}
                                </option>
                            ))}
                        </select>
                        <select
                            aria-label="Petugas pickup"
                            className="h-10 min-w-0 rounded-md border bg-card px-3 text-xs sm:max-w-36"
                            value={filter.data.staff || filter.data.staff_id}
                            onChange={(event) =>
                                navigate({
                                    staff_id: event.target.value,
                                    staff: '',
                                })
                            }
                        >
                            <option value="">Semua petugas</option>
                            {filter.data.staff && (
                                <option value={filter.data.staff}>
                                    {filter.data.staff}
                                </option>
                            )}
                            {staffOptions.map((staff) => (
                                <option key={staff.id} value={staff.id}>
                                    {staff.name}
                                </option>
                            ))}
                        </select>
                        <select
                            aria-label="Status rekonsiliasi atau pengiriman"
                            className="h-10 min-w-0 rounded-md border bg-card px-3 text-xs sm:max-w-40"
                            value={statusValue}
                            onChange={(event) => {
                                const [type, value] =
                                    event.target.value.split(':');
                                navigate({
                                    automation_status:
                                        type === 'reconciliation' ? value : '',
                                    delivery_status:
                                        type === 'delivery' ? value : '',
                                });
                            }}
                        >
                            <option value="">Semua status</option>
                            <optgroup label="Rekonsiliasi">
                                {Object.entries(reconciliationLabels).map(
                                    ([key, label]) => (
                                        <option
                                            key={key}
                                            value={`reconciliation:${key}`}
                                        >
                                            {label}
                                            {key === 'PARTIAL'
                                                ? ' (sebagian)'
                                                : ''}
                                        </option>
                                    ),
                                )}
                            </optgroup>
                            <optgroup label="Pengiriman resi">
                                {Object.entries(deliveryLabels).map(
                                    ([key, label]) => (
                                        <option
                                            key={key}
                                            value={`delivery:${key}`}
                                        >
                                            {label}
                                        </option>
                                    ),
                                )}
                            </optgroup>
                        </select>
                        <Button
                            type="submit"
                            variant="outline"
                            className="h-10 bg-card"
                            disabled={busy}
                        >
                            <Filter className="size-4" />
                            Filter
                        </Button>
                    </form>
                    {checked.length > 0 && (
                        <div
                            className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
                            role="status"
                        >
                            <span>
                                {checked.length} customer / hari dipilih.
                            </span>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setChecked([])}
                            >
                                Batalkan pilihan
                            </Button>
                        </div>
                    )}
                    <div className="hidden min-w-0 overflow-hidden rounded-lg border bg-card md:block">
                        <Table className="text-xs">
                            <TableHeader>
                                <TableRow className="bg-muted/20">
                                    <TableHead className="w-9 px-3">
                                        <Checkbox
                                            aria-label="Pilih semua pickup pada halaman ini"
                                            checked={
                                                allChecked
                                                    ? true
                                                    : visibleIds.some((id) =>
                                                            checked.includes(
                                                                id,
                                                            ),
                                                        )
                                                      ? 'indeterminate'
                                                      : false
                                            }
                                            disabled={!visibleIds.length}
                                            onCheckedChange={(value) =>
                                                setChecked((current) =>
                                                    value
                                                        ? [
                                                              ...new Set([
                                                                  ...current,
                                                                  ...visibleIds,
                                                              ]),
                                                          ].slice(0, 200)
                                                        : current.filter(
                                                              (id) =>
                                                                  !visibleIds.includes(
                                                                      id,
                                                                  ),
                                                          ),
                                                )
                                            }
                                        />
                                    </TableHead>
                                    <TableHead>Customer / Pickup</TableHead>
                                    <TableHead className="text-right whitespace-nowrap">
                                        Total paket
                                    </TableHead>
                                    <TableHead>
                                        Rincian selisih / masalah utama
                                    </TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="hidden 2xl:table-cell">
                                        Terakhir diperbarui
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Aksi
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.rows.data.map((row) => (
                                    <TableRow
                                        key={row.id}
                                        data-selected={selected === row.id}
                                        className={cn(
                                            'hover:bg-primary/5',
                                            selected === row.id &&
                                                'bg-primary/5',
                                        )}
                                    >
                                        <TableCell className="px-3">
                                            <Checkbox
                                                aria-label={`Pilih pickup ${row.reference}`}
                                                checked={checked.includes(
                                                    row.id,
                                                )}
                                                onCheckedChange={(value) =>
                                                    chooseRow(row.id, !!value)
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="max-w-60 whitespace-normal">
                                            <button
                                                type="button"
                                                className="text-left leading-5 font-semibold outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                                                onClick={() => select(row.id)}
                                            >
                                                {row.customer_name}
                                            </button>
                                            <p className="mt-0.5 text-[11px] break-all text-muted-foreground">
                                                {row.business_date
                                                    ? row.business_date +
                                                      ' · ' +
                                                      row.pickup_count +
                                                      ' pickup'
                                                    : row.reference}
                                            </p>
                                            {row.dirty && (
                                                <p className="mt-1 text-[10px] text-warning">
                                                    Menunggu evaluasi terbaru
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell
                                            className="text-right font-medium tabular-nums"
                                            title="Jumlah resi / AWB unik pada POP"
                                        >
                                            {rowPackageTotal(row) ?? '—'}
                                        </TableCell>
                                        <TableCell>
                                            <Differences row={row} />
                                        </TableCell>
                                        <TableCell>
                                            <ReconciliationStatus
                                                status={row.automation_status}
                                                group={row.reconciliation_group}
                                            />
                                        </TableCell>
                                        <TableCell className="hidden whitespace-nowrap text-muted-foreground 2xl:table-cell">
                                            {reconciliationTime(
                                                row.evaluated_at,
                                                timezone,
                                                true,
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 gap-1 px-2 text-[11px]"
                                                onClick={() => select(row.id)}
                                                aria-label={`Lihat rekonsiliasi ${row.customer_name}`}
                                            >
                                                <Files className="size-3.5 text-primary" />
                                                Lihat
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex flex-col divide-y rounded-lg border bg-card md:hidden">
                        {data.rows.data.map((row) => (
                            <article
                                key={row.id}
                                className={cn(
                                    'flex flex-col gap-3 p-4',
                                    selected === row.id && 'bg-primary/5',
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h2 className="text-sm leading-5 font-semibold">
                                            {row.customer_name}
                                        </h2>
                                        <p className="mt-1 text-[11px] break-all text-muted-foreground">
                                            {row.business_date
                                                ? row.business_date +
                                                  ' · ' +
                                                  row.pickup_count +
                                                  ' pickup'
                                                : row.reference}
                                        </p>
                                    </div>
                                    <Checkbox
                                        aria-label={`Pilih pickup ${row.reference}`}
                                        checked={checked.includes(row.id)}
                                        onCheckedChange={(value) =>
                                            chooseRow(row.id, !!value)
                                        }
                                    />
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">
                                        Total paket{' '}
                                        <strong className="ml-1 text-foreground tabular-nums">
                                            {rowPackageTotal(row) ?? '—'}
                                        </strong>
                                    </span>
                                    <ReconciliationStatus
                                        status={row.automation_status}
                                        group={row.reconciliation_group}
                                    />
                                </div>
                                <Differences row={row} />
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-muted-foreground">
                                        {row.dirty
                                            ? 'Menunggu evaluasi terbaru'
                                            : reconciliationTime(
                                                  row.evaluated_at,
                                                  timezone,
                                                  true,
                                              )}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="min-h-10"
                                        onClick={() => select(row.id)}
                                    >
                                        <PanelRightOpen className="size-4" />
                                        Lihat detail
                                    </Button>
                                </div>
                            </article>
                        ))}
                    </div>
                    {!data.rows.total && (
                        <div className="rounded-lg border bg-card px-4 py-12 text-center">
                            <Package className="mx-auto size-8 text-muted-foreground" />
                            <h2 className="mt-3 text-sm font-medium">
                                Tidak ada rekonsiliasi sesuai filter
                            </h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Ubah periode, pencarian, atau status untuk
                                melihat data lain.
                            </p>
                            <Button
                                variant="outline"
                                className="mt-4"
                                onClick={() =>
                                    navigate({
                                        q: '',
                                        category: '',
                                        staff: '',
                                        staff_id: '',
                                        automation_status: '',
                                        delivery_status: '',
                                        reconciliation_group: '',
                                    })
                                }
                            >
                                Reset filter pencarian
                            </Button>
                        </div>
                    )}
                    <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                        <p>
                            Menampilkan {data.rows.from ?? 0} –{' '}
                            {data.rows.to ?? 0} dari {data.rows.total} customer
                            / hari
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                aria-label="Jumlah customer per halaman"
                                className="h-9 rounded-md border bg-card px-2 text-xs"
                                value={filter.data.per_page}
                                onChange={(event) =>
                                    navigate({ per_page: event.target.value })
                                }
                            >
                                {[10, 20, 50].map((count) => (
                                    <option key={count} value={count}>
                                        {count} per halaman
                                    </option>
                                ))}
                            </select>
                            {[
                                [1, ChevronsLeft, 'Halaman pertama'],
                                [
                                    data.rows.current_page - 1,
                                    ChevronLeft,
                                    'Halaman sebelumnya',
                                ],
                            ].map(([page, Icon, label]) => {
                                const PageIcon = Icon as typeof ChevronLeft;
                                return (
                                    <Button
                                        key={String(label)}
                                        variant="outline"
                                        size="icon"
                                        className="size-8 bg-card"
                                        disabled={
                                            busy || data.rows.current_page <= 1
                                        }
                                        aria-label={String(label)}
                                        onClick={() => changePage(Number(page))}
                                    >
                                        <PageIcon className="size-3.5" />
                                    </Button>
                                );
                            })}
                            {pages.map((page) => (
                                <Button
                                    key={page}
                                    variant={
                                        page === data.rows.current_page
                                            ? 'default'
                                            : 'outline'
                                    }
                                    className="size-8 px-0"
                                    aria-label={`Halaman ${page}`}
                                    aria-current={
                                        page === data.rows.current_page
                                            ? 'page'
                                            : undefined
                                    }
                                    disabled={busy}
                                    onClick={() => changePage(page)}
                                >
                                    {page}
                                </Button>
                            ))}
                            {[
                                [
                                    data.rows.current_page + 1,
                                    ChevronRight,
                                    'Halaman berikutnya',
                                ],
                                [
                                    data.rows.last_page,
                                    ChevronsRight,
                                    'Halaman terakhir',
                                ],
                            ].map(([page, Icon, label]) => {
                                const PageIcon = Icon as typeof ChevronLeft;
                                return (
                                    <Button
                                        key={String(label)}
                                        variant="outline"
                                        size="icon"
                                        className="size-8 bg-card"
                                        disabled={
                                            busy ||
                                            data.rows.current_page >=
                                                data.rows.last_page
                                        }
                                        aria-label={String(label)}
                                        onClick={() => changePage(Number(page))}
                                    >
                                        <PageIcon className="size-3.5" />
                                    </Button>
                                );
                            })}
                        </div>
                    </footer>
                </section>
            </div>
            <Sheet
                open={selected !== null}
                onOpenChange={(open) => {
                    if (!open) select(null);
                }}
            >
                <SheetContent
                    className="w-full gap-0 p-0 sm:max-w-xl [&>button:last-child]:hidden"
                    onCloseAutoFocus={(event) => {
                        if (detailTrigger.current?.isConnected) {
                            event.preventDefault();
                            detailTrigger.current.focus();
                        }
                    }}
                >
                    <SheetHeader className="sr-only">
                        <SheetTitle>Detail Rekonsiliasi</SheetTitle>
                        <SheetDescription>
                            Perbandingan jumlah pickup, verifikasi gudang dan
                            resi JNE.
                        </SheetDescription>
                    </SheetHeader>
                    {panel}
                </SheetContent>
            </Sheet>
        </div>
    );
}

import { Disclosure, DisclosureSummary } from '@/components/ui/disclosure';
import { NativeSelect } from '@/components/ui/native-select';
import {
    Head,
    router,
    useForm,
    useHttp,
    usePage,
    usePoll,
} from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import {
    CalendarDays,
    ListChecks,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Download,
    Filter,
    Files,
    Package,
    RefreshCw,
    Search,
    PanelRightOpen,
    MoreHorizontal,
    Info,
    BookOpen,
    CheckCircle2,
    AlertTriangle,
    CircleAlert,
    Clock3,
    Layers,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import PickupReconciliationDetail from '@/components/reconciliation-workspace';
import PickupPendingQueue from '@/components/pickup-pending-queue';
import { cn } from '@/lib/utils';
import {
    deliveryLabels,
    reconciliationCategories as categories,
    reconciliationLabels,
    quantityLabels,
    reconciliationTime,
    reconciliationCategoryStates,
    reconciliationProgress,
} from '@/lib/pickup-reconciliation';
import type {
    AutomationMonitor,
    ReconciliationRow,
} from '@/types/pickup-reconciliation';
import * as routes from '@/routes/pickup-automation';

export type { AutomationMonitor } from '@/types/pickup-reconciliation';

export function AllocationCards({
    data,
}: {
    data: Pick<AutomationMonitor, 'pool_summary' | 'allocation_summary'>;
}) {
    const pool = data.pool_summary;
    const summary = data.allocation_summary;
    const percentage = (value: number | undefined) =>
        pool && pool.total > 0 && value != null
            ? `${Math.round((value / pool.total) * 100)}%`
            : null;
    const cards = [
        {
            label: 'Total AWB',
            value: pool?.total,
            Icon: Package,
            note: 'Pool global · lintas customer',
            tone: 'bg-primary/10 text-primary',
        },
        {
            label: 'Terikat ke pickup',
            value: pool?.allocated,
            Icon: BookOpen,
            note: percentage(pool?.allocated) ?? 'Pool global',
            tone: 'bg-success/10 text-success',
        },
        {
            label: 'Belum terikat',
            value: pool?.unassigned,
            Icon: Layers,
            note: percentage(pool?.unassigned) ?? 'Pool global',
            tone: 'bg-warning/10 text-warning',
        },
        {
            label: 'Buku pickup',
            value: summary?.pickup_books,
            Icon: Files,
            note: `${summary?.total.toLocaleString('id-ID') ?? '—'} customer/hari`,
            tone: 'bg-primary/10 text-primary',
        },
        {
            label: 'Jumlah cocok',
            value: summary?.matched,
            Icon: CheckCircle2,
            note: 'Per customer/hari',
            tone: 'bg-success/10 text-success',
        },
    ];
    return (
        <section
            aria-label="Ringkasan rekonsiliasi"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3"
        >
            {cards.map(({ label, value, Icon, note, tone }, index) => (
                <Card
                    key={label}
                    className={cn(
                        'gap-0 py-3 shadow-none',
                        index === 4 && 'col-span-2 sm:col-span-1',
                    )}
                >
                    <CardContent className="flex items-center gap-3 px-3 lg:px-4">
                        <span
                            className={cn(
                                'hidden size-11 shrink-0 items-center justify-center rounded-xl sm:flex',
                                tone,
                            )}
                        >
                            <Icon className="size-6" aria-hidden="true" />
                        </span>
                        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 sm:block">
                            <h2 className="text-xs leading-5">{label}</h2>
                            <p className="text-xl leading-7 font-semibold tracking-tight tabular-nums sm:text-2xl sm:leading-8">
                                {value?.toLocaleString('id-ID') ?? '—'}
                            </p>
                            <p className="sr-only text-xs leading-4 text-muted-foreground sm:not-sr-only">
                                {note}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </section>
    );
}

export function AllocationSummary({
    data,
}: {
    data: Pick<AutomationMonitor, 'pool_summary' | 'allocation_summary'>;
}) {
    return (
        <div className="flex flex-col gap-3">
            {data.pool_summary && (
                <section
                    aria-label="Alokasi AWB global"
                    className="flex flex-col gap-3"
                >
                    <p className="text-xs text-muted-foreground">
                        Pool global · {data.pool_summary.date_from}–
                        {data.pool_summary.date_to} ·{' '}
                        {categories.find(
                            ([key]) => key === data.pool_summary?.category,
                        )?.[1] ?? 'Semua kategori'}{' '}
                        · lintas customer
                    </p>
                    <dl className="flex flex-wrap gap-x-6 gap-y-3">
                        {(
                            [
                                ['AWB unik tersimpan', data.pool_summary.total],
                                ['Terikat', data.pool_summary.allocated],
                                ['Unassigned', data.pool_summary.unassigned],
                            ] as const
                        ).map(([label, value]) => (
                            <div key={label}>
                                <dt className="text-xs text-muted-foreground">
                                    {label}
                                </dt>
                                <dd className="font-semibold tabular-nums">
                                    {value.toLocaleString('id-ID')}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>
            )}
            {data.allocation_summary && (
                <section
                    aria-label="Jumlah sesuai filter tabel"
                    className="flex flex-col gap-2"
                >
                    <p className="text-xs text-muted-foreground">
                        {data.allocation_summary.total.toLocaleString('id-ID')}{' '}
                        customer/hari ·{' '}
                        {data.allocation_summary.pickup_books.toLocaleString(
                            'id-ID',
                        )}{' '}
                        buku pickup · sesuai filter tabel
                    </p>
                    <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                        {(
                            [
                                ['Cocok', data.allocation_summary.matched],
                                ['Kurang', data.allocation_summary.shortage],
                                ['Lebih', data.allocation_summary.excess],
                                ['Konflik', data.allocation_summary.conflict],
                            ] as const
                        ).map(([label, value]) => (
                            <div key={label} className="flex gap-2">
                                <dt>{label}</dt>
                                <dd className="font-medium tabular-nums">
                                    {value.toLocaleString('id-ID')}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>
            )}
        </div>
    );
}

export function AllocationStatus({
    row,
}: {
    row: Pick<
        ReconciliationRow,
        'quantity_status' | 'finalization_status' | 'automation_status'
    > &
        Partial<
            Pick<
                ReconciliationRow,
                | 'categories'
                | 'dirty'
                | 'closure_mode'
                | 'closure_due_at'
                | 'closure_overdue'
            >
        >;
}) {
    const finalized = row.finalization_status === 'LOCKED';
    const review = row.finalization_status === 'LOCKED_REVIEW';
    if (finalized && row.closure_mode === 'EXCEPTION') {
        return <Badge variant="secondary">Selesai dengan selisih</Badge>;
    }
    const states = reconciliationCategoryStates({
        ...row,
        categories: row.categories ?? {},
    });
    const discrepancies = states.filter((category) =>
        ['shortage', 'excess'].includes(category.state),
    );
    const waiting = states.filter(
        (category) => category.state === 'waiting' && category.relevant,
    );
    const stale = row.dirty || row.quantity_status === 'NOT_EVALUATED';
    const generic = stale
        ? 'Menunggu pemeriksaan'
        : (quantityLabels[row.quantity_status ?? 'NOT_EVALUATED'] ??
          row.quantity_status);
    return (
        <div className="flex flex-col items-start gap-1">
            {!finalized && !review && row.closure_due_at && (
                <span
                    className={
                        row.closure_overdue
                            ? 'text-xs font-medium text-destructive'
                            : 'text-xs text-muted-foreground'
                    }
                >
                    {row.closure_overdue
                        ? 'Lewat tenggat · '
                        : 'Tutup sebelum '}
                    {reconciliationTime(row.closure_due_at, 'Asia/Jakarta')}
                </span>
            )}
            {discrepancies.length ? (
                discrepancies.map((category) => (
                    <Badge
                        key={category.key}
                        variant={
                            category.state === 'excess'
                                ? 'destructive'
                                : 'warning'
                        }
                    >
                        {category.state === 'excess' ? (
                            <CircleAlert aria-hidden="true" />
                        ) : (
                            <AlertTriangle aria-hidden="true" />
                        )}
                        {category.text}
                    </Badge>
                ))
            ) : (
                <Badge
                    variant={
                        stale
                            ? 'secondary'
                            : row.quantity_status === 'MATCHED'
                              ? finalized
                                  ? 'success'
                                  : 'outline'
                              : row.quantity_status === 'CONFLICT'
                                ? 'destructive'
                                : 'secondary'
                    }
                >
                    {row.quantity_status === 'MATCHED' && !stale ? (
                        <CheckCircle2 aria-hidden="true" />
                    ) : (
                        <Clock3 aria-hidden="true" />
                    )}
                    {generic}
                </Badge>
            )}
            {!stale &&
                waiting.length > 0 &&
                waiting.length < 3 &&
                waiting.map((category) => (
                    <Badge key={category.key} variant="secondary">
                        {category.text}
                    </Badge>
                ))}
            <span className="text-xs text-muted-foreground">
                {finalized
                    ? 'Final: terkunci'
                    : review
                      ? 'Snapshot terkunci · perlu review'
                      : row.quantity_status === 'MATCHED' &&
                          row.automation_status === 'WAITING_DATA'
                        ? 'Finalisasi: menunggu sumber'
                        : 'Belum difinalisasi'}
            </span>
        </div>
    );
}

export function AllocationProgress({ row }: { row: ReconciliationRow }) {
    const progress = reconciliationProgress(row);
    return (
        <div
            className="flex min-w-24 flex-col gap-1.5"
            aria-label="Progress alokasi per kategori"
        >
            <span className="text-right text-xs tabular-nums">
                {progress.percent === null ? '—' : `${progress.percent}%`}
            </span>
            <div
                role="progressbar"
                aria-label="Kecocokan alokasi kategori"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={
                    progress.percent === null ? undefined : progress.fill
                }
                aria-valuetext={
                    progress.percent === null
                        ? 'Target belum tersedia atau menunggu pemeriksaan'
                        : `${progress.percent}% alokasi kategori`
                }
                className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
                <div
                    className={cn(
                        'h-full rounded-full',
                        progress.tone === 'danger'
                            ? 'bg-destructive'
                            : progress.tone === 'success'
                              ? 'bg-success'
                              : 'bg-warning',
                    )}
                    style={{ width: `${progress.fill}%` }}
                />
            </div>
        </div>
    );
}

function AllocationDelta({ row }: { row: ReconciliationRow }) {
    if (
        row.dirty ||
        row.quantity_status === 'NOT_EVALUATED' ||
        row.difference == null
    )
        return '—';
    const differences = reconciliationCategoryStates(row).some(
        (category) =>
            category.state === 'shortage' || category.state === 'excess',
    );
    return (
        <div className="flex flex-col items-end gap-1">
            <Badge
                variant={
                    row.difference > 0
                        ? 'destructive'
                        : row.difference < 0
                          ? 'warning'
                          : 'secondary'
                }
            >
                {row.difference > 0 ? '+' : ''}
                {row.difference}
            </Badge>
            {row.difference === 0 && differences && (
                <span className="text-xs text-destructive">Beda kategori</span>
            )}
        </div>
    );
}

function Differences({ row }: { row: ReconciliationRow }) {
    const states = reconciliationCategoryStates(row);
    const visible = states.filter(
        (category) => category.relevant && category.expected !== null,
    );
    const stale = row.dirty || row.quantity_status === 'NOT_EVALUATED';
    const deliveryError = [
        'UNKNOWN',
        'FAILED',
        'DOCUMENT_FAILED',
        'REVIEW',
    ].includes(row.delivery_status);
    return (
        <div className="flex max-w-64 flex-col gap-1 text-xs leading-5 whitespace-normal">
            {!stale && visible.length > 0 && (
                <p className="text-muted-foreground">
                    {visible
                        .map(
                            (category) =>
                                `${category.label} ${category.confirmed}/${category.expected}`,
                        )
                        .join(' · ')}
                </p>
            )}
            {row.last_error ? (
                <p className="text-destructive">{row.last_error}</p>
            ) : deliveryError ? (
                <p className="text-destructive">
                    {deliveryLabels[row.delivery_status]}
                </p>
            ) : (
                <p className="text-muted-foreground">
                    {stale
                        ? 'Menunggu evaluasi terbaru'
                        : (row.reasons?.[0] ??
                          (row.finalization_status === 'LOCKED'
                              ? 'Semua kategori sesuai'
                              : row.quantity_status === 'MATCHED'
                                ? 'Jumlah sesuai; finalisasi belum selesai'
                                : visible.length
                                  ? 'Alokasi / target per kategori'
                                  : 'Menunggu target kategori yang sah'))}
                </p>
            )}
        </div>
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
    const canAdmin =
        usePage<{ auth: { user: { role: string } } }>().props.auth?.user
            ?.role === 'admin_supervisor';
    const selectedRef = useRef(selected);
    selectedRef.current = selected;
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
    const [poolOpen, setPoolOpen] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
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
    usePoll(15000, {
        only: ['automation'],
        onBefore: () =>
            selectedRef.current === null &&
            !navigating.current &&
            !poolOpen &&
            !filtersOpen &&
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
            taskId={selected}
            detail={null}
            error=""
            timezone={timezone}
            enabled={data.enabled && canAdmin}
            close={() => select(null)}
            reload={() => {
                router.reload({ only: ['automation'] });
            }}
            loadPage={() => {}}
        />
    ) : null;
    return (
        <Sheet open={poolOpen} onOpenChange={setPoolOpen}>
            <div
                aria-busy={busy}
                className="reconciliation-workspace flex min-w-0 flex-col gap-4"
            >
                <Head title="Rekonsiliasi Paket" />
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl leading-7 font-semibold tracking-tight">
                                Rekonsiliasi Paket
                            </h1>
                            {!data.enabled && (
                                <Badge variant="outline">
                                    Otomatisasi nonaktif
                                </Badge>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Rekonsiliasi AWB hasil penarikan dengan buku pickup
                            per customer.
                        </p>
                    </div>
                    <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:flex sm:w-auto sm:flex-wrap">
                        {data.pending_count > 0 && (
                            <PickupPendingQueue
                                count={data.pending_count}
                                select={select}
                            />
                        )}
                        <Disclosure
                            variant="plain"
                            ref={dateDetails}
                            className="relative col-span-3 sm:col-span-1"
                        >
                            <DisclosureSummary
                                indicator={false}
                                className={cn(
                                    buttonVariants({ variant: 'outline' }),
                                    'min-h-11 w-full cursor-pointer list-none gap-2 px-3 py-2 sm:min-h-9 sm:w-auto [&::-webkit-details-marker]:hidden',
                                )}
                            >
                                <CalendarDays aria-hidden="true" />
                                <span className="text-xs">
                                    {rangeLabel(filters.date_from)} –{' '}
                                    {rangeLabel(filters.date_to)}
                                </span>
                                <ChevronDown aria-hidden="true" />
                            </DisclosureSummary>
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
                                                    key as
                                                        | 'date_from'
                                                        | 'date_to'
                                                ]
                                            }
                                            aria-invalid={
                                                !!filter.errors[
                                                    key as
                                                        | 'date_from'
                                                        | 'date_to'
                                                ]
                                            }
                                            aria-describedby={
                                                filter.errors[
                                                    key as
                                                        | 'date_from'
                                                        | 'date_to'
                                                ]
                                                    ? `recon-${key}-error`
                                                    : undefined
                                            }
                                            onChange={(event) =>
                                                filter.setData(
                                                    key as
                                                        | 'date_from'
                                                        | 'date_to',
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
                        </Disclosure>
                        <SheetTrigger asChild>
                            <Button
                                variant="outline"
                                className="min-h-11 sm:min-h-9"
                            >
                                Pool AWB
                                {!!data.pool_summary?.unassigned && (
                                    <Badge variant="secondary">
                                        {data.pool_summary.unassigned.toLocaleString(
                                            'id-ID',
                                        )}
                                    </Badge>
                                )}
                            </Button>
                        </SheetTrigger>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-11 sm:size-9"
                                    aria-label="Tindakan lainnya"
                                >
                                    <MoreHorizontal aria-hidden="true" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuGroup>
                                    <DropdownMenuItem
                                        asChild
                                        disabled={!data.rows.total}
                                    >
                                        <a
                                            href={routes.exportMethod.url({
                                                query: {
                                                    ...filters,
                                                    ...(checked.length
                                                        ? {
                                                              selected_ids:
                                                                  checked,
                                                          }
                                                        : {}),
                                                },
                                            })}
                                        >
                                            <Download aria-hidden="true" />
                                            {checked.length
                                                ? `Ekspor ${checked.length} pilihan`
                                                : 'Ekspor CSV'}
                                        </a>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        disabled={
                                            !canAdmin ||
                                            !data.enabled ||
                                            !data.rows.total ||
                                            busy ||
                                            bulk.processing
                                        }
                                        onSelect={() =>
                                            void validateBulk(false)
                                        }
                                    >
                                        <ListChecks aria-hidden="true" />
                                        Validasi semua hasil filter (
                                        {data.rows.total})
                                    </DropdownMenuItem>
                                </DropdownMenuGroup>
                                <DropdownMenuSeparator />
                                <DropdownMenuGroup>
                                    <DropdownMenuItem
                                        onSelect={() => setPoolOpen(true)}
                                    >
                                        <Info aria-hidden="true" />
                                        Ringkasan & aturan operasional
                                    </DropdownMenuItem>
                                </DropdownMenuGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-11 sm:size-9"
                            aria-label="Muat ulang rekonsiliasi"
                            disabled={busy}
                            onClick={() =>
                                router.reload({
                                    only: ['automation'],
                                })
                            }
                        >
                            <RefreshCw aria-hidden="true" />
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
                {refreshError && (
                    <p role="alert" className="text-sm text-destructive">
                        {refreshError}
                    </p>
                )}
                <AllocationCards data={data} />
                <div className="min-w-0">
                    <section
                        aria-label="Daftar rekonsiliasi"
                        className="flex min-w-0 flex-col gap-3"
                    >
                        <ToggleGroup
                            type="single"
                            variant="navigation"
                            value={group || 'all'}
                            disabled={busy}
                            onValueChange={(value) => {
                                if (value)
                                    groupChange(value === 'all' ? '' : value);
                            }}
                            className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-fit"
                            aria-label="Status rekonsiliasi paket"
                        >
                            {[
                                ['', 'Semua', data.summary.total],
                                [
                                    'review',
                                    'Perlu diperiksa',
                                    data.summary.review,
                                ],
                                [
                                    'waiting',
                                    'Menunggu data',
                                    data.summary.waiting,
                                ],
                                ['done', 'Selesai', data.summary.done],
                            ].map(([key, label, count]) => (
                                <ToggleGroupItem
                                    key={key}
                                    value={String(key) || 'all'}
                                    className="min-h-11 gap-2 rounded-md px-3 sm:min-h-9"
                                >
                                    <span>{label}</span>
                                    <Badge variant="secondary">{count}</Badge>
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                navigate(filter.data);
                            }}
                            className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
                            aria-label="Filter rekonsiliasi paket"
                        >
                            <div className="col-span-2 flex min-w-0 flex-1 gap-2 sm:min-w-48">
                                <Input
                                    name="q"
                                    aria-label="Cari customer, kode pickup, atau keterangan"
                                    className="min-h-11 min-w-0 sm:min-h-9"
                                    placeholder="Cari customer atau buku pickup…"
                                    autoComplete="off"
                                    value={filter.data.q}
                                    onChange={(event) =>
                                        filter.setData('q', event.target.value)
                                    }
                                />
                                <Button
                                    type="submit"
                                    variant="outline"
                                    className="min-h-11 sm:min-h-9"
                                    disabled={busy}
                                >
                                    <Search aria-hidden="true" />
                                    Cari
                                </Button>
                            </div>
                            <NativeSelect
                                wrapperClassName="min-w-0 sm:w-44"
                                aria-label="Kategori paket"
                                className="min-h-11 sm:min-h-9"
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
                            </NativeSelect>
                            <NativeSelect
                                id="reconciliation-status"
                                aria-label="Status rekonsiliasi atau pengiriman"
                                wrapperClassName="min-w-0 sm:w-48"
                                className="min-h-11 sm:min-h-9"
                                value={statusValue}
                                onChange={(event) => {
                                    const [type, value] =
                                        event.target.value.split(':');
                                    navigate({
                                        automation_status:
                                            type === 'reconciliation'
                                                ? value
                                                : '',
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
                            </NativeSelect>
                            <Button
                                type="button"
                                variant="outline"
                                className="min-h-11 sm:min-h-9"
                                onClick={() => setFiltersOpen(true)}
                            >
                                <Filter aria-hidden="true" />
                                Filter lainnya
                                {(!!filter.data.staff ||
                                    !!filter.data.staff_id) && (
                                    <Badge variant="secondary">1</Badge>
                                )}
                            </Button>
                            <Sheet
                                open={filtersOpen}
                                onOpenChange={setFiltersOpen}
                            >
                                <SheetContent className="w-full sm:max-w-md">
                                    <SheetHeader>
                                        <SheetTitle>
                                            Filter rekonsiliasi
                                        </SheetTitle>
                                        <SheetDescription>
                                            Saring hasil berdasarkan petugas
                                            pickup.
                                        </SheetDescription>
                                    </SheetHeader>
                                    <div className="flex flex-col gap-4 px-4">
                                        <Label htmlFor="reconciliation-staff">
                                            Petugas pickup
                                        </Label>
                                        <NativeSelect
                                            id="reconciliation-staff"
                                            aria-label="Petugas pickup"
                                            className="min-h-11"
                                            value={
                                                filter.data.staff ||
                                                filter.data.staff_id
                                            }
                                            onChange={(event) =>
                                                navigate({
                                                    staff_id:
                                                        event.target.value,
                                                    staff: '',
                                                })
                                            }
                                        >
                                            <option value="">
                                                Semua petugas
                                            </option>
                                            {filter.data.staff && (
                                                <option
                                                    value={filter.data.staff}
                                                >
                                                    {filter.data.staff}
                                                </option>
                                            )}
                                            {staffOptions.map((staff) => (
                                                <option
                                                    key={staff.id}
                                                    value={staff.id}
                                                >
                                                    {staff.name}
                                                </option>
                                            ))}
                                        </NativeSelect>
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </form>
                        {checked.length > 0 && (
                            <div
                                className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
                                role="status"
                            >
                                <span>
                                    {checked.length} customer / hari dipilih.
                                </span>
                                <Button
                                    size="sm"
                                    className="min-h-11 sm:min-h-8"
                                    disabled={
                                        !canAdmin ||
                                        !data.enabled ||
                                        busy ||
                                        bulk.processing
                                    }
                                    onClick={() => void validateBulk(true)}
                                >
                                    <ListChecks aria-hidden="true" />
                                    {bulk.processing
                                        ? 'Mengantrekan…'
                                        : 'Validasi pilihan'}
                                </Button>
                                <Button
                                    asChild
                                    size="sm"
                                    variant="outline"
                                    className="min-h-11 sm:min-h-8"
                                >
                                    <a
                                        href={routes.exportMethod.url({
                                            query: {
                                                ...filters,
                                                selected_ids: checked,
                                            },
                                        })}
                                    >
                                        Ekspor pilihan
                                    </a>
                                </Button>
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
                            <Table className="text-sm">
                                <TableHeader>
                                    <TableRow className="bg-muted/20">
                                        <TableHead className="w-9 px-3">
                                            <Checkbox
                                                aria-label="Pilih semua pickup pada halaman ini"
                                                checked={
                                                    allChecked
                                                        ? true
                                                        : visibleIds.some(
                                                                (id) =>
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
                                        <TableHead>
                                            Customer / Buku pickup
                                        </TableHead>
                                        <TableHead className="text-right whitespace-nowrap">
                                            Target
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Alokasi
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Selisih
                                        </TableHead>
                                        <TableHead>Progress</TableHead>
                                        <TableHead>Status kategori</TableHead>
                                        <TableHead>Rincian / masalah</TableHead>
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
                                                        chooseRow(
                                                            row.id,
                                                            !!value,
                                                        )
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell className="max-w-60 whitespace-normal">
                                                <button
                                                    type="button"
                                                    className="text-left leading-5 font-semibold outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                                                    onClick={() =>
                                                        select(row.id)
                                                    }
                                                >
                                                    {row.customer_name}
                                                </button>
                                                <p className="mt-0.5 text-[11px] break-all text-muted-foreground">
                                                    {row.reference}
                                                </p>
                                                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                                    {row.business_date
                                                        ? row.business_date
                                                        : reconciliationTime(
                                                              row.picked_up_at,
                                                              timezone,
                                                              true,
                                                          )}
                                                    <Badge variant="outline">
                                                        {row.pickup_count ?? 1}{' '}
                                                        pickup
                                                    </Badge>
                                                </p>
                                            </TableCell>
                                            <TableCell
                                                className="text-right font-medium tabular-nums"
                                                title="Target kategori dari POP/handover final"
                                            >
                                                {row.expected_quantity ?? '—'}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {row.allocated_quantity ?? '—'}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                <AllocationDelta row={row} />
                                            </TableCell>
                                            <TableCell>
                                                <AllocationProgress row={row} />
                                            </TableCell>
                                            <TableCell>
                                                <AllocationStatus row={row} />
                                            </TableCell>
                                            <TableCell>
                                                <Differences row={row} />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 gap-1 px-2 text-[11px]"
                                                    onClick={() =>
                                                        select(row.id)
                                                    }
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
                                    <dl className="grid grid-cols-3 gap-3 text-sm">
                                        {(
                                            [
                                                [
                                                    'Target',
                                                    row.expected_quantity,
                                                ],
                                                [
                                                    'Alokasi',
                                                    row.allocated_quantity,
                                                ],
                                                ['Selisih', row.difference],
                                            ] as const
                                        ).map(([label, value]) => (
                                            <div key={label}>
                                                <dt className="text-xs text-muted-foreground">
                                                    {label}
                                                </dt>
                                                <dd className="font-medium tabular-nums">
                                                    {value ?? '—'}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                    <div className="flex items-center justify-between gap-2">
                                        <AllocationStatus row={row} />
                                    </div>
                                    <AllocationProgress row={row} />
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
                                {data.rows.to ?? 0} dari {data.rows.total}{' '}
                                customer / hari
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <NativeSelect
                                    aria-label="Jumlah customer per halaman"
                                    className="h-9 rounded-md border bg-card px-2 text-xs"
                                    value={filter.data.per_page}
                                    onChange={(event) =>
                                        navigate({
                                            per_page: event.target.value,
                                        })
                                    }
                                >
                                    {[10, 20, 50].map((count) => (
                                        <option key={count} value={count}>
                                            {count} per halaman
                                        </option>
                                    ))}
                                </NativeSelect>
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
                                                busy ||
                                                data.rows.current_page <= 1
                                            }
                                            aria-label={String(label)}
                                            onClick={() =>
                                                changePage(Number(page))
                                            }
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
                                            onClick={() =>
                                                changePage(Number(page))
                                            }
                                        >
                                            <PageIcon className="size-3.5" />
                                        </Button>
                                    );
                                })}
                            </div>
                        </footer>
                    </section>
                </div>
                <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                    <SheetHeader>
                        <SheetTitle>Pool AWB</SheetTitle>
                        <SheetDescription>
                            Alokasi AWB global dan ringkasan buku sesuai filter.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="flex flex-col gap-6 px-4 pb-6">
                        <AllocationSummary data={data} />
                        <PickupPendingQueue
                            count={data.pending_count}
                            select={(id) => {
                                setPoolOpen(false);
                                select(id);
                            }}
                        />
                        <Disclosure>
                            <DisclosureSummary>
                                Aturan & status otomatisasi
                            </DisclosureSummary>
                            <p className="text-sm text-muted-foreground">
                                Hari operasional 05.00–04.59 WIB. Target
                                mengikuti POP/handover final; barang pending
                                dihitung pada tanggal pemrosesannya.
                            </p>
                            <p className="text-sm">
                                {data.enabled
                                    ? 'Validasi otomatis aktif.'
                                    : 'Validasi otomatis belum aktif. Hasil evaluasi terakhir tetap ditampilkan.'}
                            </p>
                            <dl className="grid grid-cols-2 gap-3 text-sm">
                                {(
                                    [
                                        [
                                            'Target pickup',
                                            data.processing.regular_target,
                                        ],
                                        [
                                            'Pending masuk',
                                            data.processing.pending_incoming,
                                        ],
                                        ['Target AWB', data.processing.target],
                                        ['Diproses', data.processing.processed],
                                    ] as const
                                ).map(([label, value]) => (
                                    <div key={label}>
                                        <dt className="text-muted-foreground">
                                            {label}
                                        </dt>
                                        <dd className="tabular-nums">
                                            {value?.toLocaleString('id-ID') ??
                                                '—'}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </Disclosure>
                    </div>
                </SheetContent>
                <Sheet
                    open={selected !== null}
                    onOpenChange={(open) => {
                        if (!open) select(null);
                    }}
                >
                    <SheetContent
                        className="w-full gap-0 p-0 sm:max-w-5xl [&>button:last-child]:hidden"
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
                                Perbandingan jumlah pickup, verifikasi gudang
                                dan resi JNE.
                            </SheetDescription>
                        </SheetHeader>
                        {panel}
                    </SheetContent>
                </Sheet>
            </div>
        </Sheet>
    );
}

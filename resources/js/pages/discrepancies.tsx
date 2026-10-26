import DataTable, { DataTablePagination } from '@/components/data-table';
import { Head, Link, useHttp } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import {
    AlertTriangle,
    ChevronDown,
    Filter,
    MoreVertical,
    RefreshCw,
    Search,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/page-container';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState, StatusBadge } from '@/components/operational-ui';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import * as api from '@/routes/api/discrepancies';
import { staff as staffApi } from '@/routes/api';
import { discrepancies, handover, operations } from '@/routes';
import {
    HandoverNavigation,
    type HandoverCounts,
    type HandoverPagination,
} from '@/components/handover-session-list';

const categories = {
    manual_hybrid: 'Manual Hybrid (Non-Cashless)',
    cashless_hybrid: 'Cashless Hybrid',
    css_orion: 'CSS / Orion',
};
type Discrepancy = {
    id: number;
    task_id: number;
    session_id: number;
    reference: string;
    session_reference: string;
    session_created_at: string;
    customer_name: string;
    pickup_address: string;
    staff_name: string | null;
    session_status: string;
    notes: string | null;
    verified_at: string;
    needs_review: boolean;
    category: keyof typeof categories;
    pickup_quantity: number;
    received_quantity: number;
    difference: number;
};
type Filters = {
    q: string;
    status: string;
    from: string;
    to: string;
    category: string;
    staff: string;
    review: boolean;
};
const initialFilters: Filters = {
    q: '',
    status: '',
    from: '',
    to: '',
    category: '',
    staff: '',
    review: false,
};
type Envelope = {
    data: Discrepancy[];
    meta: HandoverPagination;
    summary?: HandoverCounts;
};

export default function Discrepancies({ timezone }: { timezone: string }) {
    const [rows, setRows] = useState<Discrepancy[]>([]);
    const [filters, setFilters] = useState<Filters>(initialFilters);
    const [advanced, setAdvanced] = useState(false);
    const [staff, setStaff] = useState<{ id: number; name: string }[]>([]);
    const [staffError, setStaffError] = useState('');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(10);
    const [meta, setMeta] = useState<HandoverPagination>({});
    const [counts, setCounts] = useState<HandoverCounts>();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [revision, setRevision] = useState(0);
    const [selected, setSelected] = useState<Discrepancy | null>(null);
    const loader = useHttp<object, Envelope>({});
    const staffLoader = useHttp<
        object,
        { data: { id: number; name: string }[] }
    >({});
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        const timer = setTimeout(() => {
            void loader
                .get(
                    api.index.url({
                        query: {
                            view: 'categories',
                            summary: 1,
                            page,
                            per_page: perPage,
                            ...(filters.q ? { q: filters.q } : {}),
                            ...(filters.status
                                ? { session_status: filters.status }
                                : {}),
                            ...(filters.from
                                ? { date_from: filters.from }
                                : {}),
                            ...(filters.to ? { date_to: filters.to } : {}),
                            ...(filters.category
                                ? { category: filters.category }
                                : {}),
                            ...(filters.staff
                                ? { staff_id: filters.staff }
                                : {}),
                            ...(filters.review ? { review_only: 1 } : {}),
                        },
                    }),
                )
                .then((result) => {
                    if (!active) return;
                    if (!result) {
                        setError(
                            'Filter belum valid. Periksa tanggal mulai dan tanggal selesai.',
                        );
                        return;
                    }
                    setRows(result.data);
                    setMeta(result.meta);
                    setCounts(result.summary);
                })
                .catch(() => {
                    if (active)
                        setError(
                            'Data selisih gagal dimuat. Muat ulang untuk mencoba kembali.',
                        );
                })
                .finally(() => {
                    if (active) setLoading(false);
                });
        }, 250);
        return () => {
            active = false;
            clearTimeout(timer);
            loader.cancel();
        };
    }, [filters, page, perPage, revision]);
    useEffect(() => {
        if (!advanced) return;
        let active = true;
        setStaffError('');
        void staffLoader
            .get(staffApi.url())
            .then((result) => {
                if (!active) return;
                if (result) setStaff(result.data);
                else
                    setStaffError(
                        'Daftar petugas belum tersedia. Coba buka kembali filter lanjutan.',
                    );
            })
            .catch(() => {
                if (active)
                    setStaffError(
                        'Daftar petugas gagal dimuat. Coba buka kembali filter lanjutan.',
                    );
            });
        return () => {
            active = false;
            staffLoader.cancel();
        };
    }, [advanced]);
    const filter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
        setFilters((previous) => ({ ...previous, [key]: value }));
        setPage(1);
    };
    const reset = () => {
        setFilters(initialFilters);
        setPage(1);
    };
    const format = (value: string) =>
        new Date(value).toLocaleString('id-ID', {
            timeZone: timezone,
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    const sessionLabel = (row: Discrepancy) =>
        `HO-${String(row.session_id).padStart(4, '0')}`;
    const taskLabel = (row: Discrepancy) =>
        `PCK-${String(row.task_id).padStart(4, '0')}`;
    const details = (row: Discrepancy) => (
        <Button
            asChild
            variant="outline"
            className="h-10 border-blue-200 bg-blue-50/70 text-primary hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/50 dark:hover:bg-blue-950"
        >
            <Link
                href={handover(
                    { session: row.session_id },
                    { query: { item: row.id } },
                )}
            >
                Lihat Detail
            </Link>
        </Button>
    );
    const more = (row: Discrepancy) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Aksi ${taskLabel(row)} · ${categories[row.category]}`}
                >
                    <MoreVertical className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setSelected(row)}>
                    Lihat Catatan Selisih
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link
                        href={operations({
                            screen: 'detail',
                            task: row.task_id,
                        })}
                    >
                        Lihat Bukti Pickup
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
    return (
        <PageContainer variant="fluid" className="space-y-5">
            <Head title="Monitoring Selisih" />
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                        Monitoring Selisih
                    </h1>
                </div>
                <Button
                    variant="outline"
                    disabled={loading}
                    onClick={() => setRevision((value) => value + 1)}
                >
                    <RefreshCw
                        className={`size-4 ${loading ? 'animate-spin' : ''}`}
                    />
                    Muat Ulang
                </Button>
            </header>
            <HandoverNavigation active="discrepancies" counts={counts} />
            <section
                aria-label="Filter monitoring selisih"
                className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
            >
                <div className="grid min-w-0 gap-4 sm:grid-cols-2 2xl:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] 2xl:items-end">
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="discrepancy-search">Cari</Label>
                        <div className="relative">
                            <Search
                                aria-hidden="true"
                                className="absolute top-3.5 left-3 size-4 text-muted-foreground"
                            />
                            <Input
                                id="discrepancy-search"
                                className="h-11 pr-10 pl-9"
                                maxLength={100}
                                placeholder="Nomor session, customer, petugas, atau alamat…"
                                value={filters.q}
                                onChange={(event) =>
                                    filter('q', event.target.value)
                                }
                            />
                            {filters.q && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute top-0.5 right-0.5 size-10"
                                    aria-label="Hapus pencarian"
                                    onClick={() => filter('q', '')}
                                >
                                    <X className="size-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="discrepancy-from">
                            Rentang Tanggal Pemeriksaan
                        </Label>
                        <div className="grid min-w-0 gap-2 md:grid-cols-2">
                            <Input
                                id="discrepancy-from"
                                aria-label="Tanggal pemeriksaan mulai"
                                type="date"
                                className="h-11 min-w-0"
                                value={filters.from}
                                onChange={(event) =>
                                    filter('from', event.target.value)
                                }
                            />
                            <Input
                                aria-label="Tanggal pemeriksaan selesai"
                                type="date"
                                className="h-11 min-w-0"
                                min={filters.from || undefined}
                                value={filters.to}
                                onChange={(event) =>
                                    filter('to', event.target.value)
                                }
                            />
                        </div>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="discrepancy-category">Kategori</Label>
                        <Select
                            value={filters.category || 'ALL'}
                            onValueChange={(value) =>
                                filter('category', value === 'ALL' ? '' : value)
                            }
                        >
                            <SelectTrigger
                                id="discrepancy-category"
                                className="w-full min-w-0 data-[size=default]:h-11"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">
                                    Semua Kategori
                                </SelectItem>
                                {Object.entries(categories).map(
                                    ([value, label]) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ),
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="min-w-0 space-y-2">
                        <Label htmlFor="discrepancy-status">
                            Status Handover
                        </Label>
                        <Select
                            value={filters.status || 'ALL'}
                            onValueChange={(value) =>
                                filter('status', value === 'ALL' ? '' : value)
                            }
                        >
                            <SelectTrigger
                                id="discrepancy-status"
                                className="w-full data-[size=default]:h-11"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">
                                    Semua Status
                                </SelectItem>
                                <SelectItem value="DRAFT">
                                    Menunggu Penerimaan
                                </SelectItem>
                                <SelectItem value="IN_VERIFICATION">
                                    Dalam Verifikasi
                                </SelectItem>
                                <SelectItem value="CLOSED">Ditutup</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button
                        variant="outline"
                        className="h-10"
                        aria-expanded={advanced}
                        aria-controls="discrepancy-advanced"
                        onClick={() => setAdvanced((value) => !value)}
                    >
                        <Filter className="size-4" />
                        Filter Lanjutan
                        {(filters.staff || filters.review) && (
                            <span
                                className="size-2 rounded-full bg-primary"
                                aria-label="Filter lanjutan aktif"
                            />
                        )}
                        <ChevronDown
                            className={`size-4 transition-transform ${advanced ? 'rotate-180' : ''}`}
                        />
                    </Button>
                    <Button
                        variant="ghost"
                        className="text-primary"
                        onClick={reset}
                    >
                        <RefreshCw className="size-4" />
                        Reset Filter
                    </Button>
                </div>
                {advanced && (
                    <div
                        id="discrepancy-advanced"
                        className="grid gap-4 border-t pt-4 sm:grid-cols-2"
                    >
                        <div className="space-y-2">
                            <Label htmlFor="discrepancy-staff">Petugas</Label>
                            <Select
                                value={filters.staff || 'ALL'}
                                disabled={staffLoader.processing}
                                onValueChange={(value) =>
                                    filter(
                                        'staff',
                                        value === 'ALL' ? '' : value,
                                    )
                                }
                            >
                                <SelectTrigger
                                    id="discrepancy-staff"
                                    className="w-full data-[size=default]:h-11"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">
                                        Semua Petugas
                                    </SelectItem>
                                    {staff.map((person) => (
                                        <SelectItem
                                            key={person.id}
                                            value={String(person.id)}
                                        >
                                            {person.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {staffError && (
                                <p
                                    role="alert"
                                    className="text-xs text-destructive"
                                >
                                    {staffError}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 self-center">
                            <Checkbox
                                id="discrepancy-review"
                                checked={filters.review}
                                onCheckedChange={(value) =>
                                    filter('review', value === true)
                                }
                            />
                            <Label
                                htmlFor="discrepancy-review"
                                className="leading-relaxed"
                            >
                                Hanya POP berubah yang perlu diperiksa ulang
                            </Label>
                        </div>
                    </div>
                )}
                <p className="text-xs leading-relaxed text-muted-foreground">
                    Hanya kategori dengan selisih ditampilkan. Tanggal
                    menggunakan pemeriksaan awal · {timezone}. Session ditutup
                    tidak berarti selisih selesai.
                </p>
            </section>
            {error && (
                <div
                    role="alert"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm"
                >
                    <span className="text-destructive">{error}</span>
                    <Button
                        variant="outline"
                        onClick={() => setRevision((value) => value + 1)}
                    >
                        Coba Muat Ulang
                    </Button>
                </div>
            )}
            <section
                aria-label="Daftar selisih"
                aria-busy={loading}
                className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm"
            >
                {loading ? (
                    <div className="p-5">
                        <EmptyState loading />
                    </div>
                ) : error ? (
                    <div className="p-5">
                        <EmptyState
                            title="Daftar belum dapat ditampilkan"
                            description="Periksa filter atau gunakan Coba Muat Ulang. Data sebelumnya tidak ditampilkan agar tidak menyesatkan."
                        />
                    </div>
                ) : !rows.length ? (
                    <div className="p-5">
                        <EmptyState
                            title="Tidak ada selisih pada filter ini"
                            description="Tidak ada kategori berbeda pada hasil verifikasi yang cocok. Ubah atau reset filter untuk melihat data lainnya."
                        />
                    </div>
                ) : (
                    <>
                        <div className="hidden overflow-x-auto xl:block">
                            <DataTable
                                data={rows}
                                getRowId={(row) =>
                                    String(`${row.id}-${row.category}`)
                                }
                                bordered={false}
                                tableClassName={'w-full text-left text-sm'}
                                columns={[
                                    {
                                        id: 'session_waktu',
                                        header: 'Session / Waktu',
                                        hideable: false,
                                        className: 'px-4 py-4',
                                        cell: (row) => (
                                            <>
                                                <p
                                                    title={
                                                        row.session_reference
                                                    }
                                                    className="font-semibold"
                                                >
                                                    {sessionLabel(row)}
                                                </p>
                                                <p className="mt-1 text-xs whitespace-nowrap text-muted-foreground">
                                                    {format(
                                                        row.session_created_at,
                                                    )}
                                                </p>
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'pickup_task',
                                        header: 'Pickup Task',
                                        hideable: true,
                                        className: 'px-4 py-4',
                                        cell: (row) => (
                                            <>
                                                <p
                                                    title={row.reference}
                                                    className="font-medium whitespace-nowrap"
                                                >
                                                    {taskLabel(row)}
                                                </p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {row.staff_name ??
                                                        'Petugas tidak tersedia'}
                                                </p>
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'customer',
                                        header: 'Customer',
                                        hideable: true,
                                        className:
                                            'max-w-48 px-4 py-4 break-words',
                                        cell: (row) => <>{row.customer_name}</>,
                                    },
                                    {
                                        id: 'alamat_pickup',
                                        header: 'Alamat Pickup',
                                        hideable: true,
                                        className:
                                            'max-w-56 px-4 py-4 text-xs leading-relaxed break-words',
                                        cell: (row) => (
                                            <>{row.pickup_address}</>
                                        ),
                                    },
                                    {
                                        id: 'kategori',
                                        header: 'Kategori',
                                        hideable: true,
                                        className:
                                            'max-w-48 px-4 py-4 text-xs leading-relaxed',
                                        cell: (row) => (
                                            <>{categories[row.category]}</>
                                        ),
                                    },
                                    {
                                        id: 'pop',
                                        header: 'POP',
                                        hideable: true,
                                        className:
                                            'px-4 py-4 text-center tabular-nums',
                                        headerClassName: 'text-center',
                                        cell: (row) => (
                                            <>{row.pickup_quantity}</>
                                        ),
                                    },
                                    {
                                        id: 'diterima',
                                        header: 'Diterima',
                                        hideable: true,
                                        className:
                                            'px-4 py-4 text-center tabular-nums',
                                        headerClassName: 'text-center',
                                        cell: (row) => (
                                            <>{row.received_quantity}</>
                                        ),
                                    },
                                    {
                                        id: 'selisih',
                                        header: 'Selisih',
                                        hideable: true,
                                        className:
                                            'px-4 py-4 text-center font-semibold text-rose-600 tabular-nums dark:text-rose-400',
                                        headerClassName: 'text-center',
                                        cell: (row) => (
                                            <>
                                                {row.difference > 0 ? '+' : ''}
                                                {row.difference}
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'status_handover',
                                        header: 'Status Handover',
                                        hideable: true,
                                        className: 'px-4 py-4',
                                        cell: (row) => (
                                            <>
                                                <StatusBadge
                                                    status={row.session_status}
                                                />
                                                {row.needs_review && (
                                                    <p className="mt-2 max-w-40 text-xs text-amber-700 dark:text-amber-300">
                                                        POP berubah; perlu
                                                        diperiksa ulang.
                                                    </p>
                                                )}
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'aksi',
                                        header: 'Aksi',
                                        hideable: false,
                                        className: 'px-4 py-3',
                                        cell: (row) => (
                                            <>
                                                <div className="flex items-center gap-1">
                                                    {details(row)}
                                                    {more(row)}
                                                </div>
                                            </>
                                        ),
                                    },
                                ]}
                            />
                        </div>
                        <div className="divide-y xl:hidden">
                            {rows.map((row) => (
                                <article
                                    key={`${row.id}-${row.category}`}
                                    className="space-y-4 p-4 sm:p-5"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                            <p
                                                title={row.session_reference}
                                                className="font-semibold"
                                            >
                                                {sessionLabel(row)}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {format(row.session_created_at)}
                                            </p>
                                        </div>
                                        <StatusBadge
                                            status={row.session_status}
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold break-words">
                                            {row.customer_name}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {taskLabel(row)} ·{' '}
                                            {row.staff_name ??
                                                'Petugas tidak tersedia'}
                                        </p>
                                        <p className="mt-2 text-sm leading-relaxed break-words text-muted-foreground">
                                            {row.pickup_address}
                                        </p>
                                    </div>
                                    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                                        <p className="text-sm font-medium">
                                            {categories[row.category]}
                                        </p>
                                        <dl className="grid grid-cols-3 gap-2 text-sm">
                                            {[
                                                ['POP', row.pickup_quantity],
                                                [
                                                    'Diterima',
                                                    row.received_quantity,
                                                ],
                                                [
                                                    'Selisih',
                                                    `${row.difference > 0 ? '+' : ''}${row.difference}`,
                                                ],
                                            ].map(([label, value]) => (
                                                <div key={label}>
                                                    <dt className="text-xs text-muted-foreground">
                                                        {label}
                                                    </dt>
                                                    <dd
                                                        className={`mt-1 font-semibold tabular-nums ${label === 'Selisih' ? 'text-rose-600 dark:text-rose-400' : ''}`}
                                                    >
                                                        {value}
                                                    </dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </div>
                                    {row.needs_review && (
                                        <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                                            <AlertTriangle className="size-4 shrink-0" />
                                            POP berubah; Admin perlu memeriksa
                                            ulang.
                                        </p>
                                    )}
                                    <div className="flex items-center justify-between gap-2">
                                        {details(row)}
                                        {more(row)}
                                    </div>
                                </article>
                            ))}
                        </div>
                    </>
                )}
                <DataTablePagination
                    meta={meta}
                    page={page}
                    perPage={perPage}
                    onPage={setPage}
                    onPerPage={(size) => {
                        setPerPage(size);
                        setPage(1);
                    }}
                    loading={loading}
                    error={error}
                    itemLabel="selisih"
                />
            </section>
            <Dialog
                open={!!selected}
                onOpenChange={(open) => {
                    if (!open) setSelected(null);
                }}
            >
                <DialogContent className="max-h-[90dvh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Catatan Selisih</DialogTitle>
                        <DialogDescription>
                            {selected &&
                                `${sessionLabel(selected)} · ${taskLabel(selected)} · ${selected.customer_name}`}
                        </DialogDescription>
                    </DialogHeader>
                    {selected && (
                        <div className="space-y-4 text-sm">
                            <p className="font-medium">
                                {categories[selected.category]} · Selisih{' '}
                                {selected.difference > 0 ? '+' : ''}
                                {selected.difference}
                            </p>
                            <p className="break-words whitespace-pre-wrap">
                                {selected.notes || 'Catatan belum tersedia.'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Verifikasi terbaru:{' '}
                                {format(selected.verified_at)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Penutupan session tidak menyelesaikan selisih
                                secara otomatis.
                            </p>
                            {details(selected)}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </PageContainer>
    );
}

Discrepancies.layout = {
    breadcrumbs: [
        { title: 'Retail Pickup', href: handover() },
        { title: 'Handover & Verifikasi', href: handover() },
        { title: 'Monitoring Selisih', href: discrepancies() },
    ],
};

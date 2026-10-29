import DataTable, { DataTablePagination } from '@/components/data-table';
import { Link } from '@inertiajs/react';
import { useState } from 'react';
import { Check, Filter, RefreshCw, Search, X } from 'lucide-react';
import { handover, discrepancies } from '@/routes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { EmptyState, StatusBadge } from '@/components/operational-ui';

export type HandoverFilters = {
    q: string;
    status: string;
    from: string;
    to: string;
    staff: string;
};
export type HandoverCounts = {
    active: number;
    closed: number;
    discrepancies: number;
};
export type HandoverPagination = {
    current_page?: number;
    last_page?: number;
    total?: number;
    from?: number | null;
    to?: number | null;
};
type SessionRow = {
    id: number;
    reference: string;
    status: string;
    created_at: string;
    staff_names?: string[];
    total_packages?: number;
    task_count?: number;
    pending_count?: number;
    discrepancy_count?: number;
    review_count?: number;
    verified_count?: number;
    can_close?: boolean;
};

export function HandoverNavigation({
    active,
    counts,
}: {
    active: 'active' | 'closed' | 'discrepancies';
    counts?: HandoverCounts;
}) {
    return (
        <nav
            aria-label="Navigasi handover"
            className="flex flex-wrap gap-x-2 border-b"
        >
            {[
                {
                    key: 'active',
                    label: 'Menunggu Penerimaan',
                    href: handover(),
                    count: counts?.active,
                },
                {
                    key: 'closed',
                    label: 'Riwayat Handover',
                    href: handover({}, { query: { history: 1 } }),
                    count: counts?.closed,
                },
                {
                    key: 'discrepancies',
                    label: 'Monitoring Selisih',
                    href: discrepancies(),
                    count: counts?.discrepancies,
                },
            ].map((tab) => (
                <Link
                    key={tab.key}
                    href={tab.href}
                    aria-current={active === tab.key ? 'page' : undefined}
                    className={`inline-flex min-h-12 items-center gap-2 border-b-2 px-3 py-3 text-xs font-medium transition-colors sm:px-5 sm:text-sm ${active === tab.key ? 'border-primary text-primary' : 'border-transparent text-foreground hover:text-primary'}`}
                >
                    {tab.label}
                    {tab.count !== undefined && (
                        <span
                            title={
                                tab.key === 'discrepancies'
                                    ? 'Jumlah task dengan hasil verifikasi selisih'
                                    : undefined
                            }
                            className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${tab.count > 0 ? 'bg-rose-500 text-white' : 'bg-muted text-muted-foreground'}`}
                        >
                            {tab.count}
                        </span>
                    )}
                </Link>
            ))}
        </nav>
    );
}

function SessionStatus({ row }: { row: SessionRow }) {
    return row.can_close ? (
        <Badge
            variant="outline"
            title={row.status}
            className="gap-1.5 border-emerald-200 bg-emerald-50 px-3 py-2 font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
            <Check className="size-3.5" />
            Siap Ditutup
        </Badge>
    ) : (
        <StatusBadge status={row.status} />
    );
}

export default function HandoverSessionList({
    rows,
    history,
    counts,
    meta,
    page,
    perPage,
    filters,
    staff,
    loading,
    error,
    timezone,
    onFilter,
    onReset,
    onPage,
    onPerPage,
}: {
    rows: SessionRow[];
    history: boolean;
    counts?: HandoverCounts;
    meta: HandoverPagination;
    page: number;
    perPage: number;
    filters: HandoverFilters;
    staff: { id: number; name: string }[];
    loading: boolean;
    error: string;
    timezone: string;
    onFilter: (key: keyof HandoverFilters, value: string) => void;
    onReset: () => void;
    onPage: (value: number) => void;
    onPerPage: (value: number) => void;
}) {
    const [advanced, setAdvanced] = useState(false);
    const format = (value: string) =>
        new Date(value).toLocaleString('id-ID', {
            timeZone: timezone,
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    const action = (row: SessionRow) => (
        <Button
            variant="outline"
            asChild
            className="h-11 border-blue-200 bg-blue-50/70 font-medium text-primary hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/50 dark:hover:bg-blue-950"
        >
            <Link
                href={handover(
                    { session: row.id },
                    { query: history ? { history: 1 } : {} },
                )}
            >
                {row.status === 'CLOSED' || row.can_close
                    ? 'Lihat Detail'
                    : row.status === 'IN_VERIFICATION'
                      ? 'Lanjutkan'
                      : 'Verifikasi'}
            </Link>
        </Button>
    );
    return (
        <div className="space-y-5">
            <HandoverNavigation
                active={history ? 'closed' : 'active'}
                counts={counts}
            />
            <section
                aria-label="Filter handover"
                className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
            >
                <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-12 xl:items-end">
                    <div className="min-w-0 space-y-2 sm:col-span-2 xl:col-span-4">
                        <Label htmlFor="handover-search">Cari Session</Label>
                        <div className="relative">
                            <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
                            <Input
                                id="handover-search"
                                className="h-11 pr-10 pl-9"
                                placeholder="Nomor session atau nama petugas…"
                                value={filters.q}
                                onChange={(event) =>
                                    onFilter('q', event.target.value)
                                }
                            />
                            {filters.q && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Hapus pencarian session"
                                    className="absolute top-1 right-1 size-9"
                                    onClick={() => onFilter('q', '')}
                                >
                                    <X className="size-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2 xl:col-span-2">
                        <Label>Status</Label>
                        <Select
                            value={filters.status || 'all'}
                            onValueChange={(value) =>
                                onFilter('status', value === 'all' ? '' : value)
                            }
                            disabled={history}
                        >
                            <SelectTrigger
                                aria-label="Filter status handover"
                                className="w-full data-[size=default]:h-11"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {history ? (
                                    <SelectItem value="all">Ditutup</SelectItem>
                                ) : (
                                    <>
                                        <SelectItem value="all">
                                            Semua Session Aktif
                                        </SelectItem>
                                        <SelectItem value="DRAFT">
                                            Menunggu Penerimaan
                                        </SelectItem>
                                        <SelectItem value="IN_VERIFICATION">
                                            Dalam Verifikasi
                                        </SelectItem>
                                    </>
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3 sm:col-span-2 xl:col-span-4">
                        <div className="min-w-0 space-y-2">
                            <Label htmlFor="handover-from">Tanggal Mulai</Label>
                            <Input
                                id="handover-from"
                                className="h-11 min-w-0"
                                type="date"
                                value={filters.from}
                                onChange={(event) =>
                                    onFilter('from', event.target.value)
                                }
                            />
                        </div>
                        <div className="min-w-0 space-y-2">
                            <Label htmlFor="handover-to">Tanggal Selesai</Label>
                            <Input
                                id="handover-to"
                                className="h-11 min-w-0"
                                type="date"
                                value={filters.to}
                                onChange={(event) =>
                                    onFilter('to', event.target.value)
                                }
                            />
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        className="h-11 sm:col-span-2 xl:col-span-2"
                        aria-expanded={advanced}
                        aria-controls="handover-advanced"
                        onClick={() => setAdvanced(!advanced)}
                    >
                        <Filter className="size-4" />
                        Filter Lanjutan
                        {filters.staff && (
                            <span className="text-primary">· 1</span>
                        )}
                    </Button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                        Tanggal berdasarkan waktu pembuatan session · {timezone}
                        .
                    </p>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary"
                        onClick={onReset}
                    >
                        <RefreshCw className="size-4" />
                        Reset Filter
                    </Button>
                </div>
                {advanced && (
                    <div
                        id="handover-advanced"
                        className="space-y-2 border-t pt-4 sm:max-w-sm"
                    >
                        <Label>Petugas Pickup</Label>
                        <Select
                            value={filters.staff || 'all'}
                            onValueChange={(value) =>
                                onFilter('staff', value === 'all' ? '' : value)
                            }
                        >
                            <SelectTrigger
                                className="h-11 w-full"
                                aria-label="Filter petugas handover"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">
                                    Semua Petugas
                                </SelectItem>
                                {staff.map((person) => (
                                    <SelectItem
                                        value={String(person.id)}
                                        key={person.id}
                                    >
                                        {person.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </section>
            <section
                aria-label="Daftar handover session"
                aria-busy={loading}
                className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm"
            >
                {loading ? (
                    <div className="p-5">
                        <EmptyState loading />
                    </div>
                ) : error ? (
                    <div role="status" className="p-5 text-sm text-destructive">
                        Daftar belum dapat diperbarui. Periksa filter dan
                        gunakan Muat Ulang.
                    </div>
                ) : rows.length === 0 ? (
                    <div className="p-5">
                        <EmptyState
                            title={
                                history
                                    ? 'Tidak ada riwayat yang cocok'
                                    : 'Tidak ada session aktif yang cocok'
                            }
                            description="Reset filter atau buat session dari pickup yang sudah difinalisasi."
                        />
                    </div>
                ) : (
                    <>
                        <div className="hidden overflow-x-auto xl:block">
                            <DataTable
                                data={rows}
                                getRowId={(row) => String(row.id)}
                                bordered={false}
                                tableClassName={'w-full text-left text-sm'}
                                columns={[
                                    {
                                        id: 'session_waktu',
                                        header: 'Session / Waktu',
                                        hideable: false,
                                        className: 'px-4 py-5',
                                        cell: (row) => (
                                            <>
                                                <p
                                                    className="font-semibold"
                                                    title={row.reference}
                                                >
                                                    HO-
                                                    {String(row.id).padStart(
                                                        4,
                                                        '0',
                                                    )}
                                                </p>
                                                <p className="mt-1 text-xs whitespace-nowrap text-muted-foreground">
                                                    {format(row.created_at)}
                                                </p>
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'petugas',
                                        header: 'Petugas',
                                        hideable: true,
                                        className: 'max-w-48 px-4 py-5',
                                        cell: (row) => (
                                            <>
                                                <p
                                                    className="line-clamp-2"
                                                    title={row.staff_names?.join(
                                                        ', ',
                                                    )}
                                                >
                                                    {row.staff_names?.join(
                                                        ', ',
                                                    ) || '—'}
                                                </p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {(row.staff_names?.length ??
                                                        0) > 1
                                                        ? 'Lintas petugas'
                                                        : 'Petugas Pickup'}
                                                </p>
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'jumlah_task',
                                        header: 'Jumlah Task',
                                        hideable: true,
                                        className:
                                            'px-4 py-5 whitespace-nowrap tabular-nums',
                                        cell: (row) => (
                                            <>{row.task_count ?? 0} task</>
                                        ),
                                    },
                                    {
                                        id: 'jumlah_paket_pop',
                                        header: 'Jumlah Paket (POP)',
                                        hideable: true,
                                        className:
                                            'px-4 py-5 whitespace-nowrap tabular-nums',
                                        cell: (row) => (
                                            <>
                                                {row.total_packages ?? '—'}{' '}
                                                paket
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'verifikasi',
                                        header: 'Verifikasi',
                                        hideable: true,
                                        className: 'px-4 py-5',
                                        cell: (row) => (
                                            <>
                                                <p className="whitespace-nowrap tabular-nums">
                                                    {row.verified_count ??
                                                        (row.task_count ?? 0) -
                                                            (row.pending_count ??
                                                                0)}{' '}
                                                    / {row.task_count ?? 0}
                                                </p>
                                                {!!row.review_count && (
                                                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                                        {row.review_count} perlu
                                                        diperiksa ulang
                                                    </p>
                                                )}
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'discrepancy',
                                        header: 'Discrepancy',
                                        hideable: true,
                                        className: (row) =>
                                            `px-4 py-5 tabular-nums ${row.discrepancy_count ? 'font-semibold text-rose-600 dark:text-rose-300' : ''}`,
                                        cell: (row) => (
                                            <>{row.discrepancy_count ?? 0}</>
                                        ),
                                    },
                                    {
                                        id: 'status',
                                        header: 'Status',
                                        hideable: true,
                                        className: 'px-4 py-5',
                                        cell: (row) => (
                                            <>
                                                <SessionStatus row={row} />
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'aksi',
                                        header: 'Aksi',
                                        hideable: false,
                                        className: 'px-4 py-5',
                                        cell: (row) => <>{action(row)}</>,
                                    },
                                ]}
                            />
                        </div>
                        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:hidden">
                            {rows.map((row) => (
                                <article
                                    key={row.id}
                                    className="min-w-0 space-y-3 rounded-xl border p-4"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h2
                                            className="font-semibold"
                                            title={row.reference}
                                        >
                                            HO-{String(row.id).padStart(4, '0')}
                                        </h2>
                                        <SessionStatus row={row} />
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {format(row.created_at)}
                                    </p>
                                    <p className="text-sm break-words">
                                        {row.staff_names?.join(', ') ||
                                            'Petugas tidak tersedia'}
                                    </p>
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div>
                                            <p className="text-muted-foreground">
                                                Muatan POP
                                            </p>
                                            <p className="mt-1 font-medium">
                                                {row.task_count ?? 0} task ·{' '}
                                                {row.total_packages ?? '—'}{' '}
                                                paket
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">
                                                Verifikasi
                                            </p>
                                            <p className="mt-1 font-medium">
                                                {row.verified_count ??
                                                    (row.task_count ?? 0) -
                                                        (row.pending_count ??
                                                            0)}{' '}
                                                / {row.task_count ?? 0}
                                            </p>
                                        </div>
                                    </div>
                                    <p
                                        className={`text-xs ${row.discrepancy_count ? 'text-rose-600 dark:text-rose-300' : 'text-muted-foreground'}`}
                                    >
                                        {row.discrepancy_count ?? 0} discrepancy
                                        {row.review_count
                                            ? ` · ${row.review_count} perlu diperiksa ulang`
                                            : ''}
                                    </p>
                                    {action(row)}
                                </article>
                            ))}
                        </div>
                    </>
                )}
                <DataTablePagination
                    meta={meta}
                    page={page}
                    perPage={perPage}
                    onPage={onPage}
                    onPerPage={onPerPage}
                    loading={loading}
                    error={error}
                    itemLabel="session"
                />
            </section>
            <p className="text-xs text-muted-foreground">
                Siap Ditutup berarti seluruh pemeriksaan valid dan selisih sudah
                dicatat. Session ditutup tidak berarti discrepancy
                terselesaikan.
            </p>
        </div>
    );
}

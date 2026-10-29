import DataTable, { DataTablePagination } from '@/components/data-table';
import { Link } from '@inertiajs/react';
import { useState } from 'react';
import {
    Clock3,
    LayoutGrid,
    List,
    MapPin,
    MoreVertical,
    UserRound,
} from 'lucide-react';
import { operations } from '@/routes';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
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
import { EmptyState, StatusBadge } from '@/components/operational-ui';

export type PickupSummary = {
    date: string;
    total: number;
    waiting: number;
    handling: number;
    successful: number;
    no_packages: number;
};
export type PickupPagination = {
    current_page?: number;
    last_page?: number;
    total?: number;
    from?: number | null;
    to?: number | null;
    per_page?: number;
};
type ListTask = {
    id: number;
    reference: string;
    customer: { name: string };
    contact?: string;
    pickup_address: string;
    scheduled_at: string;
    status: string;
    assigned_staff: { name: string } | null;
    execution_started_at?: string | null;
    visits?: { id: number; outcome: string | null }[];
    can: { assign: boolean; take_over: boolean };
};

export function PickupSummaryCards({
    summary,
    loading,
}: {
    summary?: PickupSummary;
    loading: boolean;
}) {
    const metrics = [
        ['total', 'Total pickup'],
        ['waiting', 'Menunggu assignment'],
        ['handling', 'Sedang ditangani'],
        ['successful', 'Pickup berhasil'],
        ['no_packages', 'Kunjungan tanpa paket'],
    ] as const;
    return (
        <details className="rounded-lg border px-4">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                Ringkasan jadwal hari ini{summary ? ' · ' + summary.date : ''}
            </summary>
            <section
                aria-label="Ringkasan pickup hari ini"
                className="flex flex-col gap-3 pb-4"
                aria-busy={loading}
            >
                <p className="text-xs text-muted-foreground">
                    Seluruh jadwal hari ini, terlepas dari filter daftar. Tanpa
                    paket dihitung terpisah dari pickup berhasil.
                </p>
                <dl className="grid grid-cols-2 gap-4 xl:grid-cols-5">
                    {metrics.map(([key, label]) => (
                        <div key={key}>
                            <dt className="text-xs text-muted-foreground">
                                {label}
                            </dt>
                            <dd className="text-xl font-semibold tabular-nums">
                                {loading ? (
                                    <Skeleton
                                        className="h-7 w-10"
                                        aria-label="Memuat ringkasan"
                                    />
                                ) : summary ? (
                                    summary[key]
                                ) : (
                                    '—'
                                )}
                            </dd>
                        </div>
                    ))}
                </dl>
            </section>
        </details>
    );
}

function displayStatus(task: ListTask): string {
    if (task.status !== 'ASSIGNED' || !task.execution_started_at)
        return task.status;
    const latestVisit = [...(task.visits ?? [])].sort(
        (first, second) => second.id - first.id,
    )[0];
    return latestVisit?.outcome === 'NO_PACKAGES'
        ? 'NO_PACKAGES'
        : 'IN_PROGRESS';
}

export default function PickupOperationalList<T extends ListTask>({
    tasks,
    meta,
    loading,
    error,
    timezone,
    page,
    perPage,
    sort,
    onPage,
    onPerPage,
    onSort,
    onAssign,
    onTakeover,
    selection,
}: {
    tasks: T[];
    meta?: PickupPagination;
    loading: boolean;
    error: string;
    timezone: string;
    page: number;
    perPage: number;
    sort: string;
    onPage: (page: number) => void;
    onPerPage: (size: number) => void;
    onSort: (sort: string) => void;
    onAssign: (task: T) => void;
    onTakeover: (task: T) => void;
    selection?: {
        ids: number[];
        disabled: boolean;
        onToggle: (tasks: T[], checked: boolean) => void;
    };
}) {
    const [view, setView] = useState<'table' | 'cards'>('table');
    const eligible = tasks.filter((task) => task.can.assign);
    const selectedOnPage = eligible.filter((task) =>
        selection?.ids.includes(task.id),
    ).length;
    const selectTask = (task: T) =>
        selection && (
            <label className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                    checked={selection.ids.includes(task.id)}
                    disabled={selection.disabled || !task.can.assign}
                    onCheckedChange={(checked) =>
                        selection.onToggle([task], checked === true)
                    }
                    aria-label={`Pilih ${reference(task)} untuk assignment`}
                />
                <span className="xl:sr-only">
                    {task.can.assign ? 'Pilih tugas' : 'Tidak dapat di-assign'}
                </span>
            </label>
        );
    const date = (value: string) =>
        new Intl.DateTimeFormat('id-ID', {
            timeZone: timezone,
            dateStyle: 'medium',
        }).format(new Date(value));
    const time = (value: string) =>
        new Intl.DateTimeFormat('id-ID', {
            timeZone: timezone,
            timeStyle: 'short',
        }).format(new Date(value));
    const reference = (task: T) => `PCK-${String(task.id).padStart(4, '0')}`;
    const actions = (task: T) => (
        <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
                <Link href={operations({ screen: 'detail', task: task.id })}>
                    Detail
                </Link>
            </Button>
            {(task.can.assign || task.can.take_over) && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Aksi ${reference(task)}`}
                        >
                            <MoreVertical className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {task.can.assign && (
                            <DropdownMenuItem onSelect={() => onAssign(task)}>
                                Tugaskan Petugas
                            </DropdownMenuItem>
                        )}
                        {task.can.take_over && (
                            <DropdownMenuItem onSelect={() => onTakeover(task)}>
                                {task.assigned_staff
                                    ? 'Ambil Alih Pickup'
                                    : 'Ambil Tugas'}
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
    return (
        <section
            className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm"
            aria-label="Daftar pickup"
            aria-busy={loading}
        >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:px-5">
                <h2 className="text-base font-semibold tracking-tight">
                    Daftar Pickup{' '}
                    {meta?.total !== undefined && <span>({meta.total})</span>}
                </h2>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                        Urutkan
                    </span>
                    <Select
                        value={sort}
                        onValueChange={onSort}
                        disabled={loading}
                    >
                        <SelectTrigger
                            className="w-36"
                            aria-label="Urutan pickup"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="newest">Terbaru</SelectItem>
                            <SelectItem value="oldest">Terlama</SelectItem>
                            <SelectItem value="scheduled">
                                Jadwal Terdekat
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    <div
                        className="hidden gap-1 sm:flex"
                        aria-label="Tampilan daftar"
                    >
                        <Button
                            size="icon"
                            variant={view === 'table' ? 'outline' : 'ghost'}
                            className={
                                view === 'table'
                                    ? 'border-primary bg-primary/5 text-primary'
                                    : ''
                            }
                            aria-label="Tampilan tabel"
                            aria-pressed={view === 'table'}
                            onClick={() => setView('table')}
                        >
                            <List className="size-4" />
                        </Button>
                        <Button
                            size="icon"
                            variant={view === 'cards' ? 'outline' : 'ghost'}
                            className={
                                view === 'cards'
                                    ? 'border-primary bg-primary/5 text-primary'
                                    : ''
                            }
                            aria-label="Tampilan kartu"
                            aria-pressed={view === 'cards'}
                            onClick={() => setView('cards')}
                        >
                            <LayoutGrid className="size-4" />
                        </Button>
                    </div>
                </div>
            </div>
            {selection && (
                <div className="border-b px-4 sm:px-5">
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                        <Checkbox
                            checked={
                                selectedOnPage === 0
                                    ? false
                                    : selectedOnPage === eligible.length
                                      ? true
                                      : 'indeterminate'
                            }
                            disabled={
                                selection.disabled ||
                                loading ||
                                !!error ||
                                eligible.length === 0
                            }
                            onCheckedChange={(checked) =>
                                selection.onToggle(eligible, checked === true)
                            }
                        />
                        Pilih tugas belum ditugaskan di halaman ini (
                        {eligible.length})
                    </label>
                </div>
            )}
            {loading ? (
                <div className="p-5">
                    <EmptyState loading />
                </div>
            ) : error ? (
                <div className="p-5 text-sm text-destructive" role="status">
                    Daftar belum dapat diperbarui. Periksa pesan kesalahan dan
                    gunakan Muat Ulang.
                </div>
            ) : tasks.length === 0 ? (
                <div className="p-5">
                    <EmptyState
                        title="Tidak ada pickup yang cocok"
                        description="Ubah kata pencarian atau reset filter untuk melihat pickup lainnya."
                    />
                </div>
            ) : (
                <>
                    {view === 'table' && (
                        <div className="hidden overflow-x-auto xl:block">
                            <DataTable
                                data={tasks}
                                getRowId={(task) => String(task.id)}
                                bordered={false}
                                tableClassName={'w-full text-left text-sm'}
                                columns={[
                                    ...(selection
                                        ? [
                                              {
                                                  id: 'selection',
                                                  header: 'Pilih',
                                                  hideable: false,
                                                  cell: (task: T) =>
                                                      selectTask(task),
                                              },
                                          ]
                                        : []),
                                    {
                                        id: 'reference',
                                        header: 'Reference',
                                        hideable: false,
                                        className: 'px-4 py-4',
                                        cell: (task) => (
                                            <>
                                                <p className="font-medium whitespace-nowrap">
                                                    {reference(task)}
                                                </p>
                                                <p
                                                    title={task.reference}
                                                    className="mt-1 max-w-36 truncate font-mono text-[10px] text-muted-foreground"
                                                >
                                                    {task.reference}
                                                </p>
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'customer',
                                        header: 'Customer',
                                        hideable: true,
                                        className: 'min-w-36 px-4 py-4',
                                        cell: (task) => (
                                            <>
                                                <p className="font-medium">
                                                    {task.customer.name}
                                                </p>
                                                {task.contact && (
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        {task.contact}
                                                    </p>
                                                )}
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'alamat_pickup',
                                        header: 'Alamat Pickup',
                                        hideable: true,
                                        className: 'max-w-56 px-4 py-4',
                                        cell: (task) => (
                                            <>
                                                <div className="flex items-start gap-2 text-muted-foreground">
                                                    <MapPin className="mt-0.5 size-4 shrink-0" />
                                                    <span
                                                        className="line-clamp-2 break-words"
                                                        title={
                                                            task.pickup_address
                                                        }
                                                    >
                                                        {task.pickup_address}
                                                    </span>
                                                </div>
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'jadwal',
                                        header: 'Jadwal',
                                        hideable: true,
                                        className:
                                            'px-4 py-4 whitespace-nowrap',
                                        cell: (task) => (
                                            <>
                                                <p>{date(task.scheduled_at)}</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {time(task.scheduled_at)}
                                                </p>
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'petugas',
                                        header: 'Petugas',
                                        hideable: true,
                                        className: 'max-w-44 px-4 py-4',
                                        cell: (task) => (
                                            <>
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <UserRound className="size-4 shrink-0" />
                                                    <span>
                                                        {task.assigned_staff
                                                            ?.name ??
                                                            'Belum ditugaskan'}
                                                    </span>
                                                </div>
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'status',
                                        header: 'Status',
                                        hideable: true,
                                        className: 'px-4 py-4',
                                        cell: (task) => (
                                            <>
                                                <StatusBadge
                                                    status={displayStatus(task)}
                                                />
                                            </>
                                        ),
                                    },
                                    {
                                        id: 'aksi',
                                        header: 'Aksi',
                                        hideable: false,
                                        className: 'px-4 py-4',
                                        cell: (task) => <>{actions(task)}</>,
                                    },
                                ]}
                            />
                        </div>
                    )}
                    <div
                        className={`grid gap-3 p-4 sm:grid-cols-2 sm:p-5 ${view === 'table' ? 'xl:hidden' : 'xl:grid-cols-3'}`}
                    >
                        {tasks.map((task) => (
                            <article
                                key={task.id}
                                className="min-w-0 space-y-4 rounded-xl border p-4"
                            >
                                {selectTask(task)}
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground">
                                            {reference(task)}
                                        </p>
                                        <h3 className="mt-1 font-semibold break-words">
                                            {task.customer.name}
                                        </h3>
                                    </div>
                                    <StatusBadge status={displayStatus(task)} />
                                </div>
                                <div className="space-y-2 text-sm text-muted-foreground">
                                    <p className="flex items-start gap-2">
                                        <MapPin className="mt-0.5 size-4 shrink-0" />
                                        <span className="break-words">
                                            {task.pickup_address}
                                        </span>
                                    </p>
                                    <p className="flex items-center gap-2">
                                        <Clock3 className="size-4 shrink-0" />
                                        {date(task.scheduled_at)} ·{' '}
                                        {time(task.scheduled_at)}
                                    </p>
                                    <p className="flex items-center gap-2">
                                        <UserRound className="size-4 shrink-0" />
                                        {task.assigned_staff?.name ??
                                            'Belum ditugaskan'}
                                    </p>
                                    {task.contact && (
                                        <p className="pl-6 break-words">
                                            {task.contact}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center justify-between border-t pt-3">
                                    <span
                                        title={task.reference}
                                        className="mr-2 max-w-32 truncate font-mono text-[10px] text-muted-foreground"
                                    >
                                        {task.reference}
                                    </span>
                                    {actions(task)}
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
                onPage={onPage}
                onPerPage={onPerPage}
                loading={loading}
                error={error}
                itemLabel="pickup"
            />
        </section>
    );
}

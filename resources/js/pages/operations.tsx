import DataTable, { DataTablePagination } from '@/components/data-table';
import { Head, Link, router, useHttp, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/page-container';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { operations } from '@/routes';
import * as taskApi from '@/routes/api/tasks';
import BulkPickupAssignment, {
    type AssignmentSelection,
} from '@/components/bulk-pickup-assignment';
import * as userApi from '@/routes/api/users';
import { staff as staffApi } from '@/routes/api';
import { type Visit } from '@/components/pickup-execution';
import PickupDetail from '@/components/pickup-detail';
import CreatePickup from '@/components/create-pickup';
import CreatePickupDialog from '@/components/create-pickup-dialog';
import { utcFromLocal } from '@/lib/pickup-time';
import CustomerPicker, {
    type PickupCustomer,
} from '@/components/customer-picker';
import { type Proof } from '@/components/pickup-proof';
import { EmptyState, StatusBadge } from '@/components/operational-ui';
import PickupOperationalList, {
    PickupSummaryCards,
    type PickupSummary,
    type PickupPagination,
} from '@/components/pickup-operational-list';
import {
    ArrowLeft,
    Plus,
    RefreshCw,
    Search,
    SlidersHorizontal,
    ChevronDown,
    X,
} from 'lucide-react';
import { handover } from '@/routes';

type Account = {
    id: number;
    name: string;
    email: string;
    role: string;
    is_active: boolean;
};
type Task = {
    id: number;
    reference: string;
    pickup_type: string;
    customer: { id: number; name: string };
    pickup_address: string;
    contact?: string;
    notes?: string | null;
    scheduled_at: string;
    status: string;
    version: number;
    assigned_staff: { id: number; name: string } | null;
    can: {
        assign: boolean;
        take_over: boolean;
        execute?: boolean;
        retry?: boolean;
        cancel?: boolean;
        correct_proof?: boolean;
    };
    handover_session_id?: number | null;
    execution_started_at?: string | null;
    visits?: Visit[];
    proof?: Proof | null;
    events?: {
        action: string;
        actor_id: number;
        previous_staff_id: number | null;
        new_staff_id: number | null;
        occurred_at: string;
        reason: string | null;
    }[];
};
type Envelope<T> = {
    data: T;
    meta?: PickupPagination;
    summary?: PickupSummary;
};
type Field = {
    name: string;
    label: string;
    type?: string;
    required?: boolean;
    options?: { value: string; label: string }[];
};
type FormValues = Record<string, string | number | boolean>;
const roleOptions = [
    { value: 'cs', label: 'CS' },
    { value: 'pickup_staff', label: 'Pickup Staff' },
    { value: 'retail_staff', label: 'Retail Staff' },
    { value: 'admin_supervisor', label: 'Admin / Supervisor' },
];

function errorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'response' in error) {
        const response = error.response as {
            status?: number;
            data?: { message?: string } | string;
        };
        let payload: { message?: string } | undefined;
        try {
            payload =
                typeof response.data === 'string'
                    ? (JSON.parse(response.data) as { message?: string })
                    : response.data;
        } catch {
            return 'Server belum memberikan hasil yang dapat dibaca. Muat ulang untuk memeriksa perubahan.';
        }
        if (response.status === 409)
            return (
                payload?.message ??
                'Tugas sudah berubah. Muat ulang dan tinjau kembali.'
            );
        return (
            payload?.message ??
            'Permintaan gagal. Periksa input atau muat ulang halaman.'
        );
    }
    return 'Hasil permintaan belum diketahui. Muat ulang daftar sebelum mencoba kembali.';
}

function Editor({
    title,
    description,
    url,
    method = 'post',
    initial,
    fields,
    onSaved,
    onChanged,
    timezone,
}: {
    title: string;
    description?: string;
    url: string;
    method?: 'post' | 'patch';
    initial: FormValues;
    fields: Field[];
    onSaved: (data: unknown) => void;
    onChanged?: (key: string, value: string) => Partial<FormValues>;
    timezone?: string;
}) {
    const form = useHttp<FormValues, Envelope<unknown>>(initial);
    const [message, setMessage] = useState('');
    return (
        <form
            className="space-y-5"
            onSubmit={(event) => {
                event.preventDefault();
                setMessage('');
                form.transform((data) => ({
                    ...data,
                    ...(timezone && data.scheduled_at
                        ? {
                              scheduled_at: utcFromLocal(
                                  String(data.scheduled_at),
                                  timezone,
                              ),
                          }
                        : {}),
                    ...(typeof data.is_active === 'string'
                        ? { is_active: data.is_active === 'true' }
                        : {}),
                }));
                void form[method](url)
                    .then((response) => {
                        if (!response) {
                            setMessage(
                                'Data belum tersimpan. Periksa field yang ditandai.',
                            );
                            return;
                        }
                        toast.success('Berhasil disimpan');
                        onSaved(response.data);
                    })
                    .catch((error: unknown) => setMessage(errorMessage(error)));
            }}
        >
            <h2 className="text-lg font-semibold">{title}</h2>
            {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
            )}
            {fields.map((field) => (
                <div key={field.name} className="space-y-2">
                    <Label htmlFor={field.name}>
                        {field.label}
                        {field.required ? ' *' : ''}
                    </Label>
                    {field.options ? (
                        <Select
                            value={String(form.data[field.name] ?? '')}
                            onValueChange={(value) =>
                                form.setData({
                                    ...form.data,
                                    [field.name]: value,
                                    ...onChanged?.(field.name, value),
                                })
                            }
                        >
                            <SelectTrigger
                                id={field.name}
                                className="min-h-11 w-full"
                            >
                                <SelectValue placeholder="Pilih" />
                            </SelectTrigger>
                            <SelectContent>
                                {field.options.map((option) => (
                                    <SelectItem
                                        key={option.value}
                                        value={option.value}
                                    >
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : field.type === 'textarea' ? (
                        <textarea
                            id={field.name}
                            required={field.required}
                            value={String(form.data[field.name] ?? '')}
                            onChange={(event) =>
                                form.setData(field.name, event.target.value)
                            }
                            className="min-h-24 w-full rounded-md border bg-transparent p-3"
                        />
                    ) : (
                        <Input
                            id={field.name}
                            className="min-h-11"
                            required={field.required}
                            type={field.type ?? 'text'}
                            value={String(form.data[field.name] ?? '')}
                            onChange={(event) =>
                                form.setData(field.name, event.target.value)
                            }
                        />
                    )}
                    {form.errors[field.name] && (
                        <p role="alert" className="text-sm text-destructive">
                            {String(form.errors[field.name])}
                        </p>
                    )}
                </div>
            ))}
            {message && (
                <p
                    role="alert"
                    className="rounded-md border border-destructive p-3 text-sm text-destructive"
                >
                    {message}
                </p>
            )}
            <Button
                className="min-h-11 w-full sm:w-auto"
                disabled={form.processing}
            >
                {form.processing ? 'Menyimpan…' : title}
            </Button>
        </form>
    );
}

function Panel({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <Card className="min-w-0">
            <CardHeader>
                <CardTitle className="break-words">{title}</CardTitle>
            </CardHeader>
            <CardContent>{children}</CardContent>
        </Card>
    );
}

export default function Operations({
    screen,
    taskId,
    timezone,
    workspaceStats,
}: {
    screen: string;
    taskId: number | null;
    timezone: string;
    workspaceStats?: {
        today: number;
        date: string;
        next: string | null;
    } | null;
}) {
    const user = usePage().props.auth.user;
    const role = user.role;
    const history =
        new URL(usePage().url, 'http://localhost').searchParams.get(
            'history',
        ) === '1';
    const [taskScope, setTaskScope] = useState(
        screen === 'available'
            ? 'available'
            : screen === 'mine' ||
                ['pickup_staff', 'retail_staff'].includes(role)
              ? 'mine'
              : 'all',
    );
    const isTaskList = !['users', 'detail', 'create'].includes(screen);
    const manager = ['cs', 'admin_supervisor'].includes(role);
    const operationalWorkspace = manager && screen === 'tasks' && !history;
    const [sort, setSort] = useState('newest');
    const [perPage, setPerPage] = useState(10);
    const showStaffTabs =
        isTaskList &&
        !history &&
        (['pickup_staff', 'retail_staff'].includes(role) ||
            (role === 'admin_supervisor' &&
                ['mine', 'available'].includes(screen)));
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [scheduleFilter, setScheduleFilter] = useState(
        new URL(usePage().url, 'http://localhost').searchParams.get(
            'schedule_id',
        ) ?? '',
    );
    const [pickupType, setPickupType] = useState('');
    const [customerFilter, setCustomerFilter] = useState('');
    const [staffFilter, setStaffFilter] = useState('');
    const [selectedFilterCustomer, setSelectedFilterCustomer] =
        useState<PickupCustomer | null>(null);
    const [filterStaff, setFilterStaff] = useState<
        { id: number; name: string }[]
    >([]);
    const staffFilterLoader = useHttp({});
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [assignmentSelection, setAssignmentSelection] = useState<
        AssignmentSelection[]
    >([]);
    const [bulkAssignmentOpen, setBulkAssignmentOpen] = useState(false);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [revision, setRevision] = useState(0);
    const [modal, setModal] = useState<
        'user' | 'assign' | 'takeover' | 'edit-user' | null
    >(null);
    const [selectedUser, setSelectedUser] = useState<Account | null>(null);
    const [staff, setStaff] = useState<{ id: number; name: string }[]>([]);
    const [message, setMessage] = useState('');
    const loader = useHttp<
        Record<string, never>,
        Envelope<(Task | Account)[] | Task>
    >({});
    const lookup = useHttp<
        Record<string, never>,
        Envelope<{ id: number; name: string }[]>
    >({});
    const reload = () => {
        setModal(null);
        setSelectedTask(null);
        setRevision((value) => value + 1);
        if (isTaskList && role !== 'cs')
            router.reload({ only: ['workspaceStats'] });
    };
    const query = {
        page,
        ...(operationalWorkspace
            ? { sort, per_page: perPage, summary: 1 }
            : {}),
        ...(taskScope === 'mine' || (history && !manager) ? { mine: 1 } : {}),
        ...(history && isTaskList ? { history: 1 } : {}),
        ...(search ? { q: search } : {}),
        ...(status ? { status } : {}),
        ...(from ? { date_from: from } : {}),
        ...(to ? { date_to: to } : {}),
        ...(isTaskList && pickupType ? { pickup_type: pickupType } : {}),
        ...(isTaskList && customerFilter
            ? { customer_id: customerFilter }
            : {}),
        ...(isTaskList && staffFilter ? { staff_id: staffFilter } : {}),
        ...(isTaskList && scheduleFilter
            ? { schedule_id: scheduleFilter }
            : {}),
    };
    const url =
        screen === 'users'
            ? userApi.index.url({ query })
            : screen === 'detail' && taskId
              ? taskApi.show.url(taskId)
              : taskScope === 'available' && !history
                ? taskApi.candidates.url({ query })
                : taskApi.index.url({ query });
    useEffect(() => {
        if (screen === 'create') return;
        let cancelled = false;
        setMessage('');
        void loader
            .get(url)
            .then((response) => {
                if (!response && !cancelled)
                    setMessage(
                        'Filter belum dapat diterapkan. Periksa kata pencarian dan rentang tanggal.',
                    );
            })
            .catch((error: unknown) => {
                if (!cancelled) setMessage(errorMessage(error));
            });
        return () => {
            cancelled = true;
            loader.cancel();
        };
        // Each URL/revision is a fresh server read; avoid a dependency on changing form state.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url, revision, screen]);
    useEffect(() => {
        if (!isTaskList || !manager) return;
        void staffFilterLoader
            .get(staffApi.url())
            .then((result) => {
                if (result)
                    setFilterStaff(
                        (result as Envelope<{ id: number; name: string }[]>)
                            .data,
                    );
            })
            .catch((error: unknown) => setMessage(errorMessage(error)));
    }, [isTaskList, manager, revision]);
    const rows = Array.isArray(loader.response?.data)
        ? loader.response.data
        : [];
    const task =
        screen === 'detail' && !Array.isArray(loader.response?.data)
            ? (loader.response?.data as Task | undefined)
            : (selectedTask ?? undefined);
    const formatTime = (value: string) =>
        new Intl.DateTimeFormat('id-ID', {
            timeZone: timezone,
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(value));
    const title =
        (
            {
                users: 'Pengguna',
                mine: history ? 'Riwayat Pickup' : 'Tugas Saya',
                available: 'Tugas Saya',
                create: 'Buat Pickup On-Demand',
                detail: 'Detail Pickup',
                tasks: manager ? 'Operasional Pickup' : 'Tugas Saya',
            } as Record<string, string>
        )[screen] ?? 'Pickup';
    return (
        <PageContainer
            className={isTaskList ? 'space-y-4 py-4' : undefined}
            variant={
                screen === 'create'
                    ? 'form'
                    : screen === 'detail'
                      ? 'wide'
                      : 'fluid'
            }
        >
            <Head title={title} />
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                        {title}
                    </h1>
                    {isTaskList && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            {timezone}
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    {screen === 'users' && (
                        <Button onClick={() => setModal('user')}>
                            Tambah Pengguna
                        </Button>
                    )}
                    {isTaskList &&
                        !history &&
                        taskScope !== 'available' &&
                        ['cs', 'admin_supervisor', 'pickup_staff'].includes(
                            role,
                        ) && (
                            <Button
                                className="order-2 min-h-11"
                                onClick={() => setCreateOpen(true)}
                            >
                                <Plus className="size-4" />
                                Buat Pickup
                            </Button>
                        )}
                    {!['create'].includes(screen) && (
                        <Button
                            variant="outline"
                            className="min-h-11"
                            disabled={loader.processing}
                            onClick={reload}
                        >
                            <RefreshCw
                                className={`size-4 ${loader.processing ? 'animate-spin' : ''}`}
                            />
                            Muat Ulang
                        </Button>
                    )}
                </div>
            </div>
            {['create', 'detail'].includes(screen) && (
                <Button asChild variant="ghost" className="-ml-3">
                    <Link
                        href={operations(
                            {
                                screen: manager ? 'tasks' : 'mine',
                            },
                            { query: history ? { history: 1 } : {} },
                        )}
                    >
                        <ArrowLeft className="size-4" />
                        Kembali ke{' '}
                        {history
                            ? 'riwayat pickup'
                            : manager
                              ? 'daftar pickup'
                              : 'tugas saya'}
                    </Link>
                </Button>
            )}
            {showStaffTabs && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div
                        role="tablist"
                        aria-label="Daftar pickup"
                        onKeyDown={(event) => {
                            if (
                                ![
                                    'ArrowLeft',
                                    'ArrowRight',
                                    'Home',
                                    'End',
                                ].includes(event.key)
                            )
                                return;
                            const tabs = Array.from(
                                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                                    '[role=tab]',
                                ),
                            );
                            const index = tabs.findIndex(
                                (tab) => tab === document.activeElement,
                            );
                            if (index < 0) return;
                            event.preventDefault();
                            const next =
                                event.key === 'Home'
                                    ? 0
                                    : event.key === 'End'
                                      ? tabs.length - 1
                                      : (index +
                                            (event.key === 'ArrowRight'
                                                ? 1
                                                : -1) +
                                            tabs.length) %
                                        tabs.length;
                            tabs[next].focus();
                            tabs[next].click();
                        }}
                        className="flex max-w-full gap-1 rounded-lg border bg-card p-1"
                    >
                        {[
                            ['mine', 'Tugas Saya'],
                            ['available', 'Tugas Tersedia'],
                        ].map(([value, label]) => (
                            <Button
                                key={value}
                                role="tab"
                                id={`pickup-tab-${value}`}
                                aria-controls="pickup-results"
                                tabIndex={taskScope === value ? 0 : -1}
                                aria-selected={taskScope === value}
                                variant={
                                    taskScope === value ? 'default' : 'ghost'
                                }
                                className="px-3 text-xs sm:text-sm"
                                onClick={() => {
                                    setTaskScope(value);
                                    setPage(1);
                                    setStatus('');
                                }}
                            >
                                {label}
                            </Button>
                        ))}
                    </div>
                    <Button asChild variant="outline">
                        <Link href={handover()}>Serahkan Paket</Link>
                    </Button>
                </div>
            )}
            {isTaskList &&
                workspaceStats &&
                taskScope === 'mine' &&
                !history && (
                    <div className="grid grid-cols-2 gap-3">
                        <Card className="gap-1 py-3">
                            <CardContent className="px-3">
                                <p className="text-xs text-muted-foreground">
                                    Terjadwal hari ini · {workspaceStats.date}
                                </p>
                                <p className="mt-1 text-xl font-semibold">
                                    {workspaceStats.today}
                                </p>
                            </CardContent>
                        </Card>
                        <Card className="gap-1 py-3">
                            <CardContent className="px-3">
                                <p className="text-xs text-muted-foreground">
                                    Jadwal tugas aktif berikutnya
                                </p>
                                <p className="mt-1 text-sm font-semibold">
                                    {workspaceStats.next
                                        ? formatTime(workspaceStats.next)
                                        : 'Tidak ada tugas menunggu'}
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}
            {message && (
                <p
                    role="alert"
                    className="rounded-lg border border-destructive p-4 text-destructive"
                >
                    {message}
                </p>
            )}
            {screen === 'detail' && loader.processing && <EmptyState loading />}
            {screen === 'detail' && !loader.processing && !task && !message && (
                <EmptyState
                    title="Pickup tidak tersedia"
                    description="Muat ulang atau kembali ke daftar untuk memilih task yang dapat Anda akses."
                />
            )}
            {screen === 'create' && lookup.processing && (
                <p role="status" className="text-sm text-muted-foreground">
                    Memuat data customer…
                </p>
            )}
            {screen === 'create' ? (
                <CreatePickup timezone={timezone} />
            ) : screen === 'detail' ? (
                task && (
                    <PickupDetail
                        task={task}
                        timezone={timezone}
                        role={role}
                        onSaved={reload}
                        onTakeover={() => setModal('takeover')}
                        onAssign={() => {
                            setModal('assign');
                            void lookup
                                .get(staffApi.url())
                                .then((response) =>
                                    setStaff(
                                        response.data as {
                                            id: number;
                                            name: string;
                                        }[],
                                    ),
                                )
                                .catch((error: unknown) =>
                                    setMessage(errorMessage(error)),
                                );
                        }}
                    />
                )
            ) : (
                <div
                    id="pickup-results"
                    role={showStaffTabs ? 'tabpanel' : undefined}
                    aria-labelledby={
                        showStaffTabs ? `pickup-tab-${taskScope}` : undefined
                    }
                    className={isTaskList ? 'space-y-4' : 'space-y-6'}
                >
                    {scheduleFilter && isTaskList && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                            <span>
                                Menampilkan task dari jadwal #{scheduleFilter}
                            </span>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setScheduleFilter('');
                                    setPage(1);
                                }}
                            >
                                Lihat Semua Jadwal
                            </Button>
                        </div>
                    )}
                    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
                        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-12 xl:items-end">
                            <div
                                className={
                                    isTaskList
                                        ? `space-y-2 sm:col-span-2 ${operationalWorkspace ? 'xl:col-span-6' : 'xl:col-span-4'}`
                                        : 'space-y-2 sm:col-span-2 xl:col-span-12'
                                }
                            >
                                <Label htmlFor="primary-search">
                                    {isTaskList ? 'Cari Pickup' : 'Cari Nama'}
                                </Label>
                                <div className="relative">
                                    <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
                                    <Input
                                        id="primary-search"
                                        className="h-11 pr-10 pl-9"
                                        placeholder={
                                            isTaskList
                                                ? 'Cari referensi, customer, atau alamat…'
                                                : 'Ketik nama…'
                                        }
                                        value={search}
                                        onChange={(event) => {
                                            setSearch(event.target.value);
                                            setPage(1);
                                        }}
                                    />
                                    {search && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="absolute top-1 right-1 size-9"
                                            aria-label="Hapus pencarian"
                                            onClick={() => {
                                                setSearch('');
                                                setPage(1);
                                            }}
                                        >
                                            <X className="size-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {isTaskList && (
                                <>
                                    <div className="space-y-2 sm:col-span-2 xl:col-span-2">
                                        <Label>Status</Label>
                                        <Select
                                            value={status || 'all'}
                                            onValueChange={(value) => {
                                                setStatus(
                                                    value === 'all'
                                                        ? ''
                                                        : value,
                                                );
                                                setPage(1);
                                            }}
                                        >
                                            <SelectTrigger
                                                className="w-full data-[size=default]:h-11"
                                                aria-label="Filter Status"
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">
                                                    Semua Status
                                                </SelectItem>
                                                <SelectItem value="SCHEDULED">
                                                    Menunggu Assignment
                                                </SelectItem>
                                                <SelectItem value="ASSIGNED">
                                                    Ditugaskan
                                                </SelectItem>
                                                <SelectItem value="PICKED_UP">
                                                    Pickup Berhasil
                                                </SelectItem>
                                                <SelectItem value="NO_PACKAGES">
                                                    Selesai Tanpa Paket
                                                </SelectItem>
                                                <SelectItem value="CANCELLED">
                                                    Dibatalkan
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div
                                        className={`grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3 sm:col-span-2 ${operationalWorkspace ? 'xl:col-span-4' : 'xl:col-span-6'}`}
                                    >
                                        <div className="min-w-0 space-y-2">
                                            <Label htmlFor="date-from">
                                                Tanggal Mulai
                                            </Label>
                                            <Input
                                                id="date-from"
                                                className="h-11 w-full min-w-0"
                                                type="date"
                                                value={from}
                                                onChange={(event) => {
                                                    setFrom(event.target.value);
                                                    setPage(1);
                                                }}
                                            />
                                        </div>
                                        <div className="min-w-0 space-y-2">
                                            <Label htmlFor="date-to">
                                                Tanggal Selesai
                                            </Label>
                                            <Input
                                                id="date-to"
                                                className="h-11 w-full min-w-0"
                                                type="date"
                                                value={to}
                                                onChange={(event) => {
                                                    setTo(event.target.value);
                                                    setPage(1);
                                                }}
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        {isTaskList && (
                            <>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        aria-expanded={filtersOpen}
                                        aria-controls="advanced-pickup-filters"
                                        onClick={() =>
                                            setFiltersOpen(!filtersOpen)
                                        }
                                    >
                                        <SlidersHorizontal className="size-4" />
                                        Filter Lanjutan
                                        <ChevronDown
                                            className={`size-4 ${filtersOpen ? 'rotate-180' : ''}`}
                                        />
                                        {[
                                            pickupType,
                                            customerFilter,
                                            staffFilter,
                                        ].filter(Boolean).length > 0 &&
                                            ' · ' +
                                                [
                                                    pickupType,
                                                    customerFilter,
                                                    staffFilter,
                                                ].filter(Boolean).length}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setSearch('');
                                            setStatus('');
                                            setFrom('');
                                            setTo('');
                                            setPickupType('');
                                            setCustomerFilter('');
                                            setSelectedFilterCustomer(null);
                                            setStaffFilter('');
                                            setScheduleFilter('');
                                            setPage(1);
                                        }}
                                    >
                                        <RefreshCw className="size-4" />
                                        Reset Filter
                                    </Button>
                                </div>
                                {filtersOpen && (
                                    <div
                                        id="advanced-pickup-filters"
                                        className="grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3"
                                    >
                                        <div className="space-y-2">
                                            <Label>Jenis Pickup</Label>
                                            <Select
                                                value={pickupType || 'all'}
                                                onValueChange={(value) => {
                                                    setPickupType(
                                                        value === 'all'
                                                            ? ''
                                                            : value,
                                                    );
                                                    setPage(1);
                                                }}
                                            >
                                                <SelectTrigger
                                                    className="w-full data-[size=default]:h-11"
                                                    aria-label="Jenis Pickup"
                                                >
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">
                                                        Semua Jenis
                                                    </SelectItem>
                                                    <SelectItem value="on_demand">
                                                        On-Demand
                                                    </SelectItem>
                                                    <SelectItem value="regular">
                                                        Regular / Terjadwal
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {manager && (
                                            <>
                                                <div className="space-y-2">
                                                    <Label htmlFor="pickup-filter-customer">
                                                        Customer
                                                    </Label>
                                                    <CustomerPicker
                                                        triggerId="pickup-filter-customer"
                                                        allowClear
                                                        selected={
                                                            selectedFilterCustomer
                                                        }
                                                        onSelect={(
                                                            customer,
                                                        ) => {
                                                            setSelectedFilterCustomer(
                                                                customer,
                                                            );
                                                            setCustomerFilter(
                                                                customer
                                                                    ? String(
                                                                          customer.id,
                                                                      )
                                                                    : '',
                                                            );
                                                            setPage(1);
                                                        }}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Petugas</Label>
                                                    <Select
                                                        value={
                                                            staffFilter || 'all'
                                                        }
                                                        onValueChange={(
                                                            value,
                                                        ) => {
                                                            setStaffFilter(
                                                                value === 'all'
                                                                    ? ''
                                                                    : value,
                                                            );
                                                            setPage(1);
                                                        }}
                                                    >
                                                        <SelectTrigger
                                                            className="w-full data-[size=default]:h-11"
                                                            aria-label="Filter Petugas"
                                                        >
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="all">
                                                                Semua Petugas
                                                            </SelectItem>
                                                            {filterStaff.map(
                                                                (staff) => (
                                                                    <SelectItem
                                                                        key={
                                                                            staff.id
                                                                        }
                                                                        value={String(
                                                                            staff.id,
                                                                        )}
                                                                    >
                                                                        {
                                                                            staff.name
                                                                        }
                                                                    </SelectItem>
                                                                ),
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {operationalWorkspace && assignmentSelection.length > 0 && (
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
                            <div className="mr-auto text-sm">
                                <p className="font-medium">
                                    Assignment Massal ·{' '}
                                    {assignmentSelection.length}/100 dipilih
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Pilihan tetap tersimpan saat pindah halaman
                                    atau filter. Hanya task belum ditugaskan
                                    yang dapat dipilih.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                disabled={
                                    !assignmentSelection.length ||
                                    bulkAssignmentOpen
                                }
                                onClick={() => setAssignmentSelection([])}
                            >
                                Hapus Pilihan
                            </Button>
                            <Button
                                disabled={
                                    !assignmentSelection.length ||
                                    bulkAssignmentOpen ||
                                    loader.processing
                                }
                                onClick={() => setBulkAssignmentOpen(true)}
                            >
                                Tugaskan Massal
                            </Button>
                        </div>
                    )}
                    {operationalWorkspace && bulkAssignmentOpen && (
                        <BulkPickupAssignment
                            tasks={assignmentSelection}
                            staff={filterStaff}
                            onClose={() => setBulkAssignmentOpen(false)}
                            onReview={() => {
                                setBulkAssignmentOpen(false);
                                setAssignmentSelection([]);
                                reload();
                            }}
                            onAssigned={(count) => {
                                setBulkAssignmentOpen(false);
                                setAssignmentSelection([]);
                                toast.success(
                                    `${count} task berhasil ditugaskan.`,
                                );
                                reload();
                            }}
                        />
                    )}
                    {operationalWorkspace && (
                        <PickupOperationalList
                            tasks={rows as Task[]}
                            meta={loader.response?.meta}
                            loading={loader.processing}
                            error={message}
                            timezone={timezone}
                            page={page}
                            perPage={perPage}
                            sort={sort}
                            onPage={setPage}
                            selection={{
                                ids: assignmentSelection.map((task) => task.id),
                                disabled: bulkAssignmentOpen,
                                onToggle: (tasks, checked) => {
                                    const ids = new Set(
                                        tasks.map((task) => task.id),
                                    );
                                    if (!checked) {
                                        setAssignmentSelection((selected) =>
                                            selected.filter(
                                                (task) => !ids.has(task.id),
                                            ),
                                        );
                                        return;
                                    }
                                    const additions = tasks.filter(
                                        (task) =>
                                            !assignmentSelection.some(
                                                (selected) =>
                                                    selected.id === task.id,
                                            ),
                                    );
                                    if (
                                        assignmentSelection.length +
                                            additions.length >
                                        100
                                    ) {
                                        toast.error(
                                            'Maksimal 100 task per assignment. Kurangi pilihan atau proses batch ini terlebih dahulu.',
                                        );
                                        return;
                                    }
                                    setAssignmentSelection((selected) => [
                                        ...selected,
                                        ...additions,
                                    ]);
                                },
                            }}
                            onPerPage={(size) => {
                                setPerPage(size);
                                setPage(1);
                            }}
                            onSort={(value) => {
                                setSort(value);
                                setPage(1);
                            }}
                            onAssign={(row) => {
                                setSelectedTask(row);
                                setModal('assign');
                                void lookup
                                    .get(staffApi.url())
                                    .then((response) => {
                                        if (response)
                                            setStaff(
                                                response.data as {
                                                    id: number;
                                                    name: string;
                                                }[],
                                            );
                                    })
                                    .catch((error: unknown) =>
                                        setMessage(errorMessage(error)),
                                    );
                            }}
                            onTakeover={(row) => {
                                setSelectedTask(row);
                                setModal('takeover');
                            }}
                        />
                    )}
                    {operationalWorkspace && (
                        <PickupSummaryCards
                            summary={loader.response?.summary}
                            loading={loader.processing}
                        />
                    )}
                    {!operationalWorkspace && (
                        <>
                            {loader.processing && <EmptyState loading />}
                            {!loader.processing &&
                                rows.length === 0 &&
                                !message && (
                                    <EmptyState
                                        title={
                                            taskScope === 'available' &&
                                            isTaskList
                                                ? 'Tidak ada tugas tersedia'
                                                : 'Belum ada hasil'
                                        }
                                        description={
                                            isTaskList
                                                ? 'Tidak ada pickup yang cocok dengan filter dan hak akses Anda. Ubah filter atau periksa kembali nanti.'
                                                : 'Tambahkan data pertama atau gunakan kata pencarian lainnya.'
                                        }
                                    />
                                )}
                            {isTaskList &&
                                manager &&
                                rows.length > 0 &&
                                !loader.processing && (
                                    <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-sm lg:block">
                                        <DataTable
                                            data={rows as Task[]}
                                            getRowId={(row) => String(row.id)}
                                            bordered={false}
                                            tableClassName={
                                                'w-full text-left text-sm'
                                            }
                                            columns={[
                                                {
                                                    id: 'reference_customer',
                                                    header: 'Reference / Customer',
                                                    hideable: false,
                                                    className: 'p-4',
                                                    cell: (row) => (
                                                        <>
                                                            <p className="font-semibold">
                                                                {
                                                                    row.customer
                                                                        .name
                                                                }
                                                            </p>
                                                            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                                                                {row.reference}
                                                            </p>
                                                        </>
                                                    ),
                                                },
                                                {
                                                    id: 'alamat_pickup',
                                                    header: 'Alamat Pickup',
                                                    hideable: true,
                                                    className: 'max-w-64 p-4',
                                                    cell: (row) => (
                                                        <>
                                                            {row.pickup_address}
                                                        </>
                                                    ),
                                                },
                                                {
                                                    id: 'jadwal',
                                                    header: 'Jadwal',
                                                    hideable: true,
                                                    className:
                                                        'p-4 whitespace-nowrap',
                                                    cell: (row) => (
                                                        <>
                                                            {formatTime(
                                                                row.scheduled_at,
                                                            )}
                                                        </>
                                                    ),
                                                },
                                                {
                                                    id: 'petugas',
                                                    header: 'Petugas',
                                                    hideable: true,
                                                    className: 'p-4',
                                                    cell: (row) => (
                                                        <>
                                                            {row.assigned_staff
                                                                ?.name ??
                                                                'Belum ditugaskan'}
                                                        </>
                                                    ),
                                                },
                                                {
                                                    id: 'status',
                                                    header: 'Status',
                                                    hideable: true,
                                                    className: 'p-4',
                                                    cell: (row) => (
                                                        <>
                                                            <StatusBadge
                                                                status={
                                                                    row.status
                                                                }
                                                            />
                                                        </>
                                                    ),
                                                },
                                                {
                                                    id: 'aksi',
                                                    header: 'Aksi',
                                                    hideable: false,
                                                    className: 'p-4',
                                                    cell: (row) => (
                                                        <>
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    asChild
                                                                    size="sm"
                                                                    variant="outline"
                                                                >
                                                                    <Link
                                                                        href={operations(
                                                                            {
                                                                                screen: 'detail',
                                                                                task: row.id,
                                                                            },
                                                                        )}
                                                                    >
                                                                        Detail
                                                                    </Link>
                                                                </Button>
                                                                {row.can
                                                                    .assign && (
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            setSelectedTask(
                                                                                row,
                                                                            );
                                                                            setModal(
                                                                                'assign',
                                                                            );
                                                                            void lookup
                                                                                .get(
                                                                                    staffApi.url(),
                                                                                )
                                                                                .then(
                                                                                    (
                                                                                        response,
                                                                                    ) =>
                                                                                        setStaff(
                                                                                            response.data as {
                                                                                                id: number;
                                                                                                name: string;
                                                                                            }[],
                                                                                        ),
                                                                                )
                                                                                .catch(
                                                                                    (
                                                                                        error: unknown,
                                                                                    ) =>
                                                                                        setMessage(
                                                                                            errorMessage(
                                                                                                error,
                                                                                            ),
                                                                                        ),
                                                                                );
                                                                        }}
                                                                    >
                                                                        Tugaskan
                                                                    </Button>
                                                                )}
                                                                {row.can
                                                                    .take_over && (
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            setSelectedTask(
                                                                                row,
                                                                            );
                                                                            setModal(
                                                                                'takeover',
                                                                            );
                                                                        }}
                                                                    >
                                                                        Ambil
                                                                        Alih
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </>
                                                    ),
                                                },
                                            ]}
                                        />
                                    </div>
                                )}
                            {!loader.processing &&
                                rows.length > 0 &&
                                screen === 'users' && (
                                    <div className="hidden min-w-0 overflow-x-auto rounded-xl border bg-card shadow-sm lg:block">
                                        <DataTable
                                            data={rows as Account[]}
                                            getRowId={(row) => String(row.id)}
                                            bordered={false}
                                            tableClassName="min-w-[720px]"
                                            columns={[
                                                {
                                                    id: 'pengguna',
                                                    header: 'Pengguna',
                                                    hideable: false,
                                                    cell: (row) => (
                                                        <>
                                                            {
                                                                (row as Account)
                                                                    .name
                                                            }
                                                        </>
                                                    ),
                                                },
                                                {
                                                    id: 'email',
                                                    header: 'Email',
                                                    hideable: true,
                                                    cell: (row) => (
                                                        <>
                                                            {
                                                                (row as Account)
                                                                    .email
                                                            }
                                                        </>
                                                    ),
                                                },
                                                {
                                                    id: 'role',
                                                    header: 'Role',
                                                    hideable: true,
                                                    cell: (row) => (
                                                        <>
                                                            {roleOptions.find(
                                                                (option) =>
                                                                    option.value ===
                                                                    (
                                                                        row as Account
                                                                    ).role,
                                                            )?.label ??
                                                                (row as Account)
                                                                    .role}
                                                        </>
                                                    ),
                                                },
                                                {
                                                    id: 'status',
                                                    header: 'Status',
                                                    hideable: true,
                                                    cell: (row) => (
                                                        <>
                                                            <Badge variant="outline">
                                                                {(
                                                                    row as Account
                                                                ).is_active
                                                                    ? 'Aktif'
                                                                    : 'Nonaktif'}
                                                            </Badge>
                                                        </>
                                                    ),
                                                },
                                                {
                                                    id: 'aksi',
                                                    header: 'Aksi',
                                                    hideable: false,
                                                    cell: (row) => (
                                                        <>
                                                            {row.id !==
                                                                user.id && (
                                                                <Button
                                                                    variant="outline"
                                                                    onClick={() => {
                                                                        setSelectedUser(
                                                                            row as Account,
                                                                        );
                                                                        setModal(
                                                                            'edit-user',
                                                                        );
                                                                    }}
                                                                >
                                                                    Ubah Akses
                                                                </Button>
                                                            )}
                                                        </>
                                                    ),
                                                },
                                            ]}
                                        />
                                    </div>
                                )}
                            <div
                                className={`grid min-w-0 gap-4 sm:grid-cols-2 ${(isTaskList && manager) || screen === 'users' ? 'lg:hidden' : ''} ${loader.processing ? 'hidden' : ''}`}
                            >
                                {rows.map((row) =>
                                    screen === 'users' ? (
                                        <Panel
                                            key={row.id}
                                            title={(row as Account).name}
                                        >
                                            <p className="break-all">
                                                {(row as Account).email}
                                            </p>
                                            <div className="my-3 flex gap-2">
                                                <Badge>
                                                    {roleOptions.find(
                                                        (option) =>
                                                            option.value ===
                                                            (row as Account)
                                                                .role,
                                                    )?.label ??
                                                        (row as Account).role}
                                                </Badge>
                                                <Badge variant="outline">
                                                    {(row as Account).is_active
                                                        ? 'Aktif'
                                                        : 'Nonaktif'}
                                                </Badge>
                                            </div>
                                            {row.id !== user.id && (
                                                <Button
                                                    variant="outline"
                                                    onClick={() => {
                                                        setSelectedUser(
                                                            row as Account,
                                                        );
                                                        setModal('edit-user');
                                                    }}
                                                >
                                                    Ubah Akses
                                                </Button>
                                            )}
                                        </Panel>
                                    ) : (
                                        <Panel
                                            key={row.id}
                                            title={(row as Task).customer.name}
                                        >
                                            <div className="space-y-3">
                                                <StatusBadge
                                                    status={
                                                        (row as Task).status
                                                    }
                                                />
                                                <p className="break-words">
                                                    {
                                                        (row as Task)
                                                            .pickup_address
                                                    }
                                                </p>
                                                <p className="text-sm">
                                                    {formatTime(
                                                        (row as Task)
                                                            .scheduled_at,
                                                    )}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {(row as Task)
                                                        .assigned_staff?.name ??
                                                        'Belum ditugaskan'}
                                                </p>
                                                <Button
                                                    asChild
                                                    variant="outline"
                                                    className="min-h-11 w-full"
                                                >
                                                    <Link
                                                        href={operations(
                                                            {
                                                                screen: 'detail',
                                                                task: row.id,
                                                            },
                                                            {
                                                                query: history
                                                                    ? {
                                                                          history: 1,
                                                                      }
                                                                    : {},
                                                            },
                                                        )}
                                                    >
                                                        {(row as Task).can
                                                            .execute &&
                                                        (
                                                            row as Task
                                                        ).visits?.at(-1)
                                                            ?.outcome !==
                                                            'NO_PACKAGES'
                                                            ? (row as Task)
                                                                  .execution_started_at
                                                                ? 'Lanjutkan Pickup'
                                                                : 'Buka & Mulai Pickup'
                                                            : 'Lihat Detail'}
                                                    </Link>
                                                </Button>
                                                {(row as Task).can
                                                    .take_over && (
                                                    <Button
                                                        className="min-h-11 w-full"
                                                        onClick={() => {
                                                            setSelectedTask(
                                                                row as Task,
                                                            );
                                                            setModal(
                                                                'takeover',
                                                            );
                                                        }}
                                                    >
                                                        Ambil Alih
                                                    </Button>
                                                )}
                                            </div>
                                        </Panel>
                                    ),
                                )}
                            </div>
                            <DataTablePagination
                                meta={loader.response?.meta}
                                page={page}
                                onPage={setPage}
                                loading={loader.processing}
                                itemLabel={
                                    screen === 'users' ? 'pengguna' : 'pickup'
                                }
                            />
                        </>
                    )}
                </div>
            )}
            {(manager || role === 'pickup_staff') && (
                <CreatePickupDialog
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                    timezone={timezone}
                    onCreated={() => {
                        setPage(1);
                        reload();
                    }}
                />
            )}
            <Dialog
                open={modal !== null}
                onOpenChange={(open) => {
                    if (!open) setModal(null);
                }}
            >
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {modal === 'takeover'
                                ? 'Konfirmasi Ambil Alih'
                                : 'Data Operasional'}
                        </DialogTitle>
                        <DialogDescription>
                            {modal === 'takeover'
                                ? `Ambil alih ${task?.customer.name} dari ${task?.assigned_staff?.name}? Tanpa approval CS. Petugas lama kehilangan ownership. Jadwal ${task ? formatTime(task.scheduled_at) : ''}.`
                                : 'Lengkapi data. Perubahan divalidasi oleh server.'}
                        </DialogDescription>
                    </DialogHeader>
                    {message && (
                        <p role="alert" className="text-sm text-destructive">
                            {message}
                        </p>
                    )}
                    {lookup.processing && modal === 'assign' && (
                        <p
                            role="status"
                            className="text-sm text-muted-foreground"
                        >
                            Memuat petugas aktif…
                        </p>
                    )}

                    {modal === 'user' && (
                        <Editor
                            title="Buat Akun"
                            url={userApi.store.url()}
                            initial={{
                                name: '',
                                email: '',
                                password: '',
                                password_confirmation: '',
                                role: 'pickup_staff',
                                is_active: true,
                            }}
                            fields={[
                                { name: 'name', label: 'Nama', required: true },
                                {
                                    name: 'email',
                                    label: 'Email Login',
                                    type: 'email',
                                    required: true,
                                },
                                {
                                    name: 'password',
                                    label: 'Password Initial',
                                    type: 'password',
                                    required: true,
                                },
                                {
                                    name: 'password_confirmation',
                                    label: 'Konfirmasi Password',
                                    type: 'password',
                                    required: true,
                                },
                                {
                                    name: 'role',
                                    label: 'Role',
                                    options: roleOptions,
                                },
                                {
                                    name: 'is_active',
                                    label: 'Status Akun',
                                    options: [
                                        { value: 'true', label: 'Aktif' },
                                        { value: 'false', label: 'Nonaktif' },
                                    ],
                                },
                            ]}
                            onSaved={reload}
                        />
                    )}
                    {modal === 'edit-user' && selectedUser && (
                        <Editor
                            title="Simpan Akses"
                            method="patch"
                            url={userApi.update.url(selectedUser.id)}
                            initial={{
                                role: selectedUser.role,
                                is_active: selectedUser.is_active,
                            }}
                            fields={[
                                {
                                    name: 'role',
                                    label: 'Role',
                                    options: roleOptions,
                                },
                                {
                                    name: 'is_active',
                                    label: 'Status Akun',
                                    options: [
                                        { value: 'true', label: 'Aktif' },
                                        { value: 'false', label: 'Nonaktif' },
                                    ],
                                },
                            ]}
                            onSaved={reload}
                        />
                    )}
                    {modal === 'assign' && task && (
                        <Editor
                            title="Tugaskan Petugas"
                            url={taskApi.assign.url(task.id)}
                            initial={{
                                assigned_staff_id: '',
                                expected_version: task.version,
                            }}
                            fields={[
                                {
                                    name: 'assigned_staff_id',
                                    label: 'Petugas Aktif',
                                    required: true,
                                    options: staff.map((person) => ({
                                        value: String(person.id),
                                        label: person.name,
                                    })),
                                },
                            ]}
                            onSaved={reload}
                        />
                    )}
                    {modal === 'takeover' && task && (
                        <Editor
                            title={
                                task.assigned_staff
                                    ? 'Ambil Alih Task'
                                    : 'Ambil Tugas'
                            }
                            description={
                                task.assigned_staff
                                    ? `Ambil alih pickup ${task.customer.name} dari ${task.assigned_staff.name}? Setelah berhasil, task menjadi tanggung jawab Anda dan petugas lama kehilangan kepemilikan. Tidak diperlukan approval CS.`
                                    : `Ambil pickup ${task.customer.name}? Tugas ini akan menjadi tanggung jawab Anda.`
                            }
                            url={taskApi.takeover.url(task.id)}
                            initial={{
                                expected_version: task.version,
                                expected_assigned_staff_id:
                                    task.assigned_staff?.id ?? '',
                                reason: '',
                            }}
                            fields={[
                                {
                                    name: 'reason',
                                    label: 'Alasan (opsional)',
                                    type: 'textarea',
                                },
                            ]}
                            onSaved={() => {
                                setTaskScope('mine');
                                reload();
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </PageContainer>
    );
}

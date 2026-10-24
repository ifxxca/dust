import { Head, Link, router, useForm } from '@inertiajs/react';
import { useState } from 'react';
import {
    ArrowDownRight,
    ArrowRight,
    ArrowUpRight,
    CalendarDays,
    CheckCheck,
    ClipboardList,
    Clock3,
    MapPin,
    Package,
    Plus,
    RefreshCw,
    TriangleAlert,
    Truck,
    Users,
} from 'lucide-react';
import PageContainer from '@/components/page-container';
import CreatePickupDialog from '@/components/create-pickup-dialog';
import {
    OperationalActivityChart,
    OperationalDonut,
    opDate,
    opNumber as n,
} from '@/components/operational-dashboard-charts';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/operational-ui';
import { dashboard } from '@/routes';
import * as results from '@/routes/pickup-results';
import * as tracking from '@/routes/jne-monitoring';
import { trackingLabels } from '@/lib/jne-monitoring';
import type { OperationalOverviewData } from '@/types/operational-dashboard';

const pickupLabels: Record<string, string> = {
    SCHEDULED: 'Belum ditugaskan',
    ASSIGNED: 'Sedang ditangani',
    PICKED_UP: 'Pickup berhasil',
    NO_PACKAGES: 'Tidak ada paket',
    CANCELLED: 'Dibatalkan',
};
const typeLabels: Record<string, string> = {
    on_demand: 'On-demand',
    scheduled: 'Terjadwal',
    regular: 'Regular',
};
const statusColors: Record<string, string> = {
    DELIVERED: 'var(--chart-2)',
    PICKED_UP: 'var(--chart-2)',
    IN_TRANSIT: 'var(--primary)',
    ASSIGNED: 'var(--primary)',
    SCHEDULED: 'var(--chart-4)',
    EXCEPTION: 'var(--chart-5)',
    RETURNED: 'var(--chart-4)',
    CANCELLED: 'var(--destructive-foreground)',
    UNKNOWN: 'var(--muted-foreground)',
    NO_PACKAGES: 'var(--muted-foreground)',
};

export default function OperationalDashboardOverview({
    data,
    timezone,
}: {
    data: OperationalOverviewData;
    timezone: string;
}) {
    const form = useForm(data.filters);
    const [creating, setCreating] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const { summary } = data;
    const today = data.operational_date;
    const date = (value: string) =>
        new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timezone,
        }).format(new Date(value));
    const monitor = (query: Record<string, string | number> = {}) =>
        results.index.url({
            query: {
                date_from: data.filters.date_from,
                date_to: data.filters.date_thru,
                monitoring: 'pickup',
                ...query,
            },
        });
    const preset = (days: number) => {
        const from = new Date(`${today}T12:00:00Z`);
        from.setUTCDate(from.getUTCDate() - days + 1);
        router.get(dashboard.url(), {
            date_from: from.toISOString().slice(0, 10),
            date_thru: today,
        });
    };
    const reload = () =>
        router.reload({
            only: ['overview'],
            onStart: () => {
                setRefreshing(true);
                setError('');
            },
            onFinish: () => setRefreshing(false),
            onNetworkError: () => {
                setError(
                    'Data gagal diperbarui. Periksa koneksi lalu coba kembali.',
                );
                return false;
            },
        });
    const cards = [
        {
            key: 'customers',
            title: 'Customer aktif',
            value: summary.customers,
            icon: Users,
            tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
            detail: 'Customer unik dengan aktivitas pickup',
        },
        {
            key: 'tasks',
            title: 'Aktivitas pickup',
            value: summary.tasks,
            icon: Truck,
            tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
            detail: 'Satu task dihitung satu kali',
        },
        {
            key: 'packages',
            title: 'Paket tercatat',
            value: summary.packages,
            icon: Package,
            tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
            detail: 'Bukti final dengan koreksi terakhir',
        },
        {
            key: 'attention',
            title: 'Perlu tindak lanjut',
            value: summary.attention,
            icon: TriangleAlert,
            tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
            detail: 'Task belum tuntas atau perlu diperiksa',
        },
    ] as const;
    return (
        <PageContainer className="flex flex-col gap-4 space-y-0 py-4">
            <Head title="Dashboard operasional" />
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Dashboard operasional
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Ringkasan pickup, paket, performa tim, dan pekerjaan
                        yang perlu ditangani.
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Data dimuat {date(data.observed_at)} · WIB
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={refreshing}
                        onClick={reload}
                    >
                        <RefreshCw
                            aria-hidden="true"
                            className={
                                refreshing
                                    ? 'animate-spin motion-reduce:animate-none'
                                    : ''
                            }
                        />
                        {refreshing ? 'Memuat…' : 'Segarkan data'}
                    </Button>
                    <Button
                        className="min-h-11"
                        onClick={() => setCreating(true)}
                    >
                        <Plus aria-hidden="true" />
                        Buat pickup
                    </Button>
                </div>
            </header>
            <Card className="gap-0 py-4 shadow-none">
                <CardContent className="flex flex-col gap-3 px-4">
                    <form
                        className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap"
                        onSubmit={(event) => {
                            event.preventDefault();
                            form.get(dashboard.url(), {
                                preserveState: false,
                                preserveScroll: true,
                            });
                        }}
                    >
                        <div
                            className="flex flex-wrap gap-1 self-end sm:col-span-2"
                            aria-label="Periode cepat"
                        >
                            {[
                                [1, 'Hari ini'],
                                [7, '7 hari'],
                                [30, '30 hari'],
                            ].map(([days, label]) => (
                                <Button
                                    key={days}
                                    variant="ghost"
                                    className="min-h-11"
                                    type="button"
                                    onClick={() => preset(Number(days))}
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1 xl:min-w-36">
                            <Label htmlFor="overview-from">Dari tanggal</Label>
                            <Input
                                id="overview-from"
                                type="date"
                                className="min-h-11"
                                required
                                value={form.data.date_from}
                                onChange={(event) =>
                                    form.setData(
                                        'date_from',
                                        event.target.value,
                                    )
                                }
                                aria-invalid={!!form.errors.date_from}
                            />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1 xl:min-w-36">
                            <Label htmlFor="overview-thru">
                                Sampai tanggal
                            </Label>
                            <Input
                                id="overview-thru"
                                type="date"
                                className="min-h-11"
                                required
                                min={form.data.date_from}
                                value={form.data.date_thru}
                                onChange={(event) =>
                                    form.setData(
                                        'date_thru',
                                        event.target.value,
                                    )
                                }
                                aria-invalid={!!form.errors.date_thru}
                            />
                        </div>
                        <Button
                            type="submit"
                            className="min-h-11 sm:col-span-2 xl:w-auto"
                            disabled={form.processing}
                        >
                            <CalendarDays aria-hidden="true" />
                            Terapkan
                        </Button>
                    </form>
                    {(form.errors.date_from || form.errors.date_thru) && (
                        <p role="alert" className="text-sm text-destructive">
                            {form.errors.date_from || form.errors.date_thru}
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Hari pickup: 05.00–04.59 WIB, mengikuti aktivitas;
                        pickup yang belum dimulai mengikuti jadwal. Pembanding:{' '}
                        {opDate(data.previousPeriod.date_from)}–
                        {opDate(data.previousPeriod.date_thru)}.
                    </p>
                </CardContent>
            </Card>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <section
                aria-label="Ringkasan periode"
                className="grid grid-cols-2 gap-3 xl:grid-cols-4"
            >
                {cards.map(
                    ({ key, title, value, icon: Icon, tone, detail }) => {
                        const change = summary.changes[key];
                        const Delta =
                            change !== null && change < 0
                                ? ArrowDownRight
                                : ArrowUpRight;
                        return (
                            <Card
                                key={key}
                                className="min-w-0 gap-0 py-4 shadow-none"
                            >
                                <CardContent className="flex flex-col gap-3 px-4">
                                    <div className="flex items-center gap-3">
                                        <span
                                            className={`hidden rounded-lg p-2 sm:inline-flex ${tone}`}
                                        >
                                            <Icon
                                                aria-hidden="true"
                                                className="size-5"
                                            />
                                        </span>
                                        <p className="text-xs font-medium text-muted-foreground sm:text-sm">
                                            {title}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-end justify-between gap-2">
                                        <p className="text-3xl font-semibold tracking-tight tabular-nums">
                                            {n(value)}
                                        </p>
                                        {change !== null && (
                                            <Badge
                                                variant="outline"
                                                className="gap-1"
                                            >
                                                <Delta aria-hidden="true" />
                                                {change > 0 ? '+' : ''}
                                                {n(change)}%
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {detail}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {change === null
                                            ? 'Belum ada pembanding'
                                            : `${n(summary.previous[key])} pada periode sebelumnya`}
                                    </p>
                                </CardContent>
                            </Card>
                        );
                    },
                )}
            </section>
            <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm lg:grid-cols-4">
                {[
                    ['Pickup berhasil', n(summary.picked_up), CheckCheck],
                    ['Tanpa paket', n(summary.no_packages), ClipboardList],
                    [
                        'Rasio pickup berhasil',
                        summary.completion_rate === null
                            ? 'Tidak tersedia'
                            : `${n(summary.completion_rate)}%`,
                        Truck,
                    ],
                    ['Menunggu handover', n(summary.waiting_handover), Clock3],
                ].map(([label, value, Icon]) => {
                    const StatIcon = Icon as typeof Truck;
                    return (
                        <div
                            key={String(label)}
                            className="flex items-start gap-2"
                        >
                            <StatIcon
                                aria-hidden="true"
                                className="mt-0.5 size-4 shrink-0 text-primary"
                            />
                            <div>
                                <p className="text-xs text-muted-foreground">
                                    {String(label)}
                                </p>
                                <p className="mt-1 font-semibold tabular-nums">
                                    {String(value)}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="grid items-start gap-4 xl:grid-cols-3">
                <div className="min-w-0 xl:col-span-2">
                    <OperationalActivityChart
                        key={JSON.stringify(data.filters)}
                        daily={data.daily}
                    />
                </div>
                {data.tracking ? (
                    <OperationalDonut
                        title="Status pengiriman JNE"
                        description="Snapshot terbaru resi berdasarkan tanggal kirim kalender (00.00–23.59 WIB)."
                        data={data.tracking.statuses.map((row) => ({
                            ...row,
                            label: trackingLabels[row.key] ?? row.key,
                            color: statusColors[row.key],
                        }))}
                        totalLabel="Resi APEX"
                        footer={
                            <div className="flex flex-col gap-2">
                                <p className="text-xs text-muted-foreground">
                                    Diamati:{' '}
                                    {data.tracking.observed_at
                                        ? date(data.tracking.observed_at)
                                        : 'Belum ada snapshot'}
                                    . Status mengikuti report terakhir.
                                </p>
                                <Button
                                    variant="outline"
                                    className="min-h-11"
                                    asChild
                                >
                                    <Link
                                        href={tracking.customerDashboard.url({
                                            query: data.filters,
                                        })}
                                    >
                                        Analisis pengiriman
                                        <ArrowRight aria-hidden="true" />
                                    </Link>
                                </Button>
                            </div>
                        }
                    />
                ) : (
                    <OperationalDonut
                        title="Status aktivitas pickup"
                        description="Status terbaru task pada periode terpilih."
                        data={data.statuses.map((row) => ({
                            ...row,
                            label: pickupLabels[row.key] ?? row.key,
                            color: statusColors[row.key],
                        }))}
                        totalLabel="Pickup"
                    />
                )}
            </div>
            <div className="grid items-start gap-4 lg:grid-cols-3">
                <Card className="min-w-0 gap-4 shadow-none">
                    <CardHeader>
                        <CardTitle className="text-base">
                            Performa petugas
                        </CardTitle>
                        <CardDescription>
                            Pickup berhasil dibanding aktivitas tercatat,
                            berdasarkan penanggung jawab task.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        {data.team.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                                Belum ada penugasan pada periode ini.
                            </p>
                        )}
                        {data.team.map((staff) => (
                            <Link
                                key={staff.id}
                                href={monitor({ staff_id: staff.id })}
                                className="flex min-h-11 flex-col gap-2 rounded-md py-1 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="flex justify-between gap-2 text-sm">
                                    <span className="truncate">
                                        {staff.name ?? 'Petugas'}
                                    </span>
                                    <span className="shrink-0 font-medium tabular-nums">
                                        {staff.picked_up}/{staff.tasks} ·{' '}
                                        {n(staff.rate)}%
                                    </span>
                                </span>
                                <span
                                    className="h-2 overflow-hidden rounded-full bg-muted"
                                    aria-hidden="true"
                                >
                                    <span
                                        className="block h-full rounded-full bg-primary"
                                        style={{ width: `${staff.rate}%` }}
                                    />
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {n(staff.packages)} paket dari bukti final
                                </span>
                            </Link>
                        ))}
                    </CardContent>
                </Card>
                <OperationalDonut
                    title="Tipe pickup"
                    description="Distribusi jenis task pada periode terpilih."
                    data={data.types.map((row) => ({
                        ...row,
                        label: typeLabels[row.key] ?? row.key,
                        color:
                            row.key === 'regular'
                                ? 'var(--chart-2)'
                                : row.key === 'scheduled'
                                  ? 'var(--chart-4)'
                                  : 'var(--primary)',
                    }))}
                    totalLabel="Pickup"
                />
                <OperationalDonut
                    title="Kategori paket"
                    description="Jumlah paket pada bukti final, memakai koreksi terbaru."
                    data={data.categories}
                    totalLabel="Paket"
                />
            </div>
            <div className="grid items-start gap-4 lg:grid-cols-2">
                <Card className="min-w-0 gap-4 shadow-none">
                    <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <TriangleAlert
                                    aria-hidden="true"
                                    className="size-4 text-amber-600 dark:text-amber-400"
                                />
                                Perlu tindak lanjut
                                <Badge variant="secondary">
                                    {n(summary.attention)}
                                </Badge>
                            </CardTitle>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="min-h-11"
                                asChild
                            >
                                <Link href={monitor()}>
                                    Monitoring
                                    <ArrowRight aria-hidden="true" />
                                </Link>
                            </Button>
                        </div>
                        <CardDescription>
                            Task dihitung sekali, meskipun memiliki beberapa hal
                            yang perlu diperiksa.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        {data.attention.length === 0 && (
                            <p className="py-4 text-sm text-muted-foreground">
                                Tidak ada tindak lanjut pada periode ini.
                            </p>
                        )}
                        {data.attention.map((row) => (
                            <Link
                                key={row.id}
                                href={results.show.url(row.id)}
                                className="flex min-h-14 items-center justify-between gap-3 rounded-lg border p-3 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="flex min-w-0 flex-col gap-1">
                                    <span className="text-sm font-medium">
                                        {row.reason}
                                    </span>
                                    <span className="truncate text-xs text-muted-foreground">
                                        {row.customer_name}
                                    </span>
                                </span>
                                <ArrowRight
                                    aria-hidden="true"
                                    className="size-4 shrink-0 text-muted-foreground"
                                />
                            </Link>
                        ))}
                        {summary.attention > 6 && (
                            <p className="text-xs text-muted-foreground">
                                Menampilkan 6 dari {n(summary.attention)} task.
                            </p>
                        )}
                    </CardContent>
                </Card>
                <Card className="min-w-0 gap-4 shadow-none">
                    <CardHeader>
                        <CardTitle className="text-base">
                            Customer dengan paket terbanyak
                        </CardTitle>
                        <CardDescription>
                            Diurutkan dari paket final, kemudian jumlah
                            aktivitas pickup.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        {data.customers.length === 0 && (
                            <p className="py-4 text-sm text-muted-foreground">
                                Belum ada customer aktif.
                            </p>
                        )}
                        {data.customers.map((customer, index) => (
                            <Link
                                key={customer.id}
                                href={monitor({ customer_id: customer.id })}
                                className="flex min-h-12 items-center gap-3 rounded-md py-2 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium">
                                    {index + 1}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm">
                                    {customer.name}
                                </span>
                                <span className="text-right">
                                    <span className="block text-sm font-semibold tabular-nums">
                                        {n(customer.packages)} paket
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {n(customer.tasks)} pickup
                                    </span>
                                </span>
                            </Link>
                        ))}
                    </CardContent>
                </Card>
            </div>
            <div
                className={`grid items-start gap-4 ${data.tracking ? 'lg:grid-cols-2' : ''}`}
            >
                <OperationalDonut
                    title="Customer baru dan repeat"
                    description="Baru: customer aktif yang belum punya jadwal pickup sebelum awal periode. Repeat: sudah pernah punya jadwal sebelumnya."
                    data={[
                        {
                            key: 'new',
                            label: 'Baru pada periode ini',
                            value: data.customerCohorts.new,
                        },
                        {
                            key: 'returning',
                            label: 'Repeat',
                            value: data.customerCohorts.returning,
                        },
                    ]}
                    totalLabel="Customer unik"
                />
                {data.tracking && (
                    <Card className="min-w-0 gap-4 shadow-none">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <MapPin
                                    aria-hidden="true"
                                    className="size-4 text-primary"
                                />
                                Tujuan pengiriman terbanyak
                            </CardTitle>
                            <CardDescription>
                                5 tujuan dari resi APEX pada periode ini. Nama
                                mengikuti lokasi JNE yang tersedia.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            {data.tracking.destinations.length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                    Belum ada data tujuan pengiriman.
                                </p>
                            )}
                            {data.tracking.destinations.map((row) => (
                                <Link
                                    key={row.code ?? 'unknown'}
                                    href={tracking.customerDashboard.url({
                                        query: {
                                            ...data.filters,
                                            destination: row.code ?? '',
                                        },
                                    })}
                                    className="flex min-h-12 flex-col gap-2 rounded-md outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <span className="flex justify-between gap-3 text-sm">
                                        <span className="min-w-0 break-words">
                                            {row.name}
                                        </span>
                                        <span className="shrink-0 font-medium tabular-nums">
                                            {n(row.value)} resi
                                        </span>
                                    </span>
                                    <span
                                        className="h-2 overflow-hidden rounded-full bg-muted"
                                        aria-hidden="true"
                                    >
                                        <span
                                            className="block h-full rounded-full bg-primary/70"
                                            style={{
                                                width: `${(row.value / Math.max(1, data.tracking!.destinations[0]?.value ?? 0)) * 100}%`,
                                            }}
                                        />
                                    </span>
                                </Link>
                            ))}
                        </CardContent>
                    </Card>
                )}
            </div>
            <Card className="min-w-0 gap-4 shadow-none">
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-col gap-2">
                            <CardTitle className="text-base">
                                Aktivitas terbaru
                            </CardTitle>
                            <CardDescription>
                                Maksimal 8 aktivitas dalam periode terpilih.
                            </CardDescription>
                        </div>
                        <Button variant="outline" className="min-h-11" asChild>
                            <Link href={monitor()}>
                                Lihat semua
                                <ArrowRight aria-hidden="true" />
                            </Link>
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Waktu</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Petugas</TableHead>
                                <TableHead>Paket</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>
                                    <span className="sr-only">Detail</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.recent.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{date(row.at)}</TableCell>
                                    <TableCell className="max-w-64 truncate">
                                        {row.customer_name}
                                    </TableCell>
                                    <TableCell>
                                        {row.staff_name ?? 'Belum ditugaskan'}
                                    </TableCell>
                                    <TableCell className="tabular-nums">
                                        {row.packages === null
                                            ? 'Bukti belum final'
                                            : n(row.packages)}
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge status={row.status} />
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-11"
                                            aria-label={`Detail ${row.reference}`}
                                            asChild
                                        >
                                            <Link
                                                href={results.show.url(row.id)}
                                            >
                                                <ArrowRight aria-hidden="true" />
                                            </Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {data.recent.length === 0 && (
                                <TableRow>
                                    <TableCell
                                        colSpan={6}
                                        className="h-24 text-center text-muted-foreground"
                                    >
                                        Belum ada aktivitas pada periode ini.
                                        Ubah rentang tanggal untuk melihat
                                        aktivitas sebelumnya.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            <CreatePickupDialog
                open={creating}
                onOpenChange={setCreating}
                timezone={timezone}
                onCreated={() => {
                    setCreating(false);
                    reload();
                }}
            />
        </PageContainer>
    );
}

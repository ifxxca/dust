import { Head, Link, router, useForm } from '@inertiajs/react';
import { useState, type ReactNode } from 'react';
import {
    ArrowDown,
    ArrowRight,
    ArrowUp,
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    ClipboardList,
    Info,
    Package,
    Plus,
    RefreshCw,
    TriangleAlert,
    Truck,
    Users,
    type LucideIcon,
} from 'lucide-react';
import PageContainer from '@/components/page-container';
import CreatePickupDialog from '@/components/create-pickup-dialog';
import {
    OperationalActivityChart,
    OperationalDonut,
    OperationalPanel,
    opDate,
    opNumber as n,
} from '@/components/operational-dashboard-charts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/operational-ui';
import { cn } from '@/lib/utils';
import { trackingLabels } from '@/lib/jne-monitoring';
import { dashboard } from '@/routes';
import * as results from '@/routes/pickup-results';
import * as tracking from '@/routes/jne-monitoring';
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
    member_direct: 'Member Direct',
    walk_in: 'Walk-In',
};
const trackingColors: Record<string, string> = {
    DELIVERED: 'var(--chart-2)',
    UNKNOWN: 'var(--chart-4)',
    IN_TRANSIT: 'var(--primary)',
    EXCEPTION: 'var(--chart-5)',
    CANCELLED: 'var(--destructive)',
    RETURNED: 'var(--chart-3)',
};

function DetailLink({
    href,
    children = 'Lihat semua',
}: {
    href: string;
    children?: ReactNode;
}) {
    return (
        <Link
            href={href}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
        >
            {children}
            <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
    );
}

function MetricCard({
    label,
    value,
    icon: Icon,
    tone,
    description,
    change,
    lowerIsBetter = false,
    suffix = '%',
}: {
    label: string;
    value: string;
    icon: LucideIcon;
    tone: 'primary' | 'warning' | 'success' | 'package';
    description: string;
    change?: number | null;
    lowerIsBetter?: boolean;
    suffix?: string;
}) {
    const positive =
        change != null && (lowerIsBetter ? change < 0 : change > 0);
    return (
        <Card className="gap-0 py-0 shadow-none">
            <CardContent className="flex gap-3 p-3">
                <span
                    className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-12',
                        tone === 'primary' && 'bg-primary/10 text-primary',
                        tone === 'warning' && 'bg-warning/10 text-warning',
                        tone === 'success' && 'bg-success/10 text-success',
                        tone === 'package' && 'bg-chart-1/10 text-chart-1',
                    )}
                >
                    <Icon aria-hidden="true" className="size-6" />
                </span>
                <dl className="flex min-w-0 flex-1 flex-col gap-1">
                    <dt className="text-xs">{label}</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                        <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums sm:text-3xl">
                            {value}
                        </span>
                        {change != null && (
                            <Badge
                                variant="secondary"
                                className={cn(
                                    'gap-1 border-0 px-2 py-1 text-[11px] tabular-nums',
                                    change === 0
                                        ? 'bg-muted text-muted-foreground'
                                        : positive
                                          ? 'bg-success/10 text-success'
                                          : 'bg-warning/10 text-warning',
                                )}
                                title="Perubahan dibanding periode sebelumnya"
                            >
                                {change !== 0 &&
                                    (change > 0 ? (
                                        <ArrowUp
                                            aria-hidden="true"
                                            className="size-3"
                                        />
                                    ) : (
                                        <ArrowDown
                                            aria-hidden="true"
                                            className="size-3"
                                        />
                                    ))}
                                {n(Math.abs(change))}
                                {suffix}
                            </Badge>
                        )}
                    </dd>
                    <dd className="sr-only text-xs leading-normal text-muted-foreground sm:not-sr-only">
                        {description}
                    </dd>
                </dl>
            </CardContent>
        </Card>
    );
}

function NoData({ children }: { children: ReactNode }) {
    return (
        <p className="flex min-h-24 items-center justify-center px-2 text-center text-sm text-muted-foreground">
            {children}
        </p>
    );
}

export default function OperationalDashboardOverview({
    data,
    timezone,
}: {
    data: OperationalOverviewData;
    timezone: string;
}) {
    const form = useForm(data.filters);
    const [creating, setCreating] = useState(false);
    const [periodOpen, setPeriodOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const { summary } = data;
    const date = (value: string) =>
        new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timezone,
        }).format(new Date(value));
    const shortDate = (value: string) =>
        new Intl.DateTimeFormat('id-ID', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'UTC',
        }).format(new Date(`${value}T00:00:00Z`));
    const monitor = (query: Record<string, string | number> = {}) =>
        results.index.url({
            query: {
                date_from: data.filters.date_from,
                date_to: data.filters.date_thru,
                monitoring: 'pickup',
                ...query,
            },
        });
    const presetFrom = (days: number) => {
        const from = new Date(`${data.operational_date}T12:00:00Z`);
        from.setUTCDate(from.getUTCDate() - days + 1);
        return from.toISOString().slice(0, 10);
    };
    const activePreset =
        data.filters.date_thru === data.operational_date
            ? ([1, 7, 30]
                  .find((days) => presetFrom(days) === data.filters.date_from)
                  ?.toString() ?? '')
            : '';
    const preset = (value: string) => {
        if (!value) {
            return;
        }
        router.get(
            dashboard.url(),
            {
                date_from: presetFrom(Number(value)),
                date_thru: data.operational_date,
            },
            { preserveScroll: true },
        );
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
    const previousCompletion =
        summary.previous.tasks > 0 && summary.previous.picked_up != null
            ? (summary.previous.picked_up / summary.previous.tasks) * 100
            : null;
    const completionChange =
        summary.completion_rate != null && previousCompletion != null
            ? Math.round((summary.completion_rate - previousCompletion) * 10) /
              10
            : null;
    const shipmentRows =
        data.tracking?.statuses.map((row) => ({
            ...row,
            label: row.label ?? trackingLabels[row.key] ?? row.key,
            color: trackingColors[row.key],
        })) ?? [];
    const categoryRows = data.categories.map((row, index) => ({
        ...row,
        color: ['var(--primary)', 'var(--chart-2)', 'var(--chart-4)'][index],
    }));
    const comparisonRows = [
        ['tasks', 'Aktivitas pickup'],
        ['packages', 'Paket tercatat'],
        ['customers', 'Customer aktif'],
        ['attention', 'Perlu tindak lanjut'],
    ] as const;
    return (
        <PageContainer className="flex flex-col gap-3 space-y-0 py-4">
            <Head title="Dashboard operasional" />
            <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Dashboard operasional
                    </h1>
                    <p className="text-xs text-foreground/65">
                        Ringkasan aktivitas pickup, paket, dan pengiriman JNE.
                    </p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto">
                    <Dialog open={periodOpen} onOpenChange={setPeriodOpen}>
                        <DialogTrigger asChild>
                            <Button
                                variant="outline"
                                className="order-1 min-h-11 gap-2"
                            >
                                <CalendarDays
                                    aria-hidden="true"
                                    data-icon="inline-start"
                                />
                                <span className="text-xs">
                                    {shortDate(data.filters.date_from)} –{' '}
                                    {shortDate(data.filters.date_thru)}
                                </span>
                                <ChevronDown
                                    aria-hidden="true"
                                    data-icon="inline-end"
                                />
                                <span className="sr-only">
                                    Pilih periode dashboard
                                </span>
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Periode dashboard</DialogTitle>
                                <DialogDescription>
                                    Pilih rentang maksimal 31 hari.
                                </DialogDescription>
                            </DialogHeader>
                            <form
                                className="flex flex-col gap-4"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    form.get(dashboard.url(), {
                                        preserveState: true,
                                        preserveScroll: true,
                                        onSuccess: () => setPeriodOpen(false),
                                        onError: (errors) => {
                                            document
                                                .getElementById(
                                                    errors.date_from
                                                        ? 'overview-from'
                                                        : 'overview-thru',
                                                )
                                                ?.focus();
                                        },
                                    });
                                }}
                            >
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="overview-from">
                                        Dari tanggal
                                    </Label>
                                    <Input
                                        id="overview-from"
                                        name="date_from"
                                        type="date"
                                        required
                                        className="min-h-11"
                                        value={form.data.date_from}
                                        aria-invalid={!!form.errors.date_from}
                                        aria-describedby={
                                            form.errors.date_from
                                                ? 'overview-from-error'
                                                : undefined
                                        }
                                        onChange={(event) =>
                                            form.setData(
                                                'date_from',
                                                event.target.value,
                                            )
                                        }
                                    />
                                    {form.errors.date_from && (
                                        <p
                                            id="overview-from-error"
                                            role="alert"
                                            className="text-sm text-destructive"
                                        >
                                            {form.errors.date_from}
                                        </p>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="overview-thru">
                                        Sampai tanggal
                                    </Label>
                                    <Input
                                        id="overview-thru"
                                        name="date_thru"
                                        type="date"
                                        required
                                        className="min-h-11"
                                        min={form.data.date_from}
                                        value={form.data.date_thru}
                                        aria-invalid={!!form.errors.date_thru}
                                        aria-describedby={
                                            form.errors.date_thru
                                                ? 'overview-thru-error'
                                                : undefined
                                        }
                                        onChange={(event) =>
                                            form.setData(
                                                'date_thru',
                                                event.target.value,
                                            )
                                        }
                                    />
                                    {form.errors.date_thru && (
                                        <p
                                            id="overview-thru-error"
                                            role="alert"
                                            className="text-sm text-destructive"
                                        >
                                            {form.errors.date_thru}
                                        </p>
                                    )}
                                </div>
                                <Button
                                    disabled={form.processing}
                                    className="min-h-11"
                                >
                                    {form.processing
                                        ? 'Memuat…'
                                        : 'Terapkan periode'}
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>
                    <ToggleGroup
                        type="single"
                        value={activePreset}
                        onValueChange={preset}
                        aria-label="Periode cepat"
                        className="order-3 rounded-lg border bg-muted/50 p-0.5 xl:order-2"
                    >
                        {[
                            [1, 'Hari ini'],
                            [7, '7 hari'],
                            [30, '30 hari'],
                        ].map(([days, label]) => (
                            <ToggleGroupItem
                                key={days}
                                value={String(days)}
                                className="min-h-10 px-3 text-xs data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
                            >
                                {label}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                    <Button
                        variant="outline"
                        className="order-4 min-h-11 xl:order-3"
                        disabled={refreshing}
                        onClick={reload}
                    >
                        <RefreshCw
                            aria-hidden="true"
                            data-icon="inline-start"
                            className={cn(
                                refreshing &&
                                    'animate-spin motion-reduce:animate-none',
                            )}
                        />
                        <span>{refreshing ? 'Memuat…' : 'Segarkan data'}</span>
                    </Button>
                    <Button
                        className="order-2 min-h-11 xl:order-4"
                        onClick={() => setCreating(true)}
                    >
                        <Plus aria-hidden="true" data-icon="inline-start" />
                        Buat pickup
                    </Button>
                </div>
            </header>
            {error && (
                <Alert variant="destructive">
                    <TriangleAlert aria-hidden="true" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            <section
                aria-label="Ringkasan operasional"
                className="grid grid-cols-2 gap-3 xl:grid-cols-4"
            >
                <MetricCard
                    label="Aktivitas pickup"
                    value={n(summary.tasks)}
                    icon={Truck}
                    tone="primary"
                    description="Dibanding periode sebelumnya"
                    change={summary.changes.tasks}
                />
                <MetricCard
                    label="Paket tercatat"
                    value={n(summary.packages)}
                    icon={Package}
                    tone="package"
                    description="Dari seluruh pickup final"
                    change={summary.changes.packages}
                />
                <MetricCard
                    label="Pickup berhasil"
                    value={
                        summary.completion_rate == null
                            ? '—'
                            : `${n(summary.completion_rate)}%`
                    }
                    icon={CheckCircle2}
                    tone="success"
                    description={`${n(summary.picked_up)} dari ${n(summary.tasks)} aktivitas`}
                    change={completionChange}
                    suffix=" poin"
                />
                <MetricCard
                    label="Perlu tindak lanjut"
                    value={n(summary.attention)}
                    icon={TriangleAlert}
                    tone="warning"
                    description="Menunggu handover / selisih"
                    change={summary.changes.attention}
                    lowerIsBetter
                />
            </section>
            <div
                className={cn(
                    'grid min-w-0 gap-3',
                    data.tracking &&
                        'xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]',
                )}
            >
                <OperationalActivityChart daily={data.daily} />
                {data.tracking && (
                    <OperationalDonut
                        title="Status pengiriman JNE"
                        icon={ClipboardList}
                        totalLabel="Resi APEX"
                        data={shipmentRows}
                        action={
                            <DetailLink
                                href={tracking.customerDashboard.url({
                                    query: data.filters,
                                })}
                            >
                                Lihat detail
                            </DetailLink>
                        }
                    />
                )}
            </div>
            <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <OperationalDonut
                    title="Tipe pickup"
                    icon={Truck}
                    totalLabel="Pickup"
                    compact
                    data={data.types.map((row, index) => ({
                        ...row,
                        label: typeLabels[row.key] ?? row.key,
                        color: [
                            'var(--primary)',
                            'var(--chart-2)',
                            'var(--chart-4)',
                        ][index],
                    }))}
                />
                <OperationalDonut
                    title="Kategori paket final"
                    totalLabel="Paket"
                    compact
                    data={categoryRows}
                />
                <OperationalPanel
                    title="Performa petugas"
                    icon={Users}
                    className="md:col-span-2 xl:col-span-1"
                    action={
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="min-h-11 px-0 text-xs text-primary sm:h-8 sm:min-h-8"
                                >
                                    Lihat semua
                                    <ArrowRight
                                        aria-hidden="true"
                                        data-icon="inline-end"
                                    />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>Performa petugas</DialogTitle>
                                    <DialogDescription>
                                        Petugas dengan aktivitas terbanyak pada
                                        periode terpilih.
                                    </DialogDescription>
                                </DialogHeader>
                                {data.team.length > 0 && (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Petugas</TableHead>
                                                <TableHead>
                                                    Berhasil / aktivitas
                                                </TableHead>
                                                <TableHead>Rasio</TableHead>
                                                <TableHead>
                                                    Paket final
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {data.team.map((row) => (
                                                <TableRow key={row.id}>
                                                    <TableCell>
                                                        <Link
                                                            href={monitor({
                                                                staff_id:
                                                                    row.id,
                                                            })}
                                                            className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
                                                        >
                                                            {row.name}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>
                                                        {n(row.picked_up)} /{' '}
                                                        {n(row.tasks)}
                                                    </TableCell>
                                                    <TableCell>
                                                        {n(row.rate)}%
                                                    </TableCell>
                                                    <TableCell>
                                                        {n(row.packages)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                                {data.team.length === 0 && (
                                    <NoData>
                                        Belum ada penugasan pada periode ini.
                                    </NoData>
                                )}
                            </DialogContent>
                        </Dialog>
                    }
                >
                    {data.team.length === 0 && (
                        <NoData>Belum ada penugasan pada periode ini.</NoData>
                    )}
                    <div className="flex flex-col gap-3 py-1">
                        {data.team.slice(0, 3).map((row) => (
                            <Link
                                key={row.id}
                                href={monitor({ staff_id: row.id })}
                                className="flex min-h-11 flex-col justify-center gap-2 rounded-md outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="flex items-center gap-3 text-xs">
                                    <span className="min-w-0 flex-1 truncate">
                                        {row.name ?? 'Petugas'}
                                    </span>
                                    <span className="shrink-0 font-medium tabular-nums">
                                        {n(row.picked_up)} / {n(row.tasks)}
                                    </span>
                                    <span className="w-12 text-right tabular-nums">
                                        {n(row.rate)}%
                                    </span>
                                </span>
                                <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                                    <span
                                        className="block h-full rounded-full bg-primary"
                                        style={{
                                            width: `${Math.min(100, Math.max(0, row.rate))}%`,
                                        }}
                                    />
                                </span>
                            </Link>
                        ))}
                    </div>
                </OperationalPanel>
            </div>
            <div
                className={cn(
                    'grid min-w-0 gap-3 md:grid-cols-2',
                    data.tracking && 'xl:grid-cols-3',
                )}
            >
                <OperationalPanel
                    title="Perlu tindak lanjut"
                    icon={TriangleAlert}
                    action={<DetailLink href={monitor()} />}
                >
                    {data.attention.length === 0 ? (
                        <Alert className="my-2 border-0 bg-success/5 text-success">
                            <CheckCircle2 aria-hidden="true" />
                            <AlertDescription className="text-foreground">
                                Tidak ada pickup yang memerlukan tindak lanjut
                                pada periode ini.
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <div className="flex max-h-36 flex-col overflow-y-auto">
                            {data.attention.map((row) => (
                                <Link
                                    key={row.id}
                                    href={results.show.url(row.id)}
                                    className="flex min-h-14 items-center justify-between gap-3 border-b py-2 outline-none last:border-0 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <span className="flex min-w-0 flex-col gap-1">
                                        <span className="truncate text-xs font-medium">
                                            {row.customer_name}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {row.reason}
                                        </span>
                                    </span>
                                    <ArrowRight
                                        aria-hidden="true"
                                        className="size-4 shrink-0"
                                    />
                                </Link>
                            ))}
                        </div>
                    )}
                </OperationalPanel>
                <OperationalPanel title="5 customer dengan paket terbanyak">
                    <Table className="table-fixed text-xs">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="h-8 w-7 px-1">
                                    #
                                </TableHead>
                                <TableHead className="h-8 px-1">
                                    Customer
                                </TableHead>
                                <TableHead className="h-8 w-16 px-1 text-right">
                                    Paket
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.customers.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3}>
                                        <NoData>
                                            Belum ada paket pada periode ini.
                                        </NoData>
                                    </TableCell>
                                </TableRow>
                            )}
                            {data.customers.map((row, index) => (
                                <TableRow key={row.id}>
                                    <TableCell className="px-1 py-1.5 text-muted-foreground">
                                        {index + 1}
                                    </TableCell>
                                    <TableCell className="px-1 py-0">
                                        <Link
                                            href={monitor({
                                                customer_id: row.id,
                                            })}
                                            className="flex min-h-11 items-center outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring sm:min-h-6"
                                        >
                                            <span
                                                className="truncate"
                                                title={row.name}
                                            >
                                                {row.name}
                                            </span>
                                        </Link>
                                    </TableCell>
                                    <TableCell className="px-1 py-1.5 text-right font-medium tabular-nums">
                                        {n(row.packages)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </OperationalPanel>
                {data.tracking && (
                    <OperationalPanel
                        title="5 tujuan pengiriman terbanyak"
                        className="md:col-span-2 xl:col-span-1"
                    >
                        <Table className="table-fixed text-xs">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="h-8 w-7 px-1">
                                        #
                                    </TableHead>
                                    <TableHead className="h-8 px-1">
                                        Lokasi
                                    </TableHead>
                                    <TableHead className="h-8 w-14 px-1 text-right">
                                        Resi
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.tracking.destinations.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={3}>
                                            <NoData>
                                                Belum ada data tujuan
                                                pengiriman.
                                            </NoData>
                                        </TableCell>
                                    </TableRow>
                                )}
                                {data.tracking.destinations.map(
                                    (row, index) => (
                                        <TableRow key={row.code ?? 'unknown'}>
                                            <TableCell className="px-1 py-1.5 text-muted-foreground">
                                                {index + 1}
                                            </TableCell>
                                            <TableCell className="px-1 py-0">
                                                <Link
                                                    href={tracking.customerDashboard.url(
                                                        {
                                                            query: {
                                                                ...data.filters,
                                                                destination:
                                                                    row.code ??
                                                                    '',
                                                            },
                                                        },
                                                    )}
                                                    className="flex min-h-11 items-center outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring sm:min-h-6"
                                                >
                                                    <span
                                                        className="truncate"
                                                        title={row.name}
                                                    >
                                                        {row.name}
                                                    </span>
                                                </Link>
                                            </TableCell>
                                            <TableCell className="px-1 py-1.5 text-right font-medium tabular-nums">
                                                {n(row.value)}
                                            </TableCell>
                                        </TableRow>
                                    ),
                                )}
                            </TableBody>
                        </Table>
                    </OperationalPanel>
                )}
            </div>
            <OperationalPanel
                title="Aktivitas terbaru"
                action={<DetailLink href={monitor()} />}
            >
                <div className="hidden md:block">
                    <Table className="text-xs sm:[&_[data-slot=badge]]:py-0.5 sm:[&_td]:py-0.5 sm:[&_td:last-child]:py-0">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="h-8">Waktu</TableHead>
                                <TableHead className="h-8">Customer</TableHead>
                                <TableHead className="h-8">Petugas</TableHead>
                                <TableHead className="h-8 text-right">
                                    Paket
                                </TableHead>
                                <TableHead className="h-8">Status</TableHead>
                                <TableHead className="h-8 text-right">
                                    Aksi
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.recent.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6}>
                                        <NoData>
                                            Belum ada aktivitas pada periode
                                            ini.
                                        </NoData>
                                    </TableCell>
                                </TableRow>
                            )}
                            {data.recent.slice(0, 5).map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell className="whitespace-nowrap">
                                        {date(row.at)}
                                    </TableCell>
                                    <TableCell
                                        className="max-w-56 truncate"
                                        title={row.customer_name}
                                    >
                                        {row.customer_name}
                                    </TableCell>
                                    <TableCell className="max-w-40 truncate">
                                        {row.staff_name ?? 'Belum ditugaskan'}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.packages == null
                                            ? '—'
                                            : n(row.packages)}
                                    </TableCell>
                                    <TableCell>
                                        <StatusBadge status={row.status} />
                                    </TableCell>
                                    <TableCell className="py-0 text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-11 sm:size-6"
                                            asChild
                                        >
                                            <Link
                                                href={results.show.url(row.id)}
                                                aria-label={`Lihat pickup ${row.reference}`}
                                            >
                                                <ArrowRight aria-hidden="true" />
                                            </Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
                <div className="flex flex-col md:hidden">
                    {data.recent.slice(0, 5).map((row) => (
                        <Link
                            key={row.id}
                            href={results.show.url(row.id)}
                            className="flex min-w-0 flex-col gap-2 border-b py-3 outline-none last:border-0 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate text-sm font-medium">
                                    {row.customer_name}
                                </span>
                                <ArrowRight
                                    aria-hidden="true"
                                    className="size-4 shrink-0"
                                />
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {date(row.at)} ·{' '}
                                {row.staff_name ?? 'Belum ditugaskan'}
                            </span>
                            <span className="flex flex-wrap items-center justify-between gap-2">
                                <StatusBadge status={row.status} />
                                <span className="text-xs tabular-nums">
                                    {row.packages == null
                                        ? 'POP belum final'
                                        : `${n(row.packages)} paket`}
                                </span>
                            </span>
                        </Link>
                    ))}
                </div>
                {data.recent.length === 0 && (
                    <div className="md:hidden">
                        <NoData>Belum ada aktivitas pada periode ini.</NoData>
                    </div>
                )}
            </OperationalPanel>
            <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/65">
                <span>Data dimuat {date(data.observed_at)}</span>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-10 text-xs text-foreground/65"
                        >
                            <Info aria-hidden="true" data-icon="inline-start" />
                            Dasar data &amp; periode
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Dasar data &amp; periode</DialogTitle>
                            <DialogDescription>
                                Pickup 05.00–04.59 WIB. Pembanding{' '}
                                {opDate(data.previousPeriod.date_from)}–
                                {opDate(data.previousPeriod.date_thru)}.
                            </DialogDescription>
                        </DialogHeader>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            Periode mengikuti aktivitas pickup; pickup yang
                            belum dimulai mengikuti jadwal. Satu task dihitung
                            sekali. Jumlah paket berasal dari POP final dengan
                            koreksi terakhir. Tindak lanjut dihitung sekali per
                            task meskipun memiliki beberapa masalah.
                        </p>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Metrik</TableHead>
                                    <TableHead>Sebelumnya</TableHead>
                                    <TableHead>Periode ini</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {comparisonRows.map(([key, label]) => (
                                    <TableRow key={key}>
                                        <TableCell>{label}</TableCell>
                                        <TableCell className="tabular-nums">
                                            {n(summary.previous[key])}
                                        </TableCell>
                                        <TableCell className="tabular-nums">
                                            {n(summary[key])}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <section>
                                <h3 className="mb-3 text-sm font-medium">
                                    Status pickup
                                </h3>
                                <dl className="flex flex-col gap-2 text-sm">
                                    {data.statuses.map((row) => (
                                        <div
                                            key={row.key}
                                            className="flex justify-between gap-3"
                                        >
                                            <dt>
                                                {pickupLabels[row.key] ??
                                                    row.key}
                                            </dt>
                                            <dd className="tabular-nums">
                                                {n(row.value)}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </section>
                            <section>
                                <h3 className="mb-3 text-sm font-medium">
                                    Customer aktif
                                </h3>
                                <p className="text-sm">
                                    {n(summary.customers)} customer unik
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Baru {n(data.customerCohorts.new)} · Repeat{' '}
                                    {n(data.customerCohorts.returning)}.
                                    Customer repeat memiliki jadwal pickup
                                    sebelum awal periode.
                                </p>
                            </section>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Menunggu handover {n(summary.waiting_handover)} ·
                            Selisih penerimaan {n(summary.discrepancies)}.
                            Perubahan rasio pickup berhasil ditampilkan dalam
                            poin persentase.
                        </p>
                        {data.tracking && (
                            <p className="text-xs text-muted-foreground">
                                Snapshot pengiriman JNE menggunakan resi APEX
                                dan tanggal kirim kalender 00.00–23.59 WIB.
                                Status mengikuti report terakhir, diamati{' '}
                                {data.tracking.observed_at
                                    ? date(data.tracking.observed_at)
                                    : 'belum tersedia'}
                                .
                            </p>
                        )}
                    </DialogContent>
                </Dialog>
            </footer>
            <CreatePickupDialog
                open={creating}
                onOpenChange={setCreating}
                timezone={timezone}
                onCreated={reload}
            />
        </PageContainer>
    );
}

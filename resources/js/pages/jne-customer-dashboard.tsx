import { Head, Link, router, useForm } from '@inertiajs/react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import {
    ArrowDownRight,
    ArrowRight,
    ArrowUpRight,
    CheckCheck,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleHelp,
    Clock3,
    FileDown,
    FileText,
    Layers3,
    Package,
    RefreshCw,
    Scale,
    Undo2,
    Users,
    XCircle,
    type LucideIcon,
} from 'lucide-react';
import CustomerPicker from '@/components/customer-picker';
import {
    CustomerServerDetails,
    CustomerComparison,
    CustomerPendingAges,
    jneServerLabels,
} from '@/components/jne-customer-overview';
import PageContainer from '@/components/page-container';
import JneShipmentStatus from '@/components/jne-shipment-status';
import {
    CustomerDailyChart,
    CustomerRanking,
    dashboardMoney as money,
    dashboardNumber as number,
} from '@/components/jne-customer-charts';
import { OperationalPanel } from '@/components/operational-dashboard-charts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import * as routes from '@/routes/jne-monitoring';
import * as aliases from '@/routes/jne-shipper-aliases';
import * as reports from '@/routes/jne-reports';
import {
    jneTimestamp,
    matchLabels,
    trackingLabels,
} from '@/lib/jne-monitoring';
import { cn } from '@/lib/utils';
import type {
    CustomerDashboardFilters,
    CustomerDashboardProps,
} from '@/types/jne-customer-dashboard';

function DetailSection({
    title,
    icon: Icon,
    children,
    defaultOpen = false,
}: {
    title: string;
    icon: LucideIcon;
    children: ReactNode;
    defaultOpen?: boolean;
}) {
    return (
        <Collapsible defaultOpen={defaultOpen} className="group/section">
            <Card className="gap-0 py-0 shadow-none">
                <CardHeader className="px-4 py-1">
                    <h2>
                        <CollapsibleTrigger asChild>
                            <Button
                                variant="ghost"
                                className="min-h-12 w-full justify-between px-0"
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    <Icon
                                        className="text-primary"
                                        aria-hidden="true"
                                    />
                                    <span className="text-left whitespace-normal">
                                        {title}
                                    </span>
                                </span>
                                <ChevronDown
                                    className="transition-transform group-data-[state=open]/section:rotate-180 motion-reduce:transition-none"
                                    aria-hidden="true"
                                />
                            </Button>
                        </CollapsibleTrigger>
                    </h2>
                </CardHeader>
                <CollapsibleContent asChild>
                    <CardContent className="flex min-w-0 flex-col gap-4 px-4 pb-4">
                        {children}
                    </CardContent>
                </CollapsibleContent>
            </Card>
        </Collapsible>
    );
}

export default function JneCustomerDashboard({
    filters,
    selectedCustomer,
    timezone,
    summary,
    daily,
    destinations,
    services,
    statuses,
    shipments,
    servers,
    ages,
    comparison,
    selectedDestination,
}: CustomerDashboardProps) {
    const form = useForm(filters);
    const [customer, setCustomer] = useState(selectedCustomer);
    const [networkError, setNetworkError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const visit = (patch: Partial<CustomerDashboardFilters> = {}) =>
        router.get(
            routes.customerDashboard.url(),
            { ...filters, ...patch },
            {
                preserveScroll: true,
                preserveState: false,
                onNetworkError: () => {
                    setNetworkError(true);
                    return false;
                },
            },
        );
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
    const range = (days: number) => {
        const from = new Date(today + 'T00:00:00Z');
        from.setUTCDate(from.getUTCDate() - days + 1);
        return { date_from: from.toISOString().slice(0, 10), date_thru: today };
    };
    const selectedPreset =
        [7, 30, 90]
            .find(
                (days) =>
                    range(days).date_from === filters.date_from &&
                    filters.date_thru === today,
            )
            ?.toString() ?? 'custom';
    const percentage = (value: number) =>
        summary.shipments ? Math.round((value / summary.shipments) * 100) : 0;
    const metrics = [
        {
            label: 'Total resi',
            value: number(summary.shipments),
            detail: 'Resi terkonfirmasi di JNE',
            icon: FileText,
            tone: 'bg-primary/10 text-primary',
            change: comparison.shipment_change_percent,
        },
        {
            label: 'Amount APEX',
            value: money(summary.amount),
            detail:
                summary.amount_known +
                '/' +
                summary.shipments +
                ' resi memiliki amount' +
                (summary.amount_known < summary.shipments &&
                summary.amount_known > 0
                    ? ' · parsial'
                    : ''),
            icon: Package,
            tone: 'bg-warning/10 text-warning',
            change: null,
        },
        {
            label: 'Berhasil terkirim',
            value: number(summary.delivered),
            detail: 'Dari total resi',
            icon: CheckCheck,
            tone: 'bg-success/10 text-success',
            percent: percentage(summary.delivered),
            change: null,
        },
        {
            label: 'Belum selesai',
            value: number(summary.active),
            detail: 'Masih dalam proses / kendala',
            icon: Clock3,
            tone: 'bg-warning/10 text-warning',
            percent: percentage(summary.active),
            change: null,
        },
    ];
    const secondary = [
        {
            label: 'Berat kiriman',
            value:
                summary.weight_kg === null
                    ? 'Tidak tersedia'
                    : number(summary.weight_kg) + ' kg',
            detail:
                summary.weight_known +
                '/' +
                summary.shipments +
                ' resi memiliki berat',
            icon: Scale,
        },
        {
            label: 'Jumlah koli',
            value: summary.quantity_known
                ? number(summary.quantity)
                : 'Tidak tersedia',
            detail:
                summary.quantity_known +
                '/' +
                summary.shipments +
                ' resi memiliki jumlah koli',
            icon: Layers3,
        },
        {
            label: 'Dikembalikan',
            value: number(summary.returned),
            detail: 'Status retur dari JNE',
            icon: Undo2,
        },
        {
            label: 'Dibatalkan',
            value: number(summary.cancelled),
            detail: 'Status batal dari JNE',
            icon: XCircle,
        },
    ];
    const activeFilters =
        filters.service ||
        filters.destination ||
        filters.status ||
        filters.age !== 'all';
    const pages = Array.from(
        { length: Math.min(5, shipments.last_page) },
        (_, index) =>
            Math.max(
                1,
                Math.min(shipments.current_page - 2, shipments.last_page - 4),
            ) + index,
    );
    return (
        <PageContainer
            className="flex flex-col gap-3 space-y-0 py-4"
            style={
                {
                    '--muted-foreground':
                        'color-mix(in oklab, var(--foreground) 60%, var(--background))',
                    '--color-muted-foreground':
                        'color-mix(in oklab, var(--foreground) 60%, var(--background))',
                } as CSSProperties
            }
        >
            <Head title="Dashboard customer" />
            <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Dashboard customer
                    </h1>
                    <p className="text-xs text-muted-foreground">
                        Ringkasan pengiriman, resi, dan pemetaan customer.
                    </p>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button
                        variant="outline"
                        className="min-h-11 flex-1 sm:flex-none"
                        disabled={refreshing}
                        onClick={() => {
                            setNetworkError(false);
                            router.reload({
                                onStart: () => setRefreshing(true),
                                onFinish: () => setRefreshing(false),
                                onNetworkError: () => {
                                    setNetworkError(true);
                                    return false;
                                },
                            });
                        }}
                    >
                        <RefreshCw
                            className={cn(
                                refreshing &&
                                    'animate-spin motion-reduce:animate-none',
                            )}
                            data-icon="inline-start"
                            aria-hidden="true"
                        />
                        {refreshing ? 'Memuat…' : 'Segarkan data'}
                    </Button>
                    <Button asChild className="min-h-11 flex-1 sm:flex-none">
                        <Link href={reports.index.url()}>
                            <FileDown
                                data-icon="inline-start"
                                aria-hidden="true"
                            />
                            Tarik data JNE
                        </Link>
                    </Button>
                </div>
            </header>
            <section
                aria-label="Filter customer dan periode"
                className="flex flex-col gap-3 py-1"
            >
                <form
                    className="grid grid-cols-2 items-end gap-3 xl:grid-cols-[1.25fr_1fr_1fr_1.1fr_auto]"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setNetworkError(false);
                        form.get(routes.customerDashboard.url(), {
                            preserveState: false,
                            preserveScroll: true,
                            onError: (errors) => {
                                const first = Object.keys(errors)[0];
                                document
                                    .getElementById(
                                        (
                                            {
                                                customer_id:
                                                    'dashboard-customer',
                                                date_from: 'dashboard-from',
                                                date_thru: 'dashboard-thru',
                                                mapping: 'dashboard-mapping',
                                            } as Record<string, string>
                                        )[first],
                                    )
                                    ?.focus();
                            },
                            onNetworkError: () => {
                                setNetworkError(true);
                                return false;
                            },
                        });
                    }}
                >
                    <div className="col-span-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1">
                        <Label htmlFor="dashboard-customer">Customer</Label>
                        <CustomerPicker
                            selected={customer}
                            allowClear
                            triggerId="dashboard-customer"
                            placeholder="Semua customer"
                            invalid={!!form.errors.customer_id}
                            errorId="dashboard-customer-error"
                            onSelect={(value) => {
                                setCustomer(
                                    value
                                        ? {
                                              id: value.id,
                                              name: value.name,
                                              customer_code:
                                                  value.customer_code ?? null,
                                          }
                                        : null,
                                );
                                form.setData('customer_id', value?.id ?? null);
                                form.setData('mapping', 'all');
                            }}
                        />
                        {form.errors.customer_id && (
                            <p
                                id="dashboard-customer-error"
                                className="text-xs text-destructive"
                            >
                                {form.errors.customer_id}
                            </p>
                        )}
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label htmlFor="dashboard-from">Tanggal awal</Label>
                        <Input
                            id="dashboard-from"
                            type="date"
                            className="min-h-11"
                            required
                            value={form.data.date_from}
                            aria-invalid={!!form.errors.date_from}
                            aria-describedby={
                                form.errors.date_from
                                    ? 'dashboard-from-error'
                                    : undefined
                            }
                            onChange={(event) =>
                                form.setData('date_from', event.target.value)
                            }
                        />
                        {form.errors.date_from && (
                            <p
                                id="dashboard-from-error"
                                className="text-xs text-destructive"
                            >
                                {form.errors.date_from}
                            </p>
                        )}
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label htmlFor="dashboard-thru">Tanggal akhir</Label>
                        <Input
                            id="dashboard-thru"
                            type="date"
                            className="min-h-11"
                            required
                            min={form.data.date_from}
                            value={form.data.date_thru}
                            aria-invalid={!!form.errors.date_thru}
                            aria-describedby={
                                form.errors.date_thru
                                    ? 'dashboard-thru-error'
                                    : undefined
                            }
                            onChange={(event) =>
                                form.setData('date_thru', event.target.value)
                            }
                        />
                        {form.errors.date_thru && (
                            <p
                                id="dashboard-thru-error"
                                className="text-xs text-destructive"
                            >
                                {form.errors.date_thru}
                            </p>
                        )}
                    </div>
                    <div className="col-span-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1">
                        <Label htmlFor="dashboard-mapping">
                            Pemetaan customer
                        </Label>
                        <select
                            id="dashboard-mapping"
                            className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            value={form.data.mapping}
                            onChange={(event) => {
                                form.setData('mapping', event.target.value);
                                if (event.target.value !== 'all') {
                                    form.setData('customer_id', null);
                                    setCustomer(null);
                                }
                            }}
                            aria-invalid={!!form.errors.mapping}
                            aria-describedby={
                                form.errors.mapping
                                    ? 'dashboard-mapping-error'
                                    : undefined
                            }
                        >
                            <option value="all">Semua pemetaan</option>
                            <option value="matched">
                                Customer terkonfirmasi
                            </option>
                            <option value="unmapped">Belum terpetakan</option>
                            <option value="ambiguous">Pemetaan ambigu</option>
                            <option value="candidate">Kandidat customer</option>
                            <option value="conflict">Bukti bertentangan</option>
                        </select>
                        {form.errors.mapping && (
                            <p
                                id="dashboard-mapping-error"
                                className="text-xs text-destructive"
                            >
                                {form.errors.mapping}
                            </p>
                        )}
                    </div>
                    <Button
                        type="submit"
                        className="col-span-2 min-h-11 xl:col-span-1"
                        disabled={form.processing}
                    >
                        {form.processing ? 'Memuat…' : 'Terapkan filter'}
                    </Button>
                </form>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex max-w-full flex-wrap items-center gap-2">
                        <ToggleGroup
                            type="single"
                            size="sm"
                            variant="outline"
                            value={selectedPreset}
                            aria-label="Periode pengiriman"
                            onValueChange={(value) => {
                                if (!value) return;
                                if (value === 'custom') {
                                    document
                                        .getElementById('dashboard-from')
                                        ?.focus();
                                    return;
                                }
                                visit(range(Number(value)));
                            }}
                        >
                            <ToggleGroupItem
                                className="min-h-11 px-3"
                                value="7"
                            >
                                7 hari
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                className="min-h-11 px-3"
                                value="30"
                            >
                                30 hari
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                className="min-h-11 px-3"
                                value="90"
                            >
                                3 bulan
                            </ToggleGroupItem>
                            <ToggleGroupItem
                                className="min-h-11 px-3"
                                value="custom"
                            >
                                Kustom
                            </ToggleGroupItem>
                        </ToggleGroup>
                        <select
                            aria-label="Server resi"
                            className="h-11 max-w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            value={filters.server}
                            onChange={(event) =>
                                visit({ server: event.target.value })
                            }
                        >
                            <option value="all">Semua server</option>
                            {servers.map((server) => (
                                <option key={server.key} value={server.key}>
                                    {server.label} ({number(server.shipments)})
                                </option>
                            ))}
                        </select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Terakhir diperbarui:{' '}
                        {summary.last_observed_at
                            ? jneTimestamp(summary.last_observed_at, timezone) +
                              ' WIB'
                            : 'Belum tersedia'}
                    </p>
                </div>
                {networkError && (
                    <p role="alert" className="text-sm text-destructive">
                        Data gagal dimuat. Periksa koneksi lalu coba kembali.
                    </p>
                )}
                {activeFilters && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                            Rincian aktif:
                        </span>
                        {filters.service && (
                            <Badge variant="secondary">
                                Layanan {filters.service}
                            </Badge>
                        )}
                        {filters.destination && (
                            <Badge
                                variant="secondary"
                                className="max-w-full whitespace-normal"
                            >
                                {selectedDestination ?? filters.destination}
                            </Badge>
                        )}
                        {filters.status && (
                            <Badge variant="secondary">
                                {trackingLabels[filters.status]}
                            </Badge>
                        )}
                        {filters.age !== 'all' && (
                            <Badge variant="secondary">
                                Umur {filters.age === '14_plus' ? '14+' : '7+'}{' '}
                                hari
                            </Badge>
                        )}
                        <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-11"
                            onClick={() =>
                                visit({
                                    service: '',
                                    destination: '',
                                    status: '',
                                    age: 'all',
                                })
                            }
                        >
                            Hapus rincian
                        </Button>
                    </div>
                )}
            </section>
            <section
                aria-label="Ringkasan pengiriman"
                className="grid grid-cols-2 gap-3 xl:grid-cols-4"
            >
                {metrics.map(
                    ({
                        label,
                        value,
                        detail,
                        icon: Icon,
                        tone,
                        percent,
                        change,
                    }) => (
                        <Card
                            key={label}
                            className="gap-0 py-4 shadow-none sm:py-5"
                        >
                            <CardContent className="flex min-w-0 items-start gap-3 px-3 sm:gap-4 sm:px-4">
                                <span
                                    className={cn(
                                        'flex size-8 shrink-0 items-center justify-center rounded-xl sm:size-12',
                                        tone,
                                    )}
                                >
                                    <Icon
                                        className="size-5 sm:size-6"
                                        aria-hidden="true"
                                    />
                                </span>
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                    <p className="text-xs text-muted-foreground">
                                        {label}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <p
                                            className={cn(
                                                'font-semibold tracking-tight break-words tabular-nums',
                                                label === 'Amount APEX'
                                                    ? 'text-base sm:text-xl'
                                                    : 'text-2xl sm:text-3xl',
                                            )}
                                        >
                                            {value}
                                        </p>
                                        {percent !== undefined && (
                                            <Badge variant="secondary">
                                                {percent}%
                                            </Badge>
                                        )}
                                        {change !== null && (
                                            <span
                                                className={cn(
                                                    'flex items-center gap-1 rounded-full px-2 py-1 text-xs tabular-nums',
                                                    change >= 0
                                                        ? 'bg-success/10 text-success'
                                                        : 'bg-muted text-muted-foreground',
                                                )}
                                                title="Perubahan jumlah resi dibanding periode sebelumnya"
                                            >
                                                {change >= 0 ? (
                                                    <ArrowUpRight
                                                        className="size-3"
                                                        aria-hidden="true"
                                                    />
                                                ) : (
                                                    <ArrowDownRight
                                                        className="size-3"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                {number(Math.abs(change))}%
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs leading-5 text-muted-foreground">
                                        {detail}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ),
                )}
            </section>
            {(summary.unmapped > 0 || summary.undated > 0) && (
                <Alert>
                    <CircleHelp aria-hidden="true" />
                    <AlertTitle>Cakupan data perlu diperiksa</AlertTitle>
                    <AlertDescription>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p>
                                {number(summary.unmapped)} resi belum
                                terkonfirmasi customernya ·{' '}
                                {number(summary.ambiguous)} ambigu ·{' '}
                                {number(summary.candidates ?? 0)} kandidat ·{' '}
                                {number(summary.conflicts ?? 0)} konflik.
                                {summary.undated > 0 &&
                                    ' ' +
                                        number(summary.undated) +
                                        ' resi tanpa tanggal kirim tidak masuk periode.'}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {summary.unmapped > 0 && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="min-h-11"
                                        onClick={() =>
                                            visit({
                                                customer_id: null,
                                                mapping: 'unmapped',
                                            })
                                        }
                                    >
                                        <Users
                                            data-icon="inline-start"
                                            aria-hidden="true"
                                        />
                                        Periksa pemetaan
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="min-h-11"
                                    asChild
                                >
                                    <Link href={aliases.index.url()}>
                                        Kelola nama pengirim
                                        <ArrowUpRight
                                            data-icon="inline-end"
                                            aria-hidden="true"
                                        />
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </AlertDescription>
                </Alert>
            )}
            {summary.shipments === 0 && (
                <Alert>
                    <Package aria-hidden="true" />
                    <AlertTitle>Belum ada kiriman pada pilihan ini</AlertTitle>
                    <AlertDescription>
                        Ubah customer, perluas periode, atau periksa pemetaan
                        nama pengirim.
                    </AlertDescription>
                </Alert>
            )}
            <div className="grid gap-3 xl:grid-cols-[1.8fr_1fr]">
                <CustomerDailyChart
                    key={JSON.stringify(filters)}
                    days={daily}
                />
                <CustomerPendingAges
                    summary={summary}
                    ages={ages}
                    selected={filters.age}
                    onSelect={(age) => visit({ age })}
                />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
                <CustomerRanking
                    title="Tujuan pengiriman"
                    kind="destination"
                    rows={destinations}
                    total={summary.shipments}
                    onSelect={(destination) => visit({ destination })}
                />
                <CustomerRanking
                    title="Layanan yang digunakan"
                    kind="service"
                    rows={services}
                    total={summary.shipments}
                    onSelect={(service) => visit({ service })}
                />
            </div>
            <OperationalPanel
                title="Detail resi terbaru"
                icon={FileText}
                contentClassName="flex flex-col gap-3 pt-2"
                action={
                    <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
                        asChild
                    >
                        <Link
                            href={routes.index.url({
                                query: {
                                    customer_id: filters.customer_id,
                                    status: filters.status,
                                },
                            })}
                        >
                            Daftar pengiriman
                            <ArrowRight
                                data-icon="inline-end"
                                aria-hidden="true"
                            />
                        </Link>
                    </Button>
                }
            >
                <p className="text-xs text-muted-foreground">
                    Terbaru berdasarkan tanggal kirim.
                </p>
                <div className="hidden min-w-0 lg:block [&_[data-slot=table-container]]:max-h-[420px] [&_[data-slot=table-container]]:overflow-y-auto">
                    <Table className="text-xs">
                        <TableHeader className="sticky top-0 bg-card">
                            <TableRow>
                                <TableHead>Resi / Customer</TableHead>
                                <TableHead>Tanggal kirim</TableHead>
                                <TableHead>Tujuan JNE</TableHead>
                                <TableHead>Layanan</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">
                                    Amount APEX
                                </TableHead>
                                <TableHead className="text-right">
                                    Berat
                                </TableHead>
                                <TableHead>Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {shipments.data.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <Link
                                            href={routes.show.url(row.id)}
                                            className="inline-flex min-h-6 items-center font-medium underline-offset-4 hover:underline"
                                        >
                                            {row.awb}
                                        </Link>
                                        <p
                                            className="max-w-48 truncate text-xs text-muted-foreground"
                                            title={
                                                (row.customer_name ??
                                                    'Belum terpetakan') +
                                                ' · ' +
                                                row.customer_account
                                            }
                                        >
                                            {row.customer_name ??
                                                'Belum terpetakan'}
                                        </p>
                                        {row.customer_match_status !==
                                            'MATCHED' && (
                                            <p className="text-xs text-warning">
                                                {matchLabels[
                                                    row.customer_match_status
                                                ] ?? 'Belum dikonfirmasi'}
                                            </p>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {jneTimestamp(row.entry_at, timezone)}
                                    </TableCell>
                                    <TableCell
                                        className="max-w-48 truncate"
                                        title={row.destination ?? undefined}
                                    >
                                        {row.destination_name ??
                                            row.destination ??
                                            'Tidak tersedia'}
                                    </TableCell>
                                    <TableCell>{row.service ?? '—'}</TableCell>
                                    <TableCell>
                                        <JneShipmentStatus
                                            status={row.tracking_status}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.amount === null
                                            ? '—'
                                            : money(row.amount)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.weight_kg === null
                                            ? '—'
                                            : number(row.weight_kg) + ' kg'}
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            className="min-h-9"
                                            asChild
                                        >
                                            <Link
                                                href={routes.show.url(row.id)}
                                                aria-label={
                                                    'Lihat resi ' + row.awb
                                                }
                                            >
                                                Lihat
                                            </Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {shipments.data.length === 0 && (
                                <TableRow>
                                    <TableCell
                                        colSpan={8}
                                        className="h-24 text-center text-muted-foreground"
                                    >
                                        Tidak ada resi yang sesuai filter.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
                <div className="flex max-h-[520px] flex-col overflow-y-auto lg:hidden">
                    {shipments.data.map((row) => (
                        <article
                            key={row.id}
                            className="flex flex-col gap-2 border-b py-3 last:border-0"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <Link
                                        href={routes.show.url(row.id)}
                                        className="inline-flex min-h-11 items-center text-sm font-medium text-primary"
                                    >
                                        {row.awb}
                                    </Link>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {row.customer_name ??
                                            'Belum terpetakan'}
                                    </p>
                                </div>
                                <JneShipmentStatus
                                    status={row.tracking_status}
                                />
                            </div>
                            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                                <span>
                                    {jneTimestamp(row.entry_at, timezone)}
                                </span>
                                <span>
                                    {row.service ?? 'Tanpa layanan'} ·{' '}
                                    {jneServerLabels[row.server] ?? 'Lainnya'}
                                </span>
                            </div>
                            <p className="text-xs">
                                {row.destination_name ??
                                    row.destination ??
                                    'Tujuan belum tersedia'}
                            </p>
                            {row.customer_match_status !== 'MATCHED' && (
                                <p className="text-xs text-warning">
                                    {matchLabels[row.customer_match_status] ??
                                        'Belum dikonfirmasi'}
                                </p>
                            )}
                            <div className="flex items-center justify-between gap-2 text-xs">
                                <span>
                                    Amount{' '}
                                    {row.amount === null
                                        ? '—'
                                        : money(row.amount)}
                                </span>
                                <span>
                                    {row.weight_kg === null
                                        ? 'Berat —'
                                        : number(row.weight_kg) + ' kg'}
                                </span>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="min-h-11"
                                    asChild
                                >
                                    <Link
                                        href={routes.show.url(row.id)}
                                        aria-label={'Lihat resi ' + row.awb}
                                    >
                                        Lihat
                                    </Link>
                                </Button>
                            </div>
                        </article>
                    ))}
                    {shipments.data.length === 0 && (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            Tidak ada resi yang sesuai filter.
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                        Menampilkan {shipments.from ?? 0}–{shipments.to ?? 0}{' '}
                        dari {number(shipments.total)} resi
                    </p>
                    <nav
                        aria-label="Halaman resi"
                        className="flex flex-wrap items-center gap-1"
                    >
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-10"
                            aria-label="Halaman sebelumnya"
                            disabled={shipments.current_page <= 1}
                            onClick={() =>
                                router.get(
                                    routes.customerDashboard.url(),
                                    {
                                        ...filters,
                                        page: shipments.current_page - 1,
                                    },
                                    {
                                        preserveScroll: true,
                                        preserveState: true,
                                        only: ['shipments'],
                                    },
                                )
                            }
                        >
                            <ChevronLeft aria-hidden="true" />
                        </Button>
                        {pages.map((page) => (
                            <Button
                                key={page}
                                variant={
                                    page === shipments.current_page
                                        ? 'default'
                                        : 'outline'
                                }
                                size="icon"
                                className="size-10"
                                aria-current={
                                    page === shipments.current_page
                                        ? 'page'
                                        : undefined
                                }
                                aria-label={'Halaman ' + page}
                                onClick={() =>
                                    router.get(
                                        routes.customerDashboard.url(),
                                        { ...filters, page },
                                        {
                                            preserveScroll: true,
                                            preserveState: true,
                                            only: ['shipments'],
                                        },
                                    )
                                }
                            >
                                {page}
                            </Button>
                        ))}
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-10"
                            aria-label="Halaman berikutnya"
                            disabled={
                                shipments.current_page >= shipments.last_page
                            }
                            onClick={() =>
                                router.get(
                                    routes.customerDashboard.url(),
                                    {
                                        ...filters,
                                        page: shipments.current_page + 1,
                                    },
                                    {
                                        preserveScroll: true,
                                        preserveState: true,
                                        only: ['shipments'],
                                    },
                                )
                            }
                        >
                            <ChevronRight aria-hidden="true" />
                        </Button>
                    </nav>
                </div>
            </OperationalPanel>
            <DetailSection
                title="Rincian volume, status & perbandingan"
                icon={Users}
                defaultOpen
            >
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {secondary.map(({ label, value, detail, icon: Icon }) => (
                        <div
                            key={label}
                            className="flex min-w-0 items-start gap-3 rounded-lg border p-3"
                        >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                <Icon className="size-4" aria-hidden="true" />
                            </span>
                            <dl className="min-w-0">
                                <dt className="text-xs text-muted-foreground">
                                    {label}
                                </dt>
                                <dd className="mt-1">
                                    <span className="text-sm font-semibold tabular-nums">
                                        {value}
                                    </span>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {detail}
                                    </p>
                                </dd>
                            </dl>
                        </div>
                    ))}
                </div>
                <details>
                    <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">
                        Lihat perbandingan periode dan rincian server
                    </summary>
                    <div className="flex flex-col gap-3">
                        <CustomerComparison comparison={comparison} />
                        <CustomerServerDetails servers={servers} />
                        <p className="text-xs text-muted-foreground">
                            {number(summary.mapped)} AWB memiliki customer
                            terkonfirmasi ·{' '}
                            {number(summary.pickup_matched ?? 0)} AWB memiliki
                            pickup terkonfirmasi.{' '}
                            <Link
                                href={routes.reconciliation.url()}
                                className="text-primary underline"
                            >
                                Lihat rekonsiliasi POP
                            </Link>
                            .
                        </p>
                    </div>
                </details>
            </DetailSection>
            <DetailSection title="Status pengiriman" icon={Clock3} defaultOpen>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">
                            Rata-rata waktu kirim
                        </p>
                        <p className="mt-1 text-sm font-semibold">
                            {summary.average_delivery_hours === null
                                ? 'Tidak tersedia'
                                : number(
                                      Math.round(
                                          (summary.average_delivery_hours /
                                              24) *
                                              10,
                                      ) / 10,
                                  ) + ' hari'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Waktu entry sampai penyerahan; data tersedia untuk{' '}
                            {summary.delivery_known}/{summary.delivered} resi
                            terkirim.
                        </p>
                    </div>
                    <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">
                            Rata-rata amount
                        </p>
                        <p className="mt-1 text-sm font-semibold">
                            {money(summary.average_amount)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Rata-rata hanya memakai resi dengan amount APEX.
                        </p>
                    </div>
                </div>
                {statuses.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {statuses.map((row) => (
                            <Button
                                key={row.label}
                                variant="outline"
                                size="sm"
                                className="min-h-11"
                                onClick={() => visit({ status: row.label })}
                            >
                                <JneShipmentStatus status={row.label} />
                                <span className="tabular-nums">
                                    {number(row.shipments)}
                                </span>
                            </Button>
                        ))}
                    </div>
                )}
            </DetailSection>
            <details className="rounded-lg border bg-card px-4 text-xs leading-relaxed text-muted-foreground">
                <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground">
                    Tentang data dashboard
                </summary>
                <div className="flex flex-col gap-2 pb-4">
                    <p>
                        Amount berasal dari kolom AMOUNT APEX untuk seluruh
                        status, termasuk dibatalkan. Nilai ini bukan tagihan
                        final atau pembayaran diterima. Nilai kosong berbeda
                        dari nol.
                    </p>
                    <p>
                        {number(summary.destination_named)}/
                        {number(summary.shipments)} resi memiliki referensi nama
                        daerah pada {number(summary.destination_count)} kode
                        tujuan. Nama mengikuti lokasi penyerahan report JNE;
                        varian nama untuk kode yang sama tetap dipertahankan.
                    </p>
                    <p>
                        Setiap account + AWB dihitung sekali berdasarkan
                        snapshot terbaru. Pemetaan customer mengikuti bukti yang
                        tersimpan. Resi tanpa tanggal kirim tidak masuk agregat
                        periode. Server mengikuti awalan AWB: 0101 untuk PM,
                        0166 untuk Puman, CGKEC/CSS01 untuk CSS/Orion; awalan
                        lain masuk Lainnya.
                    </p>
                </div>
            </details>
        </PageContainer>
    );
}

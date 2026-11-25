import { Link, router, useForm } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import {
    CalendarDays,
    CheckCircle2,
    Clock3,
    Package,
    RefreshCw,
    Truck,
    TriangleAlert,
    CircleAlert,
} from 'lucide-react';
import DateRangeFields from '@/components/date-range-fields';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    monitoringDateInput,
    monitoringPeriodLabel,
} from '@/lib/shipment-monitoring';
import PageHeader from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { jneTimestamp } from '@/lib/jne-monitoring';
import { attention, index, overview } from '@/routes/shipment-monitoring';
import type {
    MonitoringSummary,
    TrackingShipment,
} from '@/types/shipment-monitoring';
import type { TrackingFilters } from '@/lib/shipment-monitoring';
import { cn } from '@/lib/utils';
import { slaLabels } from '@/lib/shipment-monitoring';

export function MonitoringPeriod({
    filters,
    current,
    busy,
}: {
    filters: Partial<TrackingFilters>;
    current: 'overview' | 'shipments' | 'attention';
    busy: boolean;
}) {
    const [open, setOpen] = useState(false);
    const form = useForm({
        date_from: monitoringDateInput(filters.date_from ?? ''),
        date_thru: monitoringDateInput(filters.date_thru ?? '', true),
    });
    useEffect(() => {
        form.setData({
            date_from: monitoringDateInput(filters.date_from ?? ''),
            date_thru: monitoringDateInput(filters.date_thru ?? '', true),
        });
    }, [filters.date_from, filters.date_thru]);
    const endpoint = { overview, shipments: index, attention }[current];
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className="min-h-11 max-w-full"
                    disabled={busy}
                    aria-label="Periode entry AWB"
                    title={monitoringPeriodLabel(
                        filters.date_from,
                        filters.date_thru,
                    )}
                >
                    <CalendarDays aria-hidden="true" />
                    <span className="max-w-64 truncate">
                        {monitoringPeriodLabel(
                            filters.date_from,
                            filters.date_thru,
                        )}{' '}
                        · WIB
                    </span>
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Periode entry AWB</DialogTitle>
                    <DialogDescription>
                        Pilih tanggal dan jam dalam WIB. Rentang awal mencakup
                        14 hari operasional terakhir.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="flex min-w-0 flex-col gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.transform((values) => ({
                            ...filters,
                            ...values,
                            page: 1,
                        }));
                        form.get(endpoint.url(), {
                            preserveScroll: true,
                            preserveState: true,
                            onSuccess: () => setOpen(false),
                            onError: () =>
                                requestAnimationFrame(() =>
                                    document
                                        .querySelector<HTMLElement>(
                                            '[aria-invalid="true"]',
                                        )
                                        ?.focus(),
                                ),
                        });
                    }}
                >
                    <DateRangeFields
                        id={'monitoring-period-' + current}
                        type="datetime-local"
                        label="Tanggal dan jam · WIB"
                        from={form.data.date_from}
                        thru={form.data.date_thru}
                        onFromChange={(value) =>
                            form.setData('date_from', value)
                        }
                        onThruChange={(value) =>
                            form.setData('date_thru', value)
                        }
                        fromError={form.errors.date_from}
                        thruError={form.errors.date_thru}
                        disabled={form.processing}
                        required
                    />
                    <div className="flex flex-wrap justify-between gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={form.processing}
                            onClick={() => {
                                setOpen(false);
                                router.get(
                                    endpoint.url(),
                                    {
                                        ...filters,
                                        date_from: undefined,
                                        date_thru: undefined,
                                        page: 1,
                                    },
                                    { preserveScroll: true },
                                );
                            }}
                        >
                            14 hari terakhir
                        </Button>
                        <Button disabled={form.processing}>
                            {form.processing ? 'Memuat…' : 'Terapkan periode'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function ShipmentSla({ status = 'UNKNOWN' }: { status?: string }) {
    const variant =
        status === 'OVER_SLA' || status === 'DELIVERED_LATE'
            ? 'destructive'
            : status === 'POTENTIAL_OVERDUE'
              ? 'warning'
              : status === 'ON_TIME' || status === 'DELIVERED_ON_TIME'
                ? 'success'
                : 'secondary';
    return (
        <Badge variant={variant}>
            {status === 'POTENTIAL_OVERDUE'
                ? 'Indikasi Over SLA'
                : (slaLabels[status] ?? slaLabels.UNKNOWN)}
        </Badge>
    );
}

export const trackingNumber = (value: number = 0) =>
    new Intl.NumberFormat('id-ID').format(value);

export function MonitoringNavigation({
    current,
    filters = {},
}: {
    current: 'overview' | 'shipments' | 'attention';
    filters?: Partial<TrackingFilters>;
}) {
    const query = {
        date_from: filters.date_from,
        date_thru: filters.date_thru,
        freshness_hours: filters.freshness_hours,
    };
    return (
        <nav
            aria-label="Tampilan monitoring"
            className="flex flex-wrap gap-1 border-b"
        >
            {(
                [
                    ['overview', 'Ringkasan', overview({ query })],
                    ['shipments', 'Semua resi', index({ query })],
                    ['attention', 'Perlu perhatian', attention({ query })],
                ] as const
            ).map(([key, label, href]) => (
                <Link
                    key={key}
                    href={href}
                    aria-current={current === key ? 'page' : undefined}
                    className={cn(
                        'inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring',
                        current === key
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground',
                    )}
                >
                    {label}
                </Link>
            ))}
        </nav>
    );
}

export function MonitoringHeader({
    title,
    description,
    observedAt,
    calculatedAt,
    timezone,
    busy,
    refresh,
    children,
}: {
    title: string;
    description: string;
    observedAt: string | null;
    calculatedAt?: string;
    timezone: string;
    busy: boolean;
    refresh: () => void;
    children?: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-2">
            <PageHeader
                title={title}
                description={
                    <span className="hidden sm:inline">{description}</span>
                }
                actions={
                    <>
                        {children}
                        <Button
                            disabled={busy}
                            onClick={refresh}
                            className="min-h-11"
                            aria-label="Muat ulang data tersimpan"
                        >
                            <RefreshCw
                                aria-hidden="true"
                                className={cn(
                                    busy &&
                                        'animate-spin motion-reduce:animate-none',
                                )}
                            />
                            {busy ? 'Memuat…' : 'Muat ulang'}
                        </Button>
                    </>
                }
            />
            <p className="text-xs text-muted-foreground sm:text-right">
                Pengamatan terbaru:{' '}
                {observedAt
                    ? jneTimestamp(observedAt, timezone)
                    : 'Belum tersedia'}{' '}
                · SLA per snapshot sumber
                {calculatedAt && (
                    <>
                        {' '}
                        · Ringkasan dihitung{' '}
                        {jneTimestamp(calculatedAt, timezone)}
                    </>
                )}
                <span className="sr-only">
                    . Muat ulang membaca database aplikasi, bukan meminta
                    tracking langsung ke JNE.
                </span>
            </p>
        </div>
    );
}

export function CustomerLinkage({ shipment }: { shipment: TrackingShipment }) {
    return shipment.customer ? (
        <span
            className="block max-w-64 truncate"
            title={shipment.customer.name}
        >
            {shipment.customer.name}
        </span>
    ) : (
        <Badge variant="secondary" className="font-normal">
            Belum Terhubung
        </Badge>
    );
}

export function MonitoringKpis({
    summary,
    filters,
}: {
    summary: MonitoringSummary;
    filters: Partial<TrackingFilters>;
}) {
    const metrics = [
        [
            'Total Resi',
            summary.total,
            Package,
            {},
            'bg-primary/10 text-primary',
        ],
        [
            'Pengiriman Aktif',
            summary.active,
            Truck,
            { lifecycle: 'active' },
            'bg-primary/10 text-primary',
        ],
        [
            'Terkirim',
            summary.delivered,
            CheckCircle2,
            { status: 'DELIVERED' },
            'bg-success/10 text-success',
        ],
        [
            'Aktif Over SLA',
            summary.over_sla,
            TriangleAlert,
            { sla_status: 'OVER_SLA' },
            'bg-destructive/10 text-destructive',
        ],
        [
            'Indikasi Over SLA',
            summary.potential_overdue,
            Clock3,
            { attention: 'potential_overdue' },
            'bg-warning/10 text-warning',
        ],
        [
            'Kendala Pengiriman',
            summary.exception,
            CircleAlert,
            { status: 'EXCEPTION' },
            'bg-chart-4/10 text-chart-4',
        ],
    ] as const;
    return (
        <section
            aria-label="Ringkasan resi"
            className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6"
        >
            {metrics.map(([label, value, Icon, query, tone]) => (
                <Link
                    key={label}
                    href={index({ query: { ...filters, ...query } })}
                    className="flex min-w-0 items-start gap-2 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <span
                        className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-lg',
                            tone,
                        )}
                    >
                        <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2">
                            <p className="text-2xl font-semibold tabular-nums">
                                {trackingNumber(value)}
                            </p>
                            {(label === 'Pengiriman Aktif' ||
                                label === 'Terkirim') && (
                                <p className="text-xs text-muted-foreground tabular-nums">
                                    {new Intl.NumberFormat('id-ID', {
                                        style: 'percent',
                                        maximumFractionDigits: 1,
                                    }).format(
                                        summary.total
                                            ? value / summary.total
                                            : 0,
                                    )}
                                </p>
                            )}
                        </div>
                    </div>
                </Link>
            ))}
        </section>
    );
}

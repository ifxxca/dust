import { Link } from '@inertiajs/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
    ArrowRight,
    ArrowUpRight,
    Package,
    CheckCheck,
    Truck,
    RotateCcw,
    AlertTriangle,
    ScanSearch,
    Info,
    MessageSquareText,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    performanceDrilldown,
    performanceNumber as number,
} from '@/lib/operational-performance';
import { trackingLabels } from '@/lib/jne-monitoring';
import { cn } from '@/lib/utils';
import { show, attention } from '@/routes/shipment-monitoring';
import type {
    PerformanceData,
    PerformanceFilters,
    PerformanceReason,
} from '@/types/operational-performance';

type ContentProps = {
    performance: PerformanceData;
    filters: PerformanceFilters;
};

function Section({
    id,
    title,
    children,
    action,
}: {
    id: string;
    title: string;
    children: ReactNode;
    action?: ReactNode;
}) {
    return (
        <section
            id={id}
            aria-labelledby={id + '-title'}
            className="flex min-w-0 scroll-mt-5 flex-col gap-3"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2
                    id={id + '-title'}
                    className="text-lg font-semibold tracking-tight"
                >
                    {title}
                </h2>
                {action}
            </div>
            {children}
        </section>
    );
}

function Panel({
    title,
    children,
    action,
    className,
}: {
    title: string;
    children: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <Card
            className={cn(
                'min-w-0 gap-0 overflow-hidden py-0 shadow-none',
                className,
            )}
        >
            <CardHeader className="flex min-h-14 flex-row items-center justify-between gap-3 border-b px-4 py-3">
                <CardTitle>
                    <h3 className="text-sm font-semibold">{title}</h3>
                </CardTitle>
                {action}
            </CardHeader>
            <CardContent className="min-w-0 p-4">{children}</CardContent>
        </Card>
    );
}

function InfoDialog({
    title,
    description,
    children,
    label = 'Definisi',
}: {
    title: string;
    description: string;
    children?: ReactNode;
    label?: string;
}) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 gap-1.5 text-xs text-muted-foreground"
                    aria-label={title}
                >
                    <Info aria-hidden="true" />
                    {label}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                {children}
            </DialogContent>
        </Dialog>
    );
}

export function PerformanceKpis({
    performance: { summary },
    filters,
}: ContentProps) {
    const items = [
        {
            label: 'Total AWB',
            value: summary.total,
            href: performanceDrilldown(filters),
            icon: Package,
            tone: 'primary',
        },
        {
            label: 'Delivered',
            value: summary.delivered,
            href: performanceDrilldown(filters, { status: 'DELIVERED' }),
            icon: CheckCheck,
            tone: 'success',
        },
        {
            label: 'Active / Non-terminal',
            value: summary.active,
            href: performanceDrilldown(filters, { lifecycle: 'active' }),
            icon: Truck,
            tone: 'neutral',
        },
        {
            label: 'Return',
            value: summary.returned,
            href: performanceDrilldown(filters, { status: 'RETURNED' }),
            icon: RotateCcw,
            tone: 'neutral',
        },
        {
            label: 'Exceptions',
            value: summary.exceptions,
            href: performanceDrilldown(filters, { status: 'EXCEPTION' }),
            icon: AlertTriangle,
            tone: 'warning',
        },
        {
            label: 'AWB perlu ditinjau',
            value: summary.attention,
            href: performanceDrilldown(filters, { attention: 'all' }),
            icon: ScanSearch,
            tone: 'warning',
        },
    ];
    return (
        <div
            id="overview"
            className="grid scroll-mt-5 grid-cols-2 gap-3 lg:grid-cols-3"
        >
            {items.map(({ icon: Icon, ...item }) => (
                <Link
                    key={item.label}
                    href={item.href}
                    aria-label={item.label + ': ' + number(item.value) + ' AWB'}
                    className="group min-w-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                    <Card
                        className={cn(
                            'h-full gap-2 py-3 shadow-none transition-colors group-hover:border-primary/40 sm:py-4',
                            item.tone === 'primary' &&
                                'border-primary bg-primary text-primary-foreground',
                        )}
                    >
                        <CardHeader className="flex flex-row items-center justify-between gap-2 px-4">
                            <CardTitle
                                className={cn(
                                    'text-xs leading-5 font-medium',
                                    item.tone === 'primary'
                                        ? 'text-primary-foreground/85'
                                        : 'text-muted-foreground',
                                )}
                            >
                                {item.label}
                            </CardTitle>
                            <Icon
                                aria-hidden="true"
                                className={cn(
                                    'hidden size-4 shrink-0 sm:block',
                                    item.tone === 'primary'
                                        ? 'text-primary-foreground/70'
                                        : item.tone === 'success'
                                          ? 'text-success'
                                          : item.tone === 'warning'
                                            ? 'text-warning'
                                            : 'text-muted-foreground',
                                )}
                            />
                        </CardHeader>
                        <CardContent className="flex items-end justify-between gap-2 px-4">
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl leading-9 font-semibold tracking-tight tabular-nums sm:text-4xl">
                                    {number(item.value)}
                                </span>
                                <span
                                    className={cn(
                                        'text-xs',
                                        item.tone === 'primary'
                                            ? 'text-primary-foreground/65'
                                            : 'text-muted-foreground',
                                    )}
                                >
                                    AWB
                                </span>
                            </div>
                            <ArrowUpRight
                                aria-hidden="true"
                                className={cn(
                                    'size-4 shrink-0 opacity-40 transition-opacity group-hover:opacity-100',
                                    item.tone === 'primary'
                                        ? 'text-primary-foreground'
                                        : 'text-muted-foreground',
                                )}
                            />
                        </CardContent>
                    </Card>
                </Link>
            ))}
        </div>
    );
}

function DailyVolumes({ performance, filters }: ContentProps) {
    const container = useRef<HTMLDivElement>(null);
    const [availableWidth, setAvailableWidth] = useState(640);
    useEffect(() => {
        const element = container.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) =>
            setAvailableWidth(Math.floor(entry.contentRect.width)),
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const [maximum, chartHeight] = [
        Math.max(1, ...performance.daily.map((day) => day.total)),
        160,
    ];
    const ceiling =
        maximum <= 5
            ? Math.ceil(maximum / 2) * 2
            : Math.ceil(maximum / 10) * 10;
    const width = Math.max(
        280,
        availableWidth,
        performance.daily.length > 31 ? performance.daily.length * 12 : 0,
    );
    const plotLeft = Math.max(36, number(ceiling).length * 7 + 8);
    const step = (width - plotLeft - 4) / Math.max(1, performance.daily.length);
    const labelInterval =
        performance.daily.length <= 7
            ? 1
            : Math.max(
                  1,
                  Math.ceil(performance.daily.length / Math.floor(width / 56)),
              );
    const dateLabel = (date: string) =>
        new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
        }).format(new Date(date + 'T00:00:00Z'));
    return (
        <Panel
            title="Tren pengiriman"
            action={
                <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                        <span
                            className="size-2 rounded-sm bg-primary/20"
                            aria-hidden="true"
                        />
                        Total
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span
                            className="size-2 rounded-sm bg-primary"
                            aria-hidden="true"
                        />
                        Delivered
                    </span>
                </div>
            }
        >
            <div ref={container} className="overflow-x-auto pb-1">
                <svg
                    viewBox={'0 0 ' + width + ' 210'}
                    width={width}
                    height="210"
                    className="block max-w-none"
                    role="group"
                    aria-label="Volume AWB harian dan delivered saat ini"
                >
                    {[0, 0.5, 1].map((ratio) => (
                        <g key={ratio}>
                            <line
                                x1={plotLeft}
                                x2={width - 4}
                                y1={20 + chartHeight * ratio}
                                y2={20 + chartHeight * ratio}
                                stroke="var(--border)"
                                strokeDasharray={
                                    ratio === 1 ? undefined : '3 4'
                                }
                            />
                            <text
                                x={plotLeft - 9}
                                y={24 + chartHeight * ratio}
                                textAnchor="end"
                                fontSize="12"
                                fill="var(--muted-foreground)"
                            >
                                {number(Math.round(ceiling * (1 - ratio)))}
                            </text>
                        </g>
                    ))}
                    {performance.daily.map((day, index) => {
                        const x = plotLeft + index * step;
                        const barWidth = Math.max(3, step * 0.52);
                        const totalHeight = (day.total / ceiling) * chartHeight;
                        const deliveredHeight =
                            (day.delivered / ceiling) * chartHeight;
                        return (
                            <Link
                                key={day.date}
                                href={performanceDrilldown({
                                    ...filters,
                                    date_from: day.date,
                                    date_thru: day.date,
                                })}
                                aria-label={
                                    dateLabel(day.date) +
                                    ': ' +
                                    number(day.total) +
                                    ' AWB, ' +
                                    number(day.delivered) +
                                    ' delivered'
                                }
                                className="focus-visible:outline-primary"
                            >
                                <title>
                                    {dateLabel(day.date) +
                                        ' · ' +
                                        number(day.total) +
                                        ' AWB · ' +
                                        number(day.delivered) +
                                        ' delivered'}
                                </title>
                                <rect
                                    x={x + (step - barWidth) / 2}
                                    y="12"
                                    width={barWidth}
                                    height="170"
                                    fill="transparent"
                                />
                                <rect
                                    x={x + (step - barWidth) / 2}
                                    y={180 - totalHeight}
                                    width={barWidth}
                                    height={totalHeight}
                                    rx="3"
                                    fill="var(--primary)"
                                    opacity="0.18"
                                />
                                <rect
                                    x={x + (step - barWidth) / 2}
                                    y={180 - deliveredHeight}
                                    width={barWidth}
                                    height={deliveredHeight}
                                    rx="3"
                                    fill="var(--primary)"
                                />
                                {day.total > 0 &&
                                    performance.daily.length <= 14 && (
                                        <text
                                            x={x + step / 2}
                                            y={174 - totalHeight}
                                            textAnchor="middle"
                                            fontSize="12"
                                            fill="var(--foreground)"
                                        >
                                            {number(day.total)}
                                        </text>
                                    )}
                                {index % labelInterval === 0 && (
                                    <text
                                        x={x + step / 2}
                                        y="202"
                                        textAnchor="middle"
                                        fontSize="12"
                                        fill="var(--muted-foreground)"
                                    >
                                        {dateLabel(day.date)}
                                    </text>
                                )}
                            </Link>
                        );
                    })}
                </svg>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
                Berdasarkan tanggal entry · 05:00–04:59 WIB
                {width > availableWidth && (
                    <span className="mt-1 block">
                        Geser grafik untuk melihat seluruh periode.
                    </span>
                )}
            </p>
        </Panel>
    );
}

function ServiceBreakdown({ performance, filters }: ContentProps) {
    const max = Math.max(1, ...performance.services.map((row) => row.total));
    return (
        <Panel
            title="Volume per layanan"
            action={
                performance.services.length > 6 ? (
                    <InfoDialog
                        title="Semua layanan sumber"
                        label="Lihat semua"
                        description="Kode layanan asli pada populasi AWB terpilih."
                    >
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Layanan</TableHead>
                                    <TableHead className="text-right">
                                        AWB
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Delivered
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {performance.services.map((row) => (
                                    <TableRow key={row.label}>
                                        <TableCell>{row.label}</TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {number(row.total)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {number(row.delivered)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        {performance.services_truncated && (
                            <p className="text-xs text-muted-foreground">
                                20 layanan terbesar.
                            </p>
                        )}
                    </InfoDialog>
                ) : undefined
            }
        >
            <ul className="flex flex-col gap-4">
                {performance.services.slice(0, 6).map((row) => (
                    <li key={row.label}>
                        <Link
                            href={performanceDrilldown(filters, {
                                source_service:
                                    row.label === 'Belum tersedia'
                                        ? ''
                                        : row.label,
                            })}
                            className="flex min-h-8 items-center justify-between gap-3 rounded-sm text-sm hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className="truncate font-medium">
                                {row.label}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums">
                                {number(row.total)}
                            </span>
                        </Link>
                        <div
                            className="mt-1 h-1.5 rounded-full bg-muted"
                            aria-hidden="true"
                        >
                            <div
                                className="h-full rounded-full bg-primary/70"
                                style={{ width: (row.total / max) * 100 + '%' }}
                            />
                        </div>
                    </li>
                ))}
            </ul>
            {performance.services.length === 0 && (
                <p className="py-4 text-sm text-muted-foreground">
                    Belum ada layanan pada periode ini.
                </p>
            )}
            {performance.services.length > 6 && (
                <p className="mt-4 text-xs text-muted-foreground">
                    6 layanan dengan volume tertinggi
                </p>
            )}
        </Panel>
    );
}

function Reasons({
    rows,
    truncated,
    status,
    filters,
    denominator,
}: {
    rows: PerformanceReason[];
    truncated: boolean;
    status: string;
    filters: PerformanceFilters;
    denominator: number;
}) {
    if (rows.length === 0)
        return (
            <p className="py-5 text-sm text-muted-foreground">
                Tidak ada AWB {status === 'RETURNED' ? 'return' : 'exception'}{' '}
                pada filter ini.
            </p>
        );
    return (
        <>
            <ul className="divide-y">
                {rows.map((row, index) => (
                    <li
                        key={index}
                        className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                        <div className="min-w-0 flex-1">
                            <div className="mb-2 flex items-start gap-2">
                                {row.code && (
                                    <Badge
                                        variant="outline"
                                        className="shrink-0 font-mono text-[10px]"
                                    >
                                        {row.code}
                                    </Badge>
                                )}
                                <span
                                    title={row.description ?? undefined}
                                    className="line-clamp-2 text-sm"
                                >
                                    {row.description || 'Alasan belum tersedia'}
                                </span>
                            </div>
                            <div
                                className="h-1.5 rounded-full bg-muted"
                                aria-hidden="true"
                            >
                                <div
                                    className={cn(
                                        'h-full rounded-full',
                                        status === 'RETURNED'
                                            ? 'bg-primary/65'
                                            : 'bg-warning/65',
                                    )}
                                    style={{
                                        width:
                                            (denominator > 0
                                                ? (row.total / denominator) *
                                                  100
                                                : 0) + '%',
                                    }}
                                />
                            </div>
                        </div>
                        <Link
                            className="inline-flex min-h-11 min-w-11 items-center justify-end rounded-sm text-base font-semibold text-primary tabular-nums hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={
                                number(row.total) +
                                ' AWB: ' +
                                (row.description || 'Alasan belum tersedia')
                            }
                            href={performanceDrilldown(filters, {
                                status,
                                source_code: row.code ?? '',
                                source_reason: row.description ?? '',
                                source_web: row.status_web ?? '',
                                source_pod: row.status_pod ?? '',
                            })}
                        >
                            {number(row.total)}
                            <ArrowUpRight
                                className="ml-1 size-3 opacity-50"
                                aria-hidden="true"
                            />
                        </Link>
                    </li>
                ))}
            </ul>
            {truncated && (
                <p className="mt-4 text-xs text-muted-foreground">
                    15 kelompok terbesar. Lihat seluruh AWB melalui Monitoring
                    Resi.
                </p>
            )}
        </>
    );
}

function FollowUpNote({
    row,
    limitation,
}: {
    row: PerformanceData['attention'][number];
    limitation: string;
}) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11 gap-1.5 text-xs text-muted-foreground"
                    aria-label={'Catatan follow-up ' + row.awb}
                >
                    <MessageSquareText aria-hidden="true" />
                    Belum dicatat
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Follow-up {row.awb}</DialogTitle>
                    <DialogDescription>{limitation}</DialogDescription>
                </DialogHeader>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                    {[
                        ['Catatan follow-up', 'Belum tersedia'],
                        ['Status follow-up', 'Belum dicatat'],
                        ['Penanggung jawab', '—'],
                        ['Follow-up terakhir', '—'],
                    ].map(([label, value]) => (
                        <div key={label}>
                            <dt className="mb-1 text-xs text-muted-foreground">
                                {label}
                            </dt>
                            <dd className="font-medium">{value}</dd>
                        </div>
                    ))}
                </dl>
            </DialogContent>
        </Dialog>
    );
}

export function PerformanceContent({
    performance,
    filters,
    onCustomerPage,
}: ContentProps & { onCustomerPage: (page: number) => void }) {
    const { summary, limitations } = performance;
    const customerHref = (id: number | null) =>
        performanceDrilldown(
            filters,
            id
                ? { customer_id: id, attribution: 'matched' }
                : { attribution: 'unresolved' },
        );
    const detailHref = (id: number) =>
        show.url(id, {
            query: {
                date_from: filters.date_from,
                date_thru: filters.date_thru,
                outlet: filters.outlet || undefined,
                customer_id: filters.customer_id ?? undefined,
                attribution: filters.customer_id ? 'matched' : undefined,
            },
        });
    return (
        <>
            <PerformanceKpis performance={performance} filters={filters} />
            {summary.total === 0 && (
                <Alert>
                    <AlertDescription>
                        Tidak ada AWB dengan tanggal entry pada filter ini. Ubah
                        periode, outlet, atau customer.
                    </AlertDescription>
                </Alert>
            )}
            {summary.undated > 0 && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Info className="size-3.5 shrink-0" aria-hidden="true" />
                    {number(summary.undated)} AWB tanpa tanggal entry tidak
                    termasuk periode.
                </p>
            )}
            <Section
                id="sla"
                title="SLA Performance"
                action={<Badge variant="secondary">Data terbatas</Badge>}
            >
                <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <DailyVolumes performance={performance} filters={filters} />
                    <Panel
                        title="Status SLA"
                        action={
                            <InfoDialog
                                title="Definisi & batasan SLA"
                                description={limitations.sla}
                            >
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>
                                                Kelompok laporan
                                            </TableHead>
                                            <TableHead className="text-right">
                                                AWB
                                            </TableHead>
                                            <TableHead className="text-right">
                                                SLA
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {[
                                            'All Service',
                                            'NON YES',
                                            'YES <19:00',
                                            'YES >19:00',
                                        ].map((label, index) => (
                                            <TableRow key={label}>
                                                <TableCell>{label}</TableCell>
                                                <TableCell className="text-right">
                                                    {index === 0
                                                        ? number(summary.total)
                                                        : '—'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    —
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <p className="text-sm text-muted-foreground">
                                    Kode layanan belum dipetakan ke kelompok
                                    laporan. Grafik harian menunjukkan volume
                                    entry dan delivered saat ini, bukan histori
                                    SLA pada akhir hari.
                                </p>
                            </InfoDialog>
                        }
                    >
                        <dl className="divide-y">
                            {['SLA On Time Success', 'ON SLA', 'OVER SLA'].map(
                                (label) => (
                                    <div
                                        key={label}
                                        className="flex items-center justify-between gap-3 py-3 first:pt-0"
                                    >
                                        <dt className="text-sm text-muted-foreground">
                                            {label}
                                        </dt>
                                        <dd
                                            className="text-xl font-semibold"
                                            aria-label={
                                                label + ' belum tersedia'
                                            }
                                        >
                                            —
                                        </dd>
                                    </div>
                                ),
                            )}
                        </dl>
                        <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                            Aturan SLA dan cutoff YES 19:00 menunggu verifikasi.
                        </div>
                    </Panel>
                </div>
                <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(240px,0.85fr)_minmax(0,1.5fr)]">
                    <ServiceBreakdown
                        performance={performance}
                        filters={filters}
                    />
                    <Panel
                        title="Perbandingan outlet"
                        action={
                            <InfoDialog
                                title="Sumber outlet"
                                description={limitations.outlet}
                            />
                        }
                    >
                        <div className="hidden sm:block">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Outlet</TableHead>
                                        {[
                                            'AWB',
                                            'Delivered',
                                            'Exception',
                                            'Return',
                                        ].map((label) => (
                                            <TableHead
                                                className="text-right"
                                                key={label}
                                            >
                                                {label}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {performance.outlets.map((row) => (
                                        <TableRow key={row.label ?? 'missing'}>
                                            <TableCell className="max-w-64 text-sm whitespace-normal">
                                                <span
                                                    className="line-clamp-2"
                                                    title={
                                                        row.label ?? undefined
                                                    }
                                                >
                                                    {row.label ??
                                                        'Outlet belum tersedia'}
                                                </span>
                                            </TableCell>
                                            {[
                                                row.total,
                                                row.delivered,
                                                row.exceptions,
                                                row.returned,
                                            ].map((value, index) => (
                                                <TableCell
                                                    key={index}
                                                    className="text-right tabular-nums"
                                                >
                                                    {number(value)}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <ul className="divide-y sm:hidden">
                            {performance.outlets.map((row) => (
                                <li
                                    key={row.label ?? 'missing'}
                                    className="py-3 first:pt-0 last:pb-0"
                                >
                                    <p className="mb-3 text-sm font-medium">
                                        {row.label ?? 'Outlet belum tersedia'}
                                    </p>
                                    <dl className="grid grid-cols-4 gap-2">
                                        {[
                                            ['AWB', row.total],
                                            ['Delivered', row.delivered],
                                            ['Exception', row.exceptions],
                                            ['Return', row.returned],
                                        ].map(([label, value]) => (
                                            <div key={label}>
                                                <dt className="text-[11px] text-muted-foreground">
                                                    {label}
                                                </dt>
                                                <dd className="mt-1 text-sm font-semibold tabular-nums">
                                                    {number(value as number)}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </li>
                            ))}
                        </ul>
                        {performance.outlets.length === 0 && (
                            <p className="py-4 text-sm text-muted-foreground">
                                Belum ada outlet pada periode ini.
                            </p>
                        )}
                        {performance.outlets_truncated && (
                            <p className="mt-3 text-xs text-muted-foreground">
                                20 outlet terbesar.
                            </p>
                        )}
                    </Panel>
                </div>
            </Section>
            <Section
                id="customers"
                title="Customer Performance"
                action={
                    <span className="text-xs text-muted-foreground">
                        {number(performance.customers.total)} kelompok customer
                    </span>
                }
            >
                <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-none">
                    <CardContent className="p-0">
                        <div className="hidden sm:block">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        {[
                                            'Customer',
                                            'Total AWB',
                                            'Delivered',
                                            'Active',
                                            'Return',
                                            'Perlu ditinjau',
                                        ].map((label, index) => (
                                            <TableHead
                                                key={label}
                                                className={
                                                    index
                                                        ? 'text-right'
                                                        : 'pl-4'
                                                }
                                            >
                                                {label}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {performance.customers.data.map((row) => (
                                        <TableRow
                                            key={
                                                row.customer_id ?? 'unresolved'
                                            }
                                        >
                                            <TableCell className="max-w-80 pl-4 whitespace-normal">
                                                <Link
                                                    href={customerHref(
                                                        row.customer_id,
                                                    )}
                                                    className="inline-flex min-h-11 items-center rounded-sm text-sm font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                                                >
                                                    <span
                                                        className="line-clamp-2"
                                                        title={
                                                            row.customer_name ??
                                                            undefined
                                                        }
                                                    >
                                                        {row.customer_name ?? (
                                                            <Badge variant="secondary">
                                                                Belum Terhubung
                                                            </Badge>
                                                        )}
                                                    </span>
                                                </Link>
                                            </TableCell>
                                            {[
                                                row.total,
                                                row.delivered,
                                                row.active,
                                                row.returned,
                                                row.attention,
                                            ].map((value, index) => (
                                                <TableCell
                                                    key={index}
                                                    className={cn(
                                                        'text-right tabular-nums',
                                                        index === 0 &&
                                                            'font-semibold',
                                                        index === 4 && 'pr-4',
                                                    )}
                                                >
                                                    {number(value)}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <ul className="divide-y px-4 sm:hidden">
                            {performance.customers.data.map((row) => (
                                <li
                                    key={row.customer_id ?? 'unresolved'}
                                    className="flex min-w-0 flex-col gap-3 py-4"
                                >
                                    <Link
                                        className="line-clamp-2 min-h-8 rounded-sm text-sm font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                                        href={customerHref(row.customer_id)}
                                    >
                                        {row.customer_name ?? (
                                            <Badge variant="secondary">
                                                Belum Terhubung
                                            </Badge>
                                        )}
                                    </Link>
                                    <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                                        {[
                                            ['Total AWB', row.total],
                                            ['Delivered', row.delivered],
                                            ['Active', row.active],
                                            ['Return', row.returned],
                                            ['Perlu ditinjau', row.attention],
                                        ].map(([label, value]) => (
                                            <div key={label}>
                                                <dt className="text-[11px] text-muted-foreground">
                                                    {label}
                                                </dt>
                                                <dd className="mt-0.5 font-semibold tabular-nums">
                                                    {number(value as number)}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </li>
                            ))}
                        </ul>
                        {performance.customers.data.length === 0 && (
                            <p className="p-4 text-sm text-muted-foreground">
                                Belum ada customer pada periode ini.
                            </p>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2">
                            <span className="text-xs text-muted-foreground">
                                SLA customer belum tersedia.
                            </span>
                            <div className="flex items-center gap-2">
                                {performance.customers.last_page > 1 && (
                                    <>
                                        <span className="text-xs text-muted-foreground">
                                            {performance.customers.current_page}{' '}
                                            / {performance.customers.last_page}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={
                                                performance.customers
                                                    .current_page <= 1
                                            }
                                            onClick={() =>
                                                onCustomerPage(
                                                    performance.customers
                                                        .current_page - 1,
                                                )
                                            }
                                        >
                                            Sebelumnya
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={
                                                performance.customers
                                                    .current_page >=
                                                performance.customers.last_page
                                            }
                                            onClick={() =>
                                                onCustomerPage(
                                                    performance.customers
                                                        .current_page + 1,
                                                )
                                            }
                                        >
                                            Berikutnya
                                        </Button>
                                    </>
                                )}
                                <InfoDialog
                                    title="Definisi customer & active"
                                    description="Customer mengikuti hasil atribusi MATCHED. Akun JNE bersama tidak menentukan kepemilikan. Active mengikuti Monitoring Resi dan masih mencakup RETURNED."
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </Section>
            <Section
                id="exceptions"
                title="UNRCC & Return Analysis"
                action={
                    <InfoDialog
                        title="Definisi UNRCC & return"
                        label="Cakupan data"
                        description={limitations.unrcc}
                    >
                        <p className="text-sm text-muted-foreground">
                            {limitations.returns}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Kode dan keterangan asli dipertahankan. Batang
                            menunjukkan jumlah kelompok terhadap seluruh AWB
                            berstatus sama pada filter ini.
                        </p>
                    </InfoDialog>
                }
            >
                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                    <Panel
                        title="Exception tracking"
                        action={
                            <Badge variant="outline">
                                {number(summary.exceptions)} AWB
                            </Badge>
                        }
                    >
                        <Reasons
                            rows={performance.exceptions.rows}
                            truncated={performance.exceptions.truncated}
                            status="EXCEPTION"
                            filters={filters}
                            denominator={summary.exceptions}
                        />
                    </Panel>
                    <Panel
                        title="Return"
                        action={
                            <Badge variant="outline">
                                {number(summary.returned)} AWB
                            </Badge>
                        }
                    >
                        <Reasons
                            rows={performance.returns.rows}
                            truncated={performance.returns.truncated}
                            status="RETURNED"
                            filters={filters}
                            denominator={summary.returned}
                        />
                    </Panel>
                </div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Info className="size-3.5 shrink-0" aria-hidden="true" />
                    UNRCC belum tersedia. Exception tracking dihitung terpisah.
                </p>
            </Section>
            <Section
                id="follow-up"
                title="AWB Follow-up"
                action={
                    <Button
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        asChild
                    >
                        <Link
                            href={attention.url({
                                query: {
                                    date_from: filters.date_from,
                                    date_thru: filters.date_thru,
                                    customer_id:
                                        filters.customer_id ?? undefined,
                                    attribution: filters.customer_id
                                        ? 'matched'
                                        : undefined,
                                    outlet: filters.outlet || undefined,
                                },
                            })}
                        >
                            Semua perlu perhatian
                            <ArrowRight aria-hidden="true" />
                        </Link>
                    </Button>
                }
            >
                <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-none">
                    <CardContent className="p-0">
                        <div className="hidden sm:block">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="pl-4">
                                            AWB
                                        </TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Status pengiriman</TableHead>
                                        <TableHead>Follow-up manual</TableHead>
                                        <TableHead>
                                            <span className="sr-only">
                                                Detail
                                            </span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {performance.attention.map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell className="pl-4">
                                                <Link
                                                    href={detailHref(row.id)}
                                                    translate="no"
                                                    className="inline-flex min-h-11 items-center rounded-sm font-mono text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                                >
                                                    {row.awb}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="max-w-60">
                                                <span
                                                    className="line-clamp-1 text-sm"
                                                    title={
                                                        row.customer_name ??
                                                        undefined
                                                    }
                                                >
                                                    {row.customer_name ?? (
                                                        <Badge variant="secondary">
                                                            Belum Terhubung
                                                        </Badge>
                                                    )}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {trackingLabels[
                                                        row.tracking_status
                                                    ] ?? row.tracking_status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <FollowUpNote
                                                    row={row}
                                                    limitation={
                                                        limitations.follow_up
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell className="pr-4">
                                                <Button
                                                    asChild
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-11"
                                                >
                                                    <Link
                                                        href={detailHref(
                                                            row.id,
                                                        )}
                                                        aria-label={
                                                            'Detail AWB ' +
                                                            row.awb
                                                        }
                                                    >
                                                        <ArrowUpRight aria-hidden="true" />
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <ul className="divide-y px-4 sm:hidden">
                            {performance.attention.map((row) => (
                                <li
                                    key={row.id}
                                    className="flex min-w-0 flex-col gap-2 py-3"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Link
                                            href={detailHref(row.id)}
                                            translate="no"
                                            className="inline-flex min-h-8 items-center rounded-sm font-mono text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {row.awb}
                                        </Link>
                                        <Badge variant="outline">
                                            {trackingLabels[
                                                row.tracking_status
                                            ] ?? row.tracking_status}
                                        </Badge>
                                    </div>
                                    <span className="line-clamp-1 text-xs text-muted-foreground">
                                        {row.customer_name ?? (
                                            <Badge variant="secondary">
                                                Belum Terhubung
                                            </Badge>
                                        )}
                                    </span>
                                    <div className="-ml-2">
                                        <FollowUpNote
                                            row={row}
                                            limitation={limitations.follow_up}
                                        />
                                    </div>
                                </li>
                            ))}
                        </ul>
                        {performance.attention.length === 0 && (
                            <p className="p-4 text-sm text-muted-foreground">
                                Tidak ada AWB yang memerlukan perhatian pada
                                filter ini.
                            </p>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                            <span>
                                {number(performance.attention.length)} dari{' '}
                                {number(summary.attention)} AWB perlu ditinjau
                            </span>
                            <span>Pratinjau baca saja</span>
                        </div>
                    </CardContent>
                </Card>
            </Section>
        </>
    );
}

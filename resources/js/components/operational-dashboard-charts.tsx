import { useId, useState, type ReactNode } from 'react';
import { BarChart3, CircleDot, Table2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type {
    ChartDatum,
    OperationalOverviewData,
} from '@/types/operational-dashboard';

export const opNumber = (value: number) =>
    new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(value);
export const opDate = (date: string) =>
    new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`));

const palette = [
    'var(--primary)',
    'var(--chart-2)',
    'var(--chart-4)',
    'var(--chart-3)',
    'var(--chart-5)',
    'var(--muted-foreground)',
];

export function OperationalPanel({
    title,
    icon: Icon,
    action,
    children,
    className,
    contentClassName,
}: {
    title: string;
    icon?: LucideIcon;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
    contentClassName?: string;
}) {
    return (
        <Card className={cn('min-w-0 gap-0 py-0 shadow-none', className)}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 px-4 pt-2 pb-1">
                <CardTitle>
                    <h2 className="flex items-center gap-2 text-sm leading-5">
                        {Icon && (
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Icon aria-hidden="true" className="size-4" />
                            </span>
                        )}
                        {title}
                    </h2>
                </CardTitle>
                {action}
            </CardHeader>
            <CardContent className={cn('min-w-0 px-4 pb-4', contentClassName)}>
                {children}
            </CardContent>
        </Card>
    );
}

export function OperationalDonut({
    title,
    description,
    data,
    empty = 'Belum ada data pada periode ini.',
    totalLabel = 'Total',
    footer,
    action,
    compact = false,
    icon = CircleDot,
}: {
    title: string;
    description?: string;
    data: ChartDatum[];
    empty?: string;
    totalLabel?: string;
    footer?: ReactNode;
    action?: ReactNode;
    compact?: boolean;
    icon?: LucideIcon;
}) {
    const id = useId();
    const total = data.reduce((sum, row) => sum + row.value, 0);
    let offset = 0;
    return (
        <OperationalPanel
            title={title}
            icon={icon}
            action={action}
            className="h-full"
            contentClassName="flex flex-1 flex-col justify-center gap-3"
        >
            {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
            )}
            <div
                className={cn(
                    'flex min-w-0 flex-wrap items-center justify-center gap-4 py-2',
                    compact ? 'gap-3' : 'gap-5',
                )}
            >
                <div
                    className={cn(
                        'relative aspect-square shrink-0',
                        compact ? 'size-26' : 'size-36',
                    )}
                >
                    <svg
                        viewBox="0 0 120 120"
                        className="size-full"
                        role="img"
                        aria-labelledby={id}
                    >
                        <title
                            id={id}
                        >{`${title}: ${total ? data.map((row) => `${row.label ?? row.key} ${row.value}`).join(', ') : empty}`}</title>
                        <circle
                            cx="60"
                            cy="60"
                            r="47"
                            fill="none"
                            stroke="var(--muted)"
                            strokeWidth="12"
                        />
                        {total > 0 &&
                            data.map((row, index) => {
                                const percent = (row.value / total) * 100;
                                const start = offset;
                                offset += percent;
                                return (
                                    row.value > 0 && (
                                        <circle
                                            key={row.key}
                                            cx="60"
                                            cy="60"
                                            r="47"
                                            fill="none"
                                            stroke={
                                                row.color ??
                                                palette[index % palette.length]
                                            }
                                            strokeWidth="12"
                                            pathLength="100"
                                            strokeDasharray={`${percent} ${100 - percent}`}
                                            strokeDashoffset={-start}
                                            transform="rotate(-90 60 60)"
                                        >
                                            <title>{`${row.label ?? row.key}: ${opNumber(row.value)} (${opNumber(percent)}%)`}</title>
                                        </circle>
                                    )
                                );
                            })}
                    </svg>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
                        <span
                            className={cn(
                                'font-semibold tracking-tight tabular-nums',
                                compact ? 'text-xl' : 'text-2xl',
                            )}
                        >
                            {opNumber(total)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {totalLabel}
                        </span>
                    </div>
                </div>
                {total === 0 ? (
                    <p className="min-w-0 flex-1 basis-40 text-sm text-muted-foreground">
                        {empty}
                    </p>
                ) : (
                    <ul className="flex min-w-0 flex-1 basis-40 flex-col gap-3 text-xs">
                        {data
                            .filter((row) => row.value > 0)
                            .map((row) => {
                                const index = data.indexOf(row);
                                return (
                                    <li
                                        key={row.key}
                                        className="flex items-center gap-2"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="size-2 shrink-0 rounded-full"
                                            style={{
                                                backgroundColor:
                                                    row.color ??
                                                    palette[
                                                        index % palette.length
                                                    ],
                                            }}
                                        />
                                        <span className="min-w-0 flex-1">
                                            {row.label ?? row.key}
                                        </span>
                                        <span className="font-semibold tabular-nums">
                                            {opNumber(row.value)}
                                        </span>
                                        <span className="w-12 shrink-0 text-right text-muted-foreground tabular-nums">
                                            {opNumber(
                                                (row.value / total) * 100,
                                            )}
                                            %
                                        </span>
                                    </li>
                                );
                            })}
                    </ul>
                )}
            </div>
            {footer}
        </OperationalPanel>
    );
}

const metrics = [
    ['tasks', 'Pickup'],
    ['packages', 'Paket'],
    ['customers', 'Customer'],
] as const;
type Metric = (typeof metrics)[number][0];

export function OperationalActivityChart({
    daily,
}: {
    daily: OperationalOverviewData['daily'];
}) {
    const [metric, setMetric] = useState<Metric>('tasks');
    const [focused, setFocused] = useState<number | null>(null);
    const activeIndex = Math.min(
        focused ??
            Math.max(
                0,
                daily.findLastIndex((row) => row[metric] > 0),
            ),
        daily.length - 1,
    );
    const active = daily[activeIndex];
    const maximum = Math.max(1, ...daily.map((row) => row[metric]));
    const step =
        maximum <= 4
            ? 1
            : Math.ceil(
                  maximum / 3 / 10 ** Math.floor(Math.log10(maximum / 3)),
              ) *
              10 ** Math.floor(Math.log10(maximum / 3));
    const ceiling = Math.ceil(maximum / step) * step;
    const ticks = Array.from(
        { length: Math.ceil(ceiling / step) + 1 },
        (_, index) => index * step,
    );
    const width = 700 / Math.max(1, daily.length);
    const interval = Math.max(1, Math.ceil(daily.length / 9));
    const metricLabel = metrics.find(([key]) => key === metric)![1];
    const gradient = useId();
    return (
        <Dialog>
            <OperationalPanel
                title="Aktivitas harian"
                icon={BarChart3}
                className="h-full"
                action={
                    <div className="flex flex-wrap items-center gap-1">
                        <ToggleGroup
                            type="single"
                            value={metric}
                            onValueChange={(value) => {
                                if (value) {
                                    setMetric(value as Metric);
                                    setFocused(null);
                                }
                            }}
                            aria-label="Metrik aktivitas"
                            className="rounded-lg bg-muted/60 p-0.5"
                        >
                            {metrics.map(([key, label]) => (
                                <ToggleGroupItem
                                    key={key}
                                    value={key}
                                    className="min-h-11 px-3 text-xs data-[state=on]:bg-primary/10 data-[state=on]:text-primary sm:h-8 sm:min-h-8"
                                >
                                    {label}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                        <DialogTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-11 sm:size-8"
                                aria-label="Data aktivitas harian"
                            >
                                <Table2 aria-hidden="true" />
                            </Button>
                        </DialogTrigger>
                    </div>
                }
            >
                <div className="flex h-36 gap-2 pt-3 sm:h-36">
                    <div
                        aria-hidden="true"
                        className="flex w-6 shrink-0 flex-col justify-between pb-1 text-right text-[11px] text-muted-foreground tabular-nums"
                    >
                        {[...ticks].reverse().map((tick) => (
                            <span key={tick}>{opNumber(tick)}</span>
                        ))}
                    </div>
                    <svg
                        viewBox="0 0 700 180"
                        preserveAspectRatio="none"
                        role="img"
                        aria-label={`Grafik ${metricLabel.toLowerCase()} harian`}
                        className="h-full min-w-0 flex-1 text-primary"
                    >
                        <defs>
                            <linearGradient
                                id={gradient}
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
                                <stop
                                    offset="0%"
                                    stopColor="currentColor"
                                    stopOpacity="0.7"
                                />
                                <stop
                                    offset="100%"
                                    stopColor="currentColor"
                                    stopOpacity="0.3"
                                />
                            </linearGradient>
                        </defs>
                        {ticks.map((tick) => (
                            <line
                                key={tick}
                                x1="0"
                                x2="700"
                                y1={176 - (tick / ceiling) * 172}
                                y2={176 - (tick / ceiling) * 172}
                                stroke="var(--border)"
                                opacity="0.65"
                                vectorEffect="non-scaling-stroke"
                            />
                        ))}
                        {daily.map((row, index) => {
                            const height = (row[metric] / ceiling) * 172;
                            return (
                                <rect
                                    key={row.date}
                                    x={index * width + width * 0.16}
                                    y={176 - height}
                                    width={Math.min(width * 0.68, 55)}
                                    height={
                                        row[metric] > 0
                                            ? Math.max(1, height)
                                            : 0
                                    }
                                    rx="2"
                                    fill={
                                        index === activeIndex
                                            ? 'currentColor'
                                            : `url(#${gradient})`
                                    }
                                    tabIndex={row[metric] > 0 ? 0 : -1}
                                    role="graphics-symbol"
                                    aria-label={`${opDate(row.date)}: ${row[metric]}`}
                                    className="outline-none focus:stroke-foreground focus:stroke-2"
                                    onPointerEnter={() => setFocused(index)}
                                    onFocus={() => setFocused(index)}
                                >
                                    <title>{`${opDate(row.date)}: ${opNumber(row[metric])}`}</title>
                                </rect>
                            );
                        })}
                    </svg>
                </div>
                <div
                    aria-hidden="true"
                    className="mt-1 ml-8 flex justify-between gap-1 text-[10px] text-muted-foreground sm:text-[11px] [&>span:nth-child(even)]:hidden sm:[&>span:nth-child(even)]:inline"
                >
                    {daily
                        .filter(
                            (_, index) =>
                                index % interval === 0 ||
                                index === daily.length - 1,
                        )
                        .map((row) => (
                            <span key={row.date} className="whitespace-nowrap">
                                {opDate(row.date)}
                            </span>
                        ))}
                </div>
                <div
                    className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    aria-live="polite"
                >
                    <span className="flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className="size-2 rounded-full bg-primary"
                        />
                        {metricLabel}
                    </span>
                    <span className="text-muted-foreground">
                        {active
                            ? `${opDate(active.date)} · ${opNumber(active[metric])} ${metricLabel.toLowerCase()}`
                            : 'Belum ada aktivitas'}
                    </span>
                </div>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Data aktivitas harian</DialogTitle>
                        <DialogDescription>
                            Pickup, paket final, dan customer unik per hari
                            operasional.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-80 overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead>Pickup</TableHead>
                                    <TableHead>Paket</TableHead>
                                    <TableHead>Customer</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {daily.map((row) => (
                                    <TableRow key={row.date}>
                                        <TableCell>
                                            {opDate(row.date)}
                                        </TableCell>
                                        <TableCell>
                                            {opNumber(row.tasks)}
                                        </TableCell>
                                        <TableCell>
                                            {opNumber(row.packages)}
                                        </TableCell>
                                        <TableCell>
                                            {opNumber(row.customers)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </OperationalPanel>
        </Dialog>
    );
}

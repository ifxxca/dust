import { useId, useState } from 'react';
import { BarChart3, CircleDot } from 'lucide-react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
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

export function OperationalDonut({
    title,
    description,
    data,
    empty = 'Belum ada data pada periode ini.',
    totalLabel = 'Total',
    footer,
}: {
    title: string;
    description: string;
    data: ChartDatum[];
    empty?: string;
    totalLabel?: string;
    footer?: React.ReactNode;
}) {
    const id = useId();
    const total = data.reduce((sum, row) => sum + row.value, 0);
    let offset = 0;
    return (
        <Card className="min-w-0 gap-4 shadow-none">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <CircleDot
                        aria-hidden="true"
                        className="size-4 text-primary"
                    />
                    {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div className="relative mx-auto aspect-square w-40 max-w-full">
                    <svg
                        viewBox="0 0 120 120"
                        className="size-full"
                        role="img"
                        aria-labelledby={id}
                    >
                        <title id={id}>
                            {`${title}: ${
                                total
                                    ? data
                                          .map(
                                              (row) =>
                                                  `${row.label ?? row.key} ${row.value}`,
                                          )
                                          .join(', ')
                                    : empty
                            }`}
                        </title>
                        <circle
                            cx="60"
                            cy="60"
                            r="47"
                            fill="none"
                            stroke="var(--muted)"
                            strokeWidth="13"
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
                                            strokeWidth="13"
                                            pathLength="100"
                                            strokeDasharray={`${percent} ${100 - percent}`}
                                            strokeDashoffset={-start}
                                            transform="rotate(-90 60 60)"
                                        >
                                            <title>
                                                {`${row.label ?? row.key}: ${opNumber(row.value)} (${opNumber(percent)}%)`}
                                            </title>
                                        </circle>
                                    )
                                );
                            })}
                    </svg>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-semibold tabular-nums">
                            {opNumber(total)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {totalLabel}
                        </span>
                    </div>
                </div>
                {total === 0 ? (
                    <p className="text-center text-sm text-muted-foreground">
                        {empty}
                    </p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {data.map((row, index) => (
                            <li
                                key={row.key}
                                className="flex items-center gap-2 text-sm"
                            >
                                <span
                                    className="size-2 shrink-0 rounded-full"
                                    style={{
                                        backgroundColor:
                                            row.color ??
                                            palette[index % palette.length],
                                    }}
                                    aria-hidden="true"
                                />
                                <span className="min-w-0 flex-1">
                                    {row.label ?? row.key}
                                </span>
                                <span className="font-medium tabular-nums">
                                    {opNumber(row.value)}
                                </span>
                                <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                                    {opNumber((row.value / total) * 100)}%
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
                {footer}
            </CardContent>
        </Card>
    );
}

export function OperationalActivityChart({
    daily,
}: {
    daily: OperationalOverviewData['daily'];
}) {
    const [metric, setMetric] = useState<'tasks' | 'packages' | 'customers'>(
        'tasks',
    );
    const [focused, setFocused] = useState<number | null>(null);
    const active =
        daily[
            Math.min(
                focused ??
                    Math.max(
                        0,
                        daily.findLastIndex((row) => row[metric] > 0),
                    ),
                daily.length - 1,
            )
        ];
    const max = Math.max(1, ...daily.map((row) => row[metric]));
    const width = 700 / Math.max(1, daily.length);
    return (
        <Card className="min-w-0 gap-4 shadow-none">
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <BarChart3
                                aria-hidden="true"
                                className="size-4 text-primary"
                            />
                            Aktivitas harian
                        </CardTitle>
                        <CardDescription>
                            Pickup, paket final, dan customer aktif per hari.
                        </CardDescription>
                    </div>
                    <div
                        className="flex flex-wrap gap-1"
                        aria-label="Metrik aktivitas"
                    >
                        {(
                            [
                                ['tasks', 'Pickup'],
                                ['packages', 'Paket'],
                                ['customers', 'Customer'],
                            ] as const
                        ).map(([key, label]) => (
                            <Button
                                key={key}
                                size="sm"
                                className="min-h-11"
                                variant={metric === key ? 'secondary' : 'ghost'}
                                aria-pressed={metric === key}
                                onClick={() => setMetric(key)}
                            >
                                {label}
                            </Button>
                        ))}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3"
                    aria-live="polite"
                >
                    <span className="text-sm font-medium">
                        {active ? opDate(active.date) : 'Periode terpilih'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {opNumber(active?.tasks ?? 0)} pickup ·{' '}
                        {opNumber(active?.packages ?? 0)} paket ·{' '}
                        {opNumber(active?.customers ?? 0)} customer
                    </span>
                </div>
                <div>
                    <p className="mb-1 text-xs text-muted-foreground">
                        {opNumber(max)}
                    </p>
                    <svg
                        viewBox="0 0 700 205"
                        preserveAspectRatio="none"
                        role="img"
                        aria-label={`Grafik ${metric === 'tasks' ? 'pickup' : metric === 'packages' ? 'paket' : 'customer'} harian`}
                        className="h-52 w-full text-primary sm:h-60"
                    >
                        {[12, 72, 132, 192].map((y) => (
                            <line
                                key={y}
                                x1="0"
                                x2="700"
                                y1={y}
                                y2={y}
                                stroke="var(--border)"
                                strokeDasharray="4 4"
                                vectorEffect="non-scaling-stroke"
                            />
                        ))}
                        {daily.map((row, index) => {
                            const height = (row[metric] / max) * 178;
                            return (
                                <rect
                                    key={row.date}
                                    x={index * width + width * 0.18}
                                    y={192 - height}
                                    width={width * 0.64}
                                    height={Math.max(1, height)}
                                    rx="2"
                                    fill="currentColor"
                                    opacity={
                                        active?.date === row.date ? 1 : 0.55
                                    }
                                    tabIndex={0}
                                    role="graphics-symbol"
                                    aria-label={`${opDate(row.date)}: ${row[metric]}`}
                                    className="outline-none focus:stroke-foreground focus:stroke-2"
                                    onPointerEnter={() => setFocused(index)}
                                    onFocus={() => setFocused(index)}
                                >
                                    <title>
                                        {`${opDate(row.date)}: ${opNumber(row[metric])}`}
                                    </title>
                                </rect>
                            );
                        })}
                    </svg>
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                        <span>{daily[0] && opDate(daily[0].date)}</span>
                        <span>
                            {daily.at(-1) && opDate(daily.at(-1)!.date)}
                        </span>
                    </div>
                </div>
                <details className="rounded-lg border px-3">
                    <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                        Data aktivitas harian
                    </summary>
                    <div className="max-h-64 overflow-auto pb-3">
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
                </details>
            </CardContent>
        </Card>
    );
}

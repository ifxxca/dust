import { useId, useState } from 'react';
import { BarChart3, LineChart, MapPin, Package, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type {
    CustomerDashboardDay,
    CustomerDashboardRank,
} from '@/types/jne-customer-dashboard';

export const dashboardNumber = (value: number | null) =>
    value === null
        ? 'Tidak tersedia'
        : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(
              value,
          );
export const dashboardMoney = (value: number | null) =>
    value === null
        ? 'Tidak tersedia'
        : new Intl.NumberFormat('id-ID', {
              style: 'currency',
              currency: 'IDR',
              maximumFractionDigits: 2,
          }).format(value);
const dayLabel = (date: string) =>
    new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`));

export function CustomerDailyChart({ days }: { days: CustomerDashboardDay[] }) {
    const id = useId();
    const [metric, setMetric] = useState<'shipments' | 'amount'>('shipments');
    const [selected, setSelected] = useState<number | null>(null);
    const active =
        days[
            Math.min(
                selected ??
                    Math.max(
                        0,
                        days.findLastIndex((day) => day.shipments > 0),
                    ),
                days.length - 1,
            )
        ];
    const maximum = Math.max(1, ...days.map((day) => day[metric] ?? 0));
    const x = (index: number) =>
        12 + (index / Math.max(1, days.length - 1)) * 676;
    const y = (value: number) => 174 - (value / maximum) * 156;
    const segments: string[] = [];
    let points: string[] = [];
    days.forEach((day, index) => {
        if (day[metric] === null) {
            if (points.length) segments.push(points.join(' '));
            points = [];
        } else points.push(`${x(index)},${y(day[metric] ?? 0)}`);
    });
    if (points.length) segments.push(points.join(' '));
    return (
        <Card className="min-w-0">
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-2">
                        <CardTitle className="flex items-center gap-2">
                            <LineChart
                                aria-hidden="true"
                                className="size-4 text-primary"
                            />
                            Tren harian
                        </CardTitle>
                        <CardDescription>
                            Berdasarkan tanggal kirim (TGL_ENTRY), WIB.
                        </CardDescription>
                    </div>
                    <div className="flex gap-1" aria-label="Metrik grafik">
                        <Button
                            size="sm"
                            className="min-h-11"
                            variant={
                                metric === 'shipments' ? 'secondary' : 'ghost'
                            }
                            aria-pressed={metric === 'shipments'}
                            onClick={() => setMetric('shipments')}
                        >
                            <Package aria-hidden="true" />
                            Resi
                        </Button>
                        <Button
                            size="sm"
                            className="min-h-11"
                            variant={
                                metric === 'amount' ? 'secondary' : 'ghost'
                            }
                            aria-pressed={metric === 'amount'}
                            onClick={() => setMetric('amount')}
                        >
                            <Wallet aria-hidden="true" />
                            Amount
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div
                    className="flex flex-wrap items-end justify-between gap-2 rounded-lg bg-muted/40 px-4 py-3"
                    aria-live="polite"
                >
                    <div>
                        <p className="text-xs text-muted-foreground">
                            {active
                                ? dayLabel(active.date)
                                : 'Periode terpilih'}
                        </p>
                        <p className="text-2xl font-semibold tabular-nums">
                            {metric === 'amount'
                                ? dashboardMoney(active?.amount ?? null)
                                : `${dashboardNumber(active?.shipments ?? 0)} resi`}
                        </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {metric === 'amount' && active
                            ? `${active.amount_known} dari ${active.shipments} resi memiliki amount`
                            : 'Arahkan atau fokuskan titik untuk detail'}
                    </p>
                </div>
                <div className="flex flex-col gap-1">
                    <p className="text-xs text-muted-foreground">
                        {metric === 'amount'
                            ? dashboardMoney(maximum)
                            : dashboardNumber(maximum)}
                    </p>
                    <svg
                        viewBox="0 0 700 190"
                        preserveAspectRatio="none"
                        className="h-48 w-full overflow-visible text-primary sm:h-56"
                        role="img"
                        aria-labelledby={`${id}-title ${id}-desc`}
                    >
                        <title id={`${id}-title`}>
                            {metric === 'amount'
                                ? 'Amount APEX'
                                : 'Jumlah resi'}{' '}
                            per hari
                        </title>
                        <desc id={`${id}-desc`}>
                            Setiap resi dihitung sekali dari snapshot terbaru.
                            Nilai kosong tidak dihubungkan pada grafik. Data
                            lengkap tersedia pada tabel harian di bawah.
                        </desc>
                        {[18, 70, 122, 174].map((level) => (
                            <line
                                key={level}
                                x1="0"
                                x2="700"
                                y1={level}
                                y2={level}
                                stroke="currentColor"
                                className="text-border"
                                vectorEffect="non-scaling-stroke"
                                strokeDasharray="4 4"
                            />
                        ))}
                        {segments.map((segment, index) => (
                            <polyline
                                key={index}
                                points={segment}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                vectorEffect="non-scaling-stroke"
                            />
                        ))}
                        {days.map(
                            (day, index) =>
                                day[metric] !== null && (
                                    <circle
                                        key={day.date}
                                        cx={x(index)}
                                        cy={y(day[metric] ?? 0)}
                                        r={active?.date === day.date ? 5 : 3}
                                        fill="currentColor"
                                        stroke="var(--card)"
                                        strokeWidth="1.5"
                                        vectorEffect="non-scaling-stroke"
                                        tabIndex={0}
                                        role="graphics-symbol"
                                        aria-label={`${dayLabel(day.date)}: ${metric === 'amount' ? dashboardMoney(day.amount) : `${day.shipments} resi`}`}
                                        className="cursor-crosshair outline-none focus:stroke-foreground focus:stroke-3"
                                        onFocus={() => setSelected(index)}
                                        onPointerEnter={() =>
                                            setSelected(index)
                                        }
                                    >
                                        <title>
                                            {dayLabel(day.date)} ·{' '}
                                            {metric === 'amount'
                                                ? dashboardMoney(day.amount)
                                                : `${day.shipments} resi`}
                                        </title>
                                    </circle>
                                ),
                        )}
                    </svg>
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{days[0] && dayLabel(days[0].date)}</span>
                        <span>
                            {days.at(-1) && dayLabel(days.at(-1)!.date)}
                        </span>
                    </div>
                </div>
                <details className="rounded-lg border px-3">
                    <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                        Lihat data harian
                    </summary>
                    <div className="max-h-72 overflow-y-auto pb-3">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Tanggal</TableHead>
                                    <TableHead className="text-right">
                                        Resi
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Amount APEX
                                    </TableHead>
                                    <TableHead className="text-right">
                                        Amount tersedia
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {days.map((day) => (
                                    <TableRow key={day.date}>
                                        <TableCell>
                                            {dayLabel(day.date)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {dashboardNumber(day.shipments)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {dashboardMoney(day.amount)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">
                                            {day.amount_known}/{day.shipments}
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

export function CustomerRanking({
    title,
    kind,
    rows,
    total,
    onSelect,
}: {
    title: string;
    kind: 'destination' | 'service';
    rows: CustomerDashboardRank[];
    total: number;
    onSelect: (value: string) => void;
}) {
    const Icon = kind === 'destination' ? MapPin : BarChart3;
    return (
        <Card className="min-w-0">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Icon aria-hidden="true" className="size-4 text-primary" />
                    {title}
                </CardTitle>
                <CardDescription>
                    10 terbesar · persentase dari seluruh resi terfilter. Pilih
                    untuk merinci.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
                {rows.length === 0 && (
                    <p className="py-8 text-sm text-muted-foreground">
                        Belum ada data pada periode ini.
                    </p>
                )}
                {rows.map((row) => (
                    <Button
                        key={row.key ?? row.label ?? 'missing'}
                        variant="ghost"
                        disabled={(row.key ?? row.label) === null}
                        title={
                            row.key
                                ? `Kode JNE: ${row.key}${row.multiple_names ? ' · beberapa nama lokasi pada report' : ''}`
                                : undefined
                        }
                        className="h-auto min-h-16 w-full flex-col items-stretch gap-2 px-2 py-3 whitespace-normal"
                        onClick={() => {
                            const value = row.key ?? row.label;
                            if (value) onSelect(value);
                        }}
                    >
                        <span className="flex justify-between gap-3 text-left">
                            <span className="min-w-0 break-words">
                                {row.label ??
                                    (kind === 'destination'
                                        ? 'Nama daerah belum tersedia'
                                        : 'Tidak tersedia')}
                            </span>
                            <span className="shrink-0 tabular-nums">
                                {dashboardNumber(row.shipments)}{' '}
                                <span className="font-normal text-muted-foreground">
                                    ·{' '}
                                    {total
                                        ? (
                                              (row.shipments / total) *
                                              100
                                          ).toFixed(1)
                                        : 0}
                                    %
                                </span>
                            </span>
                        </span>
                        <span
                            className="h-2 w-full overflow-hidden rounded-full bg-muted"
                            aria-hidden="true"
                        >
                            <span
                                className="block h-full rounded-full bg-primary/75"
                                style={{
                                    width: `${total ? (row.shipments / total) * 100 : 0}%`,
                                }}
                            />
                        </span>
                        <span className="text-left text-xs font-normal text-muted-foreground">
                            {dashboardMoney(row.amount)}
                            {kind === 'destination' && !row.label && row.key
                                ? ` · ${row.key}`
                                : ''}
                            {row.multiple_names
                                ? ' · beberapa nama lokasi JNE'
                                : ''}
                        </span>
                    </Button>
                ))}
            </CardContent>
        </Card>
    );
}

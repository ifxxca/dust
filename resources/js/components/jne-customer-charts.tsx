import { useId, useState } from 'react';
import { ArrowRight, BarChart3, MapPin, Package, Table2 } from 'lucide-react';
import { OperationalPanel } from '@/components/operational-dashboard-charts';
import { Button } from '@/components/ui/button';
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
    }).format(new Date(date + 'T00:00:00Z'));

export function CustomerDailyChart({ days }: { days: CustomerDashboardDay[] }) {
    const id = useId();
    const [metric, setMetric] = useState<'shipments' | 'amount'>('shipments');
    const [selected, setSelected] = useState<number | null>(null);
    const maximum = Math.max(1, ...days.map((day) => day[metric] ?? 0));
    const ceiling =
        maximum <= 5
            ? 5
            : Math.ceil(
                  maximum /
                      4 /
                      Math.pow(10, Math.floor(Math.log10(maximum / 4))),
              ) *
              Math.pow(10, Math.floor(Math.log10(maximum / 4))) *
              4;
    const step = 700 / Math.max(1, days.length);
    const labels = Array.from(
        { length: Math.min(6, days.length) },
        (_, index) => {
            const dayIndex = Math.round(
                (index * (days.length - 1)) /
                    Math.max(1, Math.min(6, days.length) - 1),
            );
            return { day: days[dayIndex], index: dayIndex };
        },
    );
    const active = selected === null ? null : days[selected];
    const available =
        metric === 'shipments' || days.some((day) => day.amount_known > 0);
    return (
        <OperationalPanel
            title="Tren resi harian"
            icon={BarChart3}
            className="h-full"
            contentClassName="flex flex-col gap-4 pt-3"
            action={
                <ToggleGroup
                    type="single"
                    value={metric}
                    onValueChange={(value) => {
                        if (value) {
                            setMetric(value as typeof metric);
                            setSelected(null);
                        }
                    }}
                    aria-label="Metrik grafik"
                    size="sm"
                    className="bg-muted/60"
                >
                    <ToggleGroupItem
                        value="shipments"
                        className="min-h-10 px-4"
                    >
                        Resi
                    </ToggleGroupItem>
                    <ToggleGroupItem value="amount" className="min-h-10 px-4">
                        Amount
                    </ToggleGroupItem>
                </ToggleGroup>
            }
        >
            {available ? (
                <div className="flex flex-col gap-2">
                    <div className="flex gap-3">
                        <div
                            className="flex h-48 w-10 shrink-0 flex-col justify-between text-right text-xs text-muted-foreground tabular-nums sm:h-52"
                            aria-hidden="true"
                        >
                            {[4, 3, 2, 1, 0].map((level) => (
                                <span key={level}>
                                    {new Intl.NumberFormat('id-ID', {
                                        notation: 'compact',
                                        maximumFractionDigits: 1,
                                    }).format((ceiling * level) / 4)}
                                </span>
                            ))}
                        </div>
                        <svg
                            viewBox="0 0 700 180"
                            preserveAspectRatio="none"
                            className="h-48 min-w-0 flex-1 overflow-visible sm:h-52"
                            role="group"
                            aria-labelledby={id + '-title ' + id + '-desc'}
                        >
                            <title id={id + '-title'}>
                                {metric === 'amount'
                                    ? 'Amount APEX harian'
                                    : 'Resi terkirim dan total resi harian'}
                            </title>
                            <desc id={id + '-desc'}>
                                Pilih batang untuk melihat nilainya. Tabel
                                lengkap tersedia melalui Lihat data harian.
                            </desc>
                            {[0, 45, 90, 135, 180].map((y) => (
                                <line
                                    key={y}
                                    x1="0"
                                    x2="700"
                                    y1={y}
                                    y2={y}
                                    stroke="var(--border)"
                                    strokeDasharray="3 3"
                                    vectorEffect="non-scaling-stroke"
                                />
                            ))}
                            {days.map((day, index) => {
                                const value = day[metric];
                                if (value === null) return null;
                                const width = Math.max(0.5, step * 0.32);
                                const x = step * index + step * 0.12;
                                const totalHeight = (value / ceiling) * 180;
                                const deliveredHeight =
                                    (day.delivered / ceiling) * 180;
                                const label =
                                    dayLabel(day.date) +
                                    ': ' +
                                    (metric === 'amount'
                                        ? dashboardMoney(day.amount)
                                        : dashboardNumber(day.delivered) +
                                          ' terkirim / ' +
                                          dashboardNumber(day.shipments) +
                                          ' resi');
                                return (
                                    <g
                                        key={day.date}
                                        tabIndex={0}
                                        role="button"
                                        aria-label={label}
                                        className="cursor-pointer outline-none focus-visible:stroke-foreground"
                                        onFocus={() => setSelected(index)}
                                        onBlur={() => setSelected(null)}
                                        onPointerEnter={() =>
                                            setSelected(index)
                                        }
                                        onPointerLeave={() => setSelected(null)}
                                        onClick={() => setSelected(index)}
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === 'Enter' ||
                                                event.key === ' '
                                            ) {
                                                event.preventDefault();
                                                setSelected(index);
                                            }
                                        }}
                                    >
                                        <title>{label}</title>
                                        <rect
                                            x={step * index}
                                            y="0"
                                            width={step}
                                            height="180"
                                            fill="transparent"
                                        />
                                        <rect
                                            x={
                                                x +
                                                (metric === 'shipments'
                                                    ? width
                                                    : 0)
                                            }
                                            y={180 - totalHeight}
                                            width={
                                                metric === 'amount'
                                                    ? width * 2
                                                    : width
                                            }
                                            height={totalHeight}
                                            rx="2"
                                            fill="var(--primary)"
                                            fillOpacity={
                                                metric === 'amount' ? 0.9 : 0.35
                                            }
                                        />
                                        {metric === 'shipments' && (
                                            <rect
                                                x={x}
                                                y={180 - deliveredHeight}
                                                width={width}
                                                height={deliveredHeight}
                                                rx="2"
                                                fill="var(--primary)"
                                            />
                                        )}
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                    <div
                        className="relative ml-13 h-4 text-xs text-muted-foreground"
                        aria-hidden="true"
                    >
                        {labels.map(({ day, index }) => (
                            <span
                                key={day.date}
                                className="absolute whitespace-nowrap"
                                style={{
                                    left:
                                        ((index + 0.5) / days.length) * 100 +
                                        '%',
                                    transform:
                                        index === 0
                                            ? undefined
                                            : index === days.length - 1
                                              ? 'translateX(-100%)'
                                              : 'translateX(-50%)',
                                }}
                            >
                                {dayLabel(day.date)}
                            </span>
                        ))}
                    </div>
                    <div
                        className="ml-13 flex min-h-6 flex-wrap items-center justify-between gap-2 text-xs"
                        aria-live="polite"
                    >
                        <div className="flex flex-wrap gap-4">
                            <span className="flex items-center gap-2">
                                <span
                                    className="size-2.5 rounded-sm bg-primary"
                                    aria-hidden="true"
                                />
                                {metric === 'amount'
                                    ? 'Amount APEX'
                                    : 'Resi terkirim'}
                            </span>
                            {metric === 'shipments' && (
                                <span className="flex items-center gap-2 text-muted-foreground">
                                    <span
                                        className="size-2.5 rounded-sm bg-primary/35"
                                        aria-hidden="true"
                                    />
                                    Resi total
                                </span>
                            )}
                        </div>
                        {active && (
                            <span className="text-muted-foreground tabular-nums">
                                {dayLabel(active.date)} ·{' '}
                                {metric === 'amount'
                                    ? dashboardMoney(active.amount)
                                    : dashboardNumber(active.delivered) +
                                      ' / ' +
                                      dashboardNumber(active.shipments)}
                            </span>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex h-60 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                    <Package className="size-7" aria-hidden="true" />
                    <p>Amount APEX belum tersedia pada periode ini.</p>
                </div>
            )}
            <Dialog>
                <DialogTrigger asChild>
                    <Button
                        variant="outline"
                        className="min-h-11 w-full justify-start"
                    >
                        <Table2 data-icon="inline-start" aria-hidden="true" />
                        Lihat data harian
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Data resi harian</DialogTitle>
                        <DialogDescription>
                            Jumlah resi dan amount berdasarkan tanggal kirim
                            pada periode terpilih.
                        </DialogDescription>
                    </DialogHeader>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tanggal</TableHead>
                                <TableHead className="text-right">
                                    Total resi
                                </TableHead>
                                <TableHead className="text-right">
                                    Terkirim
                                </TableHead>
                                <TableHead className="text-right">
                                    Amount APEX
                                </TableHead>
                                <TableHead className="text-right">
                                    Cakupan amount
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {days.map((day) => (
                                <TableRow key={day.date}>
                                    <TableCell>{dayLabel(day.date)}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {dashboardNumber(day.shipments)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {dashboardNumber(day.delivered)}
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
                </DialogContent>
            </Dialog>
        </OperationalPanel>
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
    const [expanded, setExpanded] = useState(false);
    const displayed = expanded ? rows : rows.slice(0, 5);
    const maximum = Math.max(1, ...rows.map((row) => row.shipments));
    return (
        <OperationalPanel
            title={title}
            icon={kind === 'destination' ? MapPin : Package}
            className="h-full"
            contentClassName="flex flex-col gap-1 pt-2"
            action={
                rows.length > 5 ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
                        aria-expanded={expanded}
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? 'Ringkas' : 'Lihat semua'}
                        <ArrowRight data-icon="inline-end" aria-hidden="true" />
                    </Button>
                ) : undefined
            }
        >
            <p className="mb-2 text-xs text-muted-foreground">
                {kind === 'destination'
                    ? '5 tujuan dengan jumlah resi terbanyak.'
                    : 'Distribusi layanan dari seluruh resi.'}
            </p>
            {rows.length === 0 && (
                <p className="flex min-h-36 items-center justify-center text-sm text-muted-foreground">
                    Belum ada data pada periode ini.
                </p>
            )}
            {displayed.map((row) => {
                const percentage = total ? (row.shipments / total) * 100 : 0;
                const name =
                    row.label ??
                    (kind === 'destination'
                        ? (row.key ?? 'Nama daerah belum tersedia')
                        : 'Tidak tersedia');
                return (
                    <Button
                        key={row.key ?? row.label ?? 'missing'}
                        variant="ghost"
                        disabled={(row.key ?? row.label) === null}
                        title={
                            name +
                            (row.multiple_names
                                ? ' · beberapa nama lokasi JNE'
                                : '')
                        }
                        className="h-auto min-h-11 w-full flex-col items-stretch gap-1.5 px-1 py-2"
                        onClick={() => {
                            const value = row.key ?? row.label;
                            if (value) onSelect(value);
                        }}
                    >
                        {kind === 'destination' ? (
                            <>
                                <span className="truncate text-left text-xs font-normal">
                                    {name}
                                </span>
                                <span className="flex items-center gap-4">
                                    <span
                                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                                        aria-hidden="true"
                                    >
                                        <span
                                            className="block h-full rounded-full bg-primary"
                                            style={{
                                                width:
                                                    (row.shipments / maximum) *
                                                        100 +
                                                    '%',
                                            }}
                                        />
                                    </span>
                                    <span className="w-9 text-right text-xs tabular-nums">
                                        {dashboardNumber(row.shipments)}
                                    </span>
                                </span>
                            </>
                        ) : (
                            <span className="grid w-full grid-cols-[5.5rem_1fr_3rem_2.5rem] items-center gap-3 text-xs">
                                <span className="truncate text-left font-normal">
                                    {name}
                                </span>
                                <span
                                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                                    aria-hidden="true"
                                >
                                    <span
                                        className="block h-full rounded-full bg-primary"
                                        style={{ width: percentage + '%' }}
                                    />
                                </span>
                                <span className="text-right tabular-nums">
                                    {dashboardNumber(row.shipments)}
                                </span>
                                <span className="text-right font-normal text-muted-foreground tabular-nums">
                                    {Math.round(percentage)}%
                                </span>
                            </span>
                        )}
                    </Button>
                );
            })}
        </OperationalPanel>
    );
}

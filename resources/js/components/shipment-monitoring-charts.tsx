import { useId, useState } from 'react';
import {
    OperationalPanel,
    opDate,
} from '@/components/operational-dashboard-charts';
import { NativeSelect } from '@/components/ui/native-select';
import { Disclosure, DisclosureSummary } from '@/components/ui/disclosure';
import { Label } from '@/components/ui/label';
import { trackingNumber } from '@/components/shipment-monitoring-ui';
import type { MonitoringSummary } from '@/types/shipment-monitoring';

export type ShipmentTrendRow = {
    date: string;
    entered: number;
    delivered: number;
};

export function ShipmentTrend({ data }: { data: ShipmentTrendRow[] }) {
    const [days, setDays] = useState('14');
    const id = useId();
    const rows = data.slice(-Number(days));
    const max = Math.max(
        1,
        ...rows.flatMap((row) => [row.entered, row.delivered]),
    );
    const ceiling = Math.ceil(max / 4) * 4;
    const x = (index: number) =>
        40 + (index * 600) / Math.max(1, rows.length - 1);
    const y = (value: number) => 164 - (value / ceiling) * 140;
    const points = (key: 'entered' | 'delivered') =>
        rows.map((row, index) => x(index) + ',' + y(row[key])).join(' ');
    return (
        <OperationalPanel
            title="Tren Pengiriman"
            className="h-full"
            action={
                <div className="flex items-center gap-2">
                    <Label htmlFor={id} className="sr-only">
                        Rentang tren pengiriman
                    </Label>
                    <NativeSelect
                        id={id}
                        value={days}
                        onChange={(event) => setDays(event.target.value)}
                    >
                        <option value="7">7 hari terakhir</option>
                        <option value="14">14 hari terakhir</option>
                    </NativeSelect>
                </div>
            }
        >
            <p className="text-xs text-muted-foreground">
                Volume AWB masuk dan terkirim · hari operasional WIB
            </p>
            {rows.length ? (
                <>
                    <svg
                        viewBox="0 0 660 200"
                        className="mt-2 h-36 w-full"
                        role="img"
                        aria-label="Tren AWB masuk dan terkirim dalam periode terpilih"
                    >
                        <defs>
                            <linearGradient
                                id={id + '-area'}
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
                                <stop
                                    offset="0%"
                                    stopColor="var(--success)"
                                    stopOpacity=".2"
                                />
                                <stop
                                    offset="100%"
                                    stopColor="var(--success)"
                                    stopOpacity=".02"
                                />
                            </linearGradient>
                        </defs>
                        {[0, 1, 2, 3, 4].map((tick) => (
                            <g key={tick}>
                                <line
                                    x1="40"
                                    x2="640"
                                    y1={y((tick * ceiling) / 4)}
                                    y2={y((tick * ceiling) / 4)}
                                    stroke="var(--border)"
                                />
                                <text
                                    x="32"
                                    y={y((tick * ceiling) / 4) + 4}
                                    textAnchor="end"
                                    fill="var(--muted-foreground)"
                                    fontSize="11"
                                >
                                    {trackingNumber((tick * ceiling) / 4)}
                                </text>
                            </g>
                        ))}
                        <polygon
                            points={
                                x(0) +
                                ',164 ' +
                                points('delivered') +
                                ' ' +
                                x(rows.length - 1) +
                                ',164'
                            }
                            fill={'url(#' + id + '-area)'}
                        />
                        {(['entered', 'delivered'] as const).map((key) => (
                            <g key={key}>
                                <polyline
                                    points={points(key)}
                                    fill="none"
                                    stroke={
                                        key === 'entered'
                                            ? 'var(--primary)'
                                            : 'var(--success)'
                                    }
                                    strokeWidth="2.5"
                                    strokeLinejoin="round"
                                />
                                {rows.map((row, index) => (
                                    <circle
                                        key={row.date}
                                        cx={x(index)}
                                        cy={y(row[key])}
                                        r="3.5"
                                        fill="var(--card)"
                                        stroke={
                                            key === 'entered'
                                                ? 'var(--primary)'
                                                : 'var(--success)'
                                        }
                                        strokeWidth="2"
                                        tabIndex={0}
                                        aria-label={
                                            opDate(row.date) +
                                            ': ' +
                                            (key === 'entered'
                                                ? 'AWB masuk '
                                                : 'Terkirim ') +
                                            row[key]
                                        }
                                    >
                                        <title>
                                            {opDate(row.date)}:{' '}
                                            {key === 'entered'
                                                ? 'AWB masuk'
                                                : 'Terkirim'}{' '}
                                            {trackingNumber(row[key])}
                                        </title>
                                    </circle>
                                ))}
                            </g>
                        ))}
                        {rows.map(
                            (row, index) =>
                                (index %
                                    Math.max(1, Math.ceil(rows.length / 7)) ===
                                    0 ||
                                    index === rows.length - 1) && (
                                    <text
                                        key={row.date}
                                        x={x(index)}
                                        y="190"
                                        textAnchor="middle"
                                        fill="var(--muted-foreground)"
                                        fontSize="11"
                                    >
                                        {opDate(row.date)}
                                    </text>
                                ),
                        )}
                    </svg>
                    <div className="flex justify-center gap-5 text-xs">
                        <span className="flex items-center gap-2">
                            <span
                                aria-hidden="true"
                                className="h-1 w-4 rounded bg-primary"
                            />
                            AWB Masuk
                        </span>
                        <span className="flex items-center gap-2">
                            <span
                                aria-hidden="true"
                                className="h-1 w-4 rounded bg-success"
                            />
                            Terkirim
                        </span>
                    </div>
                    <Disclosure
                        variant="plain"
                        className="mt-1 text-xs text-muted-foreground"
                    >
                        <DisclosureSummary className="px-0 text-xs text-muted-foreground">
                            Data harian
                        </DisclosureSummary>
                        <div className="max-h-44 overflow-auto pt-2">
                            <table className="w-full text-left">
                                <caption className="sr-only">
                                    Jumlah harian dari resi dalam periode entry
                                    terpilih. Hari operasional 05.00–04.59 WIB.
                                </caption>
                                <thead>
                                    <tr>
                                        <th>Tanggal</th>
                                        <th>AWB masuk</th>
                                        <th>Terkirim</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr key={row.date}>
                                            <td>{opDate(row.date)}</td>
                                            <td>
                                                {trackingNumber(row.entered)}
                                            </td>
                                            <td>
                                                {trackingNumber(row.delivered)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Disclosure>
                </>
            ) : (
                <p className="py-12 text-center text-sm text-muted-foreground">
                    Belum ada data tren pada periode ini.
                </p>
            )}
        </OperationalPanel>
    );
}

export function DeliveryPerformance({
    summary,
}: {
    summary: MonitoringSummary;
}) {
    const onTime = summary.sla_distribution?.DELIVERED_ON_TIME ?? 0;
    const late = summary.sla_distribution?.DELIVERED_LATE ?? 0;
    const rate = summary.on_time_rate;
    const percent = (value: number) =>
        new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(
            value,
        ) + '%';
    return (
        <OperationalPanel title="Delivery Performance" className="h-full">
            <div className="flex min-w-0 flex-wrap items-center gap-5 py-3">
                <div className="relative size-40 shrink-0">
                    <svg
                        viewBox="0 0 120 120"
                        className="size-full"
                        role="img"
                        aria-label={
                            'On-time Delivery Rate: ' +
                            (rate === null
                                ? 'belum dapat dinilai'
                                : percent(rate))
                        }
                    >
                        <circle
                            cx="60"
                            cy="60"
                            r="49"
                            fill="none"
                            stroke="var(--muted)"
                            strokeWidth="9"
                        />
                        {rate !== null && (
                            <>
                                <circle
                                    cx="60"
                                    cy="60"
                                    r="49"
                                    fill="none"
                                    stroke="var(--success)"
                                    strokeWidth="9"
                                    pathLength="100"
                                    strokeDasharray={rate + ' ' + (100 - rate)}
                                    transform="rotate(-90 60 60)"
                                />
                                <circle
                                    cx="60"
                                    cy="60"
                                    r="49"
                                    fill="none"
                                    stroke="var(--destructive)"
                                    strokeWidth="9"
                                    pathLength="100"
                                    strokeDasharray={100 - rate + ' ' + rate}
                                    strokeDashoffset={-rate}
                                    transform="rotate(-90 60 60)"
                                />
                            </>
                        )}
                    </svg>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
                        <span className="text-3xl font-semibold tabular-nums">
                            {rate === null ? '—' : percent(rate)}
                        </span>
                        <span className="text-center text-xs text-muted-foreground">
                            On-time
                            <br />
                            Delivery Rate
                        </span>
                    </div>
                </div>
                <div className="flex min-w-0 flex-1 basis-44 flex-col gap-3 text-sm">
                    {[
                        [onTime, 'Tepat waktu', 'bg-success'],
                        [late, 'Terlambat', 'bg-destructive'],
                    ].map(([count, label, color]) => (
                        <div
                            key={label}
                            className="flex items-center gap-2 border-b pb-2"
                        >
                            <span
                                aria-hidden="true"
                                className={
                                    'size-2 shrink-0 rounded-full ' + color
                                }
                            />
                            <span className="flex-1">{label}</span>
                            <strong className="tabular-nums">
                                {trackingNumber(Number(count))}
                            </strong>
                            <span className="w-14 text-right text-xs text-muted-foreground">
                                {summary.delivered_evaluated
                                    ? percent(
                                          (Number(count) /
                                              summary.delivered_evaluated) *
                                              100,
                                      )
                                    : '—'}
                            </span>
                        </div>
                    ))}
                    <div className="rounded-lg bg-primary/5 p-3 text-xs">
                        <p>
                            {trackingNumber(summary.delivered_evaluated)}{' '}
                            delivered dapat dinilai
                        </p>
                        <p className="mt-1 text-muted-foreground">
                            Belum dapat dinilai:{' '}
                            {trackingNumber(summary.delivered_unknown)} ·
                            Dikecualikan (cancel/return):{' '}
                            {trackingNumber(summary.excluded)}
                        </p>
                    </div>
                </div>
            </div>
        </OperationalPanel>
    );
}

export const shipmentColors: Record<string, string> = {
    DELIVERED: 'var(--success)',
    IN_TRANSIT: 'var(--primary)',
    CANCELLED: 'var(--muted-foreground)',
    RETURNED: 'var(--warning)',
    EXCEPTION: 'var(--chart-4)',
    UNKNOWN: 'var(--muted-foreground)',
};

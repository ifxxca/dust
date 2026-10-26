import { Head, Link } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { CalendarDays, ChevronDown, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PickupMonitoringViews from '@/components/pickup-monitoring-views';
import { operationalRangeLabel } from '@/components/pickup-monitoring-period';
import type { MonitoringOperations } from '@/components/pickup-monitoring-period';
import * as routes from '@/routes/pickup-results';

export function MonitoringWorkspaceHeader({
    current,
    filters,
    operations,
    busy,
    rangeOpen,
    toggleRange,
    refresh,
    submit,
    dates,
    setDate,
    insights,
}: {
    current: 'pickup' | 'processing';
    filters: Record<string, string>;
    operations: MonitoringOperations;
    busy: boolean;
    rangeOpen: boolean;
    toggleRange: () => void;
    openAdvanced: () => void;
    refresh: () => void;
    submit: (values: Record<string, string>) => void;
    dates: Record<string, string>;
    setDate: (key: string, value: string) => void;
    insights?: ReactNode;
}) {
    const period =
        filters.date_from === filters.date_to
            ? filters.date_from
            : `${filters.date_from} – ${filters.date_to}`;
    return (
        <>
            <Head
                title={`Hasil Pickup · ${current === 'pickup' ? 'Monitoring Pickup' : 'Pemrosesan Paket'}`}
            />
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Hasil Pickup
                    </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={toggleRange}
                        aria-expanded={rangeOpen}
                        aria-controls="monitoring-range"
                    >
                        <CalendarDays className="size-4" />
                        {period}
                        <span className="text-muted-foreground">WIB</span>
                        <ChevronDown className="size-3" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        aria-label="Muat ulang monitoring"
                        disabled={busy}
                        onClick={refresh}
                    >
                        <RefreshCw className="size-4" />
                    </Button>
                    <Button asChild size="sm">
                        <a href={routes.exportMethod.url({ query: filters })}>
                            <Download className="size-4" />
                            Ekspor CSV
                        </a>
                    </Button>
                </div>
            </header>
            <PickupMonitoringViews current={current} filters={filters} />
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                    className="flex flex-wrap items-center gap-1"
                    aria-label="Periode monitoring"
                >
                    {Object.entries(operations.presets).map(([key, values]) => {
                        const selected =
                            (!filters.scope || filters.scope === 'daily') &&
                            values.date_from === filters.date_from &&
                            values.date_to === filters.date_to;
                        return (
                            <Button
                                key={key}
                                size="sm"
                                disabled={busy}
                                variant={selected ? 'secondary' : 'ghost'}
                                aria-pressed={selected}
                                onClick={() =>
                                    submit({
                                        ...filters,
                                        ...values,
                                        scope: 'daily',
                                        pickup_queue: '',
                                    })
                                }
                            >
                                {
                                    (
                                        {
                                            today: 'Hari Ini',
                                            yesterday: 'Kemarin',
                                            week: '7 Hari',
                                        } as Record<string, string>
                                    )[key]
                                }
                            </Button>
                        );
                    })}
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={toggleRange}
                        aria-expanded={rangeOpen}
                        aria-controls="monitoring-range"
                    >
                        Rentang Tanggal
                    </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {insights && (
                        <details className="text-sm">
                            <summary className="cursor-pointer rounded-md px-2 py-2 font-medium focus-visible:outline-2 focus-visible:outline-ring">
                                Rincian monitoring
                            </summary>
                            <div className="mt-2">{insights}</div>
                        </details>
                    )}
                    <span className="text-xs text-muted-foreground">
                        {operationalRangeLabel(
                            filters.date_from,
                            filters.date_to,
                        )}
                    </span>
                </div>
            </div>
            {rangeOpen && (
                <form
                    id="monitoring-range"
                    className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        submit({ ...dates, scope: 'daily', pickup_queue: '' });
                    }}
                >
                    {['date_from', 'date_to'].map((key) => (
                        <div className="space-y-1" key={key}>
                            <Label htmlFor={`monitoring-${key}`}>
                                {key === 'date_from'
                                    ? 'Dari tanggal'
                                    : 'Sampai tanggal'}
                            </Label>
                            <Input
                                id={`monitoring-${key}`}
                                type="date"
                                required
                                value={dates[key]}
                                onInput={(event) =>
                                    setDate(key, event.currentTarget.value)
                                }
                            />
                        </div>
                    ))}
                    <Button size="sm" disabled={busy}>
                        Terapkan rentang
                    </Button>
                    <span className="pb-1 text-xs text-muted-foreground">
                        Asia/Jakarta · 05.00–05.00 esok · 7 hari operasional.
                    </span>
                </form>
            )}
        </>
    );
}

export function MonitoringMetric({
    label,
    value,
    hint,
    href,
    warning = false,
}: {
    label: string;
    value: number | null;
    hint: string;
    href?: string;
    warning?: boolean;
}) {
    const body = (
        <>
            <span className="min-w-0 text-xs text-muted-foreground">
                {label}
            </span>
            <p
                className={`shrink-0 font-semibold tabular-nums ${value === null ? 'text-xs' : 'text-xl'} ${warning ? 'text-amber-800 dark:text-amber-300' : ''}`}
            >
                {value === null
                    ? 'Belum tersedia'
                    : value.toLocaleString('id-ID')}
            </p>
            <span className="sr-only">{hint}</span>
        </>
    );
    return href ? (
        <MonitoringLink href={href} hint={hint}>
            {body}
        </MonitoringLink>
    ) : (
        <div
            title={hint}
            className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-lg border bg-card p-2"
        >
            {body}
        </div>
    );
}

function MonitoringLink({
    href,
    hint,
    children,
}: {
    href: string;
    hint: string;
    children: ReactNode;
}) {
    return (
        <Link
            href={href}
            title={hint}
            preserveScroll
            className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-lg border bg-card p-2 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-primary"
        >
            {children}
        </Link>
    );
}

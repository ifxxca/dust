import { Head, Link, router, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { RefreshCw, ArrowRight } from 'lucide-react';
import PageContainer from '@/components/page-container';
import CustomerPicker from '@/components/customer-picker';
import FilterSelect from '@/components/filter-select';
import InputError from '@/components/input-error';
import { PerformanceContent } from '@/components/operational-performance-content';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { operationalPerformance } from '@/routes';
import { performanceDrilldown } from '@/lib/operational-performance';
import type {
    PerformanceData,
    PerformanceFilters,
} from '@/types/operational-performance';

export default function OperationalPerformance({
    performance,
    filters,
    selectedCustomer,
}: {
    performance: PerformanceData;
    filters: PerformanceFilters;
    selectedCustomer: {
        id: number;
        name: string;
        customer_code: string | null;
    } | null;
}) {
    const { errors } = usePage().props;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [dates, setDates] = useState({
        date_from: filters.date_from,
        date_thru: filters.date_thru,
    });
    useEffect(() => {
        const field = Object.keys(errors)[0];
        if (busy || !field) return;
        const frame = requestAnimationFrame(() =>
            document.getElementById(field)?.focus(),
        );
        return () => cancelAnimationFrame(frame);
    }, [errors, busy]);
    function visit(next: Partial<PerformanceFilters> = {}) {
        router.get(
            operationalPerformance.url(),
            { ...filters, customer_page: 1, ...next },
            {
                preserveScroll: true,
                preserveState: true,
                onStart: () => {
                    setBusy(true);
                    setError('');
                },
                onSuccess: (page) => {
                    const applied = page.props.filters as PerformanceFilters;
                    setDates({
                        date_from: applied.date_from,
                        date_thru: applied.date_thru,
                    });
                },
                onFinish: () => setBusy(false),
                onNetworkError: () => {
                    setError(
                        'Data belum diperbarui. Periksa koneksi lalu coba Refresh.',
                    );
                    return false;
                },
                onHttpException: (response) => {
                    if (response.status >= 500) {
                        setError(
                            'Data belum dapat dimuat. Coba Refresh beberapa saat lagi.',
                        );
                        return false;
                    }
                },
            },
        );
    }
    const updated = performance.summary.observed_at
        ? new Intl.DateTimeFormat('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Jakarta',
          }).format(new Date(performance.summary.observed_at)) + ' WIB'
        : 'Belum ada observasi sumber';
    return (
        <PageContainer
            variant="wide"
            className="flex min-w-0 flex-col gap-6 space-y-0 py-5"
        >
            <Head title="Operational Performance" />
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-xl leading-7 font-semibold tracking-tight text-balance sm:text-2xl sm:leading-8">
                        Operational Performance
                    </h1>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
                        Monitoring kinerja pengiriman, SLA, customer, exception,
                        dan proses operasional.
                    </p>
                </div>
                <Button asChild className="min-h-11 shrink-0">
                    <Link
                        href={performanceDrilldown(filters)}
                        aria-label="Monitoring Resi"
                    >
                        <span className="hidden sm:inline">
                            Monitoring Resi
                        </span>
                        <ArrowRight aria-hidden="true" />
                    </Link>
                </Button>
            </header>
            <div
                aria-label="Filter global"
                className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3 shadow-none sm:p-4"
            >
                <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-[140px_minmax(200px,1fr)_minmax(200px,1fr)_auto]">
                    <FilterSelect
                        id="period"
                        label="Periode"
                        value={filters.period}
                        all="Pilih periode"
                        options={[
                            ['daily', 'Daily'],
                            ['weekly', 'Weekly'],
                            ['monthly', 'Monthly'],
                            ['custom', 'Custom'],
                        ]}
                        disabled={busy}
                        onChange={(period) => {
                            if (period)
                                visit({
                                    period: period as PerformanceFilters['period'],
                                });
                        }}
                    />
                    <FilterSelect
                        id="outlet"
                        label="Outlet"
                        value={filters.outlet ?? ''}
                        all="Semua outlet"
                        options={[
                            ...new Set([
                                ...performance.outlet_options,
                                ...(filters.outlet ? [filters.outlet] : []),
                            ]),
                        ].map((value) => [value, value])}
                        disabled={busy}
                        onChange={(outlet) => visit({ outlet })}
                    />
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <Label htmlFor="customer_id">Customer</Label>
                        <CustomerPicker
                            selected={selectedCustomer}
                            allowClear
                            disabled={busy}
                            triggerId="customer_id"
                            placeholder="Semua customer"
                            onSelect={(customer) =>
                                visit({ customer_id: customer?.id ?? '' })
                            }
                            className="min-h-11 w-full"
                        />
                        <InputError message={errors.customer_id} />
                    </div>
                    <div className="flex items-end">
                        <Button
                            variant="outline"
                            onClick={() =>
                                visit({
                                    customer_page: filters.customer_page ?? 1,
                                })
                            }
                            disabled={busy}
                            className="min-h-11 w-full"
                            aria-label="Refresh"
                        >
                            <RefreshCw
                                aria-hidden="true"
                                className={
                                    busy
                                        ? 'animate-spin motion-reduce:animate-none'
                                        : ''
                                }
                            />
                            {busy ? 'Memuat…' : 'Refresh'}
                        </Button>
                    </div>
                </div>
                {filters.period === 'custom' && (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            visit({ ...dates, period: 'custom' });
                        }}
                        className="flex flex-wrap items-start gap-3"
                    >
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-none">
                            <Label htmlFor="date_from">Dari</Label>
                            <Input
                                id="date_from"
                                name="date_from"
                                type="date"
                                value={dates.date_from}
                                onChange={(event) =>
                                    setDates({
                                        ...dates,
                                        date_from: event.target.value,
                                    })
                                }
                                required
                                aria-invalid={!!errors.date_from}
                                aria-describedby={
                                    errors.date_from
                                        ? 'date_from-error'
                                        : undefined
                                }
                                disabled={busy}
                                className="min-h-11"
                            />
                            <InputError
                                id="date_from-error"
                                message={errors.date_from}
                            />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-none">
                            <Label htmlFor="date_thru">Sampai</Label>
                            <Input
                                id="date_thru"
                                name="date_thru"
                                type="date"
                                value={dates.date_thru}
                                onChange={(event) =>
                                    setDates({
                                        ...dates,
                                        date_thru: event.target.value,
                                    })
                                }
                                required
                                aria-invalid={!!errors.date_thru}
                                aria-describedby={
                                    errors.date_thru
                                        ? 'date_thru-error'
                                        : undefined
                                }
                                disabled={busy}
                                className="min-h-11"
                            />
                            <InputError
                                id="date_thru-error"
                                message={errors.date_thru}
                            />
                        </div>
                        <Button
                            type="submit"
                            disabled={busy}
                            className="mt-5 min-h-11"
                        >
                            Tampilkan periode
                        </Button>
                    </form>
                )}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-3 text-[11px] text-muted-foreground sm:text-xs">
                    <span>
                        {filters.date_from} – {filters.date_thru} · 05:00–04:59
                        WIB
                    </span>
                    <span>Data terakhir diamati: {updated}</span>
                </div>
                {performance.outlet_options_truncated && (
                    <p className="text-xs text-muted-foreground">
                        100 outlet pertama dalam periode ini. Gunakan periode
                        lebih spesifik.
                    </p>
                )}
            </div>
            <nav
                aria-label="Bagian performance"
                className="-mt-2 flex gap-1 overflow-x-auto border-b"
            >
                {[
                    ['overview', 'Ringkasan'],
                    ['sla', 'SLA'],
                    ['customers', 'Customer'],
                    ['exceptions', 'UNRCC & Return'],
                    ['follow-up', 'Follow-up'],
                ].map(([id, title]) => (
                    <Button
                        asChild
                        key={id}
                        variant="ghost"
                        className="min-h-11 shrink-0 rounded-none px-3 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <a href={`#${id}`}>{title}</a>
                    </Button>
                ))}
            </nav>
            <div
                aria-live="polite"
                className={!error && !busy ? 'hidden' : undefined}
            >
                {error && (
                    <Alert variant="destructive">
                        <AlertDescription>
                            {error} Tampilan sebelumnya tetap tersedia.
                        </AlertDescription>
                    </Alert>
                )}
                {busy && (
                    <div role="status" className="flex flex-col gap-2">
                        <span className="text-sm text-muted-foreground">
                            Memuat performance…
                        </span>
                        <Skeleton className="h-2 w-full" />
                    </div>
                )}
            </div>
            <div aria-busy={busy} className="flex min-w-0 flex-col gap-7">
                <PerformanceContent
                    performance={performance}
                    filters={filters}
                    onCustomerPage={(page) => visit({ customer_page: page })}
                />
            </div>
        </PageContainer>
    );
}

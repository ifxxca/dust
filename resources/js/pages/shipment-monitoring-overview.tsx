import { Deferred, Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import {
    DeliveryPerformance,
    ShipmentTrend,
    shipmentColors,
    type ShipmentTrendRow,
} from '@/components/shipment-monitoring-charts';
import PageContainer from '@/components/page-container';
import SecondaryDisclosure from '@/components/secondary-disclosure';
import MonitoringTable from '@/components/shipment-monitoring-table';
import {
    MonitoringHeader,
    MonitoringPeriod,
    MonitoringKpis,
    MonitoringNavigation,
    trackingNumber,
} from '@/components/shipment-monitoring-ui';
import { OperationalPanel } from '@/components/operational-dashboard-charts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
    attentionCategories,
    type TrackingFilters,
} from '@/lib/shipment-monitoring';
import { trackingLabels } from '@/lib/jne-monitoring';
import { attention, index, overview } from '@/routes/shipment-monitoring';
import type {
    MonitoringSummary,
    TrackingShipment,
} from '@/types/shipment-monitoring';
export default function ShipmentOverview({
    summary,
    preview,
    trend,
    filters,
    timezone,
    priorityCategory = 'all',
    priorityPage = 1,
}: {
    summary: MonitoringSummary;
    preview?: TrackingShipment[];
    trend?: ShipmentTrendRow[];
    filters: Partial<TrackingFilters>;
    timezone: string;
    priorityCategory?: string;
    priorityPage?: number;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const priorityCount =
        attentionCategories.find(([key]) => key === priorityCategory)?.[2] ??
        'attention';
    const priorityTotal = summary[priorityCount];
    const options = {
        preserveScroll: true,
        onStart: () => {
            setBusy(true);
            setError('');
        },
        onFinish: () => setBusy(false),
        onNetworkError: () => {
            setError(
                'Ringkasan belum diperbarui. Periksa koneksi lalu coba lagi.',
            );
            return false as const;
        },
        onHttpException: (response: { status: number }) => {
            if (response.status >= 500) {
                setError(
                    'Ringkasan belum dapat dimuat. Coba muat ulang beberapa saat lagi.',
                );
                return false as const;
            }
        },
    };
    const changePriority = (category: string, page: number) =>
        router.get(
            overview.url(),
            { ...filters, attention: category, page },
            {
                ...options,
                preserveState: true,
                only: ['preview', 'priorityCategory', 'priorityPage'],
            },
        );
    return (
        <PageContainer className="flex min-w-0 flex-col gap-4 space-y-0 py-4 shipment-monitoring-surface">
            <Head title="Monitoring Resi" />
            <MonitoringHeader
                title="Monitoring Resi"
                description="Pantau kiriman, performa SLA, dan prioritas tindak lanjut."
                observedAt={summary.observed_at}
                calculatedAt={summary.calculated_at}
                timezone={timezone}
                busy={busy}
                refresh={() =>
                    router.reload({
                        ...options,
                        headers: { 'X-Monitoring-Refresh': '1' },
                    })
                }
            >
                <MonitoringPeriod
                    filters={filters}
                    current="overview"
                    busy={busy}
                />
            </MonitoringHeader>
            <MonitoringNavigation current="overview" filters={filters} />
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {busy && (
                <p role="status" className="text-sm text-muted-foreground">
                    Memuat ringkasan…
                </p>
            )}
            <MonitoringKpis summary={summary} filters={filters} />
            <div className="grid min-w-0 gap-4 xl:grid-cols-[1.35fr_1fr]">
                <Deferred
                    data="trend"
                    fallback={
                        <OperationalPanel title="Tren Pengiriman">
                            <Skeleton className="mt-3 h-56 w-full" />
                            <p role="status" className="sr-only">
                                Memuat tren pengiriman…
                            </p>
                        </OperationalPanel>
                    }
                >
                    {() => <ShipmentTrend data={trend ?? []} />}
                </Deferred>
                <DeliveryPerformance summary={summary} />
            </div>
            <div className="grid min-w-0 gap-4 xl:grid-cols-[1.1fr_1fr]">
                <OperationalPanel title="Distribusi Status Pengiriman">
                    <div
                        role="img"
                        aria-label="Distribusi status pengiriman sesuai periode terpilih"
                        className="mt-4 flex h-8 overflow-hidden rounded-lg bg-muted"
                    >
                        {Object.entries(summary.distribution ?? {})
                            .filter(([, value]) => value > 0)
                            .map(([key, value]) => (
                                <div
                                    key={key}
                                    style={{
                                        width:
                                            (summary.total
                                                ? (value / summary.total) * 100
                                                : 0) + '%',
                                        backgroundColor: shipmentColors[key],
                                    }}
                                    title={
                                        (trackingLabels[key] ?? key) +
                                        ': ' +
                                        trackingNumber(value)
                                    }
                                    className="flex min-w-px items-center justify-center text-xs font-medium text-primary-foreground"
                                >
                                    {summary.total > 0 &&
                                    value / summary.total > 0.2
                                        ? new Intl.NumberFormat('id-ID', {
                                              style: 'percent',
                                              maximumFractionDigits: 1,
                                          }).format(value / summary.total)
                                        : ''}
                                </div>
                            ))}
                    </div>
                    <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-xs">
                        {Object.entries(summary.distribution ?? {}).map(
                            ([key, value]) => (
                                <div
                                    key={key}
                                    className="flex items-start gap-2"
                                >
                                    <span
                                        aria-hidden="true"
                                        className="mt-0.5 size-3 shrink-0 rounded"
                                        style={{
                                            backgroundColor:
                                                shipmentColors[key],
                                        }}
                                    />
                                    <div>
                                        <dt>{trackingLabels[key] ?? key}</dt>
                                        <dd className="mt-1 font-medium tabular-nums">
                                            {trackingNumber(value)}{' '}
                                            <span className="font-normal text-muted-foreground">
                                                (
                                                {new Intl.NumberFormat(
                                                    'id-ID',
                                                    {
                                                        style: 'percent',
                                                        maximumFractionDigits: 1,
                                                    },
                                                ).format(
                                                    summary.total
                                                        ? value / summary.total
                                                        : 0,
                                                )}
                                                )
                                            </span>
                                        </dd>
                                    </div>
                                </div>
                            ),
                        )}
                    </dl>
                </OperationalPanel>
                <OperationalPanel title="Kendala Pengiriman">
                    <p className="mb-3 text-xs text-muted-foreground">
                        Jumlah AWB per kategori perhatian; satu resi dapat
                        memiliki beberapa alasan.
                    </p>
                    <dl className="flex flex-col gap-3 text-xs">
                        {attentionCategories
                            .filter(([key]) => key !== 'all')
                            .map(([key, label, count]) => (
                                <div
                                    key={key}
                                    className="flex items-center gap-3"
                                >
                                    <dt className="w-32 shrink-0">
                                        <Link
                                            className="hover:text-primary hover:underline"
                                            href={attention({
                                                query: {
                                                    ...filters,
                                                    attention: key,
                                                },
                                            })}
                                        >
                                            {label}
                                        </Link>
                                    </dt>
                                    <dd className="flex flex-1 items-center gap-3">
                                        <span
                                            aria-hidden="true"
                                            className="h-2.5 flex-1 overflow-hidden rounded bg-muted"
                                        >
                                            <span
                                                className="block h-full rounded"
                                                style={{
                                                    width:
                                                        (summary[count] /
                                                            Math.max(
                                                                1,
                                                                summary.over_sla,
                                                                summary.potential_overdue,
                                                                summary.exception,
                                                                summary.returned,
                                                            )) *
                                                            100 +
                                                        '%',
                                                    backgroundColor:
                                                        key === 'over_sla'
                                                            ? 'var(--destructive)'
                                                            : key ===
                                                                'potential_overdue'
                                                              ? 'var(--warning)'
                                                              : key === 'return'
                                                                ? 'var(--chart-4)'
                                                                : 'var(--chart-3)',
                                                }}
                                            />
                                        </span>
                                        <strong className="w-8 text-right tabular-nums">
                                            {trackingNumber(summary[count])}
                                        </strong>
                                    </dd>
                                </div>
                            ))}
                    </dl>
                </OperationalPanel>
            </div>
            <section
                aria-labelledby="attention-preview-heading"
                className="flex min-w-0 flex-col gap-3"
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2
                        id="attention-preview-heading"
                        className="font-semibold"
                    >
                        Prioritas Perhatian{' '}
                        <span className="text-sm font-normal text-muted-foreground">
                            ({trackingNumber(summary.attention)})
                        </span>
                    </h2>
                    <Button asChild variant="ghost" className="min-h-11">
                        <Link
                            href={attention({
                                query: {
                                    ...filters,
                                    attention: priorityCategory,
                                },
                            })}
                        >
                            Lihat semua
                            <ArrowRight aria-hidden="true" />
                        </Link>
                    </Button>
                </div>
                <ToggleGroup
                    type="single"
                    value={priorityCategory}
                    onValueChange={(value) => {
                        if (value) changePriority(value, 1);
                    }}
                    aria-label="Ringkasan kategori perhatian"
                    className="flex flex-wrap justify-start gap-2"
                >
                    {attentionCategories.map(([key, label, count]) => (
                        <ToggleGroupItem
                            value={key}
                            key={key}
                            disabled={busy}
                            className="h-auto min-h-11 max-w-full rounded-full border px-4 whitespace-normal data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                        >
                            {label}{' '}
                            <span className="text-xs tabular-nums">
                                {trackingNumber(summary[count])}
                            </span>
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
                <Deferred
                    data="preview"
                    fallback={
                        <div
                            role="status"
                            aria-label="Memuat prioritas penanganan"
                            className="flex flex-col gap-3 rounded-xl border p-4"
                        >
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <span className="sr-only">
                                Memuat prioritas penanganan…
                            </span>
                        </div>
                    }
                >
                    {() => (
                        <MonitoringTable
                            rows={preview ?? []}
                            timezone={timezone}
                            attention
                            filters={filters}
                            busy={busy}
                        />
                    )}
                </Deferred>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span role="status">
                        Menampilkan{' '}
                        {preview?.length ? (priorityPage - 1) * 5 + 1 : 0}–
                        {(priorityPage - 1) * 5 + (preview?.length ?? 0)} dari{' '}
                        {trackingNumber(priorityTotal)} resi
                    </span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy || priorityPage <= 1}
                            onClick={() =>
                                changePriority(
                                    priorityCategory,
                                    priorityPage - 1,
                                )
                            }
                        >
                            Sebelumnya
                        </Button>
                        <span>Halaman {priorityPage}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy || priorityPage * 5 >= priorityTotal}
                            onClick={() =>
                                changePriority(
                                    priorityCategory,
                                    priorityPage + 1,
                                )
                            }
                        >
                            Berikutnya
                        </Button>
                    </div>
                </div>
            </section>
            <SecondaryDisclosure title="Kualitas data & dasar SLA">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <Link
                        className="text-primary underline-offset-4 hover:underline"
                        href={index({
                            query: { ...filters, customer_link: 'unlinked' },
                        })}
                    >
                        Customer belum terhubung:{' '}
                        {trackingNumber(summary.unlinked)}
                    </Link>
                    <Link
                        className="text-primary underline-offset-4 hover:underline"
                        href={index({
                            query: { ...filters, status: 'UNKNOWN' },
                        })}
                    >
                        Status belum dikenal: {trackingNumber(summary.unknown)}
                    </Link>
                    <Link
                        className="text-primary underline-offset-4 hover:underline"
                        href={index({
                            query: { ...filters, sla_status: 'UNKNOWN' },
                        })}
                    >
                        SLA belum dapat dinilai:{' '}
                        {trackingNumber(summary.sla_distribution.UNKNOWN)}
                    </Link>
                    <span>
                        Belum diamati: {trackingNumber(summary.unobserved)}
                    </span>
                    <span>
                        Data belum diperbarui:{' '}
                        {summary.stale === null
                            ? 'Pilih batas usia'
                            : trackingNumber(summary.stale)}
                    </span>
                </div>
                <p>
                    Native SLA berasal dari CARRER dan tanda nilai SLA JNE.
                    Indikasi Over SLA berarti AGING_ONGOING melebihi ETD pada
                    snapshot sumber, bukan kepastian jumlah hari terlambat.
                    Satuan layanan dan kalender belum memastikan deadline
                    aktual. Customer belum terhubung dan kualitas data bukan
                    alasan antrean operasional.
                </p>
            </SecondaryDisclosure>
        </PageContainer>
    );
}

import * as reports from '@/routes/jne-reports';
import { Head, Link, router, usePoll, useForm } from '@inertiajs/react';
import { RefreshCw } from 'lucide-react';
import JneShipmentSummary from '@/components/jne-shipment-summary';
import JneOperationsSummary, {
    type JneOperations,
} from '@/components/jne-operations-summary';
import { useCallback, useEffect, useRef, useState } from 'react';
import JneTrackingRefreshCard, {
    type TrackingRefresh,
} from '@/components/jne-tracking-refresh-card';
import ShipmentDetailSheet from '@/components/jne-shipment-detail-sheet';
import ShipmentFilters from '@/components/jne-shipment-filters';
import ShipmentDataTable from '@/components/jne-shipment-table';
import PageContainer from '@/components/page-container';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import {
    emptyJneFilters,
    latestJneObservation,
    normalizeJneFilters,
    jneTimestamp,
} from '@/lib/jne-monitoring';
import * as monitoring from '@/routes/jne-monitoring';
import * as exceptions from '@/routes/jne-exceptions';
import * as refreshPolicies from '@/routes/jne-refresh';
import * as evidenceRules from '@/routes/jne-evidence';
import * as runs from '@/routes/report-runs';
import type {
    JneCustomer,
    JneFilters,
    JnePage,
    JneShipment,
} from '@/types/jne';

export default function JneMonitoring({
    shipments,
    summary,
    filters,
    accounts,
    customers = [],
    timezone,
    trackingRefresh,
    identitySummary,
    operationsSummary,
}: {
    shipments: JnePage<JneShipment>;
    summary: Record<string, number>;
    filters: Partial<Record<keyof JneFilters, string | number | null>>;
    accounts: string[];
    customers?: JneCustomer[];
    timezone: string;
    trackingRefresh?: TrackingRefresh;
    identitySummary?: Record<string, number>;
    operationsSummary?: JneOperations;
}) {
    const refresh = useForm({ profile_id: trackingRefresh?.profile?.id ?? 0 });
    const applied = normalizeJneFilters(filters);
    const filterKey = JSON.stringify(applied);
    const [draft, setDraft] = useState(applied);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [errors, setErrors] = useState<
        Partial<Record<keyof JneFilters, string>>
    >({});
    const [detailId, setDetailId] = useState<number | null>(null);
    const detailOrigin = useRef<HTMLElement | null>(null);
    useEffect(() => {
        setDraft(JSON.parse(filterKey));
        setErrors({});
    }, [filterKey]);

    const networkError = () => {
        setError('Koneksi terputus. Periksa koneksi lalu muat ulang daftar.');
        return false;
    };
    usePoll(15000, {
        only: [
            'shipments',
            'summary',
            'trackingRefresh',
            'identitySummary',
            'operationsSummary',
        ],
        onSuccess: () => setError(''),
        onNetworkError: networkError,
        onHttpException: (response) => {
            if (response.status >= 500) {
                setError(
                    'Daftar belum dapat dimuat dari server. Silakan coba lagi.',
                );
                return false;
            }
        },
    });

    const visit = (next: JneFilters, page = 1) => {
        router.get(
            monitoring.index.url(),
            { ...next, ...(page > 1 ? { page } : {}) },
            {
                preserveState: true,
                preserveScroll: true,
                onStart: () => {
                    setLoading(true);
                    setError('');
                    setErrors({});
                },
                onFinish: () => setLoading(false),
                onSuccess: () => {
                    setDraft(next);
                    setError('');
                },
                onError: (validation) => {
                    setErrors(validation);
                    setError('Periksa nilai filter yang dipilih.');
                },
                onNetworkError: networkError,
                onHttpException: (response) => {
                    if (response.status >= 500) {
                        setError(
                            'Daftar belum dapat dimuat dari server. Silakan coba lagi.',
                        );
                        return false;
                    }
                },
            },
        );
    };
    const reset = () => {
        setDraft(emptyJneFilters);
        visit(emptyJneFilters);
    };
    const openDetail = useCallback((id: number, origin: HTMLElement | null) => {
        detailOrigin.current = origin;
        setDetailId(id);
    }, []);
    const latest = latestJneObservation(shipments.data);
    const filtered = Object.values(applied).some(Boolean);

    return (
        <PageContainer className="flex flex-col gap-4 space-y-0 py-4">
            <Head title="Pengiriman JNE" />
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Pengiriman JNE
                    </h1>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xs text-muted-foreground">
                        {latest
                            ? `Diamati di halaman ini: ${jneTimestamp(latest, timezone)} · `
                            : ''}
                        {timezone}
                        {' · Snapshot report'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        {!!operationsSummary?.global_collection_failures && (
                            <Badge variant="destructive" asChild>
                                <Link href={runs.index.url()}>
                                    {
                                        operationsSummary.global_collection_failures
                                    }{' '}
                                    report perlu ditinjau
                                </Link>
                            </Badge>
                        )}
                        <Button
                            size="sm"
                            variant="outline"
                            className="min-h-11"
                            asChild
                        >
                            <Link href={reports.index.url()}>Tarik report</Link>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={loading}
                            onClick={() =>
                                visit(applied, shipments.current_page)
                            }
                        >
                            <RefreshCw
                                className={loading ? 'animate-spin' : ''}
                            />
                            Segarkan
                        </Button>
                    </div>
                </div>
            </header>
            <section
                className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm"
                aria-label="Monitoring AWB"
            >
                <div className="flex flex-col gap-3 p-4">
                    <ShipmentFilters
                        draft={draft}
                        applied={applied}
                        accounts={accounts}
                        customers={customers}
                        loading={loading}
                        errors={errors}
                        onChange={(key, value) =>
                            setDraft((current) => ({
                                ...current,
                                [key]: value,
                            }))
                        }
                        onApply={() => visit(draft)}
                        onReset={reset}
                        onRemove={(key) => visit({ ...applied, [key]: '' })}
                    />
                </div>
                <div className="flex flex-col gap-3 px-4 pb-4">
                    {identitySummary && (
                        <section
                            aria-label="Kepastian identitas AWB"
                            className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
                        >
                            <p>
                                {identitySummary.collected.toLocaleString(
                                    'id-ID',
                                )}{' '}
                                AWB tersimpan ·{' '}
                                {identitySummary.customer_matched.toLocaleString(
                                    'id-ID',
                                )}{' '}
                                AWB customer terkonfirmasi ·{' '}
                                {identitySummary.pickup_matched.toLocaleString(
                                    'id-ID',
                                )}{' '}
                                AWB pickup terkonfirmasi
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                                {[
                                    ['CONFLICT', 'conflicts', 'Konflik'],
                                    ['AMBIGUOUS', 'ambiguous', 'Ambigu'],
                                    ['CANDIDATE', 'candidates', 'Kandidat'],
                                    [
                                        'UNMATCHED',
                                        'unmatched',
                                        'Belum dikenali',
                                    ],
                                ]
                                    .filter(
                                        ([, key]) =>
                                            (identitySummary[key] ?? 0) > 0,
                                    )
                                    .map(([status, key, label]) => (
                                        <Link
                                            key={status}
                                            className="underline underline-offset-4"
                                            href={monitoring.index.url({
                                                query: {
                                                    ...applied,
                                                    customer_match: status,
                                                },
                                            })}
                                        >
                                            {label}: {identitySummary[key] ?? 0}
                                        </Link>
                                    ))}
                                <Link
                                    className="underline underline-offset-4"
                                    href={monitoring.reconciliation.url()}
                                >
                                    Periksa kategori POP
                                </Link>
                            </div>
                        </section>
                    )}
                    <JneShipmentSummary
                        summary={summary}
                        status={applied.status}
                        loading={loading}
                        onChange={(status) => visit({ ...applied, status })}
                    />
                </div>
                {error && (
                    <Alert>
                        <AlertTitle>Daftar belum dapat diperbarui</AlertTitle>
                        <AlertDescription>
                            <p>{error}</p>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={loading}
                                onClick={() =>
                                    visit(applied, shipments.current_page)
                                }
                            >
                                Segarkan tampilan
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}
                <ShipmentDataTable
                    bordered={false}
                    shipments={shipments}
                    timezone={timezone}
                    loading={loading}
                    error={error}
                    filtered={filtered}
                    onPage={(page) => visit(applied, page)}
                    onDetail={openDetail}
                    onReset={reset}
                />
            </section>
            <details className="rounded-lg border text-sm">
                <summary className="cursor-pointer px-4 py-3 font-medium">
                    Koleksi & tracking
                </summary>
                <div className="flex flex-col gap-4 border-t p-4">
                    <nav
                        aria-label="Pengelolaan JNE"
                        className="flex flex-wrap gap-4"
                    >
                        <Link
                            className="underline"
                            href={exceptions.index.url()}
                        >
                            Periksa exception
                        </Link>
                        <Link
                            className="underline"
                            href={evidenceRules.index.url()}
                        >
                            Aturan bukti & alias
                        </Link>
                        <Link
                            className="underline"
                            href={refreshPolicies.index.url()}
                        >
                            Kebijakan tracking
                        </Link>
                    </nav>
                    {operationsSummary && (
                        <JneOperationsSummary data={operationsSummary} />
                    )}
                    {trackingRefresh && (
                        <JneTrackingRefreshCard
                            data={trackingRefresh}
                            timezone={timezone}
                            processing={refresh.processing}
                            error={
                                refresh.errors.profile_id ||
                                (refresh.errors as Record<string, string>).run
                            }
                            onRefresh={() => {
                                if (!trackingRefresh.profile) return;
                                refresh.transform(() => ({
                                    profile_id: trackingRefresh.profile!.id,
                                }));
                                refresh.post(runs.store.url(), {
                                    preserveScroll: true,
                                    onSuccess: () =>
                                        router.visit(runs.index.url()),
                                });
                            }}
                        />
                    )}
                </div>
            </details>
            <ShipmentDetailSheet
                id={detailId}
                origin={detailOrigin}
                onClose={() => setDetailId(null)}
            />
        </PageContainer>
    );
}

import { Link } from '@inertiajs/react';
import type { RefObject } from 'react';
import { ArrowUpRight, AlertTriangle, PenLine } from 'lucide-react';
import {
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/operational-ui';
import {
    ProcessingStatus,
    categoryName,
    processingDate,
    processingLabels,
    quantity,
} from '@/components/package-processing-ui';
import {
    ResultStatus,
    OperationalPickupContext,
} from '@/components/pickup-result-ui';
import { processingDetailUrl } from '@/lib/pickup-monitoring-navigation';
import {
    MonitoringDetailSheet,
    MonitoringDrawerState,
    useQuickPickupDetail,
} from '@/components/monitoring-detail-sheet';
export { MonitoringDrawerState as ProcessingDrawerState } from '@/components/monitoring-detail-sheet';
import type { ProcessingQuickDetail } from '@/types/package-processing';

export default function PickupProcessingDrawer({
    id,
    context,
    close,
    origin,
}: {
    id: number | null;
    context: string;
    close: () => void;
    origin: RefObject<HTMLElement | null>;
}) {
    const { data, error, retry } = useQuickPickupDetail<ProcessingQuickDetail>(
        id,
        'processing',
    );
    const summary = data?.processing.summary;
    return (
        <MonitoringDetailSheet
            open={id !== null}
            close={close}
            origin={origin}
            searchId="processing-search"
        >
            <SheetHeader className="shrink-0 border-b pr-12">
                <SheetTitle>
                    {data?.result.customer_name ?? 'Detail cepat pemrosesan'}
                </SheetTitle>
                <SheetDescription>
                    {data?.task.reference ?? 'Memuat data pickup dari server.'}
                </SheetDescription>
                {data && (
                    <div className="flex flex-wrap gap-1 pt-1">
                        {Array.from(
                            new Set(
                                data.processing.rows.map(
                                    (row) => row.processing_status,
                                ),
                            ),
                        ).map((status) => (
                            <ProcessingStatus key={status} status={status} />
                        ))}
                    </div>
                )}
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                {!data && <MonitoringDrawerState error={error} retry={retry} />}
                {data && (
                    <>
                        <section aria-label="Kuantitas pickup">
                            <OperationalPickupContext
                                result={data.result}
                                timezone={data.timezone}
                            />
                            <p className="mb-3 text-xs text-muted-foreground">
                                Seluruh kategori pickup · data terkini
                            </p>
                            <dl className="grid grid-cols-3 gap-x-3 gap-y-4">
                                {[
                                    ['pop_quantity', 'POP'],
                                    ['received_quantity', 'Retail'],
                                    ['confirmed_quantity', 'Konfirmasi sistem'],
                                    ['manual_quantity', 'Berhasil manual'],
                                    [
                                        'unconfirmed_quantity',
                                        'Belum terkonfirmasi',
                                    ],
                                ].map(([key, label]) => (
                                    <div key={key}>
                                        <dt className="text-xs text-muted-foreground">
                                            {label}
                                        </dt>
                                        <dd className="mt-1 text-xl font-semibold tabular-nums">
                                            {quantity(summary?.[key])}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                            <p className="mt-3 text-xs text-muted-foreground">
                                Konfirmasi eksternal belum tersedia. Berhasil
                                manual bukan konfirmasi sistem.
                            </p>
                        </section>
                        <section
                            className="space-y-2"
                            aria-label="Kategori pickup"
                        >
                            <h3 className="text-sm font-semibold">
                                Rincian kategori
                            </h3>
                            {data.processing.rows.map((row) => (
                                <div
                                    key={row.category}
                                    className="rounded-lg border p-3"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h4 className="text-sm font-medium">
                                            {categoryName(row.category)}
                                        </h4>
                                        <ProcessingStatus
                                            status={row.processing_status}
                                        />
                                    </div>
                                    <p className="mt-2 text-sm tabular-nums">
                                        POP {quantity(row.pop_quantity)} ·
                                        Retail {quantity(row.received_quantity)}{' '}
                                        · Manual {quantity(row.manual_quantity)}{' '}
                                        · Belum terkonfirmasi{' '}
                                        {quantity(row.unconfirmed_quantity)}
                                    </p>
                                    {row.reconciliation_reasons.length > 0 && (
                                        <div className="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-300">
                                            {row.reconciliation_reasons.map(
                                                (reason) => (
                                                    <p key={reason}>
                                                        <AlertTriangle className="mr-1 inline size-3" />
                                                        {reason}
                                                    </p>
                                                ),
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {data.processing.rows.length === 0 && (
                                <EmptyState title="Belum ada kuantitas paket" />
                            )}
                        </section>
                        <section className="space-y-2">
                            <h3 className="text-sm font-semibold">
                                Catatan pemrosesan efektif
                            </h3>
                            {data.processing.latest.map((record) => (
                                <details
                                    key={record.id}
                                    className="rounded-lg border p-3 text-sm"
                                >
                                    <summary className="cursor-pointer font-medium">
                                        {processingLabels[record.system]} ·{' '}
                                        {categoryName(record.category)} · #
                                        {record.revision}
                                    </summary>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        Dicatat Manual · {record.actor_name} ·{' '}
                                        {processingDate(
                                            record.created_at,
                                            data.timezone,
                                        )}
                                    </p>
                                    <p className="mt-2">
                                        Berhasil {record.successful_quantity} ·
                                        Gagal {record.failed_quantity} · Pending{' '}
                                        {record.pending_quantity} · Outcome
                                        hilang {record.unknown_quantity}
                                    </p>
                                    <p className="mt-1">{record.reason}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Referensi dilaporkan:{' '}
                                        {record.external_reference ?? '—'} · POP
                                        #{record.pickup_revision} · Retail saat
                                        dicatat{' '}
                                        {record.received_quantity ??
                                            'Belum diverifikasi'}
                                    </p>
                                </details>
                            ))}
                            {data.processing.latest.length === 0 && (
                                <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                                    Belum ada catatan JNE Hybrid / MyORION.
                                    Status pemrosesan belum dapat dikonfirmasi.
                                </p>
                            )}
                        </section>
                        <section className="space-y-2">
                            <h3 className="text-sm font-semibold">
                                Konteks operasional
                            </h3>
                            <dl className="space-y-2 text-sm">
                                {(
                                    ['pop', 'handover', 'verification'] as const
                                ).map((dimension) => (
                                    <div
                                        key={dimension}
                                        className="flex items-center justify-between gap-3"
                                    >
                                        <dt className="text-muted-foreground">
                                            {
                                                {
                                                    pop: 'POP',
                                                    handover: 'Handover',
                                                    verification: 'Verifikasi',
                                                }[dimension]
                                            }
                                        </dt>
                                        <dd>
                                            <ResultStatus
                                                result={data.result}
                                                dimension={dimension}
                                            />
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                            <p className="pt-1 text-xs text-muted-foreground">
                                {data.result.next_action}
                            </p>
                        </section>
                        <section className="space-y-2">
                            <h3 className="text-sm font-semibold">
                                Riwayat deklarasi manual
                            </h3>
                            {data.processing.history.data
                                .slice(0, 5)
                                .map((record) => (
                                    <details
                                        key={record.id}
                                        className="rounded-md border p-3 text-sm"
                                    >
                                        <summary className="cursor-pointer">
                                            {processingLabels[record.system]} ·
                                            #{record.revision} ·{' '}
                                            {record.actor_name}
                                        </summary>
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            {categoryName(record.category)} ·{' '}
                                            {processingDate(
                                                record.created_at,
                                                data.timezone,
                                            )}
                                        </p>
                                        {record.previous_successful != null && (
                                            <p className="mt-1 text-xs">
                                                Sebelum: berhasil{' '}
                                                {record.previous_successful},
                                                gagal {record.previous_failed},
                                                pending{' '}
                                                {record.previous_pending},
                                                outcome hilang{' '}
                                                {record.previous_unknown}.
                                            </p>
                                        )}
                                        <p className="mt-1 text-xs">
                                            Sesudah: berhasil{' '}
                                            {record.successful_quantity}, gagal{' '}
                                            {record.failed_quantity}, pending{' '}
                                            {record.pending_quantity}, outcome
                                            hilang {record.unknown_quantity}.
                                        </p>
                                        <p className="mt-1">{record.reason}</p>
                                    </details>
                                ))}
                            <p className="text-xs text-muted-foreground">
                                {Math.min(data.processing.history.total, 5)}{' '}
                                dari {data.processing.history.total} revisi.
                                Histori lengkap dan bukti POP tersedia di detail
                                lengkap.
                            </p>
                        </section>
                    </>
                )}
            </div>
            {data && (
                <SheetFooter className="shrink-0 border-t bg-background">
                    <Button asChild>
                        <Link href={processingDetailUrl(data.task.id, context)}>
                            Lihat Detail Lengkap
                            <ArrowUpRight className="size-4" />
                        </Link>
                    </Button>
                    {data.processing.can_record && (
                        <Button asChild variant="outline">
                            <Link
                                href={processingDetailUrl(
                                    data.task.id,
                                    context,
                                    true,
                                )}
                            >
                                <PenLine className="size-4" />
                                Catat / Koreksi Pemrosesan
                            </Link>
                        </Button>
                    )}
                </SheetFooter>
            )}
        </MonitoringDetailSheet>
    );
}

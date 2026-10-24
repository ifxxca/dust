import { Link, usePage } from '@inertiajs/react';
import { ChevronDown, Copy, ExternalLink } from 'lucide-react';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import ShipmentStatusBadge from '@/components/jne-shipment-status';
import JneCustomerCandidates from '@/components/jne-customer-candidates';
import { copyJneAwb } from '@/components/jne-shipment-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { jneTimestamp, matchLabels } from '@/lib/jne-monitoring';
import { loadJneShipmentDetail } from '@/lib/jne-shipment-detail';
import * as monitoring from '@/routes/jne-monitoring';
import * as reports from '@/routes/jne-reports';
import { show as pickupDetail } from '@/routes/pickup-results';
import type { JneDetail } from '@/types/jne';

function DetailField({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="min-w-0 space-y-1">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm break-words whitespace-pre-wrap">
                {children || '—'}
            </dd>
        </div>
    );
}

export function ShipmentDetailContent({ detail }: { detail: JneDetail }) {
    const { shipment, history, timezone } = detail;
    const source = shipment.source;
    return (
        <div className="space-y-6">
            <section className="space-y-4" aria-labelledby="jne-detail-summary">
                <h3 id="jne-detail-summary" className="text-sm font-semibold">
                    Ringkasan pengiriman
                </h3>
                <ShipmentStatusBadge status={shipment.tracking_status} />
                <dl className="grid gap-4 sm:grid-cols-2">
                    <DetailField label="Customer">
                        {shipment.customer_name
                            ? `${shipment.customer_code || '—'} · ${shipment.customer_name}`
                            : 'Belum dipetakan'}
                    </DetailField>
                    <DetailField label="Pemetaan customer">
                        {['AMBIGUOUS', 'CONFLICT'].includes(
                            shipment.customer_match_status || '',
                        )
                            ? 'Perlu pemeriksaan'
                            : shipment.customer_match_status === 'MATCHED'
                              ? 'Customer dikenali'
                              : 'Belum dipetakan'}
                    </DetailField>
                    <DetailField label="Pengirim di report JNE">
                        {source?.shipper_name}
                    </DetailField>
                    <DetailField label="Penerima">
                        {source?.consignee_name}
                    </DetailField>
                </dl>
                {shipment.customer_match_note && (
                    <p className="text-xs text-muted-foreground">
                        {shipment.customer_match_note}
                    </p>
                )}
                <JneCustomerCandidates
                    candidates={shipment.customer_match_candidates}
                />
            </section>
            <Separator />
            <section className="space-y-4" aria-labelledby="jne-detail-source">
                <h3 id="jne-detail-source" className="text-sm font-semibold">
                    Informasi JNE & sumber
                </h3>
                <dl className="space-y-4">
                    <DetailField label="Status web asli">
                        {source?.status_web}
                    </DetailField>
                    <DetailField label="Status POD asli">
                        {source?.status_pod}
                    </DetailField>
                    <DetailField label="Pembatalan (CSV)">
                        {source?.awb_cancel}
                    </DetailField>
                    <DetailField label="Terakhir diamati">
                        {jneTimestamp(shipment.observed_at, timezone)} ·{' '}
                        {timezone}
                    </DetailField>
                    <DetailField label="Sumber report (nomor penarikan)">
                        {shipment.customer_account}
                    </DetailField>
                    {source && (
                        <>
                            <DetailField label="Report / baris CSV">
                                #{source.report_job_id} / {source.source_row}
                            </DetailField>
                            <DetailField label="Referensi di report">
                                {source.reference}
                            </DetailField>
                        </>
                    )}
                </dl>
                <p className="text-xs leading-relaxed text-muted-foreground">
                    Waktu observasi berasal dari data report yang diproses. Ini
                    bukan waktu kejadian pengiriman atau pembaruan real-time.
                </p>
                {source && (
                    <Button variant="outline" size="sm" asChild>
                        <a href={reports.download.url(source.report_job_id)}>
                            Unduh CSV sumber #{source.report_job_id}
                        </a>
                    </Button>
                )}
                {source?.raw_data && (
                    <Collapsible className="rounded-lg border">
                        <CollapsibleTrigger asChild>
                            <Button
                                variant="ghost"
                                className="h-auto w-full justify-between px-3 py-3 text-sm"
                            >
                                Semua kolom CSV asli
                                <ChevronDown className="size-4" />
                            </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <dl className="space-y-3 border-t p-3">
                                {Object.entries(source.raw_data).map(
                                    ([key, value]) => (
                                        <DetailField key={key} label={key}>
                                            {value}
                                        </DetailField>
                                    ),
                                )}
                            </dl>
                        </CollapsibleContent>
                    </Collapsible>
                )}
            </section>
            <Separator />
            <section className="space-y-3" aria-labelledby="jne-detail-pickup">
                <h3 id="jne-detail-pickup" className="text-sm font-semibold">
                    Hubungan pickup
                </h3>
                <Badge variant="outline">
                    {matchLabels[shipment.match_status] ||
                        shipment.match_status}
                </Badge>
                {shipment.pickup_task_id ? (
                    <Button variant="link" className="h-auto p-0" asChild>
                        <Link href={pickupDetail.url(shipment.pickup_task_id)}>
                            {shipment.pickup_reference || 'Buka pickup'}
                        </Link>
                    </Button>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Belum terhubung ke pickup. Ini tidak menunjukkan
                        kegagalan pengiriman.
                    </p>
                )}
                <dl className="space-y-3">
                    <DetailField label="Customer pickup">
                        {shipment.pickup_customer}
                    </DetailField>
                    <DetailField label="Metode pencocokan">
                        {shipment.match_method}
                    </DetailField>
                    <DetailField label="Catatan rekonsiliasi">
                        {shipment.match_note}
                    </DetailField>
                </dl>
                <p className="text-xs text-muted-foreground">
                    Rekonsiliasi dan perubahan hubungan pickup tersedia di
                    halaman AWB.
                </p>
            </section>
            <Separator />
            <section className="space-y-3" aria-labelledby="jne-detail-history">
                <h3 id="jne-detail-history" className="text-sm font-semibold">
                    Riwayat observasi tersimpan
                </h3>
                <p className="text-xs text-muted-foreground">
                    Snapshot dari report yang sudah diproses, bukan riwayat
                    kejadian langsung dari JNE.
                </p>
                {history.data.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Belum ada riwayat observasi.
                    </p>
                ) : (
                    <ol className="space-y-3">
                        {history.data.slice(0, 5).map((row) => (
                            <li
                                key={row.id}
                                className="space-y-2 rounded-lg border p-3"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <ShipmentStatusBadge
                                        status={row.tracking_status}
                                    />
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {jneTimestamp(
                                            row.observed_at,
                                            timezone,
                                        )}
                                    </span>
                                </div>
                                <p className="text-xs break-words whitespace-pre-wrap">
                                    Web: {row.status_web || '—'}
                                    <br />
                                    POD: {row.status_pod || '—'}
                                    <br />
                                    Pembatalan: {row.awb_cancel || '—'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Report #{row.report_job_id} · Baris{' '}
                                    {row.source_row} ·{' '}
                                    {row.changes_current
                                        ? 'Memperbarui snapshot pengiriman'
                                        : 'Observasi tersimpan'}
                                </p>
                            </li>
                        ))}
                    </ol>
                )}
                {history.data.length > 5 && (
                    <p className="text-xs text-muted-foreground">
                        Menampilkan 5 observasi terbaru. Riwayat lengkap
                        tersedia di halaman AWB.
                    </p>
                )}
                <Button variant="link" className="h-auto p-0" asChild>
                    <Link href={monitoring.show.url(shipment.id)}>
                        Lihat riwayat & detail lengkap
                        <ExternalLink />
                    </Link>
                </Button>
            </section>
        </div>
    );
}

export default function ShipmentDetailSheet({
    id,
    origin,
    onClose,
}: {
    id: number | null;
    origin: RefObject<HTMLElement | null>;
    onClose: () => void;
}) {
    const { version } = usePage();
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<{
        id: number | null;
        detail?: JneDetail;
        error?: string;
    }>({ id: null });
    useEffect(() => {
        if (id === null) {
            setState({ id: null });
            return;
        }
        const controller = new AbortController();
        let disposed = false;
        const timeout = setTimeout(() => controller.abort(), 30000);
        setState({ id });
        loadJneShipmentDetail(id, version, controller.signal)
            .then((detail) => {
                if (!disposed) setState({ id, detail });
            })
            .catch((error: unknown) => {
                if (!disposed)
                    setState({
                        id,
                        error: controller.signal.aborted
                            ? 'Permintaan detail melewati batas waktu. Silakan coba lagi.'
                            : error instanceof Error
                              ? error.message
                              : 'Detail belum dapat dimuat. Silakan coba lagi.',
                    });
            })
            .finally(() => clearTimeout(timeout));
        return () => {
            disposed = true;
            clearTimeout(timeout);
            controller.abort();
        };
    }, [id, version, attempt]);
    const detail = state.id === id ? state.detail : undefined;
    const error = state.id === id ? state.error : undefined;
    return (
        <Sheet
            open={id !== null}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <SheetContent
                className="w-full sm:max-w-xl"
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    if (origin.current?.isConnected) origin.current.focus();
                    else document.getElementById('jne-awb-search')?.focus();
                }}
            >
                <SheetHeader className="shrink-0 border-b pr-10">
                    <SheetTitle className="break-all">
                        {detail
                            ? `AWB ${detail.shipment.awb}`
                            : 'Detail pengiriman'}
                    </SheetTitle>
                    <SheetDescription>
                        Informasi dari report JNE dan observasi yang telah
                        tersimpan.
                    </SheetDescription>
                </SheetHeader>
                <div
                    className="min-h-0 flex-1 overflow-y-auto p-4"
                    aria-busy={!detail && !error}
                >
                    {error ? (
                        <Alert>
                            <AlertTitle>Detail belum tersedia</AlertTitle>
                            <AlertDescription>
                                <p>{error}</p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        setAttempt((value) => value + 1)
                                    }
                                >
                                    Coba lagi
                                </Button>
                            </AlertDescription>
                        </Alert>
                    ) : detail ? (
                        <ShipmentDetailContent detail={detail} />
                    ) : (
                        <div role="status" className="space-y-5">
                            <span className="sr-only">
                                Memuat detail pengiriman…
                            </span>
                            {[1, 2, 3, 4].map((key) => (
                                <div key={key} className="space-y-2">
                                    <Skeleton className="h-4 w-1/3" />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <SheetFooter className="shrink-0 border-t sm:flex-row sm:justify-between">
                    {detail && (
                        <Button
                            variant="outline"
                            onClick={() => void copyJneAwb(detail.shipment.awb)}
                        >
                            <Copy />
                            Salin AWB
                        </Button>
                    )}
                    {id !== null && (
                        <Button asChild>
                            <Link href={monitoring.show.url(id)}>
                                Buka halaman AWB
                                <ExternalLink />
                            </Link>
                        </Button>
                    )}
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

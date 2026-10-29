import { Link } from '@inertiajs/react';
import {
    ArrowLeft,
    ChevronDown,
    ClipboardList,
    Copy,
    Download,
    FileText,
    History,
    RefreshCw,
    type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import JneCustomerCandidates from '@/components/jne-customer-candidates';
import JneCategoryBadge from '@/components/jne-category-badge';
import JneSourceEvidence from '@/components/jne-source-evidence';
import ShipmentStatusBadge from '@/components/jne-shipment-status';
import { copyJneAwb } from '@/components/jne-shipment-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { jneTimestamp, trackingLabels } from '@/lib/jne-monitoring';
import * as monitoring from '@/routes/jne-monitoring';
import * as reports from '@/routes/jne-reports';
import type { JneDetail } from '@/types/jne';

export function ShipmentDisclosure({
    title,
    children,
    defaultOpen = false,
    icon: Icon = ClipboardList,
}: {
    title: string;
    children: ReactNode;
    defaultOpen?: boolean;
    icon?: LucideIcon;
}) {
    return (
        <details
            open={defaultOpen}
            className="group/disclosure min-w-0 rounded-xl border bg-card shadow-sm"
        >
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <Icon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-primary"
                />
                <span className="min-w-0 flex-1">{title}</span>
                <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 group-open/disclosure:rotate-180"
                />
            </summary>
            <div className="flex min-w-0 flex-col gap-4 border-t p-4">
                {children}
            </div>
        </details>
    );
}

type OverviewShipment = Pick<
    JneDetail['shipment'],
    | 'id'
    | 'awb'
    | 'category'
    | 'category_status'
    | 'tracking_status'
    | 'entry_at'
    | 'observed_at'
    | 'last_report_received_at'
    | 'last_refresh_attempt'
    | 'customer_name'
    | 'customer_code'
    | 'customer_match_status'
    | 'customer_match_note'
    | 'customer_match_candidates'
    | 'source'
> & { category_evidence?: unknown };

export default function ShipmentOverview({
    shipment,
    history,
    timezone,
    children,
}: {
    shipment: OverviewShipment;
    history: Pick<JneDetail['history'], 'data' | 'current_page' | 'last_page'>;
    timezone: string;
    children?: ReactNode;
}) {
    const source = shipment.source;
    const snapshots = history.data.slice(0, 4).reverse();
    const fields: [string, ReactNode][] = [
        ['Pengirim', source?.shipper_name || '—'],
        ['Penerima', source?.consignee_name || '—'],
        [
            'Customer',
            shipment.customer_name
                ? `${shipment.customer_code || '—'} · ${shipment.customer_name}`
                : 'Belum dipetakan',
        ],
        ['Tanggal AWB (JNE)', jneTimestamp(shipment.entry_at, timezone)],
        ['Status diperbarui', jneTimestamp(shipment.observed_at, timezone)],
    ];
    return (
        <>
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                    <Button
                        variant="outline"
                        size="icon"
                        className="size-11 shrink-0"
                        asChild
                    >
                        <Link
                            href={monitoring.index.url()}
                            aria-label="Kembali ke daftar pengiriman"
                        >
                            <ArrowLeft />
                        </Link>
                    </Button>
                    <div className="flex min-w-0 flex-col gap-2">
                        <div className="flex min-w-0 items-start gap-1">
                            <h1 className="text-xl font-semibold tracking-tight break-all sm:text-2xl">
                                AWB {shipment.awb}
                            </h1>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label="Salin nomor resi"
                                onClick={() => void copyJneAwb(shipment.awb)}
                            >
                                <Copy />
                            </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span>Kategori POP:</span>
                            <JneCategoryBadge
                                category={shipment.category}
                                status={shipment.category_status}
                            />
                            {shipment.category_status === 'MATCHED' && (
                                <span>Terkonfirmasi</span>
                            )}
                            <ShipmentStatusBadge
                                status={shipment.tracking_status}
                            />
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild>
                        <Link href={reports.index.url()}>
                            <RefreshCw data-icon="inline-start" />
                            Tarik report
                        </Link>
                    </Button>
                </div>
            </header>
            {shipment.last_refresh_attempt?.stage === 'ATTENTION' && (
                <Alert variant="destructive">
                    <AlertTitle>
                        Pembaruan #{shipment.last_refresh_attempt.id} perlu
                        diperiksa
                    </AlertTitle>
                    <AlertDescription>
                        {shipment.last_refresh_attempt.error_message ||
                            shipment.last_refresh_attempt.import_error ||
                            shipment.last_refresh_attempt.projection_error ||
                            'Periksa proses penarikan report.'}
                    </AlertDescription>
                </Alert>
            )}
            {children}
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                <Card className="min-w-0 gap-4 py-4">
                    <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 px-4">
                        <CardTitle>
                            <h2 className="flex items-center gap-2 text-sm">
                                <ClipboardList
                                    aria-hidden="true"
                                    className="size-5 text-primary"
                                />
                                Informasi pengiriman
                            </h2>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex min-w-0 flex-col gap-4 px-4">
                        <dl className="flex min-w-0 flex-col gap-3">
                            {fields.map(([label, value]) => (
                                <div
                                    key={label}
                                    className="grid min-w-0 gap-1 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]"
                                >
                                    <dt className="text-muted-foreground">
                                        {label}
                                    </dt>
                                    <dd className="min-w-0 break-words">
                                        {value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                        {shipment.customer_match_status !== 'MATCHED' &&
                            shipment.customer_match_note && (
                                <Alert>
                                    <AlertTitle>Pemetaan customer</AlertTitle>
                                    <AlertDescription>
                                        {shipment.customer_match_note}
                                    </AlertDescription>
                                </Alert>
                            )}
                        <JneCustomerCandidates
                            candidates={shipment.customer_match_candidates}
                        />
                    </CardContent>
                </Card>
                <Card className="min-w-0 gap-4 py-4">
                    <CardHeader className="px-4">
                        <CardTitle>
                            <h2 className="flex items-center gap-2 text-sm">
                                <History
                                    aria-hidden="true"
                                    className="size-5 text-primary"
                                />
                                Timeline status
                            </h2>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex min-w-0 flex-col gap-4 px-4">
                        <p className="text-xs text-muted-foreground">
                            Snapshot report JNE; bukan waktu kejadian
                            pengiriman.
                        </p>
                        {snapshots.length ? (
                            <ol
                                aria-label="Timeline observasi report"
                                className="flex flex-col gap-4"
                            >
                                {snapshots.map((snapshot) => (
                                    <li
                                        key={snapshot.id}
                                        className="relative flex min-w-0 gap-3 border-l border-border pb-1 pl-5"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="absolute top-1 -left-1.5 size-3 rounded-full border-2 border-card bg-primary"
                                        />
                                        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:justify-between">
                                            <div className="flex shrink-0 flex-col gap-1">
                                                <p className="text-sm font-medium">
                                                    {trackingLabels[
                                                        snapshot.tracking_status
                                                    ] ||
                                                        snapshot.tracking_status}
                                                </p>
                                                <time
                                                    className="text-xs text-muted-foreground tabular-nums"
                                                    dateTime={
                                                        snapshot.observed_at
                                                    }
                                                >
                                                    {jneTimestamp(
                                                        snapshot.observed_at,
                                                        timezone,
                                                    )}
                                                </time>
                                            </div>
                                            <div className="min-w-0 rounded-lg bg-muted/50 px-3 py-2 text-xs break-words text-muted-foreground">
                                                <p>
                                                    {snapshot.status_web ||
                                                        snapshot.status_pod ||
                                                        'Status asli tidak tersedia.'}
                                                </p>
                                                <Link
                                                    className="inline-flex min-h-8 items-center underline underline-offset-4"
                                                    href={reports.awbs.url(
                                                        snapshot.report_job_id,
                                                    )}
                                                >
                                                    Report #
                                                    {snapshot.report_job_id} ·
                                                    baris {snapshot.source_row}
                                                </Link>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Belum ada riwayat observasi.
                            </p>
                        )}
                        {(history.last_page > 1 || history.data.length > 4) && (
                            <p className="text-xs text-muted-foreground">
                                Menampilkan paling banyak 4 observasi pada
                                halaman {history.current_page}. Seluruh
                                observasi tersedia di riwayat report.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

export function ShipmentSourceDetails({
    shipment,
    timezone,
}: {
    shipment: OverviewShipment;
    timezone: string;
}) {
    const source = shipment.source;
    return (
        <ShipmentDisclosure
            title="Bukti asal dan kontrak sumber"
            icon={FileText}
        >
            <dl className="grid gap-3 text-xs sm:grid-cols-2">
                <div>
                    <dt className="text-muted-foreground">
                        Observasi terakhir
                    </dt>
                    <dd>{jneTimestamp(shipment.observed_at, timezone)}</dd>
                </div>
                <div>
                    <dt className="text-muted-foreground">
                        Report terakhir diterima
                    </dt>
                    <dd>
                        {jneTimestamp(
                            shipment.last_report_received_at ?? null,
                            timezone,
                        )}
                    </dd>
                </div>
            </dl>
            {source ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-primary/5 p-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <FileText
                            aria-hidden="true"
                            className="size-5 shrink-0 text-primary"
                        />
                        <div>
                            <p className="text-sm font-medium">
                                CSV sumber #{source.report_job_id}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Report JNE · baris {source.source_row}
                            </p>
                        </div>
                    </div>
                    <Badge variant="outline">Sumber tersimpan</Badge>
                    <Button variant="outline" size="sm" asChild>
                        <a href={reports.download.url(source.report_job_id)}>
                            <Download data-icon="inline-start" />
                            Unduh CSV sumber #{source.report_job_id}
                        </a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                        <Link href={reports.awbs.url(source.report_job_id)}>
                            Lihat detail sumber
                        </Link>
                    </Button>
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">
                    Belum ada sumber report.
                </p>
            )}
            <details className="min-w-0 text-sm">
                <summary className="cursor-pointer">
                    Rincian bukti dan status sumber
                </summary>
                <div className="mt-3 flex min-w-0 flex-col gap-4">
                    <JneSourceEvidence
                        code={source?.original_customer_code}
                        evidence={source?.source_evidence}
                        title="Rincian bukti dan asal Hybrid"
                    />
                    <dl className="grid min-w-0 gap-3 text-xs sm:grid-cols-3">
                        {[
                            ['Status web asli', source?.status_web],
                            ['Status POD asli', source?.status_pod],
                            ['Pembatalan (CSV)', source?.awb_cancel],
                        ].map(([label, value]) => (
                            <div
                                key={label}
                                className="flex min-w-0 flex-col gap-1"
                            >
                                <dt className="text-muted-foreground">
                                    {label}
                                </dt>
                                <dd className="break-words">{value || '—'}</dd>
                            </div>
                        ))}
                    </dl>
                    {shipment.category_evidence != null && (
                        <details className="min-w-0 text-sm">
                            <summary className="cursor-pointer">
                                Bukti kategori POP
                            </summary>
                            <pre className="mt-3 max-h-64 overflow-auto text-xs">
                                {JSON.stringify(
                                    shipment.category_evidence,
                                    null,
                                    2,
                                )}
                            </pre>
                        </details>
                    )}
                </div>
            </details>
        </ShipmentDisclosure>
    );
}

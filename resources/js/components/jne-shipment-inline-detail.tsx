import { Link } from '@inertiajs/react';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import ShipmentStatusBadge from '@/components/jne-shipment-status';
import JneCategoryBadge from '@/components/jne-category-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { jneTimestamp } from '@/lib/jne-monitoring';
import * as monitoring from '@/routes/jne-monitoring';
import type { JneDetail } from '@/types/jne';

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 text-xs leading-5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{children || '—'}</dd>
        </div>
    );
}

export default function ShipmentInlineDetail({
    detail,
    error,
    onRetry,
}: {
    detail?: JneDetail;
    error?: string;
    onRetry: () => void;
}) {
    if (error)
        return (
            <Alert variant="destructive">
                <AlertTitle>Detail belum dapat dimuat</AlertTitle>
                <AlertDescription>
                    <p>{error}</p>
                    <Button variant="outline" onClick={onRetry}>
                        Coba lagi
                    </Button>
                </AlertDescription>
            </Alert>
        );
    if (!detail)
        return (
            <div
                role="status"
                aria-label="Memuat detail AWB"
                className="grid gap-6 rounded-lg border bg-background p-5 md:grid-cols-3"
            >
                {[0, 1, 2].map((index) => (
                    <div key={index} className="flex flex-col gap-3">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                ))}
            </div>
        );
    const { shipment, history, timezone } = detail;
    return (
        <div className="grid min-w-0 gap-6 rounded-lg border bg-background p-4 lg:grid-cols-3 lg:p-5">
            <section
                className="flex min-w-0 flex-col gap-3"
                aria-label="Detail AWB"
            >
                <h3 className="text-sm font-medium">Detail AWB</h3>
                <dl className="flex flex-col gap-2">
                    <Field label="AWB">
                        <span className="font-mono break-all">
                            {shipment.awb}
                        </span>
                    </Field>
                    <Field label="Tanggal AWB">
                        {jneTimestamp(shipment.entry_at, timezone)}
                    </Field>
                    <Field label="Kategori">
                        <JneCategoryBadge
                            category={shipment.category}
                            status={shipment.category_status}
                        />
                    </Field>
                    <Field label="Status">
                        <ShipmentStatusBadge
                            status={shipment.tracking_status}
                        />
                    </Field>
                    <Field label="Pengirim">
                        {shipment.source?.shipper_name}
                    </Field>
                    <Field label="Customer">
                        {shipment.customer_name
                            ? `${shipment.customer_code || '—'} · ${shipment.customer_name}`
                            : 'Belum dipetakan'}
                    </Field>
                    <Field label="Pickup">
                        {shipment.pickup_reference || 'Belum terhubung'}
                    </Field>
                </dl>
                <Button
                    variant="link"
                    className="h-auto justify-start self-start p-0"
                    asChild
                >
                    <Link href={monitoring.show.url(shipment.id)}>
                        Buka halaman AWB
                        <ArrowUpRight data-icon="inline-end" />
                    </Link>
                </Button>
            </section>
            <section
                className="flex min-w-0 flex-col gap-3 border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
                aria-label="Penerima dan informasi JNE"
            >
                <h3 className="text-sm font-medium">Penerima</h3>
                <dl>
                    <Field label="Nama">
                        {shipment.source?.consignee_name}
                    </Field>
                </dl>
                <h3 className="mt-3 text-sm font-medium">Informasi JNE</h3>
                <dl className="flex flex-col gap-2">
                    <Field label="Status asli">
                        {shipment.source?.status_web}
                    </Field>
                    <Field label="Status POD">
                        {shipment.source?.status_pod}
                    </Field>
                    <Field label="Diamati">
                        {jneTimestamp(shipment.observed_at, timezone)}
                    </Field>
                    <Field label="Sumber">
                        {shipment.source
                            ? `Report #${shipment.source.report_job_id} · baris ${shipment.source.source_row}`
                            : null}
                    </Field>
                </dl>
            </section>
            <section
                className="flex min-w-0 flex-col gap-3 border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
                aria-label="Riwayat observasi"
            >
                <h3 className="text-sm font-medium">Riwayat observasi</h3>
                {history.data.length ? (
                    <ol className="ml-1 flex flex-col gap-5 border-l pl-4">
                        {history.data.slice(0, 3).map((item) => (
                            <li
                                key={item.id}
                                className="relative flex flex-col gap-1 text-xs"
                            >
                                <span
                                    className="absolute top-1 -left-5 size-2 rounded-full bg-primary"
                                    aria-hidden="true"
                                />
                                <ShipmentStatusBadge
                                    status={item.tracking_status}
                                />
                                <time
                                    className="text-muted-foreground"
                                    dateTime={item.observed_at}
                                >
                                    {jneTimestamp(item.observed_at, timezone)}
                                </time>
                                <p className="break-words text-muted-foreground">
                                    {item.status_web ||
                                        item.status_pod ||
                                        'Status asli tidak tersedia'}
                                </p>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="text-xs text-muted-foreground">
                        Belum ada riwayat observasi.
                    </p>
                )}
                <p className="text-xs leading-5 text-muted-foreground">
                    Snapshot dari report JNE. Riwayat lengkap tersedia di
                    halaman AWB.
                </p>
            </section>
        </div>
    );
}

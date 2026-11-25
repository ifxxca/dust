import { useEffect, useState } from 'react';
import { Link, useHttp } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import { Disclosure, DisclosureSummary } from '@/components/ui/disclosure';
import { ReconciliationPager } from '@/components/pickup-reconciliation-detail';
import { reconciliationTime } from '@/lib/pickup-reconciliation';
import { evidence as evidenceRoute } from '@/routes/reconciliation-workspace';
import { index as report } from '@/routes/report-runs';
import type { AwbEvidence } from '@/types/reconciliation-workspace';

export default function ReconciliationAwbEvidence({
    id,
    taskId,
    close,
    timezone,
}: {
    id: number | null;
    taskId: number;
    close: () => void;
    timezone: string;
}) {
    const [data, setData] = useState<AwbEvidence | null>(null),
        [error, setError] = useState(''),
        [sourcePage, setSourcePage] = useState(1),
        [eventPage, setEventPage] = useState(1);
    const http = useHttp<Record<string, never>, AwbEvidence>({});
    useEffect(() => {
        setSourcePage(1);
        setEventPage(1);
    }, [id]);
    useEffect(() => {
        if (!id) return;
        setData(null);
        setError('');
        void http
            .get(
                evidenceRoute.url(
                    { task: taskId, shipment: id },
                    {
                        query: {
                            source_page: sourcePage,
                            event_page: eventPage,
                        },
                    },
                ),
            )
            .then((value) => {
                if (value) setData(value);
            })
            .catch(() =>
                setError('Bukti tidak dapat dimuat. Tutup dan coba kembali.'),
            );
        return () => http.cancel();
    }, [id, taskId, sourcePage, eventPage]);
    const time = (value: string | null | undefined) =>
        value ? reconciliationTime(value, timezone) : 'Tidak tersedia';
    return (
        <Sheet open={id !== null} onOpenChange={(open) => !open && close()}>
            <SheetContent
                side="bottom"
                className="h-[90dvh] rounded-t-xl p-0 sm:inset-y-0 sm:top-0 sm:right-0 sm:left-auto sm:h-full sm:w-[36rem] sm:rounded-none"
            >
                <SheetHeader>
                    <SheetTitle>{data?.identity.awb ?? 'Bukti AWB'}</SheetTitle>
                    <SheetDescription>
                        Bukti terkini, asal report, dan riwayat atribusi
                    </SheetDescription>
                </SheetHeader>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {!data && !error && <Skeleton className="h-72" />}
                    {data && (
                        <div className="flex flex-col gap-4">
                            <dl className="grid grid-cols-2 gap-3 text-sm">
                                {[
                                    ['Customer', data.customer?.name],
                                    ['Kode', data.customer?.customer_code],
                                    ['Account', data.identity.customer_account],
                                    ['Pengirim', data.shipper_name],
                                    ['Kategori', data.identity.category],
                                    ['Pickup', data.pickup?.reference],
                                    [
                                        'Metode customer',
                                        data.identity.customer_match_method,
                                    ],
                                    [
                                        'Metode pickup',
                                        data.identity.match_method,
                                    ],
                                ].map(([key, value]) => (
                                    <div key={key}>
                                        <dt className="text-xs text-muted-foreground">
                                            {key}
                                        </dt>
                                        <dd className="break-words">
                                            {value ?? 'Tidak tersedia'}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                            <h3 className="font-medium">
                                Penjelasan pencocokan
                            </h3>
                            <p className="text-sm">
                                {data.identity.customer_match_note ??
                                    'Penjelasan customer tidak tersedia.'}
                            </p>
                            <p className="text-sm">
                                {data.identity.match_note ??
                                    'Penjelasan pickup tidak tersedia.'}
                            </p>
                            {!!data.identity.customer_match_candidates
                                ?.length && (
                                <Disclosure>
                                    <DisclosureSummary>
                                        Kandidat atribusi dari sistem
                                    </DisclosureSummary>
                                    <pre className="overflow-auto p-2 text-xs">
                                        {JSON.stringify(
                                            data.identity
                                                .customer_match_candidates,
                                            null,
                                            2,
                                        )}
                                    </pre>
                                </Disclosure>
                            )}
                            <h3 className="font-medium">Bukti sumber</h3>
                            {data.sources.data.map((source) => (
                                <article
                                    key={source.id}
                                    className="rounded-md border p-3 text-sm"
                                >
                                    <strong>
                                        {source.report_job?.source ??
                                            'Sumber tidak tersedia'}{' '}
                                        · report #{source.report_job_id}
                                    </strong>
                                    <p className="text-xs">
                                        Record #{source.id} · baris{' '}
                                        {source.source_row} · input{' '}
                                        {time(source.entry_at)}
                                    </p>
                                    <p className="text-xs">
                                        Import{' '}
                                        {time(source.report_job?.imported_at)}
                                    </p>
                                    <p className="text-xs">
                                        Referensi sumber:{' '}
                                        {source.reference ?? 'Tidak tersedia'}
                                    </p>
                                    <Button
                                        asChild
                                        variant="link"
                                        className="h-auto p-0"
                                    >
                                        <Link
                                            href={report.url({
                                                query: {
                                                    run_id:
                                                        source.report_job
                                                            ?.hybrid_batch_id ??
                                                        source.report_job_id,
                                                },
                                            })}
                                        >
                                            Buka bukti report
                                        </Link>
                                    </Button>
                                </article>
                            ))}
                            <ReconciliationPager
                                page={data.sources}
                                change={setSourcePage}
                            />
                            <h3 className="font-medium">Riwayat atribusi</h3>
                            {data.history.data.map((event) => (
                                <article
                                    key={event.id}
                                    className="border-b pb-3 text-sm"
                                >
                                    <p>
                                        {event.reviewer ?? 'Sistem'} ·{' '}
                                        {time(event.created_at)}
                                    </p>
                                    <p>
                                        Customer{' '}
                                        {event.previous_customer_id ?? '—'} →{' '}
                                        {event.customer_id ?? '—'} · pickup{' '}
                                        {event.previous_pickup_task_id ?? '—'} →{' '}
                                        {event.pickup_task_id ?? '—'}
                                    </p>
                                    <p className="text-xs">
                                        {event.method} ·{' '}
                                        {event.reason ??
                                            'Alasan tidak tersedia'}
                                    </p>
                                </article>
                            ))}
                            {!data.history.data.length && (
                                <p className="text-sm text-muted-foreground">
                                    Riwayat keputusan tidak tersedia.
                                </p>
                            )}
                            <ReconciliationPager
                                page={data.history}
                                change={setEventPage}
                            />
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

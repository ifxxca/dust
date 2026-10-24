import { Head, Link, useForm } from '@inertiajs/react';
import ShipmentStatusBadge from '@/components/jne-shipment-status';
import JneCustomerCandidates from '@/components/jne-customer-candidates';
import type { JneCustomerCandidate } from '@/types/jne';
import PageContainer from '@/components/page-container';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { matchLabels, jneTimestamp } from '@/lib/jne-monitoring';
import * as monitoring from '@/routes/jne-monitoring';
import * as reports from '@/routes/jne-reports';
import { show as pickupDetail } from '@/routes/pickup-results';

type Source = {
    report_job_id: number;
    source_row: number;
    reference: string | null;
    shipper_name: string | null;
    consignee_name: string | null;
    status_web: string | null;
    status_pod: string | null;
    awb_cancel: string | null;
    raw_data: Record<string, string | null> | null;
};
type Shipment = {
    id: number;
    awb: string;
    customer_account: string;
    version: number;
    tracking_status: string;
    match_status: string;
    match_method: string | null;
    match_note: string | null;
    observed_at: string | null;
    pickup_reference: string | null;
    pickup_task_id: number | null;
    pickup_customer: string | null;
    source: Source | null;
    customer_name?: string | null;
    customer_code?: string | null;
    customer_match_status?: string;
    customer_match_note?: string | null;
    customer_match_method?: string | null;
    customer_match_candidates?: JneCustomerCandidate[] | null;
};
type Observation = {
    id: number;
    observed_at: string;
    tracking_status: string;
    changes_current: boolean;
    status_web: string | null;
    status_pod: string | null;
    awb_cancel: string | null;
    report_job_id: number;
    source_row: number;
};
type MatchEvent = {
    id: number;
    method: string;
    match_status: string;
    reason: string;
    created_at: string;
    actor_name: string | null;
    pickup_reference: string | null;
    previous_pickup_reference: string | null;
};
export default function JneShipment({
    shipment,
    history,
    matchHistory,
    timezone,
}: {
    shipment: Shipment;
    history: { data: Observation[]; current_page: number; last_page: number };
    matchHistory: MatchEvent[];
    timezone: string;
}) {
    const form = useForm({
        pickup_reference: shipment.pickup_reference || '',
        version: shipment.version,
        reason: '',
    });
    return (
        <PageContainer className="flex flex-col gap-4 space-y-0 py-4">
            <Head title={`AWB ${shipment.awb}`} />
            <h1 className="text-2xl font-semibold">AWB {shipment.awb}</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Detail pengiriman</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <ShipmentStatusBadge status={shipment.tracking_status} />
                    <p className="text-sm">
                        Observasi terakhir:{' '}
                        {jneTimestamp(shipment.observed_at, timezone)}
                    </p>
                    <p className="text-sm">
                        Pengirim: {shipment.source?.shipper_name || '—'} ·
                        Penerima: {shipment.source?.consignee_name || '—'}
                    </p>
                    <p className="text-sm">
                        Customer:{' '}
                        {shipment.customer_name
                            ? `${shipment.customer_code || ''} · ${shipment.customer_name}`
                            : 'Belum dipetakan'}
                        {['AMBIGUOUS', 'CONFLICT'].includes(
                            shipment.customer_match_status || '',
                        ) && ' · Perlu pemeriksaan'}
                    </p>
                    {shipment.customer_match_note && (
                        <p className="text-sm text-muted-foreground">
                            {shipment.customer_match_note}
                        </p>
                    )}
                    <JneCustomerCandidates
                        candidates={shipment.customer_match_candidates}
                    />
                    <p className="text-sm whitespace-pre-wrap">
                        Status web: {shipment.source?.status_web || '—'}
                        <br />
                        Status POD: {shipment.source?.status_pod || '—'}
                        <br />
                        Pembatalan (CSV): {shipment.source?.awb_cancel || '—'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Data berasal dari report JNE; status yang tidak dikenali
                        tetap ditampilkan sebagai belum dikenali.
                    </p>
                    {shipment.source && (
                        <Button size="sm" variant="outline" asChild>
                            <a
                                href={reports.download.url(
                                    shipment.source.report_job_id,
                                )}
                            >
                                Unduh CSV sumber #
                                {shipment.source.report_job_id}
                            </a>
                        </Button>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Pencocokan pickup</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Badge
                        variant={
                            shipment.match_status === 'AMBIGUOUS'
                                ? 'destructive'
                                : 'secondary'
                        }
                    >
                        {matchLabels[shipment.match_status]}
                    </Badge>
                    <p className="text-sm">
                        NOREF CSV: {shipment.source?.reference || '—'}
                    </p>
                    <p className="text-sm">
                        {shipment.match_note ||
                            'Atur nama pengirim pada customer yang benar, lalu gunakan referensi pickup yang sesuai.'}
                    </p>
                    {shipment.pickup_task_id && (
                        <Link
                            className="text-sm underline"
                            href={pickupDetail.url(shipment.pickup_task_id)}
                        >
                            {shipment.pickup_reference} ·{' '}
                            {shipment.pickup_customer}
                        </Link>
                    )}
                    <form
                        className="grid gap-4 md:grid-cols-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            form.post(monitoring.match.url(shipment.id), {
                                preserveScroll: true,
                                onSuccess: () => {
                                    form.setData(
                                        'version',
                                        form.data.version + 1,
                                    );
                                    form.reset('reason');
                                },
                            });
                        }}
                    >
                        <div className="space-y-2">
                            <Label htmlFor="pickup-reference">
                                Referensi pickup (kosongkan untuk melepas)
                            </Label>
                            <Input
                                id="pickup-reference"
                                value={form.data.pickup_reference}
                                maxLength={100}
                                onChange={(event) =>
                                    form.setData(
                                        'pickup_reference',
                                        event.target.value,
                                    )
                                }
                            />
                            <InputError
                                message={form.errors.pickup_reference}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="match-reason">
                                Alasan keputusan Admin
                            </Label>
                            <Input
                                id="match-reason"
                                required
                                maxLength={500}
                                value={form.data.reason}
                                onChange={(event) =>
                                    form.setData('reason', event.target.value)
                                }
                            />
                            <InputError message={form.errors.reason} />
                        </div>
                        <p className="text-sm text-muted-foreground md:col-span-2">
                            Gunakan pickup dengan POP final. Keputusan manual
                            dicatat dan tidak ditimpa pencocokan otomatis.
                            Pickup Staff tidak perlu memindai AWB.
                        </p>
                        <div>
                            <Button disabled={form.processing} type="submit">
                                Simpan keputusan
                            </Button>
                        </div>
                    </form>
                    <details>
                        <summary className="cursor-pointer text-sm">
                            Riwayat keputusan pencocokan
                        </summary>
                        <div className="mt-3 space-y-3">
                            {matchHistory.map((event) => (
                                <div
                                    key={event.id}
                                    className="rounded-md border p-3 text-sm"
                                >
                                    <p>
                                        {jneTimestamp(
                                            event.created_at,
                                            timezone,
                                        )}{' '}
                                        · {event.actor_name || 'Sistem'} ·{' '}
                                        {event.method}
                                    </p>
                                    <p>
                                        {event.previous_pickup_reference || '—'}{' '}
                                        → {event.pickup_reference || '—'} ·{' '}
                                        {matchLabels[event.match_status]}
                                    </p>
                                    <p>{event.reason}</p>
                                </div>
                            ))}
                            {matchHistory.length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                    Belum ada keputusan pencocokan.
                                </p>
                            )}
                        </div>
                    </details>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Riwayat status dari report</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {[
                                    'Observasi',
                                    'Kategori',
                                    'Status web / POD',
                                    'Sumber',
                                    'Perubahan terkini',
                                ].map((label) => (
                                    <TableHead key={label}>{label}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {history.data.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell className="whitespace-nowrap">
                                        {jneTimestamp(
                                            item.observed_at,
                                            timezone,
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <ShipmentStatusBadge
                                            status={item.tracking_status}
                                        />
                                    </TableCell>
                                    <TableCell className="max-w-xl whitespace-normal">
                                        {item.status_web || '—'}
                                        <br />
                                        {item.status_pod || '—'}
                                    </TableCell>
                                    <TableCell>
                                        <Link
                                            className="underline"
                                            href={reports.awbs.url(
                                                item.report_job_id,
                                            )}
                                        >
                                            #{item.report_job_id}
                                        </Link>{' '}
                                        · baris {item.source_row}
                                    </TableCell>
                                    <TableCell>
                                        {item.changes_current
                                            ? 'Ya'
                                            : 'Tidak / observasi lama atau sama'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <div className="flex gap-2">
                        {history.current_page > 1 && (
                            <Button variant="outline" size="sm" asChild>
                                <Link
                                    href={monitoring.show.url(shipment.id, {
                                        query: {
                                            page: history.current_page - 1,
                                        },
                                    })}
                                >
                                    Sebelumnya
                                </Link>
                            </Button>
                        )}
                        {history.current_page < history.last_page && (
                            <Button variant="outline" size="sm" asChild>
                                <Link
                                    href={monitoring.show.url(shipment.id, {
                                        query: {
                                            page: history.current_page + 1,
                                        },
                                    })}
                                >
                                    Berikutnya
                                </Link>
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Seluruh kolom CSV sumber</CardTitle>
                </CardHeader>
                <CardContent>
                    <details>
                        <summary className="cursor-pointer text-sm">
                            Lihat{' '}
                            {
                                Object.keys(shipment.source?.raw_data || {})
                                    .length
                            }{' '}
                            kolom asli pada record sumber
                        </summary>
                        <p className="my-3 text-sm text-muted-foreground">
                            Nilai di bawah mempertahankan isi field CSV,
                            termasuk format teks Excel. File CSV sumber tetap
                            utuh.
                        </p>
                        <div className="max-h-[32rem] overflow-auto">
                            <Table>
                                <TableBody>
                                    {Object.entries(
                                        shipment.source?.raw_data || {},
                                    ).map(([key, value]) => (
                                        <TableRow key={key}>
                                            <TableHead className="align-top">
                                                {key}
                                            </TableHead>
                                            <TableCell className="break-words whitespace-pre-wrap">
                                                {value ?? ''}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </details>
                </CardContent>
            </Card>
        </PageContainer>
    );
}

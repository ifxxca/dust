import { useState } from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import ShipmentStatusBadge from '@/components/jne-shipment-status';
import ShipmentOverview, {
    ShipmentDisclosure,
    ShipmentSourceDetails,
} from '@/components/jne-shipment-overview';
import type {
    JneCustomerCandidate,
    JneDetail,
    JneMatchEvidence,
    JneSourceProvenance,
} from '@/types/jne';
import PageContainer from '@/components/page-container';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Package, LockKeyhole, Pencil, History } from 'lucide-react';
import { focusFormError } from '@/lib/utils';
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
    original_customer_code?: string | null;
    source_evidence?: JneSourceProvenance | null;
};
type Shipment = {
    category?: string | null;
    category_status?: string;
    category_evidence?: unknown;
    id: number;
    awb: string;
    customer_account: string;
    version: number;
    tracking_status: string;
    match_status: string;
    match_method: string | null;
    match_note: string | null;
    entry_at: string | null;
    observed_at: string | null;
    last_report_received_at?: string | null;
    last_refresh_attempt?: JneDetail['shipment']['last_refresh_attempt'];
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
    shipper_name?: string | null;
    customer_account?: string | null;
    reference?: string | null;
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
    previous_customer_id?: number | null;
    customer_id?: number | null;
    customer_match_status?: string;
    evidence?: JneMatchEvidence[] | null;
};
export default function JneShipment({
    shipment,
    history,
    matchHistory,
    timezone,
    decisionPages,
}: {
    shipment: Shipment;
    history: { data: Observation[]; current_page: number; last_page: number };
    matchHistory: MatchEvent[];
    timezone: string;
    decisionPages?: {
        data: {
            id: number;
            method: string;
            actor_id: number | null;
            reason: string;
            evidence: unknown;
            created_at: string;
        }[];
        total?: number;
        prev_page_url: string | null;
        next_page_url: string | null;
    };
}) {
    const [editingPickup, setEditingPickup] = useState(false);
    const form = useForm({
        pickup_reference: shipment.pickup_reference || '',
        version: shipment.version,
        reason: '',
    });
    return (
        <PageContainer className="flex flex-col gap-4 space-y-0 py-4">
            <Head title={`AWB ${shipment.awb}`} />
            <ShipmentOverview
                shipment={shipment}
                history={history}
                timezone={timezone}
            >
                <Card
                    id="pickup-matching"
                    className="min-w-0 scroll-mt-20 gap-4 py-4"
                >
                    <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 px-4">
                        <CardTitle>
                            <h2 className="flex items-center gap-2 text-sm">
                                <Package
                                    aria-hidden="true"
                                    className="size-5 text-primary"
                                />
                                Pencocokan pickup
                            </h2>
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge
                                variant={
                                    shipment.match_status === 'AMBIGUOUS'
                                        ? 'destructive'
                                        : 'secondary'
                                }
                            >
                                {matchLabels[shipment.match_status]}
                            </Badge>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-expanded={editingPickup}
                                aria-controls="pickup-editor"
                                disabled={form.processing}
                                onClick={() => setEditingPickup(!editingPickup)}
                            >
                                <Pencil data-icon="inline-start" />
                                {editingPickup
                                    ? 'Tutup koreksi'
                                    : shipment.pickup_task_id
                                      ? 'Ubah pickup'
                                      : 'Hubungkan pickup'}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="flex min-w-0 flex-col gap-4 px-4">
                        {shipment.match_status !== 'MATCHED' && (
                            <Alert>
                                <AlertDescription>
                                    {shipment.match_note ||
                                        'Belum terhubung ke pickup. Periksa customer dan referensi pickup.'}
                                </AlertDescription>
                            </Alert>
                        )}
                        {shipment.pickup_task_id && (
                            <Link
                                className="text-sm underline"
                                href={pickupDetail.url(shipment.pickup_task_id)}
                            >
                                {shipment.pickup_reference} ·{' '}
                                {shipment.pickup_customer}
                            </Link>
                        )}
                        {editingPickup && (
                            <form
                                id="pickup-editor"
                                className="grid min-w-0 gap-4 md:grid-cols-2"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    const element = event.currentTarget;
                                    form.post(
                                        monitoring.match.url(shipment.id),
                                        {
                                            preserveScroll: true,
                                            onError: () =>
                                                focusFormError(element),
                                            onSuccess: () => {
                                                form.setData(
                                                    'version',
                                                    form.data.version + 1,
                                                );
                                                form.reset('reason');
                                                setEditingPickup(false);
                                            },
                                        },
                                    );
                                }}
                            >
                                <div className="flex min-w-0 flex-col gap-2">
                                    <Label htmlFor="pickup-reference">
                                        Referensi pickup (kosongkan untuk
                                        melepas)
                                    </Label>
                                    <Input
                                        id="pickup-reference"
                                        name="pickup_reference"
                                        autoComplete="off"
                                        spellCheck={false}
                                        className="min-h-11"
                                        placeholder="Masukkan referensi pickup…"
                                        aria-invalid={
                                            !!form.errors.pickup_reference
                                        }
                                        aria-describedby={
                                            form.errors.pickup_reference
                                                ? 'pickup-reference-error'
                                                : undefined
                                        }
                                        disabled={form.processing}
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
                                        id="pickup-reference-error"
                                        message={form.errors.pickup_reference}
                                    />
                                </div>
                                <div className="flex min-w-0 flex-col gap-2">
                                    <Label htmlFor="match-reason">
                                        Alasan keputusan Admin
                                    </Label>
                                    <Textarea
                                        id="match-reason"
                                        name="reason"
                                        className="min-h-20"
                                        placeholder="Contoh: resi sesuai POP final…"
                                        aria-invalid={!!form.errors.reason}
                                        aria-describedby={
                                            form.errors.reason
                                                ? 'match-reason-error'
                                                : undefined
                                        }
                                        disabled={form.processing}
                                        required
                                        maxLength={500}
                                        value={form.data.reason}
                                        onChange={(event) =>
                                            form.setData(
                                                'reason',
                                                event.target.value,
                                            )
                                        }
                                    />
                                    <div className="flex items-start justify-between gap-2">
                                        <InputError
                                            id="match-reason-error"
                                            message={form.errors.reason}
                                        />
                                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                                            {form.data.reason.length}/500
                                        </span>
                                    </div>
                                </div>
                                <details className="text-xs text-muted-foreground md:col-span-2">
                                    <summary className="cursor-pointer">
                                        Ketentuan pencocokan pickup
                                    </summary>
                                    <p className="mt-2">
                                        Gunakan pickup dengan POP final.
                                        Keputusan manual dicatat dan tidak
                                        ditimpa pencocokan otomatis. Cashless
                                        dicatat melalui Sertim; CSS / Orion
                                        tidak wajib dipindai satu per satu.
                                    </p>
                                </details>
                                <div>
                                    <Button
                                        disabled={form.processing}
                                        type="submit"
                                    >
                                        <LockKeyhole data-icon="inline-start" />
                                        {form.processing
                                            ? 'Menyimpan…'
                                            : 'Simpan keputusan'}
                                    </Button>
                                </div>
                            </form>
                        )}
                        <p className="text-xs text-muted-foreground">
                            {matchHistory.length
                                ? `${decisionPages?.total ?? matchHistory.length} catatan pencocokan · Terakhir ${jneTimestamp(matchHistory[0].created_at, timezone)} · ${matchHistory[0].actor_name || 'Sistem'}`
                                : 'Belum ada keputusan pencocokan.'}
                        </p>
                    </CardContent>
                </Card>
            </ShipmentOverview>
            <ShipmentDisclosure title="Detail teknis & audit">
                <ShipmentSourceDetails
                    shipment={shipment}
                    timezone={timezone}
                />
                <ShipmentDisclosure title="Riwayat status dari report">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {[
                                    'Waktu observasi',
                                    'Status pengiriman',
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
                                        <p className="max-w-64 text-xs whitespace-normal text-muted-foreground">
                                            Account:{' '}
                                            {item.customer_account || '—'} ·
                                            Pengirim: {item.shipper_name || '—'}{' '}
                                            · Referensi: {item.reference || '—'}
                                        </p>
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
                </ShipmentDisclosure>
                <ShipmentDisclosure
                    title={`Seluruh kolom CSV sumber (${Object.keys(shipment.source?.raw_data || {}).length})`}
                >
                    <p className="my-3 text-sm text-muted-foreground">
                        Nilai di bawah mempertahankan isi field CSV, termasuk
                        format teks Excel. File CSV sumber tetap utuh.
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
                </ShipmentDisclosure>
                <ShipmentDisclosure
                    title={`Riwayat keputusan pencocokan (${matchHistory.length})`}
                    icon={History}
                >
                    <div className="flex max-h-96 flex-col gap-2 overflow-auto">
                        {matchHistory.map((event) => (
                            <details
                                key={event.id}
                                className="rounded-md border p-3 text-sm"
                            >
                                <summary className="cursor-pointer break-words">
                                    {jneTimestamp(event.created_at, timezone)} ·{' '}
                                    {event.actor_name || 'Sistem'} ·{' '}
                                    {event.method}
                                </summary>
                                <p>
                                    {event.previous_pickup_reference || '—'} →{' '}
                                    {event.pickup_reference || '—'} ·{' '}
                                    {matchLabels[event.match_status]}
                                </p>
                                <p>{event.reason}</p>
                                <p className="text-xs text-muted-foreground">
                                    Customer #
                                    {event.previous_customer_id ?? '—'} → #
                                    {event.customer_id ?? '—'} ·{' '}
                                    {event.customer_match_status
                                        ? matchLabels[
                                              event.customer_match_status
                                          ]
                                        : '—'}
                                </p>
                                {event.evidence &&
                                    event.evidence.length > 0 && (
                                        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                                            {event.evidence.map(
                                                (evidence, index) => (
                                                    <li key={index}>
                                                        {evidence.original_code && (
                                                            <>
                                                                Kode asli{' '}
                                                                {
                                                                    evidence.original_code
                                                                }{' '}
                                                                · Kontrak #
                                                                {
                                                                    evidence.contract_id
                                                                }{' '}
                                                                revisi{' '}
                                                                {
                                                                    evidence.contract_revision
                                                                }{' '}
                                                                ·{' '}
                                                                {evidence.registered_code
                                                                    ? 'Kode terdaftar ' +
                                                                      evidence.registered_code
                                                                    : 'Bukti sumber'}{' '}
                                                                ·{' '}
                                                            </>
                                                        )}
                                                        {evidence.source_id && (
                                                            <>
                                                                Baris sumber #
                                                                {
                                                                    evidence.source_id
                                                                }{' '}
                                                                ·{' '}
                                                            </>
                                                        )}
                                                        {evidence.alias_id && (
                                                            <>
                                                                Alias terdaftar
                                                                #
                                                                {
                                                                    evidence.alias_id
                                                                }{' '}
                                                                · Customer #
                                                                {
                                                                    evidence.customer_id
                                                                }
                                                            </>
                                                        )}
                                                        {evidence.sertim_id && (
                                                            <>
                                                                Sertim #
                                                                {
                                                                    evidence.sertim_id
                                                                }{' '}
                                                                revisi{' '}
                                                                {
                                                                    evidence.sertim_version
                                                                }{' '}
                                                                · Customer #
                                                                {
                                                                    evidence.customer_id
                                                                }{' '}
                                                                · Pickup #
                                                                {
                                                                    evidence.pickup_task_id
                                                                }
                                                            </>
                                                        )}
                                                        {evidence.reference && (
                                                            <>
                                                                Referensi{' '}
                                                                {
                                                                    evidence.reference
                                                                }{' '}
                                                                · Pickup #
                                                                {evidence.pickup_task_ids?.join(
                                                                    ', #',
                                                                )}
                                                            </>
                                                        )}
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    )}
                            </details>
                        ))}
                        {matchHistory.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                                Belum ada keputusan pencocokan.
                            </p>
                        )}
                    </div>
                </ShipmentDisclosure>
                {decisionPages && (
                    <details className="rounded border p-3">
                        <summary>
                            Audit keputusan lengkap ({decisionPages.data.length}{' '}
                            pada halaman ini)
                        </summary>
                        <div className="max-h-96 overflow-auto">
                            {decisionPages.data.map((event) => (
                                <details key={event.id} className="my-2">
                                    <summary>
                                        {event.created_at} · {event.method} ·{' '}
                                        {event.reason}
                                    </summary>
                                    <pre className="max-w-full overflow-auto text-xs">
                                        {JSON.stringify(
                                            event.evidence,
                                            null,
                                            2,
                                        )}
                                    </pre>
                                </details>
                            ))}
                        </div>
                        <nav className="flex gap-4">
                            {decisionPages.prev_page_url && (
                                <Link href={decisionPages.prev_page_url}>
                                    Audit sebelumnya
                                </Link>
                            )}
                            {decisionPages.next_page_url && (
                                <Link href={decisionPages.next_page_url}>
                                    Audit berikutnya
                                </Link>
                            )}
                        </nav>
                    </details>
                )}
            </ShipmentDisclosure>
        </PageContainer>
    );
}

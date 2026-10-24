import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from '@/components/ui/table';
import { EmptyState } from '@/components/operational-ui';
import {
    ProcessingSource,
    ProcessingPager,
    categoryName,
    processingLabels,
    processingDate,
} from '@/components/package-processing-ui';
import type { ProcessingDetail } from '@/types/package-processing';
import RecordProcessingDialog from '@/components/record-processing-dialog';
import type { ResultTask, PickupResult } from '@/types/pickup-result';
export default function PickupProcessingDetail({
    data,
    timezone,
    task,
    result,
    autoRecord = false,
}: {
    data: ProcessingDetail;
    timezone: string;
    task: ResultTask;
    result: PickupResult;
    autoRecord?: boolean;
}) {
    return (
        <div className="space-y-5">
            <ProcessingSource />
            {data.can_record && (
                <RecordProcessingDialog
                    taskId={task.id}
                    data={data}
                    pickupRevision={result.pickup_revision}
                    handoverRevision={result.handover_revision}
                    initialOpen={autoRecord}
                />
            )}
            <p className="text-sm text-muted-foreground">
                POP efektif revisi #{task.proof?.revision ?? 0}. Nilai POP asli:
                Manual Hybrid {task.proof?.original?.manual_hybrid ?? '—'},
                Cashless Hybrid {task.proof?.original?.cashless_hybrid ?? '—'},
                CSS / Orion {task.proof?.original?.css_orion ?? '—'}.
            </p>
            <div className="rounded-xl border bg-card p-4">
                <h2 className="mb-3 font-semibold">
                    POP, penerimaan dan pemrosesan
                </h2>
                <p className="mb-3 text-sm text-muted-foreground">
                    Selisih fisik = Retail − POP. Gap konfirmasi pemrosesan =
                    Retail − konfirmasi sistem; belum dapat dihitung sebagai
                    selisih pasti karena sumber sistem belum tersedia. Gap
                    deklarasi manual di bawah adalah Retail − berhasil manual,
                    bukan konfirmasi eksternal.
                </p>
                <Table>
                    <TableHeader>
                        <TableRow>
                            {[
                                'Kategori',
                                'POP efektif',
                                'Retail',
                                'Selisih fisik',
                                'Terkonfirmasi sistem',
                                'Berhasil manual',
                                'Gap deklarasi manual',
                                'Belum terkonfirmasi',
                                'Status',
                            ].map((label) => (
                                <TableHead key={label}>{label}</TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.rows.map((row) => (
                            <TableRow key={row.category}>
                                <TableCell>
                                    {categoryName(row.category)}
                                </TableCell>
                                <TableCell>{row.pop_quantity}</TableCell>
                                <TableCell>
                                    {row.received_quantity ?? '—'}
                                </TableCell>
                                <TableCell>
                                    {row.needs_review
                                        ? 'Perlu tinjau ulang POP'
                                        : row.received_quantity == null
                                          ? '—'
                                          : row.received_quantity -
                                            row.pop_quantity}
                                </TableCell>
                                <TableCell>Belum tersedia</TableCell>
                                <TableCell>{row.manual_quantity}</TableCell>
                                <TableCell>
                                    {row.received_quantity == null
                                        ? '—'
                                        : row.received_quantity -
                                          row.manual_quantity}
                                </TableCell>
                                <TableCell>
                                    {row.unconfirmed_quantity}
                                </TableCell>
                                <TableCell>
                                    {processingLabels[row.processing_status]}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {data.rows.length === 0 && (
                    <EmptyState title="Belum ada kuantitas paket" />
                )}
            </div>
            {data.rows.some((row) => row.reconciliation_reasons.length > 0) && (
                <div
                    role="alert"
                    className="space-y-2 rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
                >
                    <h2 className="font-semibold">Investigasi pemrosesan</h2>
                    {data.rows.map((row) =>
                        row.reconciliation_reasons.map((reason) => (
                            <p key={row.category + reason}>
                                {categoryName(row.category)}: {reason}
                            </p>
                        )),
                    )}
                </div>
            )}
            <div className="space-y-3 rounded-xl border bg-card p-4">
                <h2 className="font-semibold">
                    Catatan efektif JNE Hybrid / MyORION
                </h2>
                <p className="text-sm text-muted-foreground">
                    Seluruh catatan di bawah adalah deklarasi manual. Satu
                    snapshot efektif per kategori/sistem.
                </p>
                {data.latest.map((record) => (
                    <article
                        key={record.id}
                        className="space-y-1 rounded-lg border p-3 text-sm"
                    >
                        <h3 className="font-semibold">
                            {processingLabels[record.system]} ·{' '}
                            {categoryName(record.category)} · Revisi #
                            {record.revision}
                        </h3>
                        <p>
                            Dicatat Manual · {record.actor_name} ·{' '}
                            {processingDate(record.created_at, timezone)}
                        </p>
                        <p>
                            Berhasil: {record.successful_quantity} · Gagal:{' '}
                            {record.failed_quantity} · Pending:{' '}
                            {record.pending_quantity} · Outcome tidak diketahui:{' '}
                            {record.unknown_quantity}
                        </p>
                        <p>
                            Baseline POP #{record.pickup_revision} · Retail:{' '}
                            {record.received_quantity ?? 'Belum diverifikasi'}
                        </p>
                        <p>
                            Referensi dilaporkan:{' '}
                            {record.external_reference ?? '—'}
                        </p>
                        <p>Alasan / bukti pendukung: {record.reason}</p>
                    </article>
                ))}
                {data.latest.length === 0 && (
                    <EmptyState
                        title="Belum ada catatan pemrosesan"
                        description="Pickup, POP, dan Handover tidak membuktikan paket sudah diinput ke sistem eksternal."
                    />
                )}
            </div>
            <div className="space-y-3 rounded-xl border bg-card p-4">
                <h2 className="font-semibold">Riwayat snapshot pemrosesan</h2>
                <p className="text-xs text-muted-foreground">
                    Revisi terbaru menggantikan kontribusi hitungan sebelumnya;
                    histori tetap tersimpan. Bandingkan revisi berurutan untuk
                    nilai sebelum/sesudah.
                </p>
                {data.history.data.map((record) => (
                    <details
                        key={record.id}
                        className="rounded-md border p-3 text-sm"
                    >
                        <summary>
                            {processingLabels[record.system]} ·{' '}
                            {categoryName(record.category)} · #{record.revision}{' '}
                            · {record.actor_name} ·{' '}
                            {processingDate(record.created_at, timezone)}
                        </summary>
                        {record.previous_successful != null && (
                            <p className="mt-2 text-muted-foreground">
                                Sebelumnya: berhasil{' '}
                                {record.previous_successful}; gagal{' '}
                                {record.previous_failed}; pending{' '}
                                {record.previous_pending}; outcome tidak
                                diketahui {record.previous_unknown}.
                            </p>
                        )}
                        <p className="mt-2">
                            Sesudah: berhasil {record.successful_quantity};
                            gagal {record.failed_quantity}; pending{' '}
                            {record.pending_quantity}; outcome tidak diketahui{' '}
                            {record.unknown_quantity}
                        </p>
                        <p>{record.reason}</p>
                        <p>
                            Referensi: {record.external_reference ?? '—'} · POP
                            #{record.pickup_revision} · Retail saat dicatat:{' '}
                            {record.received_quantity ?? 'Belum diverifikasi'}
                        </p>
                    </details>
                ))}
                <ProcessingPager page={data.history} />
            </div>
        </div>
    );
}

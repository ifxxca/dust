import { Disclosure, DisclosureSummary } from '@/components/ui/disclosure';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { index } from '@/routes/mobile/cashless-handover';
import type { CashlessScanProgress as Progress } from '../../js/types/cashless-handover';
import { playScanError, playScanSuccess } from '@/lib/scan-feedback';
import { request, userFacingError } from './api';
import { readLocal, writeLocal } from './local-store';
import type { Session } from './types';
import { OperationalFeedback } from './feedback';
import SecondaryDisclosure from '@/components/secondary-disclosure';

type Acknowledged = { success: number[]; failure: string[] };

export function newScanMilestones(progress: Progress, previous: Acknowledged) {
    return {
        success: progress.confirmed_ids.filter(
            (id) => !previous.success.includes(id),
        ),
        failure: progress.failed_attempts.filter(
            (id) => !previous.failure.includes(id),
        ),
    };
}

export function useCashlessScanProgress(
    session: Session,
    pickupId: number | undefined,
    online: boolean,
) {
    const [progress, setProgress] = useState<Progress | null>(null);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [tone, setTone] = useState<'success' | 'error'>('success');
    useEffect(() => {
        setProgress(null);
        setNotice('');
        setError('');
    }, [pickupId, session.user.id, session.environment]);
    useEffect(() => {
        if (!pickupId || !online) return;
        const controller = new AbortController();
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        const journal = `cashless-milestones-${pickupId}`;
        let acknowledged: Acknowledged | null = null;
        const poll = async () => {
            try {
                if (document.hidden) return;
                const result = await request<{
                    selected: { scan_progress?: Progress } | null;
                }>(
                    index({ query: { task: pickupId } }),
                    session,
                    controller.signal,
                );
                if (!active || document.hidden) return;
                const next = result.selected?.scan_progress;
                if (!next)
                    throw new Error(
                        'Status pemrosesan belum tersedia. Segarkan setelah server diperbarui.',
                    );
                setProgress(next);
                acknowledged ??= await readLocal<Acknowledged>(
                    session,
                    journal,
                );
                if (!active) return;
                if (
                    acknowledged &&
                    (!Array.isArray(acknowledged.success) ||
                        !Array.isArray(acknowledged.failure))
                )
                    throw new Error(
                        'Catatan umpan balik belum dapat dibaca. Hubungi Admin.',
                    );
                const fresh = acknowledged
                    ? newScanMilestones(next, acknowledged)
                    : { success: [], failure: [] };
                const updated = {
                    success: [
                        ...new Set([
                            ...(acknowledged?.success ?? []),
                            ...next.confirmed_ids,
                        ]),
                    ],
                    failure: [
                        ...new Set([
                            ...(acknowledged?.failure ?? []),
                            ...next.failed_attempts,
                        ]),
                    ],
                };
                await writeLocal(session, journal, updated);
                acknowledged = updated;
                if (!active) return;
                setError('');
                if (fresh.failure.length) {
                    playScanError();
                    setTone('error');
                    const affected = next.recent
                        .filter((row) =>
                            fresh.failure.includes(
                                `${row.id}:${row.batch_id}:${row.state}`,
                            ),
                        )
                        .slice(0, 3)
                        .map((row) => row.awb)
                        .join(', ');
                    setNotice(
                        `${fresh.failure.length} resi gagal atau perlu diperiksa${affected ? `: ${affected}` : ''}. Buka riwayat; tidak ada pengiriman ulang otomatis dari perangkat.`,
                    );
                } else if (fresh.success.length) {
                    playScanSuccess();
                    setTone('success');
                    const affected = next.recent
                        .filter((row) => fresh.success.includes(row.id))
                        .slice(0, 3)
                        .map((row) => row.awb)
                        .join(', ');
                    setNotice(
                        `${fresh.success.length} resi berhasil diproses${affected ? `: ${affected}` : ''}. Approval dikonfirmasi server. Rekonsiliasi mengikuti status tersendiri.`,
                    );
                }
            } catch (reason) {
                if (active) setError(userFacingError(reason));
            } finally {
                if (active) timer = setTimeout(() => void poll(), 5000);
            }
        };
        void poll();
        return () => {
            active = false;
            controller.abort();
            clearTimeout(timer);
        };
    }, [session.token, session.user.id, session.environment, pickupId, online]);
    return { progress, notice, error, tone };
}

export function CashlessScanSummary({
    progress,

    draftCount,

    pending = false,

    counts,
}: {
    progress: Progress | null;

    draftCount: number;

    pending?: boolean;

    counts?: { total: number; duplicate: number; invalid: number };
}) {
    return (
        <div className="scan-summary" aria-label="Ringkasan pemindaian">
            {pending && (
                <p role="status" className="text-sm font-medium text-warning">
                    Konfirmasi pengiriman tertunda
                </p>
            )}
            <dl className="scan-totals">
                <div>
                    <dt>Belum dikirim</dt>
                    <dd>{draftCount}</dd>
                </div>
                {progress && (
                    <>
                        <div>
                            <dt>Berhasil</dt>
                            <dd>{progress.summary.success}</dd>
                        </div>
                        <div>
                            <dt>Diproses</dt>
                            <dd>{progress.summary.pending}</dd>
                        </div>
                    </>
                )}
            </dl>
            {progress &&
                (progress.summary.failed > 0 ||
                    progress.summary.attention > 0) && (
                    <p
                        role="status"
                        className="text-sm font-medium text-destructive"
                    >
                        Gagal: {progress.summary.failed} · Periksa:{' '}
                        {progress.summary.attention}
                    </p>
                )}
            {progress ? (
                <SecondaryDisclosure
                    className="scan-server-detail"
                    title="Rincian pemrosesan"
                >
                    <p className="pb-2 text-sm tabular-nums" role="status">
                        Buku — Total: {progress.summary.total} · Dicoba ulang:{' '}
                        {progress.summary.retrying} · Gagal:{' '}
                        {progress.summary.failed} · Periksa:{' '}
                        {progress.summary.attention}
                    </p>
                </SecondaryDisclosure>
            ) : (
                <p className="text-sm text-muted-foreground">
                    Status server belum tersedia.
                </p>
            )}
            {counts && (
                <p className="text-xs text-muted-foreground tabular-nums">
                    Scan: {counts.total} · Duplikat: {counts.duplicate} · Tidak
                    valid: {counts.invalid}
                </p>
            )}
        </div>
    );
}

export function CashlessScanHistory({
    progress,
    notice,
    error,
    tone,
}: ReturnType<typeof useCashlessScanProgress>) {
    const history = useRef<HTMLDetailsElement>(null);
    const attention =
        (progress?.summary.failed ?? 0) + (progress?.summary.attention ?? 0);
    return (
        <>
            {attention > 0 && (
                <OperationalFeedback
                    title={`${attention} resi perlu tindakan`}
                    tone="error"
                >
                    <p>
                        Periksa hasil resi sebelum mengirim ulang. Pengiriman
                        ulang otomatis dari perangkat tidak dijadwalkan.
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        className="mt-2 min-h-12"
                        onClick={() => {
                            if (!history.current) return;
                            history.current.open = true;
                            history.current.querySelector('summary')?.focus();
                            history.current.scrollIntoView({
                                block: 'nearest',
                            });
                        }}
                    >
                        Periksa riwayat resi
                    </Button>
                </OperationalFeedback>
            )}
            {notice && (
                <OperationalFeedback
                    title={
                        tone === 'success' ? 'Proses selesai' : 'Perlu tindakan'
                    }
                    tone={tone}
                >
                    {notice}
                </OperationalFeedback>
            )}
            {error && (
                <OperationalFeedback
                    title="Status belum diperbarui"
                    tone="warning"
                >
                    {error} Status lama dipertahankan; pemeriksaan status dicoba
                    lagi saat layar aktif.
                </OperationalFeedback>
            )}
            {progress && (progress.recent.length > 0 || attention > 0) && (
                <Disclosure ref={history} className="scan-history">
                    <DisclosureSummary className="min-h-11 cursor-pointer content-center">
                        Riwayat proses resi (50 terbaru)
                    </DisclosureSummary>
                    <ul className="max-h-72 divide-y overflow-y-auto">
                        {progress.recent.map((row) => (
                            <li key={row.id} className="py-2 text-sm">
                                <p className="font-mono break-all">{row.awb}</p>
                                <p
                                    className={
                                        ['failed', 'attention'].includes(
                                            row.state,
                                        )
                                            ? 'text-destructive'
                                            : row.state === 'success'
                                              ? 'text-success'
                                              : 'text-muted-foreground'
                                    }
                                >
                                    {
                                        {
                                            success:
                                                'Berhasil · approval dikonfirmasi',
                                            failed: 'Gagal · perlu tindakan',
                                            attention:
                                                'Hasil belum pasti · perlu diperiksa',
                                            retrying:
                                                'Percobaan lanjutan · diproses',
                                            pending: row.batch_id
                                                ? 'Diproses · menunggu konfirmasi'
                                                : 'Terkirim · belum masuk antrean',
                                        }[row.state]
                                    }
                                </p>
                                {row.message && (
                                    <p className="break-words">{row.message}</p>
                                )}
                                {['failed', 'attention'].includes(
                                    row.state,
                                ) && (
                                    <p>
                                        Tidak dikirim ulang otomatis dari
                                        perangkat. Buka hasil batch melalui menu
                                        Notifikasi untuk pemeriksaan.
                                    </p>
                                )}
                            </li>
                        ))}
                    </ul>
                </Disclosure>
            )}
        </>
    );
}

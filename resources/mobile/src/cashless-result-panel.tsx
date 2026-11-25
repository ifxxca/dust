import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import CashlessResultView from '@/components/cashless-result-view';
import type { CashlessResult } from '../../js/types/cashless-handover';
import { show, correct } from '@/routes/mobile/cashless-results';
import { request, userFacingError } from './api';
import { ApiError } from './api';
import CashlessCameraScanner from './cashless-camera-scanner';
import type { Session } from './types';

export default function CashlessResultPanel({
    session,
    batchId,
    onBack,
}: {
    session: Session;
    batchId: number;
    onBack: () => void;
}) {
    const [result, setResult] = useState<CashlessResult | null>(null);
    const [currentBatch, setCurrentBatch] = useState(batchId);
    const [camera, setCamera] = useState<{
        onScan: (raw: string) => Promise<{ awb?: string; error?: string }>;
    } | null>(null);
    useEffect(() => {
        setCurrentBatch(batchId);
        setResult(null);
        setPage(1);
    }, [batchId]);
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(true);
    useEffect(() => {
        const controller = new AbortController();
        setBusy(true);
        void request<CashlessResult>(
            show(currentBatch, { query: { page } }),
            session,
            controller.signal,
        )
            .then((value) => {
                if (!controller.signal.aborted) {
                    setResult(value);
                    setError('');
                }
            })
            .catch((failure) => {
                if (!controller.signal.aborted)
                    setError(userFacingError(failure));
            })
            .finally(() => {
                if (!controller.signal.aborted) setBusy(false);
            });
        return () => controller.abort();
    }, [session.token, currentBatch, page, revision]);
    return (
        <div className="flex flex-col gap-4">
            <Button variant="outline" onClick={onBack}>
                Kembali ke notifikasi
            </Button>
            {error && (
                <div role="alert" className="flex flex-col gap-2">
                    <p className="text-sm text-destructive">{error}</p>
                    <Button
                        variant="outline"
                        onClick={() => setRevision((value) => value + 1)}
                    >
                        Coba lagi
                    </Button>
                </div>
            )}
            {busy && !result && (
                <div role="status" aria-label="Memuat hasil cashless">
                    <Skeleton className="h-40 w-full" />
                </div>
            )}
            {result && (
                <CashlessResultView
                    result={result}
                    busy={busy}
                    onPage={setPage}
                    onCorrect={async (item, data) => {
                        try {
                            const next = await request<{ batch_id: number }>(
                                correct([currentBatch, item.id]),
                                session,
                                new AbortController().signal,
                                data,
                            );
                            setRevision((value) => value + 1);
                            return next.batch_id;
                        } catch (failure) {
                            const validation =
                                failure instanceof ApiError
                                    ? Object.values(failure.errors).flat()[0]
                                    : undefined;
                            throw new Error(
                                validation ?? userFacingError(failure),
                            );
                        }
                    }}
                    onOpenBatch={(id) => {
                        setCurrentBatch(id);
                        setResult(null);
                        setPage(1);
                    }}
                    onCamera={(onScan) => setCamera({ onScan })}
                />
            )}
            {camera && (
                <CashlessCameraScanner
                    title="Scan resi pengganti"
                    count={0}
                    onScan={camera.onScan}
                    onClose={() => setCamera(null)}
                />
            )}
        </div>
    );
}

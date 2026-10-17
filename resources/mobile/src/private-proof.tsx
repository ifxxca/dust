import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { evidence } from '@/routes/mobile';
import { request } from './api';
import { receiptLabel } from './proof-draft';
import type { Session, Proof } from './types';
import { OperationalFeedback } from './feedback';
export default function PrivateProof({
    proof,
    session,
}: {
    proof: Proof;
    session: Session;
}) {
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState('');
    const controller = useRef(new AbortController());
    useEffect(() => {
        controller.current = new AbortController();
        return () => controller.current.abort();
    }, [session.token]);
    useEffect(
        () => () => {
            if (preview) URL.revokeObjectURL(preview);
        },
        [preview],
    );
    return (
        <section className="space-y-3 border-t pt-4" aria-label="POP final">
            <h3 className="font-semibold">
                POP final · #{proof.id} · revisi {proof.revision}
            </h3>
            <p>
                Manual Hybrid: {proof.manual_hybrid} · Cashless Hybrid:{' '}
                {proof.cashless_hybrid} · CSS / Orion: {proof.css_orion} ·
                Total: {proof.total}
            </p>
            {proof.customer_name && <p>Customer: {proof.customer_name}</p>}
            {proof.pickup_address && <p>Alamat POP: {proof.pickup_address}</p>}
            {proof.contact && <p>Kontak POP: {proof.contact}</p>}
            {proof.notes && <p>{proof.notes}</p>}
            <OperationalFeedback
                title={receiptLabel(proof.receipt?.status)}
                tone={
                    proof.receipt?.status === 'DELIVERED' ? 'success' : 'info'
                }
            />
            {proof.receipt?.proof_revision !== undefined && (
                <p>
                    Receipt untuk POP revisi {proof.receipt.proof_revision}
                    {proof.receipt.proof_revision !== proof.revision
                        ? ' · berbeda dari revisi POP terkini'
                        : ''}
                    .
                </p>
            )}
            {proof.attachments?.map((file) => (
                <Button
                    key={file.id}
                    variant="outline"
                    onClick={() => {
                        setError('');
                        void request<Blob>(
                            evidence(file.id),
                            session,
                            controller.current.signal,
                            undefined,
                            false,
                            'blob',
                        )
                            .then((blob) => {
                                if (controller.current.signal.aborted) return;
                                if (
                                    ![
                                        'image/png',
                                        'image/jpeg',
                                        'image/webp',
                                    ].includes(blob.type)
                                )
                                    throw new Error(
                                        'Bukti bukan image yang didukung.',
                                    );
                                setPreview(URL.createObjectURL(blob));
                            })
                            .catch(() =>
                                setError(
                                    'Bukti privat belum dapat dibuka; periksa sesi dan hak akses.',
                                ),
                            );
                    }}
                >
                    Lihat {file.kind === 'signature' ? 'tanda tangan' : 'foto'}{' '}
                    #{file.id}
                </Button>
            ))}
            {preview && (
                <>
                    <img
                        src={preview}
                        alt="Bukti POP privat"
                        className="max-h-80 w-full object-contain"
                    />
                    <Button variant="outline" onClick={() => setPreview(null)}>
                        Tutup Bukti
                    </Button>
                </>
            )}
            {error && <OperationalFeedback title={error} tone="error" />}
            {proof.revisions?.map((revision) => (
                <div key={revision.revision}>
                    <p>
                        Revisi {revision.revision}: {revision.reason}
                    </p>
                    <dl className="text-sm">
                        {Object.entries(revision.values).map(
                            ([field, value]) => {
                                const labels: Record<string, string> = {
                                    manual_hybrid: 'Manual Hybrid Non-Cashless',
                                    cashless_hybrid: 'Cashless Hybrid',
                                    css_orion: 'CSS / Orion',
                                    notes: 'Catatan',
                                    customer_name: 'Customer',
                                    pickup_address: 'Alamat',
                                    contact: 'Kontak',
                                };
                                return labels[field] &&
                                    (typeof value === 'string' ||
                                        typeof value === 'number') ? (
                                    <div key={field}>
                                        <dt>{labels[field]}</dt>
                                        <dd>{value}</dd>
                                    </div>
                                ) : null;
                            },
                        )}
                    </dl>
                </div>
            ))}
        </section>
    );
}

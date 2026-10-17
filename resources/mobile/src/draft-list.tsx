import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FilePenLine, ChevronRight } from 'lucide-react';
import { localNames, readLocal } from './local-store';
import type { Session } from './types';
import type { ProofDraft } from './proof-draft';
import { readableProofDraft } from './proof-draft';
export default function DraftList({
    session,
    onOpen,
}: {
    session: Session;
    onOpen: (id: number) => void;
}) {
    const [drafts, setDrafts] = useState<ProofDraft[]>([]);
    const [error, setError] = useState('');
    useEffect(() => {
        let disposed = false;
        void localNames(session)
            .then(async (names) => {
                const values = await Promise.all(
                    names
                        .filter((name) => /^pop-\d+$/.test(name))
                        .map((name) => readLocal<ProofDraft>(session, name)),
                );
                if (
                    values.some(
                        (value) => value !== null && !readableProofDraft(value),
                    )
                )
                    throw new Error('Draft tidak didukung.');
                if (!disposed)
                    setDrafts(
                        values.filter((value): value is ProofDraft => !!value),
                    );
            })
            .catch(() => {
                if (!disposed)
                    setError(
                        'Daftar draft belum dapat dibaca. Data tidak dihapus.',
                    );
            });
        return () => {
            disposed = true;
        };
    }, [session.token]);
    return (
        <section
            aria-label="Draft pickup tersimpan"
            className="overflow-hidden rounded-2xl border bg-card"
        >
            <div className="flex items-center gap-3 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-primary">
                    <FilePenLine size={20} aria-hidden="true" />
                </span>
                <div>
                    <h3 className="font-semibold">Draft Pickup</h3>
                    <p className="text-xs text-muted-foreground">
                        Lanjutkan pickup yang belum selesai
                    </p>
                </div>
            </div>
            {error && (
                <p role="status" className="px-4 pb-4 text-sm text-amber-700">
                    {error}
                </p>
            )}
            {drafts.length === 0 && !error && (
                <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                    Belum ada draft tersimpan.
                </p>
            )}
            {drafts.map((draft) => (
                <Button
                    key={draft.id}
                    variant="outline"
                    className="flex h-auto w-full justify-between gap-3 rounded-none border-0 border-t p-4 text-left whitespace-normal"
                    onClick={() => onOpen(draft.taskId)}
                >
                    <span>
                        <span className="block font-semibold">
                            Draft PCK-{draft.taskId}
                        </span>
                        <span className="block text-xs font-normal text-muted-foreground">
                            {
                                {
                                    EDITING: 'Belum selesai',
                                    SENDING: 'Sedang dikirim',
                                    UNCERTAIN: 'Periksa hasil pengiriman',
                                    BLOCKED: 'Perlu ditinjau',
                                    CONFIRMED: 'Terkonfirmasi',
                                }[draft.state]
                            }
                            {Date.now() - Date.parse(draft.updatedAt) >
                            7 * 86400000
                                ? ' · Belum diperbarui lebih dari 7 hari'
                                : ''}
                        </span>
                    </span>
                    <ChevronRight
                        size={18}
                        aria-hidden="true"
                        className="shrink-0 text-muted-foreground"
                    />
                </Button>
            ))}
        </section>
    );
}

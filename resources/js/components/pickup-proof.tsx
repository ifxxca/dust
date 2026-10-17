import { useHttp } from '@inertiajs/react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import * as taskApi from '@/routes/api/tasks';
import { submissionKey } from '@/lib/submission-key';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { RecordedValues } from '@/components/operational-change';

export type Proof = {
    id: number;
    customer_name: string;
    pickup_address: string;
    contact: string;
    revision?: number;
    original?: Record<string, string | number | null>;
    revisions?: {
        revision: number;
        reason: string;
        actor_id: number;
        created_at: string;
        values: Record<string, string | number | null>;
    }[];
    picked_up_at: string;
    manual_hybrid: number;
    cashless_hybrid: number;
    css_orion: number;
    total: number;
    notes: string | null;
    attachments: { id: number; kind: string; url: string }[];
    receipt: {
        status: string;
        last_error?: string | null;
        accepted_at?: string | null;
        provider_message_id?: string | null;
    };
    can_send_receipt?: boolean;
    receipt_history?: {
        proof_revision: number;
        status: string;
        recipient: string;
    }[];
};
export default function PickupProof({
    taskId,
    version,
    proof,
    canFinalize,
    onSaved,
    timezone,
    customerName,
}: {
    taskId: number;
    version: number;
    proof?: Proof | null;
    canFinalize: boolean;
    onSaved: () => void;
    timezone: string;
    customerName: string;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const [signed, setSigned] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [error, setError] = useState('');
    const delivery = useHttp({});
    const form = useHttp({
        expected_version: version,
        submission_key: submissionKey(),
        manual_hybrid: 0,
        cashless_hybrid: 0,
        css_orion: 0,
        notes: '',
        photos: [] as File[],
        signature: null as File | null,
    });
    const categories = [
        ['manual_hybrid', 'Manual Hybrid (Non-Cashless)'],
        ['cashless_hybrid', 'Cashless Hybrid'],
        ['css_orion', 'CSS / Orion'],
    ] as const;
    if (!proof && !canFinalize) return null;
    return (
        <section className="space-y-5 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
            <div>
                <p className="mb-1 text-xs font-semibold tracking-wide text-primary">
                    BUKTI PENGAMBILAN
                </p>
                <h2 className="text-lg font-semibold">Bukti Pickup</h2>
            </div>
            {proof ? (
                <>
                    <p>
                        {proof.customer_name} ·{' '}
                        {new Date(proof.picked_up_at).toLocaleString('id-ID', {
                            timeZone: timezone,
                        })}
                    </p>
                    <p className="text-sm break-words">
                        Alamat pada POP: {proof.pickup_address}
                    </p>
                    <p className="text-sm break-words">
                        Kontak pada POP: {proof.contact} · versi{' '}
                        {proof.revision ?? 0}
                    </p>
                    {categories.map(([key, label]) => (
                        <p key={key}>
                            {label}: <strong>{proof[key]}</strong>
                        </p>
                    ))}
                    <p>
                        Total: <strong>{proof.total}</strong>
                    </p>
                    {proof.notes && <p>{proof.notes}</p>}
                    <div className="grid grid-cols-2 gap-3">
                        {proof.attachments.map((file) => (
                            <a
                                key={file.id}
                                href={file.url}
                                target="_blank"
                                rel="noreferrer"
                            >
                                <img
                                    className="h-32 w-full rounded-md border bg-white object-contain"
                                    src={file.url}
                                    alt={
                                        file.kind === 'signature'
                                            ? 'Tanda tangan customer/sender'
                                            : 'Foto bukti pickup'
                                    }
                                />
                            </a>
                        ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Receipt:{' '}
                        {(
                            {
                                PENDING_CONFIGURATION:
                                    'Belum dikirim — provider WhatsApp/email belum dikonfigurasi.',
                                PENDING_RECIPIENT:
                                    'Belum dikirim — kontak email tidak valid.',
                                PROCESSING: 'Pengiriman sedang diproses.',
                                ACCEPTED_BY_PROVIDER:
                                    'Diterima provider email. Penerimaan customer belum dikonfirmasi.',
                                DELIVERED:
                                    'Penerimaan customer dikonfirmasi provider.',
                                FAILED: 'Belum terkirim. Periksa kendala pengiriman.',
                                UNKNOWN:
                                    'Hasil provider belum pasti. Jangan kirim ulang sebelum rekonsiliasi.',
                            } as Record<string, string>
                        )[proof.receipt.status] ?? proof.receipt.status}
                    </p>
                    {proof.receipt.last_error && (
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                            {proof.receipt.last_error}
                        </p>
                    )}
                    {proof.can_send_receipt &&
                        [
                            'PENDING_CONFIGURATION',
                            'FAILED',
                            'PENDING_RECIPIENT',
                        ].includes(proof.receipt.status) && (
                            <Button
                                variant="outline"
                                disabled={delivery.processing}
                                onClick={() => {
                                    void delivery
                                        .post(taskApi.receipt.url(taskId))
                                        .then((result) => {
                                            if (result) onSaved();
                                        })
                                        .catch(() =>
                                            setError(
                                                'Pengiriman gagal atau sedang diproses. Muat ulang untuk memeriksa status.',
                                            ),
                                        );
                                }}
                            >
                                {delivery.processing
                                    ? 'Mengirim…'
                                    : 'Kirim Receipt Email'}
                            </Button>
                        )}
                    {proof.revisions && proof.revisions.length > 0 && (
                        <details className="rounded-md border p-3 text-sm">
                            <summary>
                                Riwayat koreksi POP ({proof.revisions.length})
                            </summary>
                            <p className="mt-2 break-words">Nilai awal</p>
                            <RecordedValues values={proof.original} />
                            {proof.revisions.map((revision) => (
                                <div
                                    key={revision.revision}
                                    className="mt-2 break-words"
                                >
                                    Versi {revision.revision} · pengguna #
                                    {revision.actor_id} · {revision.reason} ·{' '}
                                    {new Date(
                                        revision.created_at,
                                    ).toLocaleString('id-ID', {
                                        timeZone: timezone,
                                    })}
                                    <RecordedValues values={revision.values} />
                                </div>
                            ))}
                        </details>
                    )}
                    {proof.receipt_history &&
                        proof.receipt_history.length > 1 && (
                            <details className="rounded-md border p-3 text-sm">
                                <summary>Riwayat Receipt</summary>
                                {proof.receipt_history.map((receipt) => (
                                    <p key={receipt.proof_revision}>
                                        Versi {receipt.proof_revision} ·{' '}
                                        {receipt.recipient} · {receipt.status}
                                    </p>
                                ))}
                            </details>
                        )}
                </>
            ) : (
                <form
                    id={`proof-form-${taskId}`}
                    className="space-y-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setError('');
                        if (!signed || !canvas.current) {
                            setError(
                                'Minta customer/sender menandatangani bukti pickup.',
                            );
                            return;
                        }
                        if (!reviewing) {
                            setReviewing(true);
                            return;
                        }
                        canvas.current.toBlob((blob) => {
                            if (!blob) return;
                            form.transform((data) => ({
                                ...data,
                                expected_version: version,
                                signature: new File([blob], 'signature.png', {
                                    type: 'image/png',
                                }),
                            }));
                            void form
                                .post(taskApi.proof.url(taskId))
                                .then((result) => {
                                    setReviewing(false);
                                    if (result) {
                                        toast.success(
                                            'Bukti pickup berhasil difinalisasi',
                                        );
                                        onSaved();
                                    } else
                                        setError(
                                            'Periksa jumlah paket dan file. Bukti belum final.',
                                        );
                                })
                                .catch(() => {
                                    setReviewing(false);
                                    setError(
                                        'Finalisasi gagal atau task berubah. Muat ulang untuk memeriksa hasil.',
                                    );
                                });
                        }, 'image/png');
                    }}
                >
                    {categories.map(([key, label]) => (
                        <div key={key} className="space-y-2">
                            <Label htmlFor={key}>{label}</Label>
                            <Input
                                id={key}
                                type="number"
                                min="0"
                                max="1000000"
                                required
                                value={form.data[key]}
                                onChange={(event) =>
                                    form.setData(
                                        key,
                                        Number(event.target.value),
                                    )
                                }
                            />
                            {form.errors[key] && (
                                <p className="text-sm text-destructive">
                                    {form.errors[key]}
                                </p>
                            )}
                        </div>
                    ))}
                    <p>
                        Total paket:{' '}
                        <strong>
                            {form.data.manual_hybrid +
                                form.data.cashless_hybrid +
                                form.data.css_orion}
                        </strong>
                    </p>
                    <Label htmlFor="proof-notes">Catatan khusus</Label>
                    <textarea
                        id="proof-notes"
                        maxLength={2000}
                        className="min-h-20 w-full rounded-md border p-3"
                        value={form.data.notes}
                        onChange={(event) =>
                            form.setData('notes', event.target.value)
                        }
                    />
                    <Label htmlFor="proof-photos">
                        Foto bukti (hingga 4 foto, 5 MB per foto)
                    </Label>
                    <Input
                        id="proof-photos"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        onChange={(event) =>
                            form.setData(
                                'photos',
                                Array.from(event.target.files ?? []),
                            )
                        }
                    />
                    {form.data.photos.length > 0 && (
                        <p className="text-xs break-words text-muted-foreground">
                            {form.data.photos
                                .map((file) => file.name)
                                .join(', ')}
                        </p>
                    )}
                    {form.data.photos.length > 4 && (
                        <p role="alert" className="text-sm text-destructive">
                            Pilih maksimal empat foto sebelum melanjutkan.
                        </p>
                    )}
                    {Object.entries(form.errors)
                        .filter(([key]) => key.startsWith('photos'))
                        .map(([key, message]) => (
                            <p key={key} className="text-sm text-destructive">
                                {message}
                            </p>
                        ))}
                    <p className="text-sm">Tanda tangan customer/sender</p>
                    <canvas
                        ref={canvas}
                        width={600}
                        height={220}
                        aria-label="Area tanda tangan customer"
                        className="h-36 w-full touch-none rounded-md border bg-white"
                        onPointerDown={(event) => {
                            const ctx = event.currentTarget.getContext('2d');
                            if (!ctx) return;
                            event.currentTarget.setPointerCapture(
                                event.pointerId,
                            );
                            const rect =
                                event.currentTarget.getBoundingClientRect();
                            ctx.strokeStyle = '#111';
                            ctx.lineWidth = 3;
                            ctx.lineCap = 'round';
                            ctx.beginPath();
                            ctx.moveTo(
                                ((event.clientX - rect.left) * 600) /
                                    rect.width,
                                ((event.clientY - rect.top) * 220) /
                                    rect.height,
                            );
                            drawing.current = true;
                        }}
                        onPointerMove={(event) => {
                            if (!drawing.current) return;
                            const rect =
                                event.currentTarget.getBoundingClientRect();
                            const ctx = event.currentTarget.getContext('2d');
                            ctx?.lineTo(
                                ((event.clientX - rect.left) * 600) /
                                    rect.width,
                                ((event.clientY - rect.top) * 220) /
                                    rect.height,
                            );
                            ctx?.stroke();
                            setSigned(true);
                        }}
                        onPointerUp={() => {
                            drawing.current = false;
                        }}
                        onPointerCancel={() => {
                            drawing.current = false;
                        }}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            canvas.current
                                ?.getContext('2d')
                                ?.clearRect(0, 0, 600, 220);
                            setSigned(false);
                        }}
                    >
                        Hapus tanda tangan
                    </Button>
                    {form.errors.signature && (
                        <p className="text-sm text-destructive">
                            {form.errors.signature}
                        </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                        Periksa bukti bersama customer sebelum finalisasi.
                        Koreksi bukti final belum tersedia.
                    </p>
                    <Button
                        className="w-full"
                        disabled={
                            form.processing ||
                            form.data.photos.length > 4 ||
                            form.data.manual_hybrid +
                                form.data.cashless_hybrid +
                                form.data.css_orion <=
                                0
                        }
                    >
                        {form.processing
                            ? 'Memfinalisasi…'
                            : 'Review & Finalisasi Pickup'}
                    </Button>
                    <Dialog
                        open={reviewing}
                        onOpenChange={(value) => {
                            if (!form.processing) setReviewing(value);
                        }}
                    >
                        <DialogContent className="max-h-[90dvh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>
                                    Review Pickup · {customerName}
                                </DialogTitle>
                                <DialogDescription>
                                    Pastikan jumlah paket dan bukti sesuai
                                    bersama customer/sender. Koreksi bukti final
                                    belum tersedia.
                                </DialogDescription>
                            </DialogHeader>
                            {categories.map(([key, label]) => (
                                <p
                                    key={key}
                                    className="flex justify-between gap-4 text-sm"
                                >
                                    <span>{label}</span>
                                    <strong>{form.data[key]}</strong>
                                </p>
                            ))}
                            <p className="rounded-lg bg-primary/10 p-3 font-semibold">
                                Total:{' '}
                                {form.data.manual_hybrid +
                                    form.data.cashless_hybrid +
                                    form.data.css_orion}{' '}
                                paket
                            </p>
                            <p className="text-sm">
                                {form.data.photos.length} foto · tanda tangan
                                tercatat
                            </p>
                            {form.data.notes && (
                                <p className="text-sm break-words">
                                    Catatan: {form.data.notes}
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                Receipt mengikuti status pengiriman sebenarnya.
                                Provider saat ini belum dikonfigurasi.
                            </p>
                            <Button
                                type="submit"
                                form={`proof-form-${taskId}`}
                                className="min-h-11"
                                disabled={form.processing}
                            >
                                {form.processing
                                    ? 'Memfinalisasi…'
                                    : 'Konfirmasi Finalisasi'}
                            </Button>
                        </DialogContent>
                    </Dialog>
                </form>
            )}
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
        </section>
    );
}

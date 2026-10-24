import { router, useHttp, usePage } from '@inertiajs/react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { categories } from '@/components/pickup-result-ui';
import { submissionKey } from '@/lib/submission-key';
import { processing as recordProcessing } from '@/routes/api/tasks';
import { show } from '@/routes/pickup-results';
import type { ProcessingDetail } from '@/types/package-processing';
type Values = {
    category: string;
    system: string;
    successful_quantity: string;
    failed_quantity: string;
    pending_quantity: string;
    unknown_quantity: string;
    external_reference: string;
    reason: string;
    expected_revision: number;
    expected_pickup_revision: number;
    expected_handover_revision: number | null;
    submission_key: string;
};
const quantities = [
    ['successful_quantity', 'Berhasil diinput — deklarasi manual'],
    ['failed_quantity', 'Outcome terakhir gagal — manual'],
    ['pending_quantity', 'Pekerjaan diketahui belum selesai — manual'],
    ['unknown_quantity', 'Outcome tidak dapat dipastikan — manual'],
] as const;
export default function RecordProcessingDialog({
    taskId,
    data,
    pickupRevision,
    handoverRevision,
    initialOpen = false,
}: {
    taskId: number;
    data: ProcessingDetail;
    pickupRevision: number;
    handoverRevision: number | null;
    initialOpen?: boolean;
}) {
    const [open, setOpen] = useState(initialOpen);
    const pageUrl = usePage().url;
    const [reviewing, setReviewing] = useState(false);
    const [error, setError] = useState('');
    const busy = useRef(false);
    const form = useHttp<Values>({
        category: 'manual_hybrid',
        system: '',
        successful_quantity: '0',
        failed_quantity: '0',
        pending_quantity: '0',
        unknown_quantity: '0',
        external_reference: '',
        reason: '',
        expected_revision: 0,
        expected_pickup_revision: pickupRevision,
        expected_handover_revision: handoverRevision,
        submission_key: submissionKey(),
    });
    const latest = data.latest.find(
        (record) =>
            record.category === form.data.category &&
            record.system === form.data.system,
    );
    const row = data.rows.find(
        (record) => record.category === form.data.category,
    );
    const stale =
        form.data.expected_revision !== (latest?.revision ?? 0) ||
        form.data.expected_pickup_revision !== pickupRevision ||
        form.data.expected_handover_revision !== handoverRevision;
    const total = quantities.reduce(
        (sum, [key]) => sum + (Number(form.data[key]) || 0),
        0,
    );
    const refresh = () => {
        const query = Object.fromEntries(
            new URL(pageUrl, 'http://localhost').searchParams,
        );
        delete query.record_processing;
        router.visit(show(taskId, { query: { ...query, tab: 'processing' } }), {
            preserveState: true,
            preserveScroll: true,
            fresh: true,
        });
    };
    const select = (category: string, system: string) => {
        const previous = data.latest.find(
            (record) =>
                record.category === category && record.system === system,
        );
        form.setData({
            category,
            system,
            successful_quantity: String(previous?.successful_quantity ?? 0),
            failed_quantity: String(previous?.failed_quantity ?? 0),
            pending_quantity: String(previous?.pending_quantity ?? 0),
            unknown_quantity: String(previous?.unknown_quantity ?? 0),
            reason: '',
            external_reference: previous?.external_reference ?? '',
            expected_revision: previous?.revision ?? 0,
            expected_pickup_revision: pickupRevision,
            expected_handover_revision: handoverRevision,
            submission_key: submissionKey(),
        });
        form.clearErrors();
        setReviewing(false);
        setError('');
    };
    return (
        <>
            <Button
                variant="outline"
                onClick={() => {
                    select('manual_hybrid', '');
                    setOpen(true);
                }}
            >
                Catat / Koreksi Pemrosesan Manual
            </Button>
            <Dialog
                open={open}
                onOpenChange={(value) => {
                    if (!form.processing) setOpen(value);
                }}
            >
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>
                            {reviewing
                                ? 'Konfirmasi Catatan Manual'
                                : 'Catat Pemrosesan Manual'}
                        </DialogTitle>
                        <DialogDescription>
                            Isi total terkini untuk satu pickup/kategori/sistem.
                            Ini snapshot pengganti, bukan tambahan paket atau
                            konfirmasi eksternal. Nilai sebelumnya tetap
                            tersimpan dalam histori.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="space-y-3"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (busy.current || stale) return;
                            setError('');
                            if (
                                !quantities.every(
                                    ([key]) =>
                                        /^\d+$/.test(form.data[key]) &&
                                        Number(form.data[key]) <= 1000000,
                                )
                            ) {
                                setError(
                                    'Isi jumlah bulat 0–1.000.000 pada semua outcome.',
                                );
                                return;
                            }
                            if (!reviewing) {
                                setReviewing(true);
                                return;
                            }
                            busy.current = true;
                            void form
                                .post(recordProcessing.url(taskId))
                                .then((result) => {
                                    if (result) {
                                        toast.success(
                                            'Catatan manual tersimpan; belum dikonfirmasi sistem eksternal',
                                        );
                                        setOpen(false);
                                        refresh();
                                    } else {
                                        setError(
                                            'Periksa isian. Catatan belum tersimpan.',
                                        );
                                        setReviewing(false);
                                    }
                                })
                                .catch(() => {
                                    setError(
                                        'Data berubah atau hasil permintaan belum pasti. Muat ulang dan periksa riwayat sebelum mencoba kembali.',
                                    );
                                    setReviewing(false);
                                })
                                .finally(() => {
                                    busy.current = false;
                                });
                        }}
                    >
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                ['category', 'Kategori'],
                                ['system', 'Sistem tujuan'],
                            ].map(([key, label]) => (
                                <div key={key} className="space-y-1">
                                    <Label htmlFor={`manual-${key}`}>
                                        {label}
                                    </Label>
                                    <select
                                        id={`manual-${key}`}
                                        required
                                        disabled={reviewing || form.processing}
                                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                                        value={form.data[key as 'category']}
                                        onChange={(event) =>
                                            select(
                                                key === 'category'
                                                    ? event.target.value
                                                    : form.data.category,
                                                key === 'system'
                                                    ? event.target.value
                                                    : form.data.system,
                                            )
                                        }
                                    >
                                        {key === 'system' && (
                                            <option value="">
                                                Pilih sistem
                                            </option>
                                        )}
                                        {(key === 'category'
                                            ? categories
                                            : [
                                                  ['JNE_HYBRID', 'JNE Hybrid'],
                                                  ['MYORION', 'MyORION'],
                                              ]
                                        ).map(([value, title]) => (
                                            <option key={value} value={value}>
                                                {title}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                        <p className="rounded-md bg-muted p-3 text-sm">
                            Revisi catatan #{form.data.expected_revision} · POP
                            #{form.data.expected_pickup_revision} · POP efektif:{' '}
                            {row?.pop_quantity ?? 0} · Retail:{' '}
                            {row?.received_quantity ?? 'Belum diverifikasi'}
                        </p>
                        {quantities.map(([key, label]) => (
                            <div key={key} className="space-y-1">
                                <Label htmlFor={`manual-${key}`}>{label}</Label>
                                <Input
                                    id={`manual-${key}`}
                                    type="number"
                                    min={0}
                                    max={1000000}
                                    required
                                    readOnly={reviewing}
                                    value={form.data[key]}
                                    onChange={(event) =>
                                        form.setData(key, event.target.value)
                                    }
                                />
                                {reviewing && (
                                    <p className="text-xs text-muted-foreground">
                                        Sebelumnya:{' '}
                                        {latest?.[key] ?? 'Belum dicatat'}
                                    </p>
                                )}
                            </div>
                        ))}
                        <p className="text-sm">
                            Total deklarasi sistem ini: {total}.{' '}
                            {row?.received_quantity != null &&
                                total > row.received_quantity && (
                                    <span className="text-amber-800 dark:text-amber-300">
                                        Melebihi Retail; akan ditandai untuk
                                        rekonsiliasi, tanpa mengubah jumlah.
                                    </span>
                                )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Outcome yang konfirmasinya hilang dicatat sebagai
                            tidak dapat dipastikan, bukan gagal. Jumlah per
                            outcome adalah kelompok yang tidak tumpang tindih
                            pada snapshot ini.
                        </p>
                        <Label htmlFor="manual-reference">
                            Referensi pendukung (opsional, bukan konfirmasi
                            sistem)
                        </Label>
                        <Input
                            id="manual-reference"
                            maxLength={100}
                            readOnly={reviewing}
                            value={form.data.external_reference}
                            onChange={(event) =>
                                form.setData(
                                    'external_reference',
                                    event.target.value,
                                )
                            }
                        />
                        <Label htmlFor="manual-reason">
                            Catatan pendukung / alasan koreksi (wajib)
                        </Label>
                        <textarea
                            id="manual-reason"
                            required
                            maxLength={500}
                            readOnly={reviewing}
                            className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
                            value={form.data.reason}
                            onChange={(event) =>
                                form.setData('reason', event.target.value)
                            }
                        />
                        {Object.entries(form.errors).map(([key, message]) => (
                            <p
                                role="alert"
                                key={key}
                                className="text-sm text-destructive"
                            >
                                {message}
                            </p>
                        ))}
                        {error && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {error}
                            </p>
                        )}
                        {stale && (
                            <p
                                role="alert"
                                className="text-sm text-amber-800 dark:text-amber-300"
                            >
                                Baseline berubah. Tinjau ulang; jumlah dan
                                alasan tetap tersimpan.
                            </p>
                        )}
                        {(error || stale) && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={form.processing}
                                onClick={() => {
                                    if (!stale) {
                                        refresh();
                                        return;
                                    }
                                    form.setData({
                                        ...form.data,
                                        expected_revision:
                                            latest?.revision ?? 0,
                                        expected_pickup_revision:
                                            pickupRevision,
                                        expected_handover_revision:
                                            handoverRevision,
                                        submission_key: submissionKey(),
                                    });
                                    setReviewing(false);
                                    setError('');
                                }}
                            >
                                {' '}
                                {stale
                                    ? 'Gunakan baseline terbaru & tinjau ulang'
                                    : 'Muat ulang dan periksa riwayat'}{' '}
                            </Button>
                        )}
                        <div className="flex justify-end gap-2">
                            {reviewing && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={form.processing}
                                    onClick={() => setReviewing(false)}
                                >
                                    Ubah isian
                                </Button>
                            )}
                            <Button disabled={stale || form.processing}>
                                {form.processing
                                    ? 'Menyimpan…'
                                    : reviewing
                                      ? 'Konfirmasi Catatan Manual'
                                      : 'Tinjau Catatan'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}

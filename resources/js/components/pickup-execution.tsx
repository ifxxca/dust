import { useHttp } from '@inertiajs/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import * as taskApi from '@/routes/api/tasks';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/operational-ui';

export type Visit = {
    id: number;
    outcome: 'COLLECTED' | 'NO_PACKAGES' | null;
    reason: string | null;
    notes: string | null;
    started_at: string;
    recorded_at: string | null;
};

export default function PickupExecution({
    taskId,
    version,
    startedAt,
    visits,
    onSaved,
}: {
    taskId: number;
    version: number;
    startedAt: string | null;
    visits: Visit[];
    onSaved: () => void;
}) {
    const visit = visits.at(-1);
    const form = useHttp({
        expected_version: version,
        outcome: 'COLLECTED',
        reason: '',
        notes: '',
    });
    const start = useHttp({ expected_version: version });
    const [error, setError] = useState('');
    return (
        <section className="space-y-5 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
            <div>
                <p className="mb-1 text-xs font-semibold tracking-wide text-primary">
                    EKSEKUSI TUGAS
                </p>
                <h2 className="text-lg font-semibold">Kunjungan Pickup</h2>
            </div>
            {!startedAt ? (
                <>
                    <p className="text-sm text-muted-foreground">
                        Mulai kunjungan saat Anda menjalankan tugas. Task tidak
                        dapat diambil alih setelah dimulai.
                    </p>
                    <Button
                        disabled={start.processing}
                        onClick={() => {
                            start.setData('expected_version', version);
                            void start
                                .post(taskApi.start.url(taskId))
                                .then((result) => {
                                    if (result) {
                                        toast.success('Kunjungan dimulai');
                                        onSaved();
                                    } else
                                        setError(
                                            'Periksa data sebelum memulai.',
                                        );
                                })
                                .catch(() =>
                                    setError(
                                        'Tugas berubah atau bukan milik Anda. Muat ulang untuk memeriksa hasil.',
                                    ),
                                );
                        }}
                    >
                        Mulai Kunjungan
                    </Button>
                </>
            ) : visit?.outcome ? (
                <>
                    <StatusBadge status={visit.outcome} />
                    <p>
                        Hasil:{' '}
                        <strong>
                            {visit.outcome === 'COLLECTED'
                                ? 'Paket berhasil diambil'
                                : 'Kunjungan tanpa paket'}
                        </strong>
                    </p>
                    {visit.reason && <p>Alasan: {visit.reason}</p>}
                    {visit.notes && <p>Catatan: {visit.notes}</p>}
                    {visit.outcome === 'NO_PACKAGES' && (
                        <p className="text-sm text-muted-foreground">
                            Task tidak otomatis dibatalkan atau ditutup. Tindak
                            lanjut tersedia melalui aksi kunjungan ulang atau
                            pembatalan sesuai akses pengguna.
                        </p>
                    )}
                </>
            ) : (
                <form
                    className="space-y-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setError('');
                        form.transform((data) => ({
                            ...data,
                            expected_version: version,
                        }));
                        void form
                            .post(taskApi.visit.url(taskId))
                            .then((result) => {
                                if (result) onSaved();
                                else
                                    setError(
                                        'Hasil belum tersimpan. Periksa field.',
                                    );
                            })
                            .catch(() =>
                                setError(
                                    'Gagal mencatat kunjungan. Muat ulang sebelum mencoba kembali.',
                                ),
                            );
                    }}
                >
                    <Label htmlFor="visit-outcome">Hasil Kunjungan</Label>
                    <Select
                        value={form.data.outcome}
                        onValueChange={(value) =>
                            form.setData('outcome', value)
                        }
                    >
                        <SelectTrigger id="visit-outcome">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="COLLECTED">
                                Paket berhasil diambil
                            </SelectItem>
                            <SelectItem value="NO_PACKAGES">
                                Tidak berhasil / tidak ada paket
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    <Label htmlFor="visit-reason">
                        Alasan{' '}
                        {form.data.outcome === 'NO_PACKAGES'
                            ? '(wajib)'
                            : '(opsional)'}
                    </Label>
                    <textarea
                        id="visit-reason"
                        required={form.data.outcome === 'NO_PACKAGES'}
                        className="min-h-20 w-full rounded-md border p-3"
                        value={form.data.reason}
                        onChange={(event) =>
                            form.setData('reason', event.target.value)
                        }
                        placeholder="Lokasi tutup, customer tidak tersedia, paket belum siap, atau alasan lainnya"
                    />
                    {form.errors.reason && (
                        <p className="text-sm text-destructive">
                            {form.errors.reason}
                        </p>
                    )}
                    <Label htmlFor="visit-notes">Catatan Kunjungan</Label>
                    <textarea
                        id="visit-notes"
                        className="min-h-20 w-full rounded-md border p-3"
                        value={form.data.notes}
                        onChange={(event) =>
                            form.setData('notes', event.target.value)
                        }
                    />
                    <Button disabled={form.processing}>
                        {form.processing
                            ? 'Menyimpan…'
                            : 'Simpan Hasil Kunjungan'}
                    </Button>
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

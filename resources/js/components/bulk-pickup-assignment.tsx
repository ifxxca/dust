import { useHttp } from '@inertiajs/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { bulkAssign } from '@/routes/api/tasks';

export type AssignmentSelection = {
    id: number;
    version: number;
    customer: { name: string };
};

export default function BulkPickupAssignment({
    tasks,
    staff,
    onClose,
    onAssigned,
    onReview,
}: {
    tasks: AssignmentSelection[];
    staff: { id: number; name: string }[];
    onClose: () => void;
    onAssigned: (count: number) => void;
    onReview: () => void;
}) {
    const form = useHttp<
        {
            assigned_staff_id: string;
            tasks: { id: number; expected_version: number }[];
        },
        { meta: { assigned_count: number } }
    >({
        assigned_staff_id: '',
        tasks: tasks.map((task) => ({
            id: task.id,
            expected_version: task.version,
        })),
    });
    const [message, setMessage] = useState('');
    const [needsReview, setNeedsReview] = useState(false);
    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open && !form.processing && !needsReview) onClose();
            }}
        >
            <DialogContent
                className="max-h-[90vh] overflow-y-auto"
                onInteractOutside={(event) => {
                    if (form.processing || needsReview) event.preventDefault();
                }}
            >
                <DialogHeader>
                    <DialogTitle>Assignment Massal</DialogTitle>
                    <DialogDescription>
                        {tasks.length} task akan ditugaskan ke satu petugas
                        aktif. Jika satu task sudah berubah, seluruh batch
                        ditolak. Pilihan dari halaman atau filter lain juga
                        termasuk.
                    </DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (form.processing || needsReview) return;
                        setMessage('');
                        void form
                            .post(bulkAssign.url())
                            .then((result) => {
                                if (result)
                                    onAssigned(result.meta.assigned_count);
                            })
                            .catch((error: unknown) => {
                                const status = (
                                    error as { response?: { status?: number } }
                                )?.response?.status;
                                if (status === 422) {
                                    setMessage(
                                        'Periksa pilihan petugas dan task di bawah.',
                                    );
                                } else if (status === 409) {
                                    setNeedsReview(true);
                                    setMessage(
                                        'Ada task yang berubah atau sudah ditugaskan. Tidak ada task dalam batch ini yang diubah. Muat ulang dan pilih kembali.',
                                    );
                                } else if (status === 401 || status === 403) {
                                    setNeedsReview(true);
                                    setMessage(
                                        'Sesi atau hak akses Anda tidak mengizinkan assignment. Periksa akun dan muat ulang daftar.',
                                    );
                                } else {
                                    setNeedsReview(true);
                                    setMessage(
                                        'Hasil assignment belum dapat dipastikan. Periksa petugas dan status task pada daftar terbaru sebelum melakukan assignment lain. Tidak ada pengiriman ulang otomatis.',
                                    );
                                }
                            });
                    }}
                >
                    <div className="space-y-2">
                        <Label htmlFor="bulk-assignment-staff">
                            Petugas penerima
                        </Label>
                        <Select
                            value={form.data.assigned_staff_id}
                            onValueChange={(value) =>
                                form.setData('assigned_staff_id', value)
                            }
                            disabled={form.processing || needsReview}
                        >
                            <SelectTrigger id="bulk-assignment-staff">
                                <SelectValue placeholder="Pilih petugas aktif" />
                            </SelectTrigger>
                            <SelectContent>
                                {staff.map((person) => (
                                    <SelectItem
                                        key={person.id}
                                        value={String(person.id)}
                                    >
                                        {person.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {staff.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                                Daftar petugas belum tersedia. Tutup dialog dan
                                muat ulang daftar.
                            </p>
                        )}
                    </div>
                    <ul
                        aria-label="Task yang akan ditugaskan"
                        className="max-h-56 divide-y overflow-y-auto rounded-lg border px-3"
                    >
                        {tasks.map((task) => (
                            <li key={task.id} className="py-2 text-sm">
                                <span className="font-medium">
                                    PCK-{String(task.id).padStart(4, '0')}
                                </span>{' '}
                                · {task.customer.name}
                            </li>
                        ))}
                    </ul>
                    {Object.entries(form.errors).map(([key, value]) => (
                        <p
                            key={key}
                            role="alert"
                            className="text-sm text-destructive"
                        >
                            {value}
                        </p>
                    ))}
                    {message && (
                        <p role="alert" className="text-sm text-destructive">
                            {message}
                        </p>
                    )}
                    <div className="flex justify-end gap-2">
                        {form.processing ? (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setNeedsReview(true);
                                    setMessage(
                                        'Permintaan mungkin masih diproses server. Periksa daftar terbaru; jangan langsung mengirim ulang.',
                                    );
                                    form.cancel();
                                }}
                            >
                                Hentikan Menunggu
                            </Button>
                        ) : needsReview ? (
                            <Button type="button" onClick={onReview}>
                                Muat Ulang & Pilih Kembali
                            </Button>
                        ) : (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={form.processing}
                                    onClick={onClose}
                                >
                                    Batal
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={
                                        form.processing ||
                                        !form.data.assigned_staff_id
                                    }
                                >
                                    {form.processing
                                        ? 'Menugaskan…'
                                        : `Tugaskan ${tasks.length} Task`}
                                </Button>
                            </>
                        )}
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

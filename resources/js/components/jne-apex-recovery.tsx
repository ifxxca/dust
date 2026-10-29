import { useForm } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import * as runs from '@/routes/report-runs';

export type ApexBatch = {
    batch_number: number;
    status: string;
    row_count: number | null;
    file_checksum: string | null;
    review_reason: string | null;
};

export default function JneApexRecovery({
    id,
    batches,
    failed,
}: {
    id: number;
    batches: ApexBatch[];
    failed: boolean;
}) {
    const form = useForm<{
        number: string;
        reason: string;
        confirmed_not_submitted: boolean;
        file: File | null;
    }>({ number: '', reason: '', confirmed_not_submitted: false, file: null });
    return (
        <section
            className="space-y-3 rounded-lg border p-4"
            aria-label="Checkpoint APEX"
        >
            <h3 className="font-medium">Checkpoint APEX</h3>
            <ul className="space-y-1 text-sm">
                {batches.map((batch) => (
                    <li key={batch.batch_number}>
                        Batch {batch.batch_number}: {batch.status} ·{' '}
                        {batch.row_count ?? '—'} AWB
                        {batch.review_reason && (
                            <p className="text-xs text-muted-foreground">
                                {batch.review_reason}
                            </p>
                        )}
                    </li>
                ))}
            </ul>
            {failed && (
                <form
                    className="space-y-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.post(runs.apexRecovery.url(id), {
                            forceFormData: true,
                            preserveScroll: true,
                            onSuccess: () => form.reset(),
                        });
                    }}
                >
                    <Label htmlFor="apex-recovery-batch">
                        Tindakan pemulihan
                    </Label>
                    <select
                        id="apex-recovery-batch"
                        className="h-10 w-full rounded-md border bg-background px-3"
                        value={form.data.number}
                        onChange={(event) =>
                            form.setData('number', event.target.value)
                        }
                    >
                        <option value="">
                            Lanjutkan dari semua checkpoint tersimpan
                        </option>
                        {batches
                            .filter((batch) => batch.status === 'STARTED')
                            .map((batch) => (
                                <option
                                    key={batch.batch_number}
                                    value={batch.batch_number}
                                >
                                    Periksa batch {batch.batch_number} yang
                                    belum pasti
                                </option>
                            ))}
                    </select>
                    {form.data.number && (
                        <>
                            <Label htmlFor="apex-recovery-file">
                                Hasil CSV asli dari History APEX (bila sudah
                                diproses)
                            </Label>
                            <Input
                                id="apex-recovery-file"
                                type="file"
                                accept=".csv"
                                onChange={(event) =>
                                    form.setData(
                                        'file',
                                        event.target.files?.[0] ?? null,
                                    )
                                }
                            />
                        </>
                    )}
                    <Label htmlFor="apex-recovery-reason">
                        Alasan dan bukti pemeriksaan
                    </Label>
                    <Input
                        id="apex-recovery-reason"
                        required
                        maxLength={500}
                        value={form.data.reason}
                        onChange={(event) =>
                            form.setData('reason', event.target.value)
                        }
                    />
                    <label className="flex items-start gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={form.data.confirmed_not_submitted}
                            onChange={(event) =>
                                form.setData(
                                    'confirmed_not_submitted',
                                    event.target.checked,
                                )
                            }
                        />
                        Saya sudah memeriksa History APEX. Tanpa CSV pengganti,
                        batch yang dipilih dipastikan belum dikirim; kelanjutan
                        hanya memakai checkpoint yang sudah aman.
                    </label>
                    {Object.values(form.errors).map((error, index) => (
                        <p
                            key={index}
                            role="alert"
                            className="text-sm text-destructive"
                        >
                            {error}
                        </p>
                    ))}
                    <Button disabled={form.processing} type="submit">
                        {form.processing
                            ? 'Menyimpan…'
                            : 'Simpan pemeriksaan batch'}
                    </Button>
                </form>
            )}
        </section>
    );
}

import { useHttp } from '@inertiajs/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { statusLabels } from '@/components/operational-ui';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export function RecordedValues({
    values,
}: {
    values?: Record<string, string | number | null>;
}) {
    const labels: Record<string, string> = {
        customer_name: 'Customer',
        pickup_address: 'Alamat',
        contact: 'Kontak',
        manual_hybrid: 'Manual Hybrid (Non-Cashless)',
        cashless_hybrid: 'Cashless Hybrid',
        css_orion: 'CSS / Orion',
        notes: 'Catatan',
        discrepancy_notes: 'Catatan Selisih',
        status: 'Hasil',
        verified_by: 'Pemeriksa',
        verified_at: 'Waktu Pemeriksaan',
    };
    return (
        <dl className="mt-3 space-y-2">
            {Object.entries(values ?? {}).map(([key, value]) => (
                <div
                    className="grid gap-1 break-words sm:grid-cols-2"
                    key={key}
                >
                    <dt className="text-muted-foreground">
                        {labels[key] ?? key}
                    </dt>
                    <dd>
                        {key === 'status'
                            ? (statusLabels[String(value)] ?? value)
                            : (value ?? '—')}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

export default function OperationalChange({
    title,
    description,
    url,
    version,
    values = {},
    labels = {},
    onSaved,
}: {
    title: string;
    description: string;
    url: string;
    version: number;
    values?: Record<string, string | number>;
    labels?: Record<string, string>;
    onSaved: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [error, setError] = useState('');
    const form = useHttp<Record<string, string | number>>({
        ...values,
        reason: '',
        expected_version: version,
    });
    return (
        <>
            <Button
                variant="outline"
                onClick={() => {
                    form.setData({
                        ...values,
                        reason: '',
                        expected_version: version,
                    });
                    setError('');
                    setOpen(true);
                }}
            >
                {title}
            </Button>
            <Dialog
                open={open}
                onOpenChange={(value) => {
                    if (!form.processing) setOpen(value);
                }}
            >
                <DialogContent className="max-h-[90dvh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription>{description}</DialogDescription>
                    </DialogHeader>
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
                                .post(url)
                                .then((result) => {
                                    if (result) {
                                        toast.success('Perubahan tersimpan');
                                        setOpen(false);
                                        onSaved();
                                    } else
                                        setError(
                                            'Periksa data. Perubahan belum tersimpan.',
                                        );
                                })
                                .catch(() =>
                                    setError(
                                        'Permintaan gagal atau data sudah berubah. Muat ulang sebelum mencoba kembali.',
                                    ),
                                );
                        }}
                    >
                        {Object.entries(values).map(([key, initial]) => (
                            <div key={key} className="space-y-2">
                                <Label htmlFor={`change-${key}`}>
                                    {labels[key] ?? key}
                                </Label>
                                <Input
                                    id={`change-${key}`}
                                    type={
                                        typeof initial === 'number'
                                            ? 'number'
                                            : 'text'
                                    }
                                    min={
                                        typeof initial === 'number'
                                            ? 0
                                            : undefined
                                    }
                                    max={
                                        typeof initial === 'number'
                                            ? 1000000
                                            : undefined
                                    }
                                    required={
                                        ![
                                            'notes',
                                            'discrepancy_notes',
                                        ].includes(key)
                                    }
                                    value={form.data[key] ?? ''}
                                    onChange={(event) =>
                                        form.setData(key, event.target.value)
                                    }
                                />
                                {form.errors[key] && (
                                    <p className="text-sm text-destructive">
                                        {form.errors[key]}
                                    </p>
                                )}
                            </div>
                        ))}
                        <Label htmlFor="change-reason">
                            Alasan perubahan (wajib)
                        </Label>
                        <textarea
                            id="change-reason"
                            required
                            maxLength={500}
                            className="min-h-24 w-full rounded-md border p-3"
                            value={form.data.reason}
                            onChange={(event) =>
                                form.setData('reason', event.target.value)
                            }
                        />
                        {form.errors.reason && (
                            <p className="text-sm text-destructive">
                                {form.errors.reason}
                            </p>
                        )}
                        {error && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {error}
                            </p>
                        )}
                        <Button disabled={form.processing}>
                            {form.processing
                                ? 'Menyimpan…'
                                : 'Konfirmasi Perubahan'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}

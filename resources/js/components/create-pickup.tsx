import { router, useHttp, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import CustomerPicker, {
    type PickupCustomer,
} from '@/components/customer-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { operations } from '@/routes';
import * as api from '@/routes/api/tasks';
import { utcFromLocal } from '@/lib/pickup-time';
import { submissionKey } from '@/lib/submission-key';

export default function CreatePickup({
    timezone,
    onCreated,
    onCancel,
    onBusyChange,
}: {
    timezone: string;
    onCreated?: () => void;
    onCancel?: () => void;
    onBusyChange?: (busy: boolean) => void;
}) {
    const [customer, setCustomer] = useState<PickupCustomer | null>(null);
    const staff = usePage().props.auth.user.role === 'pickup_staff';
    const [key] = useState(submissionKey);
    const [uncertain, setUncertain] = useState(false);
    const previousId =
        Number(
            new URL(window.location.href).searchParams.get('previous_task_id'),
        ) || null;
    const source = useHttp({});
    const [error, setError] = useState('');
    const submitting = useRef(false);
    const form = useHttp({
        customer_id: '',
        pickup_address: '',
        scheduled_at: '',
        notes: '',
        submission_key: key,
        previous_task_id: previousId,
    });
    useEffect(() => {
        if (!previousId) return;
        let active = true;
        void source
            .get(api.show.url(previousId))
            .then((response) => {
                if (!active || !response) return;
                const task = (
                    response as {
                        data: {
                            customer: { id: number; name: string };
                            pickup_address: string;
                            contact: string;
                            status: string;
                        };
                    }
                ).data;
                if (task.status !== 'NO_PACKAGES') {
                    setError('Task asal belum selesai tanpa paket.');
                    return;
                }
                setCustomer({
                    ...task.customer,
                    pickup_address: task.pickup_address,
                    contact: task.contact,
                });
                form.setData('customer_id', String(task.customer.id));
                form.setData('pickup_address', task.pickup_address);
            })
            .catch(() => {
                if (active)
                    setError(
                        'Task asal tidak dapat dibuka. Jangan kirim sebelum data terverifikasi.',
                    );
            });
        return () => {
            active = false;
            source.cancel();
        };
    }, [previousId]);
    return (
        <form
            className={
                onCancel
                    ? 'space-y-5'
                    : 'mx-auto max-w-2xl space-y-6 rounded-xl border bg-card p-5 shadow-sm sm:p-6'
            }
            onSubmit={(event) => {
                event.preventDefault();
                if (submitting.current) return;
                setError('');
                if (!customer) {
                    setError('Pilih customer terlebih dahulu.');
                    return;
                }
                form.transform((data) => ({
                    ...data,
                    scheduled_at: utcFromLocal(data.scheduled_at, timezone),
                }));
                submitting.current = true;
                onBusyChange?.(true);
                void form
                    .post(api.store.url())
                    .then((result) => {
                        if (result) {
                            toast.success('Pickup berhasil dibuat');
                            if (onCreated) onCreated();
                            else
                                router.visit(
                                    operations({
                                        screen: 'detail',
                                        task: (
                                            result as { data: { id: number } }
                                        ).data.id,
                                    }),
                                );
                        }
                    })
                    .catch((failure: unknown) => {
                        const response = (
                            failure as {
                                response?: {
                                    status?: number;
                                    data?: string | { message?: string };
                                };
                            }
                        )?.response;
                        const status = response?.status || 0;
                        if (!status || status >= 500) setUncertain(true);
                        let message =
                            'Hasil belum pasti. Kirim ulang input dan key yang sama untuk memeriksa hasil; jangan membuat task lain.';
                        try {
                            const data =
                                typeof response?.data === 'string'
                                    ? JSON.parse(response.data)
                                    : response?.data;
                            if (data?.message) message = data.message;
                        } catch {
                            /* Keep recovery message. */
                        }
                        setError(message);
                    })
                    .finally(() => {
                        submitting.current = false;
                        onBusyChange?.(false);
                    });
            }}
        >
            {staff && (
                <p className="rounded-lg bg-muted p-3 text-sm">
                    Pickup manual ditugaskan kepada Anda. Pilih customer
                    existing dan isi alasan/catatan.
                </p>
            )}
            {previousId && (
                <p className="text-sm">
                    Kunjungan baru setelah PCK-{previousId}. Task asal dan
                    riwayatnya tetap tersimpan.
                </p>
            )}
            <fieldset
                disabled={form.processing || uncertain}
                className="space-y-5"
            >
                {!onCancel && (
                    <div>
                        <h2 className="text-lg font-semibold">
                            Customer dan Tujuan Pickup
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Pilih customer, periksa alamat, lalu tentukan jadwal
                            kunjungan.
                        </p>
                    </div>
                )}
                <div className="space-y-2">
                    <Label htmlFor="pickup-customer">Customer</Label>
                    <CustomerPicker
                        triggerId="pickup-customer"
                        selected={customer}
                        allowCreate={!staff}
                        disabled={
                            form.processing || uncertain || previousId !== null
                        }
                        onSelect={(value) => {
                            setCustomer(value);
                            form.setData(
                                'customer_id',
                                value ? String(value.id) : '',
                            );
                            form.setData(
                                'pickup_address',
                                value?.pickup_address ?? '',
                            );
                        }}
                    />
                    {form.errors.customer_id && (
                        <p className="text-sm text-destructive">
                            {form.errors.customer_id}
                        </p>
                    )}
                </div>
                {customer && (
                    <div className="rounded-lg bg-muted/50 p-4 text-sm">
                        <p className="font-semibold">{customer.name}</p>
                        <p className="mt-1 break-words text-muted-foreground">
                            {customer.contact}
                        </p>
                    </div>
                )}
                <div className="space-y-2">
                    <Label htmlFor="pickup-address">Alamat Pickup</Label>
                    <textarea
                        id="pickup-address"
                        className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
                        required
                        value={form.data.pickup_address}
                        onChange={(event) =>
                            form.setData('pickup_address', event.target.value)
                        }
                    />
                    <p className="text-xs text-muted-foreground">
                        Alamat disalin dari master dan dapat disesuaikan untuk
                        task ini.
                    </p>
                    {form.errors.pickup_address && (
                        <p className="text-sm text-destructive">
                            {form.errors.pickup_address}
                        </p>
                    )}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="pickup-scheduled">
                        Jadwal Pickup · {timezone}
                    </Label>
                    <Input
                        id="pickup-scheduled"
                        className="h-11"
                        type="datetime-local"
                        required
                        value={form.data.scheduled_at}
                        onChange={(event) =>
                            form.setData('scheduled_at', event.target.value)
                        }
                    />
                    {form.errors.scheduled_at && (
                        <p className="text-sm text-destructive">
                            {form.errors.scheduled_at}
                        </p>
                    )}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="pickup-notes">
                        Catatan {staff ? '(wajib)' : '(opsional)'}
                    </Label>
                    <textarea
                        id="pickup-notes"
                        required={staff}
                        className="min-h-20 w-full rounded-md border bg-background p-3 text-sm"
                        value={form.data.notes}
                        onChange={(event) =>
                            form.setData('notes', event.target.value)
                        }
                    />
                    {form.errors.notes && (
                        <p className="text-sm text-destructive">
                            {form.errors.notes}
                        </p>
                    )}
                </div>
            </fieldset>
            {uncertain && (
                <p role="status" className="text-sm">
                    Hasil belum pasti; input dikunci untuk mencegah task ganda.
                </p>
            )}
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                {onCancel && (
                    <Button
                        type="button"
                        variant="outline"
                        className="h-11"
                        disabled={form.processing}
                        onClick={onCancel}
                    >
                        Batal
                    </Button>
                )}
                <Button
                    className="h-11 w-full sm:w-auto"
                    disabled={form.processing}
                >
                    {form.processing
                        ? 'Membuat Pickup…'
                        : uncertain
                          ? 'Periksa / Kirim Ulang Input yang Sama'
                          : 'Buat Pickup'}
                </Button>
            </div>
        </form>
    );
}

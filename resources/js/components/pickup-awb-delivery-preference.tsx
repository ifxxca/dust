import { useForm } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import * as automationRoutes from '@/routes/pickup-automation';
import type { ReconciliationDetail } from '@/types/pickup-reconciliation';
export function DeliveryPreference({
    detail,
    saved,
}: {
    detail: ReconciliationDetail;
    saved: () => void;
}) {
    const form = useForm({
        enabled: detail.preference?.enabled ?? false,
        recipient: detail.preference?.recipient ?? '',
        expected_revision: detail.preference?.revision ?? 0,
        reason: '',
    });
    return (
        <details>
            <summary className="cursor-pointer py-2 font-medium">
                Pengaturan pengiriman customer
            </summary>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    form.post(automationRoutes.preference.url(detail.task.id), {
                        preserveScroll: true,
                        onSuccess: saved,
                        onError: (errors) => {
                            const field = errors.recipient
                                ? 'automation-recipient'
                                : 'automation-reason';
                            document.getElementById(field)?.focus();
                        },
                    });
                }}
                className="mt-3 flex flex-col gap-3"
            >
                {!detail.send_enabled && (
                    <p className="text-sm text-muted-foreground">
                        Pengiriman eksternal belum diaktifkan. Dokumen tetap
                        dapat diunduh.
                    </p>
                )}
                <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={form.data.enabled}
                        onChange={(event) =>
                            form.setData('enabled', event.target.checked)
                        }
                    />
                    Aktifkan pengiriman otomatis ke customer ini
                </label>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="automation-recipient">
                        Email tujuan Excel dan PDF
                    </Label>
                    <Input
                        id="automation-recipient"
                        type="email"
                        autoComplete="email"
                        value={form.data.recipient}
                        aria-invalid={!!form.errors.recipient}
                        aria-describedby={
                            form.errors.recipient
                                ? 'automation-recipient-error'
                                : undefined
                        }
                        onChange={(event) =>
                            form.setData('recipient', event.target.value)
                        }
                    />
                    {form.errors.recipient && (
                        <p
                            id="automation-recipient-error"
                            className="text-sm text-destructive"
                        >
                            {form.errors.recipient}
                        </p>
                    )}
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="automation-reason">Alasan perubahan</Label>
                    <Input
                        id="automation-reason"
                        value={form.data.reason}
                        aria-invalid={!!form.errors.reason}
                        aria-describedby={
                            form.errors.reason
                                ? 'automation-reason-error'
                                : undefined
                        }
                        onChange={(event) =>
                            form.setData('reason', event.target.value)
                        }
                    />
                    {form.errors.reason && (
                        <p
                            id="automation-reason-error"
                            className="text-sm text-destructive"
                        >
                            {form.errors.reason}
                        </p>
                    )}
                </div>
                <Button type="submit" disabled={form.processing}>
                    {form.processing ? 'Menyimpan…' : 'Simpan pengaturan'}
                </Button>
            </form>
        </details>
    );
}

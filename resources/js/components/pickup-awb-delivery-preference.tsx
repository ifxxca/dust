import { Disclosure, DisclosureSummary } from '@/components/ui/disclosure';
import { NativeCheckbox } from '@/components/ui/native-checkbox';
import { useForm, usePage } from '@inertiajs/react';
import { EmailRecipientsInput } from '@/components/email-recipients-input';
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
    const emailLimit = Number(usePage().props.email_recipient_limit ?? 1);
    const form = useForm({
        enabled: detail.preference?.enabled ?? false,
        recipients: detail.preference?.email_recipients ??
            detail.preference?.recipients ?? [
                detail.preference?.recipient ?? '',
            ],
        expected_revision: detail.preference?.revision ?? 0,
        reason: '',
    });
    return (
        <Disclosure>
            <DisclosureSummary className="cursor-pointer">
                Pengaturan pengiriman customer
            </DisclosureSummary>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    form.transform((data) => ({
                        ...data,
                        recipients: data.recipients.every(
                            (email) => email.trim() === '',
                        )
                            ? []
                            : data.recipients,
                    }));
                    form.post(automationRoutes.preference.url(detail.task.id), {
                        preserveScroll: true,
                        onSuccess: saved,
                        onError: (errors) => {
                            const invalidRecipient = Object.keys(errors).find(
                                (key) => key.startsWith('recipients.'),
                            );
                            const field = invalidRecipient
                                ? `automation-recipient-${invalidRecipient.split('.')[1]}`
                                : errors.recipient || errors.recipients
                                  ? 'automation-recipient-0'
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
                    <NativeCheckbox
                        checked={form.data.enabled}
                        onChange={(event) =>
                            form.setData('enabled', event.target.checked)
                        }
                    />
                    Aktifkan pengiriman otomatis ke customer ini
                </label>
                <EmailRecipientsInput
                    id="automation-recipient"
                    label="Email tujuan Excel dan PDF"
                    value={form.data.recipients}
                    limit={emailLimit}
                    disabled={form.processing}
                    onChange={(emails) => form.setData('recipients', emails)}
                    errors={{
                        list: form.errors.recipients,
                        ...Object.fromEntries(
                            form.data.recipients.map((_, index) => [
                                index,
                                (form.errors as Record<string, string>)[
                                    `recipients.${index}`
                                ] ??
                                    (index === 0
                                        ? (
                                              form.errors as Record<
                                                  string,
                                                  string
                                              >
                                          ).recipient
                                        : undefined),
                            ]),
                        ),
                    }}
                />
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
        </Disclosure>
    );
}

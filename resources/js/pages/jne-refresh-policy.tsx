import { Head, Link, useForm } from '@inertiajs/react';
import { focusFormError } from '@/lib/utils';
import InputError from '@/components/input-error';
import JneRefreshPolicyFields from '@/components/jne-refresh-policy-fields';
import PageContainer from '@/components/page-container';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import * as policies from '@/routes/jne-refresh';
import * as monitoring from '@/routes/jne-monitoring';

type Profile = {
    id: number;
    label: string | null;
    version: number;
    enabled: boolean;
    refresh_policy: {
        definition: Record<string, unknown>;
        verified_at: string | null;
    } | null;
};
export default function JneRefreshPolicy({
    installed,
    enabled,
    profiles,
    events,
}: {
    installed: boolean;
    enabled: boolean;
    profiles: Profile[];
    events: {
        data: {
            id: number;
            reason: string;
            before: string;
            after: string;
            created_at: string;
        }[];
        prev_page_url: string | null;
        next_page_url: string | null;
    } | null;
}) {
    const profile = profiles[0];
    const form = useForm({
        version: profile?.version ?? 1,
        reason: '',
        verified: false,
        definition: JSON.stringify(
            profile?.refresh_policy?.definition ?? {
                enabled: false,
                intervals: {},
                terminal_statuses: [],
                terminal_confirmations: null,
                sla_after_days: null,
                sla_interval_minutes: null,
                priority_statuses: [],
                availability_hours: [],
                failure_backoff_minutes: 15,
                max_failure_backoff_minutes: 1440,
            },
            null,
            2,
        ),
    });
    return (
        <PageContainer className="flex flex-col gap-4 py-4">
            <Head title="Kebijakan pembaruan tracking" />
            <h1 className="text-2xl font-semibold">
                Kebijakan pembaruan tracking
            </h1>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span>Aktivasi: {enabled ? 'Diizinkan' : 'Nonaktif'}</span>
                <span>
                    Jadwal:{' '}
                    {!profile
                        ? 'Belum diatur'
                        : profile.enabled
                          ? 'Aktif'
                          : 'Nonaktif'}
                </span>
            </div>
            {!profile && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4 text-sm">
                    <span>Konfigurasi pemantauan AWB belum tersedia.</span>
                    <Button variant="outline" asChild>
                        <Link href={monitoring.profiles.url()}>
                            Atur pemantauan AWB
                        </Link>
                    </Button>
                </div>
            )}
            {profile && (
                <form
                    className="flex max-w-3xl flex-col gap-4 rounded-lg border p-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const element = event.currentTarget;
                        let definition: Record<string, unknown>;
                        try {
                            definition = JSON.parse(form.data.definition);
                        } catch {
                            form.setError(
                                'definition',
                                'Definisi harus berupa JSON valid.',
                            );
                            focusFormError(element);
                            return;
                        }
                        form.transform((data) => ({ ...data, definition }));
                        form.post(policies.store.url(profile.id), {
                            onError: () => focusFormError(element),
                            onSuccess: () =>
                                form.setData('version', form.data.version + 1),
                        });
                    }}
                >
                    <JneRefreshPolicyFields
                        activationAllowed={enabled}
                        errors={form.errors}
                        value={form.data.definition}
                        onChange={(value) => {
                            form.setData('definition', value);
                            form.clearErrors('definition');
                        }}
                        error={form.errors.definition}
                    />
                    <Label className="flex gap-2">
                        <input
                            type="checkbox"
                            checked={form.data.verified}
                            onChange={(event) =>
                                form.setData('verified', event.target.checked)
                            }
                        />
                        Kebijakan telah diverifikasi untuk lingkungan ini
                    </Label>
                    <Label htmlFor="refresh-reason">
                        Alasan dan bukti kebijakan
                    </Label>
                    <Textarea
                        id="refresh-reason"
                        aria-invalid={!!form.errors.reason}
                        aria-describedby={
                            form.errors.reason
                                ? 'refresh-reason-error'
                                : undefined
                        }
                        required
                        maxLength={500}
                        value={form.data.reason}
                        onChange={(event) =>
                            form.setData('reason', event.target.value)
                        }
                    />
                    <InputError
                        id="refresh-reason-error"
                        message={form.errors.reason}
                    />
                    <div
                        data-form-errors
                        tabIndex={-1}
                        className="scroll-mt-20"
                    >
                        {Object.entries(form.errors)
                            .filter(
                                ([key]) =>
                                    !['definition', 'reason'].includes(key),
                            )
                            .map(([field, message]) => (
                                <p
                                    role="alert"
                                    className="text-destructive"
                                    key={field}
                                >
                                    {message}
                                </p>
                            ))}
                    </div>
                    <Button disabled={!installed || form.processing}>
                        Simpan kebijakan
                    </Button>
                </form>
            )}
            <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                    Ketentuan kebijakan
                </summary>
                <p className="mt-2">
                    Menyimpan kebijakan tidak mengaktifkan jadwal. Interval
                    mengikuti batas minimum jadwal. Status terminal, SLA,
                    prioritas, dan jam sumber memerlukan verifikasi.
                </p>
            </details>
            <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                    Audit kebijakan
                </summary>
                <div className="mt-3 flex flex-col gap-2">
                    {events?.data.map((event) => (
                        <details key={event.id} className="rounded border p-3">
                            <summary>
                                {event.created_at} · {event.reason}
                            </summary>
                            <pre className="max-w-full overflow-auto text-xs">
                                {event.before}
                                {'\n'}
                                {event.after}
                            </pre>
                        </details>
                    ))}
                    <nav className="flex gap-3">
                        {events?.prev_page_url && (
                            <Link href={events.prev_page_url}>Sebelumnya</Link>
                        )}
                        {events?.next_page_url && (
                            <Link href={events.next_page_url}>Berikutnya</Link>
                        )}
                    </nav>
                </div>
            </details>
        </PageContainer>
    );
}

import { Head, Link, useForm } from '@inertiajs/react';
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
        <PageContainer className="space-y-4 py-4">
            <Head title="Kebijakan pembaruan tracking" />
            <Link href={monitoring.index.url()} className="underline">
                Monitoring JNE
            </Link>
            <h1 className="text-2xl font-semibold">
                Kebijakan pembaruan tracking
            </h1>
            <p className="text-sm text-muted-foreground">
                Kebijakan ini mengatur pemilihan AWB pada jadwal status yang
                sudah ada. Menyimpan kebijakan tidak mengaktifkan jadwal.
                Interval tetap mengikuti batas minimum jadwal; status terminal,
                SLA, prioritas dan jam sumber harus diverifikasi saat UAT.
            </p>
            <p>
                Aktivasi lingkungan: {enabled ? 'Diizinkan' : 'Ditutup'} ·
                Jadwal: {profile?.enabled ? 'Aktif' : 'Nonaktif'}
            </p>
            {!profile && (
                <p>
                    Buat konfigurasi pemantauan AWB aktif pada sumber report
                    terlebih dahulu.
                </p>
            )}
            {profile && (
                <form
                    className="space-y-3 rounded border p-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        let definition: Record<string, unknown>;
                        try {
                            definition = JSON.parse(form.data.definition);
                        } catch {
                            form.setError(
                                'definition',
                                'Definisi harus berupa JSON valid.',
                            );
                            return;
                        }
                        form.transform((data) => ({ ...data, definition }));
                        form.post(policies.store.url(profile.id), {
                            onSuccess: () =>
                                form.setData('version', form.data.version + 1),
                        });
                    }}
                >
                    <Label htmlFor="refresh-definition">
                        Definisi kebijakan (jam 0–23 pada Asia/Jakarta)
                    </Label>
                    <Textarea
                        id="refresh-definition"
                        className="min-h-80 font-mono text-sm"
                        value={form.data.definition}
                        onChange={(event) =>
                            form.setData('definition', event.target.value)
                        }
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
                        required
                        maxLength={500}
                        value={form.data.reason}
                        onChange={(event) =>
                            form.setData('reason', event.target.value)
                        }
                    />
                    {Object.entries(form.errors).map(([field, message]) => (
                        <p
                            role="alert"
                            className="text-destructive"
                            key={field}
                        >
                            {message}
                        </p>
                    ))}
                    <Button disabled={!installed || form.processing}>
                        Simpan kebijakan tracking
                    </Button>
                </form>
            )}
            <h2 className="text-lg font-semibold">Audit kebijakan</h2>
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
        </PageContainer>
    );
}

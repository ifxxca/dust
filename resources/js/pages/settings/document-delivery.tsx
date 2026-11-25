import { Head, router, useForm } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { NativeCheckbox } from '@/components/ui/native-checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import * as routes from '@/routes/document-delivery';

type Settings = { session: string | null; enabled: boolean; version: number };
export default function DocumentDeliverySettings({
    ready,
    configured,
    settings,
    sessions,
    connectionError,
    limits,
    pause,
}: {
    ready: boolean;
    configured: boolean;
    settings: Settings;
    sessions: { name: string; status: string }[];
    connectionError: string | null;
    limits: {
        start_hour: number;
        end_hour: number;
        send_seen: boolean;
        recipient_hourly_limit: number;
        recipient_daily_limit: number;
    };
    pause: { until: number; reason: string } | null;
}) {
    const form = useForm({
        session: settings.session ?? '',
        enabled: settings.enabled,
        expected_version: settings.version,
    });
    return (
        <>
            <Head title="Pengiriman dokumen" />
            <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-xl font-semibold">
                        Pengiriman dokumen
                    </h1>
                    <Button
                        variant="outline"
                        onClick={() =>
                            router.reload({
                                only: ['sessions', 'connectionError', 'pause'],
                            })
                        }
                    >
                        Segarkan session
                    </Button>
                </div>
                {(!ready || !configured || connectionError) && (
                    <Alert variant="destructive">
                        <AlertDescription>
                            {!ready
                                ? 'Fitur belum diaktifkan pada database. Hubungi pengelola sistem.'
                                : !configured
                                  ? 'Isi WAHA_BASE_URL dan WAHA_API_KEY di konfigurasi server.'
                                  : connectionError}
                        </AlertDescription>
                    </Alert>
                )}
                {pause && (
                    <Alert>
                        <AlertDescription>
                            {pause.reason} Sampai{' '}
                            {new Date(pause.until * 1000).toLocaleString(
                                'id-ID',
                                { timeZone: 'Asia/Jakarta' },
                            )}{' '}
                            WIB.
                        </AlertDescription>
                    </Alert>
                )}
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        form.transform((data) => ({
                            ...data,
                            session: data.session || null,
                        }));
                        form.patch(routes.update.url(), {
                            onError: () =>
                                document
                                    .getElementById('waha-session')
                                    ?.focus(),
                            onSuccess: (page) =>
                                form.setData(
                                    'expected_version',
                                    (page.props.settings as Settings).version,
                                ),
                        });
                    }}
                >
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="waha-session">
                            Session WhatsApp pengirim
                        </Label>
                        <NativeSelect
                            id="waha-session"
                            value={form.data.session}
                            disabled={!ready || !configured || form.processing}
                            aria-invalid={!!form.errors.session}
                            aria-describedby={
                                form.errors.session
                                    ? 'waha-session-error'
                                    : undefined
                            }
                            onChange={(e) =>
                                form.setData('session', e.target.value)
                            }
                        >
                            <option value="">Pilih session</option>
                            {settings.session &&
                                !sessions.some(
                                    (row) => row.name === settings.session,
                                ) && (
                                    <option value={settings.session}>
                                        {settings.session} · tidak tersedia
                                    </option>
                                )}
                            {sessions.map((row) => (
                                <option value={row.name} key={row.name}>
                                    {row.name} ·{' '}
                                    {row.status === 'WORKING'
                                        ? 'Terhubung'
                                        : row.status}
                                </option>
                            ))}
                        </NativeSelect>
                        {form.errors.session && (
                            <p
                                id="waha-session-error"
                                role="alert"
                                className="text-sm text-destructive dark:text-red-400"
                            >
                                {form.errors.session}
                            </p>
                        )}
                    </div>
                    {configured &&
                        sessions.length === 0 &&
                        !connectionError && (
                            <p className="text-sm text-muted-foreground">
                                Belum ada session. Buat session dan hubungkan
                                nomor WhatsApp di WAHA, lalu segarkan daftar.
                            </p>
                        )}
                    <label className="flex min-h-11 cursor-pointer items-center gap-3">
                        <NativeCheckbox
                            checked={form.data.enabled}
                            disabled={!ready || form.processing}
                            onChange={(e) =>
                                form.setData('enabled', e.target.checked)
                            }
                        />
                        Aktifkan pengiriman WhatsApp
                    </label>
                    <p className="text-sm text-muted-foreground">
                        Tujuan kontak/grup serta pilihan Email dan WhatsApp
                        diatur pada masing-masing customer.
                    </p>
                    <div className="flex items-center justify-between gap-3">
                        <Badge
                            variant={settings.enabled ? 'success' : 'outline'}
                        >
                            {settings.enabled
                                ? 'Pengiriman aktif'
                                : 'Pengiriman nonaktif'}
                        </Badge>
                        <Button
                            type="submit"
                            disabled={!ready || !configured || form.processing}
                        >
                            {form.processing
                                ? 'Menyimpan…'
                                : 'Simpan pengaturan'}
                        </Button>
                    </div>
                    {form.wasSuccessful && (
                        <p role="status" className="text-sm">
                            Pengaturan disimpan.
                        </p>
                    )}
                </form>
                <details className="rounded-md border p-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                        Batas pengiriman WhatsApp
                    </summary>
                    <div className="mt-3 flex flex-col gap-2 text-muted-foreground">
                        <p>
                            Jam kirim:{' '}
                            {String(limits.start_hour).padStart(2, '0')}.00–
                            {String(limits.end_hour).padStart(2, '0')}.00 WIB.
                            Di luar jam ini, dokumen tetap dalam antrean.
                        </p>
                        <p>
                            Tanpa kuota pesan per session. Jeda 30–60 detik
                            antar-pesan tetap berlaku.
                        </p>
                        <p>
                            Per kontak/grup: {limits.recipient_hourly_limit}{' '}
                            pesan/jam, {limits.recipient_daily_limit} pesan/24
                            jam. Setiap lampiran dihitung satu pesan.
                        </p>
                        <p>
                            Penandaan baca pesan masuk:{' '}
                            {limits.send_seen
                                ? 'aktif sebelum pesan dokumen pertama dikirim ke chat tujuan'
                                : 'nonaktif'}
                            .
                        </p>
                        <p>
                            Tujuan harus mendapat persetujuan. Matikan pilihan
                            WhatsApp pada customer jika penerima berhenti
                            berlangganan. Session dijeda saat batas atau akses
                            WAHA ditolak.
                        </p>
                        <p>
                            Batas ini adalah pembatasan internal, bukan jaminan
                            bebas pembatasan dari WhatsApp.
                        </p>
                    </div>
                </details>
            </div>
        </>
    );
}

DocumentDeliverySettings.layout = {
    breadcrumbs: [{ title: 'Pengiriman dokumen', href: routes.edit() }],
};

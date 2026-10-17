import { Head, useHttp } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { BellRing, RefreshCw, Search } from 'lucide-react';
import PageContainer from '@/components/page-container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/operational-ui';
import { devices, store, show } from '@/routes/api/push-test';
import { pushTest } from '@/routes';
import { submissionKey } from '@/lib/submission-key';

type Device = {
    id: number;
    staff_name: string;
    device_label: string;
    eligible: boolean;
    updated_at: string;
};
type Result = {
    request_id: string;
    device_id: number;
    status: string;
    updated_at: string;
};
const statuses: Record<string, { title: string; description: string }> = {
    queued: {
        title: 'Menunggu worker',
        description:
            'Tes masuk antrean mobile-push. Jika tidak berubah, pastikan worker khusus antrean ini berjalan, lalu periksa hasil lagi.',
    },
    attempted: {
        title: 'Sedang dikirim / hasil belum pasti',
        description:
            'Worker telah memulai pengiriman. Periksa hasil lagi dan perangkat penerima sebelum membuat tes baru.',
    },
    accepted: {
        title: 'Diterima FCM',
        description:
            'FCM menerima permintaan. Ini belum membuktikan notifikasi tampil di Android. Periksa izin, koneksi internet, Layanan Google Play, dan perangkat penerima.',
    },
    unregistered: {
        title: 'Registrasi perangkat kedaluwarsa',
        description:
            'FCM menolak token perangkat. Login pada aplikasi Android dan aktifkan kembali notifikasi.',
    },
    skipped: {
        title: 'Tidak dikirim',
        description:
            'Akun, sesi, registrasi perangkat, atau konfigurasi berubah sebelum diproses. Muat ulang perangkat dan periksa aksesnya.',
    },
    queue_failed: {
        title: 'Gagal masuk antrean',
        description:
            'Backend tidak dapat memasukkan tes ke queue. Hubungi pengelola server sebelum mencoba tes baru.',
    },
    failed_or_uncertain: {
        title: 'Gagal / hasil belum pasti',
        description:
            'Worker atau pengiriman FCM gagal atau kehabisan waktu. Periksa perangkat dan konfigurasi Firebase. Tidak ada pengiriman ulang otomatis.',
    },
};
function errorMessage(error: unknown): string {
    const response = (
        error as {
            response?: {
                status?: number;
                data?: string | { message?: string };
            };
        }
    )?.response;
    try {
        const data =
            typeof response?.data === 'string'
                ? (JSON.parse(response.data) as { message?: string })
                : response?.data;
        if (response?.status && response.status < 500 && data?.message)
            return data.message;
    } catch {
        /* Use recovery guidance for unreadable responses. */
    }
    return 'Hasil belum dapat dipastikan. Periksa hasil tes dan perangkat sebelum mencoba lagi.';
}
export default function PushTest({
    enabled,
    configured,
}: {
    enabled: boolean;
    configured: boolean;
}) {
    const [q, setQ] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [selected, setSelected] = useState<Device | null>(null);
    const [requestId, setRequestId] = useState(submissionKey);
    const [submitted, setSubmitted] = useState(false);
    const [result, setResult] = useState<Result | null>(null);
    const [message, setMessage] = useState('');
    const [listError, setListError] = useState('');
    const list = useHttp<
        Record<string, never>,
        {
            data: Device[];
            meta: { current_page: number; last_page: number; total: number };
        }
    >({});
    const send = useHttp<Record<string, never>, { data: Result }>({});
    const status = useHttp<Record<string, never>, { data: Result }>({});
    useEffect(() => {
        let cancelled = false;
        setListError('');
        void list
            .get(devices.url({ query: { q: search, page } }))
            .catch((error: unknown) => {
                if (!cancelled) setListError(errorMessage(error));
            });
        return () => {
            cancelled = true;
            list.cancel();
        };
        // Each page/search/revision is an authoritative read.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, page, revision]);
    const check = () => {
        setMessage('');
        void status
            .get(show.url(requestId))
            .then((response) => {
                if (response) setResult(response.data);
            })
            .catch((error: unknown) => setMessage(errorMessage(error)));
    };
    const busy = send.processing || status.processing;
    const state = result ? statuses[result.status] : null;
    return (
        <>
            <Head title="Tes Notifikasi" />
            <PageContainer className="space-y-6">
                <header className="space-y-2">
                    <h1 className="flex items-center gap-2 text-2xl font-semibold">
                        <BellRing className="size-6" />
                        Tes Push Notifikasi
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Kirim satu pesan uji ke perangkat Pickup Staff melalui
                        queue dan Firebase existing. Tidak mengubah task atau
                        membuat assignment.
                    </p>
                </header>
                {(!enabled || !configured) && (
                    <p
                        role="alert"
                        className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
                    >
                        Firebase backend belum siap. Pengelola server perlu
                        mengaktifkan push serta memeriksa project dan
                        service-account Firebase di luar repository.
                    </p>
                )}
                <section
                    className="space-y-4 rounded-xl border bg-card p-4 sm:p-6"
                    aria-label="Perangkat penerima"
                >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="font-semibold">
                            Pilih perangkat penerima
                        </h2>
                        <Button
                            variant="outline"
                            disabled={busy || list.processing}
                            onClick={() => setRevision((value) => value + 1)}
                        >
                            <RefreshCw className="mr-2 size-4" />
                            Muat Ulang
                        </Button>
                    </div>
                    <form
                        className="flex gap-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            setPage(1);
                            setSearch(q);
                            setRevision((value) => value + 1);
                        }}
                    >
                        <Input
                            aria-label="Cari nama Pickup Staff"
                            placeholder="Cari nama Pickup Staff…"
                            value={q}
                            maxLength={100}
                            onChange={(event) => setQ(event.target.value)}
                        />
                        <Button type="submit" variant="outline">
                            <Search className="mr-2 size-4" />
                            Cari
                        </Button>
                    </form>
                    <p className="text-sm text-muted-foreground">
                        Perangkat muncul setelah Pickup Staff login dan
                        mengaktifkan notifikasi di Akun Android. Waktu
                        registrasi bukan bukti perangkat sedang online.
                    </p>
                    {listError ? (
                        <p role="alert" className="text-sm text-destructive">
                            {listError}
                        </p>
                    ) : list.processing ? (
                        <EmptyState loading />
                    ) : !list.response?.data.length ? (
                        <EmptyState
                            title="Belum ada perangkat terdaftar"
                            description="Pastikan akun Pickup Staff aktif, login di Android, lalu pilih Aktifkan Notifikasi dan muat ulang halaman ini."
                        />
                    ) : (
                        <div className="divide-y rounded-lg border px-3">
                            {list.response.data.map((device) => (
                                <label
                                    key={device.id}
                                    className="flex min-h-20 items-start gap-3 py-3"
                                >
                                    <input
                                        className="mt-1 size-4"
                                        type="radio"
                                        name="push-device"
                                        checked={selected?.id === device.id}
                                        disabled={
                                            !device.eligible ||
                                            submitted ||
                                            busy
                                        }
                                        onChange={() => setSelected(device)}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium">
                                            {device.staff_name}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {device.device_label}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Registrasi diperbarui{' '}
                                            {new Date(
                                                device.updated_at,
                                            ).toLocaleString('id-ID')}
                                        </p>
                                    </div>
                                    <Badge
                                        variant={
                                            device.eligible
                                                ? 'secondary'
                                                : 'outline'
                                        }
                                    >
                                        {device.eligible
                                            ? 'Sesi aktif'
                                            : 'Login / aktivasi ulang'}
                                    </Badge>
                                </label>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <span>{list.response?.meta.total ?? 0} perangkat</span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                disabled={page <= 1 || list.processing || busy}
                                onClick={() => setPage((value) => value - 1)}
                            >
                                Sebelumnya
                            </Button>
                            <Button
                                variant="outline"
                                disabled={
                                    page >=
                                        (list.response?.meta.last_page ?? 1) ||
                                    list.processing ||
                                    busy
                                }
                                onClick={() => setPage((value) => value + 1)}
                            >
                                Berikutnya
                            </Button>
                        </div>
                    </div>
                </section>
                <section
                    className="space-y-4 rounded-xl border bg-card p-4 sm:p-6"
                    aria-label="Kirim dan periksa tes"
                >
                    <h2 className="font-semibold">Pesan tes</h2>
                    <div className="rounded-lg bg-muted p-3 text-sm">
                        <p className="font-medium">
                            Tes notifikasi Retail Operations
                        </p>
                        <p>
                            Ini adalah notifikasi uji dari Admin. Tidak ada
                            perubahan pada tugas pickup.
                        </p>
                    </div>
                    {selected && (
                        <p className="text-sm">
                            Penerima: <strong>{selected.staff_name}</strong> ·{' '}
                            {selected.device_label}
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <Button
                            disabled={
                                !selected ||
                                !enabled ||
                                !configured ||
                                submitted ||
                                busy
                            }
                            onClick={() => {
                                if (!selected || submitted || busy) return;
                                setSubmitted(true);
                                setMessage('');
                                send.transform(() => ({
                                    device_id: selected.id,
                                    submission_key: requestId,
                                }));
                                void send
                                    .post(store.url())
                                    .then((response) => {
                                        if (response) setResult(response.data);
                                    })
                                    .catch((error: unknown) =>
                                        setMessage(errorMessage(error)),
                                    );
                            }}
                        >
                            {send.processing
                                ? 'Mengantrekan…'
                                : 'Kirim Tes Notifikasi'}
                        </Button>
                        {submitted && (
                            <Button
                                variant="outline"
                                disabled={busy}
                                onClick={check}
                            >
                                Periksa Hasil
                            </Button>
                        )}
                        {submitted && (
                            <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                    setRequestId(submissionKey());
                                    setSubmitted(false);
                                    setResult(null);
                                    setMessage('');
                                    setSelected(null);
                                    send.clearErrors();
                                    setRevision((value) => value + 1);
                                }}
                            >
                                Buat Tes Baru
                            </Button>
                        )}
                    </div>
                    {Object.entries(send.errors).map(([key, value]) => (
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
                    {state && result && (
                        <div
                            role="status"
                            className="space-y-2 rounded-lg border p-4"
                        >
                            <p className="font-semibold">{state.title}</p>
                            <p className="text-sm">{state.description}</p>
                            <p className="text-xs text-muted-foreground">
                                Diperbarui{' '}
                                {new Date(result.updated_at).toLocaleString(
                                    'id-ID',
                                )}
                                . Hasil disimpan sementara selama 30 menit.
                            </p>
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Periksa Android sebelum membuat tes baru jika hasil
                        masih belum pasti. Tidak ada pengiriman ulang otomatis.
                        APK lama tetap bisa menerima notifikasi background;
                        tampilan foreground pesan tes memerlukan APK terbaru.
                    </p>
                </section>
                <details className="rounded-xl border bg-card p-4 text-sm">
                    <summary className="cursor-pointer font-medium">
                        Jika tes masih menunggu worker
                    </summary>
                    <p className="mt-3">
                        Jalankan worker berikut di server Laravel dan biarkan
                        proses tetap berjalan. Setelah pembaruan kode, restart
                        worker lama agar job terbaru terbaca.
                    </p>
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                        php artisan queue:work database --queue=mobile-push
                        --sleep=2 --tries=1 --timeout=60 -v
                    </pre>
                    <p className="mt-3 text-muted-foreground">
                        Queue default saja tidak mengambil mobile-push.
                        Notifikasi foreground, background, dan izin Android
                        tetap perlu dicek pada perangkat.
                    </p>
                </details>
            </PageContainer>
        </>
    );
}

PushTest.layout = {
    breadcrumbs: [{ title: 'Tes Notifikasi', href: pushTest() }],
};

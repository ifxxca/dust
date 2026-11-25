import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { worker } from '@/routes/retail';
import { isBrowserPwa } from './platform';
import { Info } from 'lucide-react';
import SecondaryDisclosure from '@/components/secondary-disclosure';

export function PwaDraftNotice() {
    if (!isBrowserPwa) return null;
    return (
        <SecondaryDisclosure
            className="mb-3"
            title={
                <span className="flex items-center gap-2">
                    <Info size={16} aria-hidden="true" />
                    Draft sementara
                </span>
            }
        >
            <p className="leading-relaxed text-muted-foreground">
                Draft, foto, dan tanda tangan hanya berada di tab ini. Muat
                ulang, tutup aplikasi, atau keluar akan menghapusnya. Tidak ada
                pengiriman otomatis saat offline.
            </p>
        </SecondaryDisclosure>
    );
}

export function PwaStatus({ busy }: { busy: boolean }) {
    const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
    const [message, setMessage] = useState('');
    useEffect(() => {
        if (!isBrowserPwa) return;
        if (!window.isSecureContext || !('serviceWorker' in navigator)) {
            setMessage(
                'Pemasangan PWA memerlukan HTTPS dan browser yang mendukung service worker.',
            );
            return;
        }
        let active = true;
        let registration: ServiceWorkerRegistration | undefined;
        const check = () => {
            if (document.visibilityState === 'visible')
                void registration?.update().catch(() => undefined);
        };
        void navigator.serviceWorker
            .register(worker.url(), { scope: '/m', updateViaCache: 'none' })
            .then((result) => {
                registration = result;
                if (!active) return;
                if (result.waiting) setWaiting(result.waiting);
                result.addEventListener('updatefound', () => {
                    const installing = result.installing;
                    installing?.addEventListener('statechange', () => {
                        if (
                            active &&
                            installing.state === 'installed' &&
                            navigator.serviceWorker.controller
                        )
                            setWaiting(installing);
                    });
                });
            })
            .catch(() => {
                if (active)
                    setMessage(
                        'PWA belum dapat disiapkan. Tetap gunakan web dan coba buka ulang saat online.',
                    );
            });
        document.addEventListener('visibilitychange', check);
        window.addEventListener('online', check);
        return () => {
            active = false;
            document.removeEventListener('visibilitychange', check);
            window.removeEventListener('online', check);
        };
    }, []);
    if (!isBrowserPwa) return null;
    return (
        <>
            {message && (
                <p role="status" className="mb-3 text-sm text-muted-foreground">
                    {message}
                </p>
            )}
            {waiting && (
                <div
                    role="status"
                    className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 text-sm"
                >
                    <p>Versi baru tersedia.</p>
                    <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                            if (
                                !window.confirm(
                                    'Muat versi baru? Pastikan pengiriman sudah diperiksa. Draft browser sementara akan hilang.',
                                )
                            )
                                return;
                            navigator.serviceWorker.addEventListener(
                                'controllerchange',
                                () => window.location.reload(),
                                { once: true },
                            );
                            waiting.postMessage('ACTIVATE_UPDATE');
                        }}
                    >
                        Muat versi baru
                    </Button>
                </div>
            )}
        </>
    );
}

export function PwaHelp() {
    if (!isBrowserPwa) return null;
    return (
        <SecondaryDisclosure
            className="pwa-install-help"
            title="Pasang di Home Screen"
        >
            <ol className="mt-3 list-inside list-decimal space-y-2">
                <li>iPhone: buka halaman ini di Safari.</li>
                <li>Tekan Bagikan, lalu Tambahkan ke Layar Utama.</li>
                <li>
                    Jika tersedia, aktifkan Buka sebagai App (Open as Web App),
                    lalu tekan Tambahkan.
                </li>
                <li>
                    Android Chrome: buka menu browser, lalu Instal aplikasi atau
                    Tambahkan ke layar utama.
                </li>
            </ol>
            <p className="mt-3 text-muted-foreground">
                Izinkan kamera saat diminta. Suara aktif setelah interaksi;
                getaran bergantung pada browser. Pemberitahuan hanya tersedia di
                dalam aplikasi saat dibuka.
            </p>
            <p className="mt-2 text-muted-foreground">
                Draft, foto, dan tanda tangan hanya berada di memori tab ini.
                Muat ulang, tutup aplikasi, atau keluar akan menghapusnya. Tidak
                ada pengiriman otomatis saat offline.
            </p>
        </SecondaryDisclosure>
    );
}

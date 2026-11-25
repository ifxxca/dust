import { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Button } from '@/components/ui/button';

const settings = registerPlugin<{
    status(): Promise<{
        enabled: boolean;
        highImportance: boolean;
        sound: boolean;
    }>;
    open(): Promise<void>;
}>('NotificationSettings');

export default function NotificationSettings() {
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const available =
        Capacitor.isNativePlatform() &&
        Capacitor.isPluginAvailable('NotificationSettings');
    useEffect(() => {
        if (!available) return;
        let active = true;
        const refresh = () => {
            void settings
                .status()
                .then((status) => {
                    if (active)
                        setMessage(
                            !status.enabled
                                ? 'Notifikasi Android dinonaktifkan.'
                                : !status.highImportance
                                  ? 'Notifikasi cashless aktif tanpa pop-up prioritas tinggi.'
                                  : !status.sound
                                    ? 'Suara notifikasi cashless dinonaktifkan.'
                                    : 'Notifikasi cashless aktif.',
                        );
                })
                .catch(() => {
                    if (active)
                        setMessage(
                            'Periksa izin pop-up di pengaturan Android.',
                        );
                });
        };
        refresh();
        const listener = App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) refresh();
        });
        return () => {
            active = false;
            void listener.then((handle) => handle.remove());
        };
    }, [available]);
    if (!available) return null;
    return (
        <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground" role="status">
                {message}
            </p>
            <Button
                variant="outline"
                className="min-h-11 w-full"
                disabled={busy}
                onClick={() => {
                    setBusy(true);
                    void settings
                        .open()
                        .catch((error: unknown) =>
                            setMessage(
                                error instanceof Error
                                    ? error.message
                                    : 'Buka pengaturan notifikasi Android.',
                            ),
                        )
                        .finally(() => setBusy(false));
                }}
            >
                Pengaturan notifikasi Android
            </Button>
        </div>
    );
}

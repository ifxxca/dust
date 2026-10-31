import { useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, Flashlight, LoaderCircle, ScanLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogDescription,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
} from '@/components/ui/dialog';
import { CameraPermissionError, CameraScanSession } from './camera-scanner';
import {
    playScanError,
    playScanSuccess,
    primeScanAudio,
} from '@/lib/scan-feedback';

export default function CashlessCameraScanner({
    title,
    count,
    onScan,
    onClose,
}: {
    title: string;
    count: number;
    onScan: (raw: string) => Promise<{ awb?: string; error?: string }>;
    onClose: () => void;
}) {
    const [phase, setPhase] = useState<
        'starting' | 'scanning' | 'error' | 'closing'
    >('starting');
    const [notice, setNotice] = useState('Arahkan kamera ke barcode resi.');
    const [warning, setWarning] = useState(false);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [torchAvailable, setTorchAvailable] = useState(false);
    const [torch, setTorch] = useState(false);
    const [torchBusy, setTorchBusy] = useState(false);
    const reader = useRef<CameraScanSession | null>(null);
    const closing = useRef(false);
    const callbacks = useRef({ onScan, onClose });
    callbacks.current = { onScan, onClose };
    const finish = useRef<() => Promise<void>>(async () => {});

    useEffect(() => {
        primeScanAudio();
        let mounted = true;
        let scanning = false;
        closing.current = false;
        const error = (reason: unknown) => {
            if (!mounted || closing.current) return;
            setWarning(true);
            setNotice(
                reason instanceof Error
                    ? reason.message
                    : 'Kamera tidak dapat dibuka. Tutup pemindai dan coba lagi.',
            );
            setPermissionDenied(reason instanceof CameraPermissionError);
            setPhase('error');
            void reader.current?.stop().catch(() => {});
        };
        const session = new CameraScanSession(
            async (raw) => {
                const result = await callbacks.current.onScan(raw);
                if (!mounted || closing.current) return;
                setWarning(!!result.error);
                if (result.error) playScanError();
                else if (result.awb) playScanSuccess();
                setNotice(
                    result.error ?? `${result.awb} ditambahkan ke draft.`,
                );
            },
            error,
            BarcodeScanner,
            (awb) => {
                if (!mounted || closing.current) return;
                setWarning(true);
                setNotice(
                    `Resi ${awb} sudah dipindai. Jumlah tidak bertambah.`,
                );
                playScanError();
            },
        );
        reader.current = session;
        document.documentElement.classList.add('cashless-camera-mode');
        document.body.classList.add('cashless-camera-mode');
        finish.current = async () => {
            if (closing.current) return;
            closing.current = true;
            if (mounted) setPhase('closing');
            try {
                await session.stop();
            } catch {
                if (mounted) {
                    setNotice(
                        'Kamera belum berhasil dihentikan. Tekan Selesai untuk mencoba lagi.',
                    );
                    setWarning(true);
                    setPhase('error');
                    closing.current = false;
                }
                return;
            }
            if (mounted) callbacks.current.onClose();
        };
        const back = (event: Event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            void finish.current();
        };
        const hidden = () => {
            if (document.hidden && scanning) void finish.current();
        };
        window.addEventListener('mobile-back', back, true);
        document.addEventListener('visibilitychange', hidden);
        const listeners = Capacitor.isNativePlatform()
            ? [
                  App.addListener('backButton', () => void finish.current()),
                  App.addListener('appStateChange', ({ isActive }) => {
                      if (!isActive && scanning) void finish.current();
                  }),
              ]
            : [];
        void (async () => {
            try {
                if (!Capacitor.isNativePlatform())
                    throw new Error(
                        'Scan kamera tersedia di aplikasi Android. Gunakan APK terbaru, atau input manual di browser.',
                    );
                await session.start();
                if (!mounted || closing.current) return;
                scanning = true;
                if (document.hidden) {
                    await finish.current();
                    return;
                }
                setPhase('scanning');
                const available = await BarcodeScanner.isTorchAvailable().catch(
                    () => ({ available: false }),
                );
                if (mounted && !closing.current)
                    setTorchAvailable(available.available);
            } catch (reason) {
                error(reason);
            }
        })();
        return () => {
            mounted = false;
            void session.stop().catch(() => {});
            document.documentElement.classList.remove('cashless-camera-mode');
            document.body.classList.remove('cashless-camera-mode');
            window.removeEventListener('mobile-back', back, true);
            document.removeEventListener('visibilitychange', hidden);
            for (const listener of listeners)
                void listener.then((handle) => handle.remove());
        };
    }, []);

    async function toggleTorch() {
        if (torchBusy || phase !== 'scanning') return;
        setTorchBusy(true);
        try {
            await BarcodeScanner.toggleTorch();
            setTorch((await BarcodeScanner.isTorchEnabled()).enabled);
        } catch {
            setWarning(true);
            setNotice(
                'Senter tidak dapat diubah. Coba di tempat yang lebih terang.',
            );
        } finally {
            setTorchBusy(false);
        }
    }

    return (
        <Dialog
            open
            onOpenChange={(open) => {
                if (!open) void finish.current();
            }}
        >
            <DialogPortal>
                <DialogOverlay className="bg-transparent" />
                <DialogPrimitive.Content
                    className="cashless-camera-dialog"
                    onInteractOutside={(event) => event.preventDefault()}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                >
                    <div className="relative z-10 flex min-w-0 items-start gap-3 rounded-xl bg-background p-4 text-foreground shadow-lg">
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="pr-0 text-lg">
                                Scan resi Cashless
                            </DialogTitle>
                            <DialogDescription className="mt-1 break-words">
                                {title}
                            </DialogDescription>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Tutup kamera"
                            disabled={phase === 'closing'}
                            onClick={() => void finish.current()}
                        >
                            <X aria-hidden="true" />
                        </Button>
                    </div>
                    <div
                        className="flex min-h-0 flex-1 items-center justify-center"
                        aria-hidden="true"
                    >
                        {phase === 'scanning' ? (
                            <div className="h-36 w-full max-w-80 rounded-2xl border-2 border-white shadow-[0_0_0_200vmax_#0005]" />
                        ) : (
                            <div className="flex items-center gap-3 rounded-xl bg-background p-4 text-foreground">
                                {phase === 'starting' || phase === 'closing' ? (
                                    <LoaderCircle className="size-6 animate-spin motion-reduce:animate-none" />
                                ) : (
                                    <ScanLine className="size-6" />
                                )}
                                <span>
                                    {phase === 'starting'
                                        ? 'Membuka kamera…'
                                        : phase === 'closing'
                                          ? 'Menutup kamera…'
                                          : 'Pemindai berhenti'}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="relative z-10 flex flex-col gap-3 rounded-xl bg-background p-4 text-foreground shadow-lg">
                        <p className="flex items-center gap-2 text-sm font-medium tabular-nums">
                            <Check aria-hidden="true" className="size-4" />
                            {count} resi dalam draft
                        </p>
                        <p
                            role="status"
                            aria-live="polite"
                            className={`text-sm break-words ${warning ? 'text-destructive' : 'text-muted-foreground'}`}
                        >
                            {notice}
                        </p>
                        {permissionDenied && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                    void BarcodeScanner.openSettings().catch(
                                        () => {
                                            setNotice(
                                                'Buka Pengaturan HP → Aplikasi → Retail Pickup → Izin kamera.',
                                            );
                                        },
                                    )
                                }
                            >
                                Buka pengaturan kamera
                            </Button>
                        )}
                        <div className="flex gap-2">
                            {torchAvailable && phase === 'scanning' && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-12"
                                    aria-pressed={torch}
                                    disabled={torchBusy}
                                    onClick={() => void toggleTorch()}
                                >
                                    <Flashlight aria-hidden="true" />
                                    Senter
                                </Button>
                            )}
                            <Button
                                type="button"
                                className="h-12 flex-1"
                                disabled={phase === 'closing'}
                                onClick={() => void finish.current()}
                            >
                                {phase === 'closing'
                                    ? 'Menutup…'
                                    : 'Selesai scan'}
                            </Button>
                        </div>
                    </div>
                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    );
}

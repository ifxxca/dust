import type { IScannerControls } from '@zxing/browser';
import type { BarcodeScannerPlugin } from '@capacitor-mlkit/barcode-scanning';
import type { PluginListenerHandle } from '@capacitor/core';
import { CameraPermissionError } from './camera-scanner';

/** Adapter kamera saja; antrean, validasi AWB, dan duplikat tetap ditangani CameraScanSession. */
export function browserScanner(
    getVideo: () => HTMLVideoElement | null,
): BarcodeScannerPlugin {
    let stream: MediaStream | null = null;
    let controls: IScannerControls | null = null;
    let stopped = false;
    const listeners = new Map<string, (event: never) => void>();
    const emit = (name: string, event: unknown) =>
        listeners.get(name)?.(event as never);
    const stop = () => {
        stopped = true;
        controls?.stop();
        controls = null;
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        const video = getVideo();
        if (video) video.srcObject = null;
    };
    return {
        isSupported: async () => ({
            supported:
                window.isSecureContext &&
                !!navigator.mediaDevices?.getUserMedia,
        }),
        checkPermissions: async () => ({ camera: 'prompt' }),
        requestPermissions: async () => ({ camera: 'granted' }),
        addListener: async (
            name: string,
            callback: (event: never) => void,
        ): Promise<PluginListenerHandle> => {
            listeners.set(name, callback);
            return {
                remove: async () => {
                    listeners.delete(name);
                },
            };
        },
        startScan: async () => {
            try {
                const video = getVideo();
                if (!video) throw new Error('Pratinjau kamera belum siap.');
                const { BrowserMultiFormatReader } =
                    await import('@zxing/browser');
                if (stopped) return;
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                });
                if (stopped || document.hidden) {
                    stop();
                    return;
                }
                video.muted = true;
                video.playsInline = true;
                const reader = new BrowserMultiFormatReader(undefined, {
                    delayBetweenScanAttempts: 180,
                    delayBetweenScanSuccess: 250,
                });
                controls = await reader.decodeFromStream(
                    stream,
                    video,
                    (result, error) => {
                        if (stopped) return;
                        if (result)
                            emit('barcodesScanned', {
                                barcodes: [{ rawValue: result.getText() }],
                            });
                        else if (
                            error &&
                            ![
                                'NotFoundException',
                                'ChecksumException',
                                'FormatException',
                            ].includes(error.getKind())
                        ) {
                            emit('scanError', {
                                message:
                                    'Pemindai terhenti. Tutup kamera dan coba lagi atau ketik AWB.',
                            });
                        }
                    },
                );
                if (stopped || document.hidden) stop();
            } catch (error) {
                stop();
                if (
                    error instanceof DOMException &&
                    ['NotAllowedError', 'SecurityError'].includes(error.name)
                )
                    throw new CameraPermissionError(
                        'Izin kamera ditolak. Izinkan kamera di pengaturan situs Safari/Chrome, lalu coba lagi. Input manual tetap tersedia.',
                    );
                throw new Error(
                    'Kamera belum dapat dibuka. Gunakan HTTPS, tutup aplikasi kamera lain, atau ketik AWB/scanner Bluetooth.',
                );
            }
        },
        stopScan: async () => stop(),
    } as unknown as BarcodeScannerPlugin;
}

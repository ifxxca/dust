import {
    BarcodeScanner,
    LensFacing,
    type BarcodeScannerPlugin,
} from '@capacitor-mlkit/barcode-scanning';
import type { PluginListenerHandle } from '@capacitor/core';
import { normalizeAwb } from '@/lib/awb-signatures';

export class CameraPermissionError extends Error {}

export class CameraScanSession {
    private closed = false;
    private attempted = false;
    private listeners: PluginListenerHandle[] = [];
    private starting: Promise<void> | null = null;
    private stopping: Promise<void> | null = null;
    private writes: Promise<void> = Promise.resolve();
    private seen = new Set<string>();
    private visible = new Map<string, number>();

    constructor(
        private readonly onBarcode: (raw: string) => Promise<void | boolean>,
        private readonly onError: (reason: unknown) => void,
        private readonly scanner: BarcodeScannerPlugin = BarcodeScanner,
        private readonly onDuplicate?: (awb: string) => void | Promise<void>,
        private readonly clock: () => number = () => performance.now(),
    ) {}

    start(): Promise<void> {
        this.starting ??= this.open();
        return this.starting;
    }

    private async open(): Promise<void> {
        if (this.closed) return;
        if (!(await this.scanner.isSupported()).supported)
            throw new Error(
                'Kamera pemindai tidak tersedia. Gunakan input manual atau scanner Bluetooth.',
            );
        if (this.closed) return;
        let permission = await this.scanner.checkPermissions();
        if (this.closed) return;
        if (permission.camera !== 'granted' && permission.camera !== 'denied')
            permission = await this.scanner.requestPermissions();
        if (this.closed) return;
        if (permission.camera !== 'granted')
            throw new CameraPermissionError(
                'Izin kamera belum diberikan. Aktifkan izin kamera di pengaturan aplikasi atau gunakan input manual.',
            );

        this.listeners.push(
            await this.scanner.addListener(
                'barcodesScanned',
                ({ barcodes }) => {
                    if (this.closed) return;
                    const now = this.clock();
                    const frame = new Map<string, number>();
                    for (const barcode of barcodes) {
                        const raw =
                            barcode.rawValue === undefined
                                ? ''
                                : normalizeAwb(barcode.rawValue);
                        if (!raw || frame.has(raw)) continue;
                        frame.set(raw, now);
                        const lastObserved = this.visible.get(raw);
                        if (this.seen.has(raw)) {
                            if (
                                lastObserved === undefined ||
                                now - lastObserved >= 750
                            ) {
                                this.writes = this.writes
                                    .then(async () => {
                                        if (this.seen.has(raw))
                                            await this.onDuplicate?.(raw);
                                    })
                                    .catch(this.onError);
                            }
                            continue;
                        }
                        if (
                            lastObserved !== undefined &&
                            now - lastObserved < 750
                        )
                            continue;
                        this.seen.add(raw);
                        this.writes = this.writes
                            .then(async () => {
                                if ((await this.onBarcode(raw)) === false)
                                    this.seen.delete(raw);
                            })
                            .catch((reason: unknown) => {
                                this.seen.delete(raw);
                                this.visible.delete(raw);
                                this.onError(reason);
                            });
                    }
                    this.visible = frame;
                },
            ),
        );
        if (this.closed) return;
        this.listeners.push(
            await this.scanner.addListener('scanError', (event) => {
                if (!this.closed) this.onError(new Error(event.message));
            }),
        );
        if (this.closed) return;
        this.attempted = true;
        await this.scanner.startScan({ lensFacing: LensFacing.Back });
    }

    stop(): Promise<void> {
        this.closed = true;
        this.stopping ??= this.close().catch((reason: unknown) => {
            this.stopping = null;
            throw reason;
        });
        return this.stopping;
    }

    private async close(): Promise<void> {
        await this.starting?.catch(() => {});
        try {
            if (this.attempted) await this.scanner.stopScan();
        } finally {
            await Promise.allSettled(
                this.listeners.map((listener) => listener.remove()),
            );
            this.listeners = [];
            await this.writes;
        }
    }
}

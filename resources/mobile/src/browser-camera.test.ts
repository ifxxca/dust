import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { BarcodeScannerPlugin } from '@capacitor-mlkit/barcode-scanning';
import { browserScanner } from './browser-camera';
import { CameraPermissionError, CameraScanSession } from './camera-scanner';

const decoder = vi.hoisted(() => ({
    callback: null as
        | null
        | ((result: { getText(): string } | null, error?: Error) => void),
    stop: vi.fn(),
}));
vi.mock('@zxing/browser', () => ({
    BrowserMultiFormatReader: class {
        async decodeFromStream(
            _stream: unknown,
            _video: unknown,
            callback: typeof decoder.callback,
        ) {
            decoder.callback = callback;
            return { stop: decoder.stop };
        }
    },
}));
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { isSecureContext: true });
    vi.stubGlobal('document', { hidden: false });
});
afterEach(() => vi.unstubAllGlobals());
const video = () =>
    ({
        srcObject: null,
        muted: false,
        playsInline: false,
    }) as unknown as HTMLVideoElement;

test('browser camera forwards decoded AWBs into the existing duplicate queue and stops every track', async () => {
    const stop = vi.fn();
    const media = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: media } });
    const target = video();
    const adapter = browserScanner(() => target);
    const onBarcode = vi.fn(async () => true);
    const onError = vi.fn();
    const session = new CameraScanSession(onBarcode, onError, adapter);
    await session.start();
    decoder.callback!(
        null,
        Object.assign(new Error(), { getKind: () => 'NotFoundException' }),
    );
    decoder.callback!({ getText: () => 'TG1234567890' });
    decoder.callback!({ getText: () => 'TG1234567890' });
    await session.stop();
    expect(onBarcode).toHaveBeenCalledExactlyOnceWith('TG1234567890');
    expect(onError).not.toHaveBeenCalled();
    expect(media.mock.calls[0][0]).toMatchObject({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
    });
    expect(stop).toHaveBeenCalledOnce();
    expect(decoder.stop).toHaveBeenCalledOnce();
    expect(target.muted && target.playsInline).toBe(true);
});

test('unsupported or insecure browsers do not open a native scanner', async () => {
    vi.stubGlobal('window', { isSecureContext: false });
    vi.stubGlobal('navigator', {});
    const adapter = browserScanner(() => video());
    expect(await adapter.isSupported()).toEqual({ supported: false });
});

test('camera permission rejection provides a browser recovery message', async () => {
    vi.stubGlobal('navigator', {
        mediaDevices: {
            getUserMedia: vi
                .fn()
                .mockRejectedValue(
                    new DOMException('denied', 'NotAllowedError'),
                ),
        },
    });
    const adapter = browserScanner(() => video());
    await expect(
        adapter.startScan(
            {} as Parameters<BarcodeScannerPlugin['startScan']>[0],
        ),
    ).rejects.toBeInstanceOf(CameraPermissionError);
});

test('closing while permission is pending releases a late camera stream without starting decoding', async () => {
    let allow!: (value: unknown) => void;
    const stop = vi.fn();
    vi.stubGlobal('navigator', {
        mediaDevices: {
            getUserMedia: () =>
                new Promise((resolve) => {
                    allow = resolve;
                }),
        },
    });
    const adapter = browserScanner(() => video());
    const starting = adapter.startScan(
        {} as Parameters<BarcodeScannerPlugin['startScan']>[0],
    );
    await vi.waitFor(() => expect(allow).toBeTypeOf('function'));
    await adapter.stopScan();
    allow({ getTracks: () => [{ stop }] });
    await starting;
    expect(stop).toHaveBeenCalledOnce();
    expect(decoder.stop).not.toHaveBeenCalled();
});

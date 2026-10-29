import { beforeEach, expect, test, vi } from 'vitest';
import { CameraPermissionError, CameraScanSession } from './camera-scanner';

const native = vi.hoisted(() => {
    const handlers = new Map<string, (event: unknown) => void>();
    const remove = vi.fn(async () => {});
    return {
        handlers,
        remove,
        scanner: {
            isSupported: vi.fn(async () => ({ supported: true })),
            checkPermissions: vi.fn(async (): Promise<{ camera: string }> => ({
                camera: 'granted',
            })),
            requestPermissions: vi.fn(
                async (): Promise<{ camera: string }> => ({
                    camera: 'granted',
                }),
            ),
            addListener: vi.fn(
                async (name: string, callback: (event: unknown) => void) => {
                    handlers.set(name, callback);
                    return { remove };
                },
            ),
            startScan: vi.fn(async () => {}),
            stopScan: vi.fn(async () => {}),
        },
    };
});
vi.mock('@capacitor-mlkit/barcode-scanning', async (original) => ({
    ...(await original<typeof import('@capacitor-mlkit/barcode-scanning')>()),
    BarcodeScanner: native.scanner,
}));

beforeEach(() => {
    vi.clearAllMocks();
    native.handlers.clear();
    native.scanner.isSupported.mockResolvedValue({ supported: true });
    native.scanner.checkPermissions.mockResolvedValue({ camera: 'granted' });
    native.scanner.requestPermissions.mockResolvedValue({ camera: 'granted' });
    native.scanner.startScan.mockResolvedValue();
    native.scanner.stopScan.mockResolvedValue();
});

test('a deliberately rescanned barcode reports a duplicate once without replaying its write or warning on every frame', async () => {
    const scan = vi.fn(async () => {});
    const duplicate = vi.fn();
    const session = new CameraScanSession(scan, vi.fn(), undefined, duplicate);
    await session.start();
    const frame = (values: string[]) => native.handlers.get('barcodesScanned')!({ barcodes: values.map((rawValue) => ({ rawValue })) });
    frame(['TG001', 'TG001']);
    frame(['TG001']);
    expect(duplicate).not.toHaveBeenCalled();
    frame(['TG002']);
    frame(['TG001']);
    frame(['TG001']);
    await session.stop();
    expect(scan).toHaveBeenCalledTimes(2);
    expect(duplicate).toHaveBeenCalledExactlyOnceWith('TG001');
});

test('camera requests permission before starting and reports denied access without opening it', async () => {
    native.scanner.checkPermissions.mockResolvedValue({ camera: 'prompt' });
    native.scanner.requestPermissions.mockResolvedValue({ camera: 'denied' });
    const session = new CameraScanSession(vi.fn(), vi.fn());

    await expect(session.start()).rejects.toBeInstanceOf(CameraPermissionError);
    await session.stop();

    expect(native.scanner.requestPermissions).toHaveBeenCalledOnce();
    expect(native.scanner.startScan).not.toHaveBeenCalled();
    expect(native.scanner.stopScan).not.toHaveBeenCalled();
});

test('unsupported devices retain the manual input recovery path', async () => {
    native.scanner.isSupported.mockResolvedValue({ supported: false });
    const session = new CameraScanSession(vi.fn(), vi.fn());

    await expect(session.start()).rejects.toThrow('input manual');
    await session.stop();

    expect(native.scanner.checkPermissions).not.toHaveBeenCalled();
});

test('frames deduplicate barcode values and serialize durable draft writes before closing', async () => {
    let release!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
        release = resolve;
    });
    const saved: string[] = [];
    const scan = vi.fn(async (raw: string) => {
        if (!saved.length) await firstWrite;
        saved.push(raw);
    });
    const session = new CameraScanSession(scan, vi.fn());
    await session.start();

    native.handlers.get('barcodesScanned')!({
        barcodes: [{ rawValue: ' tg001 ' }, { rawValue: 'TG002' }],
    });
    native.handlers.get('barcodesScanned')!({
        barcodes: [{ rawValue: 'TG001' }, {}, { rawValue: '' }],
    });
    const stopped = session.stop();
    native.handlers.get('barcodesScanned')!({
        barcodes: [{ rawValue: 'TG003' }],
    });
    await Promise.resolve();
    expect(saved).toEqual([]);
    release();
    await stopped;

    expect(saved).toEqual(['TG001', 'TG002']);
    expect(native.scanner.stopScan).toHaveBeenCalledOnce();
    expect(native.remove).toHaveBeenCalledTimes(2);
    await session.stop();
    expect(native.scanner.stopScan).toHaveBeenCalledOnce();
});

test('closing while native start is pending stops the camera after startup completes', async () => {
    let opened!: () => void;
    const pending = new Promise<void>((resolve) => {
        opened = resolve;
    });
    native.scanner.startScan.mockReturnValue(pending);
    const session = new CameraScanSession(vi.fn(), vi.fn());
    const starting = session.start();
    await vi.waitFor(() =>
        expect(native.scanner.startScan).toHaveBeenCalledOnce(),
    );

    const stopped = session.stop();
    expect(native.scanner.stopScan).not.toHaveBeenCalled();
    opened();
    await Promise.all([starting, stopped]);

    expect(native.scanner.stopScan).toHaveBeenCalledOnce();
    expect(native.remove).toHaveBeenCalledTimes(2);
});

test('startup errors still release native camera resources and listeners', async () => {
    native.scanner.startScan.mockRejectedValue(new Error('camera occupied'));
    const session = new CameraScanSession(vi.fn(), vi.fn());

    await expect(session.start()).rejects.toThrow('camera occupied');
    await session.stop();

    expect(native.scanner.stopScan).toHaveBeenCalledOnce();
    expect(native.remove).toHaveBeenCalledTimes(2);
});

test('a failed draft write is reported and the same barcode can be retried', async () => {
    const scan = vi
        .fn()
        .mockRejectedValueOnce(new Error('disk full'))
        .mockResolvedValue(undefined);
    const error = vi.fn();
    const session = new CameraScanSession(scan, error);
    await session.start();

    native.handlers.get('barcodesScanned')!({
        barcodes: [{ rawValue: 'TG001' }],
    });
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    native.handlers.get('barcodesScanned')!({
        barcodes: [{ rawValue: 'TG001' }],
    });
    await session.stop();

    expect(scan).toHaveBeenCalledTimes(2);
    expect(error.mock.calls[0][0].message).toBe('disk full');
});

test('a stop failure can be retried instead of leaving a permanently stuck scanner', async () => {
    native.scanner.stopScan.mockRejectedValueOnce(new Error('busy'));
    const session = new CameraScanSession(vi.fn(), vi.fn());
    await session.start();

    await expect(session.stop()).rejects.toThrow('busy');
    await session.stop();

    expect(native.scanner.stopScan).toHaveBeenCalledTimes(2);
});

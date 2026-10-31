import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const native = vi.hoisted(() => ({
    success: vi.fn(async () => {}),
    isNativePlatform: vi.fn(() => false),
    isPluginAvailable: vi.fn(() => false),
}));

vi.mock('@capacitor/core', () => ({
    Capacitor: native,
    registerPlugin: () => ({ success: native.success }),
}));

let state = 'running';
let vibrate = vi.fn();
let resume = vi.fn(async () => {
    state = 'running';
});
let tones: { type: string; frequency: { value: number } }[] = [];

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    native.isNativePlatform.mockReturnValue(false);
    native.isPluginAvailable.mockReturnValue(false);
    native.success.mockResolvedValue();
    state = 'running';
    vibrate = vi.fn();
    resume = vi.fn(async () => {
        state = 'running';
    });
    tones = [];
    vi.stubGlobal('navigator', { vibrate });
    vi.stubGlobal(
        'AudioContext',
        class {
            get state() {
                return state;
            }
            currentTime = 0;
            destination = {};
            resume = resume;
            createOscillator() {
                const tone = {
                    type: '',
                    frequency: { value: 0 },
                    connect: vi.fn(),
                    disconnect: vi.fn(),
                    start: vi.fn(),
                    stop: vi.fn(),
                };
                tones.push(tone);
                return tone;
            }
            createGain() {
                return {
                    gain: {
                        setValueAtTime: vi.fn(),
                        exponentialRampToValueAtTime: vi.fn(),
                    },
                    connect: vi.fn(),
                    disconnect: vi.fn(),
                };
            }
        },
    );
});

afterEach(() => vi.unstubAllGlobals());

test('each successful scan confirms with a short beep and vibration, including rapid scans', async () => {
    const { playScanSuccess } = await import('./scan-feedback');
    playScanSuccess();
    playScanSuccess();
    expect(tones.map((tone) => tone.frequency.value)).toEqual([1046, 1046]);
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenCalledWith(40);
});

test('Android delegates success feedback to its native plugin without playing a second web tone', async () => {
    native.isNativePlatform.mockReturnValue(true);
    native.isPluginAvailable.mockReturnValue(true);
    const { playScanSuccess } = await import('./scan-feedback');
    playScanSuccess();
    expect(native.success).toHaveBeenCalledOnce();
    expect(tones).toEqual([]);
    expect(vibrate).not.toHaveBeenCalled();
});

test('an unavailable native bridge falls back without failing the scan', async () => {
    native.isNativePlatform.mockReturnValue(true);
    native.isPluginAvailable.mockReturnValue(true);
    native.success.mockRejectedValue(new Error('bridge unavailable'));
    const { playScanSuccess } = await import('./scan-feedback');
    playScanSuccess();
    await Promise.resolve();
    expect(tones).toHaveLength(1);
    expect(vibrate).toHaveBeenCalledOnce();
});

test('vibration still confirms when audio is unsupported', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const { playScanSuccess } = await import('./scan-feedback');
    expect(playScanSuccess).not.toThrow();
    expect(vibrate).toHaveBeenCalledWith(40);
});

test('unavailable vibration does not suppress the success sound or fail the scan', async () => {
    vibrate.mockImplementation(() => {
        throw new Error('unavailable');
    });
    const { playScanSuccess } = await import('./scan-feedback');
    expect(playScanSuccess).not.toThrow();
    expect(tones).toHaveLength(1);
});

test('the first success waits for suspended web audio to resume', async () => {
    state = 'suspended';
    const { playScanSuccess } = await import('./scan-feedback');
    playScanSuccess();
    await Promise.resolve();
    expect(resume).toHaveBeenCalled();
    expect(tones).toHaveLength(1);
});

test('duplicate feedback remains a distinct two-tone warning without a success vibration', async () => {
    const { playScanError } = await import('./scan-feedback');
    playScanError();
    expect(tones.map((tone) => tone.frequency.value)).toEqual([240, 180]);
    expect(vibrate).not.toHaveBeenCalled();
    expect(native.success).not.toHaveBeenCalled();
});

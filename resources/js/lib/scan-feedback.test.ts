import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const native = vi.hoisted(() => ({
    success: vi.fn(async () => {}),
    error: vi.fn(async () => {}),
    accepted: vi.fn(async () => {}),
    duplicate: vi.fn(async () => {}),
    vibration: vi.fn(async () => {}),
    isNativePlatform: vi.fn(() => false),
    isPluginAvailable: vi.fn(() => false),
}));

vi.mock('@capacitor/core', () => ({
    Capacitor: native,
    registerPlugin: () => native,
}));

let state = 'running';
let vibrate = vi.fn();
let resume = vi.fn(async () => {
    state = 'running';
});
let tones: { type: string; frequency: { value: number } }[] = [];
let gains: number[] = [];

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    native.isNativePlatform.mockReturnValue(false);
    native.isPluginAvailable.mockReturnValue(false);
    native.success.mockResolvedValue();
    native.error.mockResolvedValue();
    state = 'running';
    vibrate = vi.fn();
    resume = vi.fn(async () => {
        state = 'running';
    });
    tones = [];
    gains = [];
    vi.stubGlobal('localStorage', {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
    });
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
                        setValueAtTime: vi.fn((value: number) =>
                            gains.push(value),
                        ),
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
    expect(vibrate).toHaveBeenCalledWith(70);
    expect(gains).toEqual([0.5, 0.5]);
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
    expect(vibrate).toHaveBeenCalledWith(70);
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

test('failure feedback uses two warning tones and a different vibration pattern', async () => {
    const { playScanError } = await import('./scan-feedback');
    playScanError();
    expect(tones.map((tone) => tone.frequency.value)).toEqual([440, 330]);
    expect(vibrate).toHaveBeenCalledWith([150, 80, 150]);
    expect(native.success).not.toHaveBeenCalled();
});

test('Android failure feedback uses its native warning rather than silent web-only audio', async () => {
    native.isNativePlatform.mockReturnValue(true);
    native.isPluginAvailable.mockReturnValue(true);
    const { playScanError } = await import('./scan-feedback');
    playScanError();
    expect(native.error).toHaveBeenCalledOnce();
    expect(native.success).not.toHaveBeenCalled();
    expect(tones).toEqual([]);
});

test('a successful scan rearms the next duplicate warning even immediately after a previous error', async () => {
    native.isNativePlatform.mockReturnValue(true);
    native.isPluginAvailable.mockReturnValue(true);
    const { playScanError, playScanSuccess } = await import('./scan-feedback');
    playScanError();
    playScanSuccess();
    playScanError();
    expect(native.error).toHaveBeenCalledTimes(2);
    expect(native.success).toHaveBeenCalledOnce();
});

test('a failed native warning falls back to both web vibration and sound', async () => {
    native.isNativePlatform.mockReturnValue(true);
    native.isPluginAvailable.mockReturnValue(true);
    native.error.mockRejectedValue(new Error('bridge unavailable'));
    const { playScanError } = await import('./scan-feedback');
    playScanError();
    await Promise.resolve();
    expect(tones).toHaveLength(2);
    expect(vibrate).toHaveBeenCalledWith([150, 80, 150]);
});

test('a suspended audio context resumes before playing a duplicate warning', async () => {
    state = 'suspended';
    const { playScanError } = await import('./scan-feedback');
    playScanError();
    await Promise.resolve();
    expect(tones).toHaveLength(2);
});

test('an unavailable vibrator does not turn duplicate feedback into a scan failure', async () => {
    vibrate.mockImplementation(() => {
        throw new Error('unavailable');
    });
    const { playScanError } = await import('./scan-feedback');
    expect(playScanError).not.toThrow();
    expect(tones).toHaveLength(2);
});

test('local acceptance vibrates without claiming backend success', async () => {
    const { playScanAccepted } = await import('./scan-feedback');
    playScanAccepted();
    expect(vibrate).toHaveBeenCalledWith(25);
    expect(tones).toHaveLength(0);
    expect(native.success).not.toHaveBeenCalled();
});

test('duplicates have a third feedback distinct from processing failure', async () => {
    const { playScanDuplicate } = await import('./scan-feedback');
    playScanDuplicate();
    playScanDuplicate();
    expect(tones.map((tone) => tone.frequency.value)).toEqual([660]);
    expect(vibrate).toHaveBeenCalledExactlyOnceWith([35, 45, 35]);
});

test('operator preferences suppress sound and vibration independently', async () => {
    const { playScanSuccess, playScanError } = await import('./scan-feedback');
    vi.mocked(localStorage.getItem).mockReturnValue(
        JSON.stringify({
            successSound: false,
            failureSound: true,
            vibration: false,
        }),
    );
    playScanSuccess();
    expect(tones).toHaveLength(0);
    playScanError();
    expect(tones).toHaveLength(2);
    expect(vibrate).not.toHaveBeenCalled();
});

test('native bridge receives preferences and vibration testing never plays sound', async () => {
    native.isNativePlatform.mockReturnValue(true);
    native.isPluginAvailable.mockReturnValue(true);
    const { playScanSuccess, testScanVibration } =
        await import('./scan-feedback');
    vi.mocked(localStorage.getItem).mockReturnValue(
        JSON.stringify({ successSound: false, vibration: true }),
    );
    playScanSuccess();
    testScanVibration();
    expect(native.success).toHaveBeenCalledWith({
        sound: false,
        vibration: true,
    });
    expect(native.vibration).toHaveBeenCalledWith({
        sound: false,
        vibration: true,
    });
});

test('sound test never vibrates and vibration test never plays web audio', async () => {
    const { testScanSound, testScanVibration } =
        await import('./scan-feedback');
    testScanSound('success');
    expect(vibrate).not.toHaveBeenCalled();
    expect(tones).toHaveLength(1);
    testScanVibration();
    expect(tones).toHaveLength(1);
    expect(vibrate).toHaveBeenCalledWith(70);
});

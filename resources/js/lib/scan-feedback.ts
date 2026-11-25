import { Capacitor, registerPlugin } from '@capacitor/core';

export type ScannerFeedbackSettings = {
    successSound: boolean;
    failureSound: boolean;
    vibration: boolean;
};
const settingsKey = 'retail-scanner-feedback-v1';
const defaults: ScannerFeedbackSettings = {
    successSound: true,
    failureSound: true,
    vibration: true,
};
type Kind = 'success' | 'error' | 'duplicate' | 'accepted' | 'vibration';
type Options = { sound: boolean; vibration: boolean };
const nativeFeedback =
    registerPlugin<Record<Kind, (options: Options) => Promise<void>>>(
        'ScanFeedback',
    );
let audio: AudioContext | undefined;
let lastError = -Infinity;
let lastDuplicate = -Infinity;

export function scannerFeedbackSettings(): ScannerFeedbackSettings {
    try {
        const saved = JSON.parse(localStorage.getItem(settingsKey) ?? '{}');
        return Object.fromEntries(
            Object.entries(defaults).map(([key, fallback]) => [
                key,
                typeof saved?.[key] === 'boolean' ? saved[key] : fallback,
            ]),
        ) as ScannerFeedbackSettings;
    } catch {
        return { ...defaults };
    }
}

export function saveScannerFeedbackSettings(
    settings: ScannerFeedbackSettings,
): void {
    localStorage.setItem(settingsKey, JSON.stringify(settings));
}

export function primeScanAudio(): void {
    try {
        audio ??= new AudioContext();
        if (audio.state === 'suspended')
            void audio.resume().catch(() => undefined);
    } catch {
        /* Konfirmasi visual tetap tersedia. */
    }
}

function feedback(kind: Kind, soundOnly = false): void {
    const settings = scannerFeedbackSettings();
    const options = {
        sound:
            kind === 'success'
                ? settings.successSound
                : ['error', 'duplicate'].includes(kind) &&
                  settings.failureSound,
        vibration: !soundOnly && settings.vibration,
    };
    if (!options.sound && !options.vibration) return;
    if (
        Capacitor.isNativePlatform() &&
        Capacitor.isPluginAvailable('ScanFeedback')
    ) {
        void nativeFeedback[kind](options).catch(() =>
            webFeedback(kind, options),
        );
    } else webFeedback(kind, options);
}

function webFeedback(kind: Kind, options: Options): void {
    if (options.vibration) {
        try {
            navigator.vibrate?.(
                kind === 'error'
                    ? [150, 80, 150]
                    : kind === 'duplicate'
                      ? [35, 45, 35]
                      : kind === 'accepted'
                        ? 25
                        : 70,
            );
        } catch {
            /* Perangkat tanpa getaran tetap dapat memindai. */
        }
    }
    if (!options.sound) return;
    primeScanAudio();
    if (!audio) return;
    const context = audio;
    const beep = () => {
        if (context.state !== 'running') return;
        try {
            const frequencies =
                kind === 'error'
                    ? [440, 330]
                    : kind === 'duplicate'
                      ? [660]
                      : [1046];
            for (const [index, frequency] of frequencies.entries()) {
                const oscillator = context.createOscillator();
                const volume = context.createGain();
                const start = context.currentTime + index * 0.22;
                const duration = kind === 'duplicate' ? 0.06 : 0.14;
                oscillator.type = kind === 'error' ? 'triangle' : 'sine';
                oscillator.frequency.value = frequency;
                volume.gain.setValueAtTime(0.5, start);
                volume.gain.exponentialRampToValueAtTime(
                    0.001,
                    start + duration,
                );
                oscillator.connect(volume);
                volume.connect(context.destination);
                oscillator.onended = () => {
                    oscillator.disconnect();
                    volume.disconnect();
                };
                oscillator.start(start);
                oscillator.stop(start + duration + 0.01);
            }
        } catch {
            /* Kegagalan audio tidak mengubah status resi. */
        }
    };
    if (context.state === 'suspended')
        void context
            .resume()
            .then(beep)
            .catch(() => undefined);
    else beep();
}

export function playScanAccepted(): void {
    lastError = -Infinity;
    lastDuplicate = -Infinity;
    feedback('accepted');
}
export function playScanSuccess(): void {
    lastError = -Infinity;
    feedback('success');
}
export function playScanError(): void {
    if (performance.now() - lastError < 500) return;
    lastError = performance.now();
    feedback('error');
}
export function playScanDuplicate(): void {
    if (performance.now() - lastDuplicate < 500) return;
    lastDuplicate = performance.now();
    feedback('duplicate');
}
export function testScanVibration(): void {
    feedback('vibration');
}
export function testScanSound(kind: 'success' | 'error'): void {
    feedback(kind, true);
}

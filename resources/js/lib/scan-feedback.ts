import { Capacitor, registerPlugin } from '@capacitor/core';

const nativeFeedback = registerPlugin<{ success(): Promise<void> }>(
    'ScanFeedback',
);

let audio: AudioContext | undefined;
let lastError = -Infinity;

export function primeScanAudio(): void {
    try {
        audio ??= new AudioContext();
        if (audio.state === 'suspended')
            void audio.resume().catch(() => undefined);
    } catch {
        // Visual feedback remains available when audio is unavailable.
    }
}

export function playScanSuccess(): void {
    if (
        Capacitor.isNativePlatform() &&
        Capacitor.isPluginAvailable('ScanFeedback')
    ) {
        void nativeFeedback.success().catch(playWebScanSuccess);
        return;
    }
    playWebScanSuccess();
}

function playWebScanSuccess(): void {
    try {
        navigator.vibrate?.(40);
    } catch {
        // Feedback must never interrupt recording a resi.
    }
    primeScanAudio();
    if (!audio) return;
    const context = audio;
    const beep = () => {
        if (context.state !== 'running') return;
        try {
            const oscillator = context.createOscillator();
            const volume = context.createGain();
            const start = context.currentTime;
            oscillator.type = 'sine';
            oscillator.frequency.value = 1046;
            volume.gain.setValueAtTime(0.12, start);
            volume.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
            oscillator.connect(volume);
            volume.connect(context.destination);
            oscillator.onended = () => {
                oscillator.disconnect();
                volume.disconnect();
            };
            oscillator.start(start);
            oscillator.stop(start + 0.11);
        } catch {
            // The saved resi and visual confirmation remain available.
        }
    };
    if (context.state === 'suspended') {
        void context
            .resume()
            .then(beep)
            .catch(() => undefined);
    } else {
        beep();
    }
}

export function playScanError(): void {
    primeScanAudio();
    if (
        !audio ||
        audio.state !== 'running' ||
        performance.now() - lastError < 700
    )
        return;
    lastError = performance.now();
    for (const [index, frequency] of [240, 180].entries()) {
        const oscillator = audio.createOscillator();
        const volume = audio.createGain();
        const start = audio.currentTime + index * 0.16;
        oscillator.type = 'triangle';
        oscillator.frequency.value = frequency;
        volume.gain.setValueAtTime(0.12, start);
        volume.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
        oscillator.connect(volume);
        volume.connect(audio.destination);
        oscillator.onended = () => {
            oscillator.disconnect();
            volume.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + 0.13);
    }
}

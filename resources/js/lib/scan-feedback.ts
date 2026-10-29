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

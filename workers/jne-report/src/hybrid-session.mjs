import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ReportError } from './errors.mjs';

export function sessionClock(now = new Date()) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Jakarta',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(now)
            .map(({ type, value }) => [type, value]),
    );
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        paused: parts.hour === '00' && Number(parts.minute) < 30,
    };
}

export function assertSessionWindow(now) {
    if (sessionClock(now).paused) {
        throw new ReportError(
            'HYBRID_MIDNIGHT',
            'Sesi menunggu login ulang pukul 00:30 WIB.',
        );
    }
}

export function sessionDirectory(profile, config) {
    const identity = createHash('sha256')
        .update(new URL(profile.loginUrl).origin + '\n' + profile.username)
        .digest('hex')
        .slice(0, 20);
    return path.join(
        config.sessionDir || path.join(config.outputDir, '.sessions'),
        identity,
    );
}

export async function readSession(file, profile) {
    try {
        const state = JSON.parse(await readFile(file, 'utf8'));
        if (
            state.version !== 1 ||
            state.origin !== new URL(profile.loginUrl).origin ||
            state.username !== profile.username ||
            !/^[1-9]\d*$/.test(state.session || '') ||
            !Number.isFinite(Date.parse(state.authenticatedAt)) ||
            !Array.isArray(state.storage?.cookies)
        ) {
            return null;
        }
        return state;
    } catch (error) {
        if (error.code === 'ENOENT' || error instanceof SyntaxError) {
            return null;
        }
        throw error;
    }
}

export async function writeSession(file, value) {
    const temporary = file + '.tmp';
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, file);
}

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Session } from './types';
import { isBrowserPwa } from './platform';
import { activateBrowserAccount, clearBrowserDrafts } from './browser-local';

let browserSession: Session | null = null;

const vault = registerPlugin<{
    read(): Promise<{ value: string | null }>;
    write(options: { value: string }): Promise<void>;
    clear(): Promise<void>;
    lock(): Promise<void>;
    installation(): Promise<{ id: string }>;
    pushConfigured(): Promise<{ configured: boolean }>;
}>('SecureSession');

function nativeOnly() {
    if (!Capacitor.isNativePlatform())
        throw new Error(
            'Login aman hanya tersedia pada APK Android. Tidak ada penyimpanan token browser.',
        );
}
export async function readSession(): Promise<Session | null> {
    if (isBrowserPwa) {
        const { restoreBrowserSession } = await import('./browser-session');
        browserSession = await restoreBrowserSession();
        if (browserSession) {
            activateBrowserAccount(
                browserSession.user.id,
                browserSession.environment,
            );
        }
        return browserSession;
    }
    nativeOnly();
    const { value } = await vault.read();
    if (!value) return null;
    const session = JSON.parse(value) as Session;
    if (
        !session.token ||
        !session.user?.id ||
        !session.environment ||
        !session.expiresAt ||
        typeof session.locked !== 'boolean'
    ) {
        throw new Error('Sesi perangkat tidak valid.');
    }
    return session;
}
export async function writeSession(session: Session): Promise<void> {
    if (isBrowserPwa) {
        activateBrowserAccount(session.user.id, session.environment);
        browserSession = session;
        return;
    }
    nativeOnly();
    await vault.write({ value: JSON.stringify(session) });
}
export async function clearSession(): Promise<void> {
    if (isBrowserPwa) {
        browserSession = null;
        clearBrowserDrafts();
        return;
    }
    nativeOnly();
    await vault.clear();
}
export async function lockSession(): Promise<void> {
    if (isBrowserPwa) {
        if (browserSession)
            browserSession = { ...browserSession, locked: true };
        return;
    }
    nativeOnly();
    await vault.lock();
}
export async function installationId(): Promise<string> {
    if (isBrowserPwa) return 'browser-cookie-session';
    nativeOnly();
    return (await vault.installation()).id;
}
export async function pushConfigured(): Promise<boolean> {
    return (
        Capacitor.isNativePlatform() &&
        (await vault.pushConfigured()).configured
    );
}

import { me as mobileMe } from '@/routes/mobile';
import {
    store as mobileLogin,
    destroy as mobileLogout,
} from '@/routes/mobile/auth';
import { me } from '@/routes/retail';
import { store as login } from '@/routes/login';
import { logout } from '@/routes';
import { csrfCookie } from '@/routes/sanctum';
import { ApiError, apiOrigin } from './api';
import type { MeResult, Session } from './types';

function sessionFor(result: MeResult): Session {
    return {
        token: crypto.randomUUID(),
        user: result.data,
        environment: apiOrigin,
        expiresAt: '9999-01-01T00:00:00Z',
        timezone: result.meta.operational_timezone,
        locked: false,
    };
}

export function browserRoute(route: { url: string; method: string }) {
    const source = new URL(route.url, apiOrigin);
    const nativeBase = mobileMe.url().slice(0, -3);
    if (
        source.origin !== apiOrigin ||
        !source.pathname.startsWith(nativeBase + '/')
    )
        throw new Error('Route mobile tidak valid.');
    if (source.pathname === mobileLogin.url()) {
        if (route.method !== 'post')
            throw new Error('Metode login tidak valid.');
        return login();
    }
    if (source.pathname === mobileLogout.url()) {
        if (route.method !== 'delete')
            throw new Error('Metode logout tidak valid.');
        return logout();
    }
    return {
        method: route.method,
        url:
            me.url().slice(0, -3) +
            source.pathname.slice(nativeBase.length) +
            source.search,
    };
}

async function cookieFetch(
    route: { url: string; method: string },
    signal: AbortSignal,
    body?: Record<string, unknown> | FormData,
    responseType: 'json' | 'blob' = 'json',
) {
    const token = document.cookie
        .split('; ')
        .find((part) => part.startsWith('XSRF-TOKEN='))
        ?.slice(11);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) controller.abort();
    const timeout = setTimeout(abort, 30_000);
    let response: Response;
    try {
        response = await fetch(route.url, {
            method: route.method.toUpperCase(),
            credentials: 'same-origin',
            cache: 'no-store',
            redirect: 'error',
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                ...(token ? { 'X-XSRF-TOKEN': decodeURIComponent(token) } : {}),
                ...(body && !(body instanceof FormData)
                    ? { 'Content-Type': 'application/json' }
                    : {}),
            },
            body:
                body instanceof FormData
                    ? body
                    : body
                      ? JSON.stringify(body)
                      : undefined,
        });
    } catch (error) {
        if (signal.aborted) throw error;
        throw new ApiError(
            0,
            'Server belum dapat dihubungi. Periksa hasil sebelum mencoba lagi.',
        );
    } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
    }
    if (response.ok && responseType === 'blob') return response.blob();
    const data = await response.json().catch(() => null);
    if (!response.ok)
        throw new ApiError(
            response.status,
            response.status >= 500
                ? 'Server sedang bermasalah. Periksa hasil sebelum mencoba lagi.'
                : data?.message || 'Permintaan belum berhasil.',
            data?.errors,
        );
    return data;
}

export async function restoreBrowserSession(): Promise<Session | null> {
    try {
        return sessionFor(
            (await cookieFetch(me(), new AbortController().signal)) as MeResult,
        );
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
    }
}

export async function browserRequest<T>(
    route: { url: string; method: string },
    session: Session | null,
    signal: AbortSignal,
    body?: Record<string, unknown> | FormData,
    revoking = false,
    responseType: 'json' | 'blob' = 'json',
): Promise<T> {
    if (typeof window !== 'undefined' && !window.isSecureContext)
        throw new ApiError(
            0,
            'Gunakan HTTPS untuk masuk dan menggunakan kamera.',
        );
    const isLogout =
        revoking &&
        route.url === mobileLogout.url() &&
        route.method === 'delete';
    if (session?.locked && !isLogout)
        throw new ApiError(
            403,
            'Sesi terkunci. Selesaikan keluar saat online.',
        );
    if (session && session.environment !== apiOrigin)
        throw new ApiError(403, 'Sesi berasal dari environment lain.');
    const destination = browserRoute(route);
    if (route.url === mobileLogin.url()) {
        await cookieFetch(csrfCookie(), signal);
    }
    let result;
    try {
        result = await cookieFetch(destination, signal, body, responseType);
    } catch (error) {
        if (!isLogout || !(error instanceof ApiError) || error.status !== 419)
            throw error;
        await cookieFetch(csrfCookie(), signal);
        result = await cookieFetch(destination, signal, body, responseType);
    }
    if (route.url === mobileLogin.url()) {
        if (result?.two_factor) {
            throw new ApiError(
                409,
                'Lanjutkan verifikasi dua langkah untuk masuk.',
            );
        }
        const current = sessionFor(
            (await cookieFetch(me(), signal)) as MeResult,
        );
        return {
            data: {
                token: current.token,
                user: current.user,
                expires_at: current.expiresAt,
            },
            meta: { operational_timezone: current.timezone },
        } as T;
    }
    if (isLogout) return { data: null } as T;
    return result as T;
}

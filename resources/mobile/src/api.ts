import type { Session } from './types';
import { destroy } from '@/routes/mobile/auth';

export const apiOrigin = __API_ORIGIN__;
export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        public errors: Record<string, string[]> = {},
    ) {
        super(message);
    }
}

export function userFacingError(error: unknown, login = false): string {
    if (!(error instanceof ApiError))
        return error instanceof Error
            ? error.message
            : 'Permintaan belum berhasil. Periksa koneksi dan coba lagi.';
    if (error.status === 401)
        return login
            ? 'Email atau password belum sesuai. Periksa lalu coba lagi.'
            : 'Sesi berakhir. Masuk kembali untuk melanjutkan. Draft tetap tersimpan.';
    if (error.status === 403)
        return 'Akses tidak tersedia untuk akun ini. Periksa akun atau hubungi Admin. Draft tetap tersimpan.';
    if (error.status === 0)
        return 'Server belum dapat dihubungi. Periksa koneksi; cek hasil pengiriman sebelum mencoba lagi.';
    if (error.status === 413)
        return 'Ukuran bukti terlalu besar. Periksa batas file sebelum mengirim ulang.';
    if (error.status === 429)
        return 'Terlalu banyak permintaan. Tunggu sebentar sebelum mencoba lagi.';
    if (error.status >= 500)
        return 'Server sedang bermasalah. Data tetap tersimpan; periksa hasil sebelum mengirim ulang.';
    return error.message;
}

export async function request<T>(
    route: { url: string; method: string },
    session: Session | null,
    signal: AbortSignal,
    body?: Record<string, unknown> | FormData,
    logout = false,
    responseType: 'json' | 'blob' = 'json',
): Promise<T> {
    const revoking =
        logout &&
        route.method.toLowerCase() === 'delete' &&
        route.url === destroy.url();
    if (session?.locked && !revoking)
        throw new ApiError(
            403,
            'Sesi terkunci di perangkat. Selesaikan logout saat online.',
        );
    if (session && session.environment !== apiOrigin)
        throw new ApiError(403, 'Sesi berasal dari environment lain.');
    const url = new URL(route.url, apiOrigin);
    if (url.origin !== apiOrigin || !url.pathname.startsWith('/api/mobile/v1/'))
        throw new Error('Route mobile tidak valid.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) controller.abort();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
        const response = await fetch(url, {
            method: route.method.toUpperCase(),
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error',
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                ...(session
                    ? { Authorization: `Bearer ${session.token}` }
                    : {}),
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
        if (response.ok && responseType === 'blob')
            return (await response.blob()) as T;
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) {
            const error = data as {
                message?: string;
                errors?: Record<string, string[]>;
            } | null;
            throw new ApiError(
                response.status,
                response.status === 404
                    ? 'Data tidak tersedia untuk akun ini. Kembali ke daftar atau periksa hak akses.'
                    : response.status >= 500
                      ? 'Server belum dapat memproses permintaan. Periksa hasil di server sebelum mencoba lagi.'
                      : error?.message ||
                        `Permintaan gagal (${response.status}).`,
                error?.errors,
            );
        }
        if (!data)
            throw new ApiError(502, 'Respons server tidak dapat dibaca.');
        return data as T;
    } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof ApiError) throw error;
        throw new ApiError(
            0,
            'Server belum dapat dihubungi atau permintaan timeout. Periksa koneksi lalu coba lagi.',
        );
    } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', abort);
    }
}

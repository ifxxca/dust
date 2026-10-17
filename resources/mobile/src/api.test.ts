import { afterEach, expect, test, vi } from 'vitest';
import { ApiError, apiOrigin, request, userFacingError } from './api';
import type { Session } from './types';

const session: Session = {
    token: 'test-only-secret',
    user: { id: 1, name: 'Staff', role: 'pickup_staff', is_active: true },
    environment: apiOrigin,
    timezone: 'Asia/Jakarta',
    expiresAt: '2099-01-01',
    locked: false,
};

test('operational errors give recovery guidance without changing status or validation details', () => {
    const conflict = new ApiError(
        409,
        'Task sudah berubah. Tinjau detail terbaru.',
    );
    expect(userFacingError(conflict)).toBe(conflict.message);
    expect(
        userFacingError(new ApiError(401, 'Unauthenticated'), true),
    ).toContain('Email atau password');
    expect(userFacingError(new ApiError(401, 'Unauthenticated'))).toContain(
        'Draft tetap tersimpan',
    );
    expect(userFacingError(new ApiError(0, 'timeout'))).toContain(
        'cek hasil pengiriman',
    );
    expect(
        userFacingError(new ApiError(502, 'private upstream error')),
    ).not.toContain('upstream');
    expect(userFacingError(new ApiError(413, 'too large'))).toContain(
        'Ukuran bukti',
    );
    expect(userFacingError(new ApiError(429, 'too many'))).toContain('Tunggu');
    expect(userFacingError(new ApiError(403, 'Forbidden'))).toContain(
        'hubungi Admin',
    );
    const invalid = new ApiError(422, 'Periksa jumlah paket.', {
        manual_hybrid: ['Maksimal 1.000.000.'],
    });
    expect(userFacingError(invalid)).toBe('Periksa jumlah paket.');
    expect(invalid.errors.manual_hybrid).toEqual(['Maksimal 1.000.000.']);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

test('mobile request carries bearer without cookies and maps field validation', async () => {
    const fetch = vi.fn().mockResolvedValue(
        new Response(
            JSON.stringify({
                message: 'Invalid input',
                errors: { email: ['Email invalid'] },
            }),
            { status: 422 },
        ),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(
        request(
            { url: '/api/mobile/v1/me', method: 'get' },
            session,
            new AbortController().signal,
        ),
    ).rejects.toMatchObject({
        status: 422,
        errors: { email: ['Email invalid'] },
    });
    expect(fetch.mock.calls[0][1]).toMatchObject({
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        headers: { Authorization: 'Bearer test-only-secret' },
    });
});

test('locked and cross environment sessions cannot reach business endpoints', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
        request(
            { url: '/api/mobile/v1/me', method: 'get' },
            { ...session, locked: true },
            new AbortController().signal,
        ),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
        request(
            { url: '/api/mobile/v1/me', method: 'get' },
            { ...session, environment: 'https://different.example' },
            new AbortController().signal,
        ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
        request(
            {
                url: 'https://different.example/api/mobile/v1/me',
                method: 'get',
            },
            session,
            new AbortController().signal,
        ),
    ).rejects.toThrow('Route mobile tidak valid');
    expect(fetch).not.toHaveBeenCalled();
});

test('explicit logout can revoke a locally locked credential', async () => {
    vi.stubGlobal(
        'fetch',
        vi
            .fn()
            .mockResolvedValue(
                new Response(JSON.stringify({ data: null }), { status: 200 }),
            ),
    );
    await expect(
        request(
            { url: '/api/mobile/v1/auth/token', method: 'delete' },
            { ...session, locked: true },
            new AbortController().signal,
            undefined,
            true,
        ),
    ).resolves.toEqual({ data: null });
});

test('logout override cannot send a locked token to other endpoints', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
        request(
            { url: '/api/mobile/v1/me', method: 'get' },
            { ...session, locked: true },
            new AbortController().signal,
            undefined,
            true,
        ),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetch).not.toHaveBeenCalled();
});

test('non JSON server errors preserve HTTP status instead of reporting empty success', async () => {
    vi.stubGlobal(
        'fetch',
        vi
            .fn()
            .mockResolvedValue(
                new Response('<html>Error</html>', { status: 502 }),
            ),
    );
    await expect(
        request(
            { url: '/api/mobile/v1/me', method: 'get' },
            session,
            new AbortController().signal,
        ),
    ).rejects.toMatchObject({ status: 502 });
});

test('JSON requests time out after 30 seconds without retrying', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
        (_url, options: RequestInit) =>
            new Promise((_resolve, reject) =>
                options.signal?.addEventListener('abort', () =>
                    reject(new DOMException('Aborted', 'AbortError')),
                ),
            ),
    );
    vi.stubGlobal('fetch', fetch);
    const result = request(
        { url: '/api/mobile/v1/me', method: 'get' },
        session,
        new AbortController().signal,
    );
    const assertion = expect(result).rejects.toMatchObject({ status: 0 });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
});

test.each([404, 500])(
    'HTTP %i retains status without exposing server implementation details',
    async (status) => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        message: 'SQLSTATE private internal detail',
                    }),
                    { status },
                ),
            ),
        );
        await expect(
            request(
                { url: '/api/mobile/v1/pickup-tasks/22', method: 'get' },
                session,
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({
            status,
            message:
                status === 404
                    ? 'Data tidak tersedia untuk akun ini. Kembali ke daftar atau periksa hak akses.'
                    : 'Server belum dapat memproses permintaan. Periksa hasil di server sebelum mencoba lagi.',
        });
        expect(fetch).toHaveBeenCalledTimes(1);
    },
);

import { afterEach, expect, test, vi } from 'vitest';
import {
    browserRequest,
    browserRoute,
    restoreBrowserSession,
} from './browser-session';

afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;
const current = {
    data: { id: 7, name: 'Petugas', role: 'pickup_staff', is_active: true },
    meta: { operational_timezone: 'Asia/Jakarta' },
};

test('browser routes retain numeric bindings and queries but reject a foreign origin', () => {
    expect(
        browserRoute({
            url: '/api/mobile/v1/pickup-tasks/18?mine=1&page=2',
            method: 'get',
        }),
    ).toEqual({
        url: '/m/api/v1/pickup-tasks/18?mine=1&page=2',
        method: 'get',
    });
    expect(() =>
        browserRoute({
            url: 'https://attacker.invalid/api/mobile/v1/me',
            method: 'get',
        }),
    ).toThrow('Route mobile tidak valid');
    expect(() =>
        browserRoute({ url: '/api/mobile/v1-sibling/me', method: 'get' }),
    ).toThrow('Route mobile tidak valid');
    expect(() =>
        browserRoute({ url: '/api/mobile/v1/auth/token', method: 'get' }),
    ).toThrow('Metode logout tidak valid');
});

test('login uses cookie credentials and CSRF without a bearer token and restores only the account', async () => {
    vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=encoded%3Dtoken' });
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(Response.json({ data: current.data }))
        .mockResolvedValueOnce(Response.json(current));
    vi.stubGlobal('fetch', fetch);
    const result = await browserRequest<{
        data: { user: { id: number }; token: string };
    }>({ url: '/api/mobile/v1/auth/tokens', method: 'post' }, null, signal(), {
        email: 'staff@example.test',
        password: 'fixture',
    });
    expect(result.data.user.id).toBe(7);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        '/sanctum/csrf-cookie',
        '/login',
        '/m/api/v1/me',
    ]);
    expect(fetch.mock.calls[1][1]).toMatchObject({
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'X-XSRF-TOKEN': 'encoded=token' },
    });
    expect(fetch.mock.calls[1][1].headers).not.toHaveProperty('Authorization');
});

test('expired sessions return to login but forbidden accounts and interrupted requests remain distinguishable', async () => {
    vi.stubGlobal('document', { cookie: '' });
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json({}, { status: 401 }))
        .mockResolvedValueOnce(Response.json({}, { status: 403 }))
        .mockRejectedValueOnce(new TypeError('offline'));
    vi.stubGlobal('fetch', fetch);
    expect(await restoreBrowserSession()).toBeNull();
    await expect(restoreBrowserSession()).rejects.toMatchObject({
        status: 403,
    });
    await expect(restoreBrowserSession()).rejects.toMatchObject({ status: 0 });
    expect(fetch).toHaveBeenCalledTimes(3);
});

test('state changing failures preserve 419 and validation details without automatic resubmission', async () => {
    vi.stubGlobal('document', { cookie: '' });
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(
            Response.json({ message: 'Sesi berakhir' }, { status: 419 }),
        )
        .mockResolvedValueOnce(
            Response.json(
                {
                    message: 'Resi tidak valid',
                    errors: { awbs: ['Periksa resi'] },
                },
                { status: 422 },
            ),
        );
    vi.stubGlobal('fetch', fetch);
    await expect(
        browserRequest(
            { url: '/api/mobile/v1/handovers', method: 'post' },
            null,
            signal(),
            {},
        ),
    ).rejects.toMatchObject({ status: 419 });
    await expect(
        browserRequest(
            { url: '/api/mobile/v1/handovers', method: 'post' },
            null,
            signal(),
            {},
        ),
    ).rejects.toMatchObject({
        status: 422,
        errors: { awbs: ['Periksa resi'] },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
});

test('logout uses the existing CSRF cookie so an account disabled by an administrator can still leave', async () => {
    vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=fixture' });
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ data: null }));
    vi.stubGlobal('fetch', fetch);
    await browserRequest(
        { url: '/api/mobile/v1/auth/token', method: 'delete' },
        null,
        signal(),
        undefined,
        true,
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe('/logout');
});

test('only logout may refresh an expired CSRF cookie and repeat the idempotent logout', async () => {
    vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=expired' });
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json({}, { status: 419 }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(Response.json({ data: null }));
    vi.stubGlobal('fetch', fetch);
    await browserRequest(
        { url: '/api/mobile/v1/auth/token', method: 'delete' },
        null,
        signal(),
        undefined,
        true,
    );
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        '/logout',
        '/sanctum/csrf-cookie',
        '/logout',
    ]);
});

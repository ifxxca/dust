import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, test, vi } from 'vitest';

function worker() {
    const handlers = new Map<
        string,
        (event: Record<string, unknown>) => void
    >();
    const cache = {
        put: vi.fn(),
        match: vi.fn().mockResolvedValue(new Response('public shell')),
    };
    const caches = {
        open: vi.fn().mockResolvedValue(cache),
        keys: vi
            .fn()
            .mockResolvedValue(['retail-shell-old', 'unrelated-cache']),
        delete: vi.fn(),
    };
    const fetch = vi.fn().mockResolvedValue(new Response('public asset'));
    const self = {
        location: { origin: 'https://fixture.invalid' },
        addEventListener: (
            name: string,
            handler: (event: Record<string, unknown>) => void,
        ) => handlers.set(name, handler),
        clients: { claim: vi.fn() },
        skipWaiting: vi.fn(),
    };
    const source = readFileSync('resources/mobile/pwa-worker.js', 'utf8')
        .replace('__VERSION__', 'fixture')
        .replace(
            '__ASSETS__',
            JSON.stringify(['/retail/index.html', '/retail/assets/app.js']),
        );
    vm.runInNewContext(source, { self, caches, fetch, URL });
    return { handlers, cache, caches, fetch, self };
}

test('service worker never intercepts operational API authentication evidence or submissions', () => {
    const fixture = worker();
    for (const [url, method, mode] of [
        ['/m/api/v1/me', 'GET', 'cors'],
        ['/m/api/v1/pickup-evidence/1', 'GET', 'cors'],
        ['/m/api/v1/pickup-tasks/1/proof', 'POST', 'cors'],
        ['/login', 'POST', 'cors'],
        ['/m/api/v1/handovers', 'GET', 'navigate'],
    ]) {
        const respondWith = vi.fn();
        fixture.handlers.get('fetch')!({
            request: { url: `https://fixture.invalid${url}`, method, mode },
            respondWith,
        });
        expect(respondWith).not.toHaveBeenCalled();
    }
    expect(fixture.cache.put).not.toHaveBeenCalled();
});

test('offline navigation returns only the public shell and never stores server navigation responses', async () => {
    const fixture = worker();
    fixture.fetch.mockRejectedValueOnce(new TypeError('offline'));
    let result: Promise<Response> | undefined;
    fixture.handlers.get('fetch')!({
        request: {
            url: 'https://fixture.invalid/m',
            method: 'GET',
            mode: 'navigate',
        },
        respondWith: (response: Promise<Response>) => {
            result = response;
        },
    });
    expect(await (await result!).text()).toBe('public shell');
    expect(fixture.cache.put).not.toHaveBeenCalled();
});

test('precache omits credentials and activation deletes only previous retail shell caches', async () => {
    const fixture = worker();
    let pending: Promise<unknown> | undefined;
    const waitUntil = (promise: Promise<unknown>) => {
        pending = promise;
    };
    fixture.handlers.get('install')!({ waitUntil });
    await pending;
    expect(fixture.fetch.mock.calls).toEqual([
        [
            '/retail/index.html',
            { cache: 'reload', credentials: 'omit', redirect: 'error' },
        ],
        [
            '/retail/assets/app.js',
            { cache: 'reload', credentials: 'omit', redirect: 'error' },
        ],
    ]);
    fixture.handlers.get('activate')!({ waitUntil });
    await pending;
    expect(fixture.caches.delete).toHaveBeenCalledExactlyOnceWith(
        'retail-shell-old',
    );
    expect(fixture.self.skipWaiting).not.toHaveBeenCalled();
    fixture.handlers.get('message')!({ data: 'ACTIVATE_UPDATE' });
    expect(fixture.self.skipWaiting).toHaveBeenCalledOnce();
});

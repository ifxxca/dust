const CACHE = 'retail-shell-__VERSION__';
const ASSETS = __ASSETS__;
const SHELL = '/retail/index.html';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then(async (cache) => {
            for (const url of ASSETS) {
                const response = await fetch(url, {
                    cache: 'reload',
                    credentials: 'omit',
                    redirect: 'error',
                });
                if (!response.ok)
                    throw new Error('Aset aplikasi belum lengkap.');
                await cache.put(url, response);
            }
        }),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            for (const name of await caches.keys()) {
                if (name.startsWith('retail-shell-') && name !== CACHE)
                    await caches.delete(name);
            }
            await self.clients.claim();
        })(),
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || request.method !== 'GET') return;
    if (request.mode === 'navigate' && ['/m', '/m/'].includes(url.pathname)) {
        event.respondWith(
            fetch(request).catch(async () =>
                (await caches.open(CACHE)).match(SHELL),
            ),
        );
        return;
    }
    if (!url.search && ASSETS.includes(url.pathname)) {
        event.respondWith(
            caches
                .open(CACHE)
                .then(
                    async (cache) =>
                        (await cache.match(url.pathname)) || fetch(request),
                ),
        );
    }
});

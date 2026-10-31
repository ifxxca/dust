import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), ['MOBILE_', 'APP_URL']);
    const development = mode === 'development';
    const origin =
        env.MOBILE_API_URL ||
        env.APP_URL ||
        (development ? 'http://10.20.10.13:8000' : '');
    if (!origin)
        throw new Error(
            'APP_URL atau MOBILE_API_URL HTTPS harus ditetapkan sebelum build staging/pilot/release.',
        );
    const url = new URL(origin);
    if (
        url.protocol !== 'https:' &&
        !(
            development &&
            url.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '10.20.10.13'].includes(url.hostname)
        )
    ) {
        throw new Error(
            'Mobile API requires HTTPS; debug alone may use approved development hosts.',
        );
    }
    if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== '/'
    ) {
        throw new Error(
            'MOBILE_API_URL must be an origin without credentials or path.',
        );
    }

    return {
        root: 'resources/mobile',
        base: './',
        plugins: [
            react(),
            tailwindcss(),
            {
                name: 'mobile-api-origin',
                transformIndexHtml(html) {
                    return html
                        .replace(
                            '<head>',
                            `<head><meta name="mobile-build-mode" content="${mode}" />`,
                        )
                        .replace(
                            "connect-src 'self' https: http://127.0.0.1:8000;",
                            `connect-src 'self' ${url.origin};`,
                        );
                },
            },
        ],
        resolve: { alias: { '@': path.resolve('resources/js') } },
        define: { __API_ORIGIN__: JSON.stringify(url.origin) },
        build: {
            outDir: 'dist',
            emptyOutDir: true,
            target: 'es2020',
            cssTarget: 'chrome101',
        },
        server: { host: '127.0.0.1', port: 5174 },
    };
});

import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    root: 'resources/mobile',
    base: '/retail/',
    publicDir: 'pwa',
    plugins: [
        react(),
        tailwindcss(),
        {
            name: 'retail-pwa',
            enforce: 'post',
            transformIndexHtml(html) {
                return html
                    .replace('Retail Pickup Dev', 'Retail Operations')
                    .replace(
                        '</head>',
                        '<link rel="manifest" href="/retail/manifest.webmanifest" /><link rel="apple-touch-icon" href="/retail/icon-180.png" /><meta name="theme-color" content="#2563eb" /><meta name="apple-mobile-web-app-capable" content="yes" /><meta name="apple-mobile-web-app-status-bar-style" content="default" /></head>',
                    )
                    .replace(
                        "connect-src 'self' https: http://127.0.0.1:8000;",
                        "connect-src 'self' blob:;",
                    );
            },
            generateBundle(_, bundle) {
                const assets = Object.keys(bundle)
                    .filter((file) => /\.(js|css|svg|woff2?)$/.test(file))
                    .map((file) => `/retail/${file}`);
                assets.push(
                    '/retail/index.html',
                    '/retail/icon-180.png',
                    '/retail/icon-192.png',
                    '/retail/icon-512.png',
                    '/retail/manifest.webmanifest',
                );
                const template = readFileSync(
                    'resources/mobile/pwa-worker.js',
                    'utf8',
                );
                const hash = createHash('sha256')
                    .update(JSON.stringify(assets))
                    .update(template)
                    .update(readFileSync('resources/mobile/index.html'));
                for (const file of [
                    'manifest.webmanifest',
                    'icon-180.png',
                    'icon-192.png',
                    'icon-512.png',
                ])
                    hash.update(readFileSync(`resources/mobile/pwa/${file}`));
                const version = hash.digest('hex').slice(0, 16);
                const source = template
                    .replace('__VERSION__', version)
                    .replace('__ASSETS__', JSON.stringify(assets));
                this.emitFile({ type: 'asset', fileName: 'sw.js', source });
            },
        },
    ],
    resolve: { alias: { '@': path.resolve('resources/js') } },
    define: { __API_ORIGIN__: JSON.stringify(''), __BROWSER_PWA__: 'true' },
    build: {
        outDir: '../../public/retail',
        emptyOutDir: true,
        target: 'es2020',
        cssTarget: 'safari16',
    },
});

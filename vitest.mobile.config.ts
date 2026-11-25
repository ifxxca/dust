import path from 'node:path';
import { defineConfig } from 'vite-plus';

export default defineConfig({
    resolve: { alias: { '@': path.resolve('resources/js') } },
    define: {
        __API_ORIGIN__: JSON.stringify('https://fixture.invalid'),
        __BROWSER_PWA__: 'false',
    },
    test: {
        include: [
            'resources/mobile/src/**/*.test.{ts,tsx}',
            'resources/js/lib/awb-signatures.test.ts',
            'resources/js/lib/cashless-handover.test.ts',
            'resources/js/lib/scan-feedback.test.ts',
            'resources/js/lib/ui-conventions.test.ts',
        ],
        environment: 'node',
    },
});

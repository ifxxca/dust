import { beforeEach, expect, test, vi } from 'vitest';
import mobileConfig from '../../../vite.mobile.config';

const environment = vi.hoisted(() => ({
    values: {} as Record<string, string>,
}));

vi.mock('vite', async (importOriginal) => ({
    ...(await importOriginal<typeof import('vite')>()),
    loadEnv: () => environment.values,
}));

beforeEach(() => {
    environment.values = {};
});

async function resolveMobileConfig(mode = 'production') {
    if (typeof mobileConfig !== 'function') {
        throw new Error('Expected a mobile configuration factory.');
    }

    return await mobileConfig({ command: 'build', mode });
}

test('mobile builds use the application HTTPS origin without a separate mobile setting', async () => {
    environment.values = { APP_URL: 'https://retail.example.test' };

    const config = await resolveMobileConfig();

    expect(config.define?.__API_ORIGIN__).toBe('"https://retail.example.test"');
});

test('an explicit mobile origin overrides the application origin', async () => {
    environment.values = {
        APP_URL: 'https://retail.example.test',
        MOBILE_API_URL: 'https://mobile.example.test',
    };

    const config = await resolveMobileConfig();

    expect(config.define?.__API_ORIGIN__).toBe('"https://mobile.example.test"');
});

test('production builds reject an insecure application origin', async () => {
    environment.values = { APP_URL: 'http://localhost:8000' };

    await expect(resolveMobileConfig()).rejects.toThrow(
        'Mobile API requires HTTPS',
    );
});

test('development builds accept the default local application origin', async () => {
    environment.values = { APP_URL: 'http://localhost:8000' };

    const config = await resolveMobileConfig('development');

    expect(config.define?.__API_ORIGIN__).toBe('"http://localhost:8000"');
});

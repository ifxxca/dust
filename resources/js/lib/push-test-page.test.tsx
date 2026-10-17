import { afterEach, expect, test, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import PushTest from '../pages/push-test';
import { submissionKey } from './submission-key';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    useHttp: () => ({ processing: false, response: null, errors: {} }),
}));

afterEach(() => vi.unstubAllGlobals());

test('admin push page renders on HTTP LAN without crypto.randomUUID', () => {
    const getRandomValues = globalThis.crypto.getRandomValues.bind(
        globalThis.crypto,
    );
    vi.stubGlobal('crypto', { getRandomValues });

    const html = renderToString(<PushTest enabled configured />);

    expect(html).toContain('Tes Push Notifikasi');
    expect(html).toContain('Kirim Tes Notifikasi');
});

test('HTTP fallback produces fresh valid UUID submission keys using Web Crypto', () => {
    const getRandomValues = globalThis.crypto.getRandomValues.bind(
        globalThis.crypto,
    );
    vi.stubGlobal('crypto', { getRandomValues });

    const first = submissionKey();
    const next = submissionKey();

    const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(first).toMatch(uuid);
    expect(next).toMatch(uuid);
    expect(next).not.toBe(first);
});

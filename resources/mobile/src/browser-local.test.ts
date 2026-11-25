import { afterEach, expect, test } from 'vitest';
import {
    activateBrowserAccount,
    BrowserLocal,
    clearBrowserDrafts,
} from './browser-local';

afterEach(clearBrowserDrafts);
const scope = {
    account: '1',
    environment: 'https://fixture.invalid',
    name: 'draft-1',
};

test('temporary drafts are isolated by account and environment and removed at logout', async () => {
    const local = new BrowserLocal();
    activateBrowserAccount(1, scope.environment);
    await local.write({ ...scope, value: JSON.stringify({ taskId: 1 }) });
    expect(await local.read(scope)).toEqual({ value: '{"taskId":1}' });
    expect(await local.list(scope)).toEqual({ names: ['draft-1'] });
    await expect(local.read({ ...scope, account: '2' })).rejects.toThrow(
        'Draft tidak tersedia',
    );
    await expect(
        local.read({ ...scope, environment: 'https://another.invalid' }),
    ).rejects.toThrow('Draft tidak tersedia');
    clearBrowserDrafts();
    await expect(local.read(scope)).rejects.toThrow('Draft tidak tersedia');
    activateBrowserAccount(1, scope.environment);
    expect(await local.read(scope)).toEqual({ value: null });
});

test('switching accounts clears old drafts and missing evidence is recoverable without fabricated data', async () => {
    const local = new BrowserLocal();
    activateBrowserAccount(1, scope.environment);
    await local.write({ ...scope, value: '{}' });
    activateBrowserAccount(2, scope.environment);
    activateBrowserAccount(1, scope.environment);
    expect(await local.list(scope)).toEqual({ names: [] });
    await expect(local.evidence(scope)).rejects.toThrow(
        'Ambil ulang foto atau tanda tangan',
    );
    await expect(
        local.importPhoto({ ...scope, uri: 'blob:foreign' }),
    ).rejects.toThrow('Foto tidak berasal');
});

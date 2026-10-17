import { afterEach, expect, test, vi } from 'vitest';
import type { Session } from './types';
const native = vi.hoisted(() => ({
    read: vi.fn(),
    write: vi.fn(),
    remove: vi.fn(),
    preview: vi.fn(),
    evidence: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => native }));
import { evidencePreview, readLocal } from './local-store';

const session: Session = {
    token: 'fixture',
    user: { id: 1, name: 'Fixture', role: 'pickup_staff', is_active: true },
    environment: 'https://fixture.invalid',
    expiresAt: '2035-01-01T00:00:00Z',
    locked: false,
    timezone: 'Asia/Jakarta',
};
afterEach(() => vi.resetAllMocks());

test('absent local record is distinct from an unreadable encrypted record', async () => {
    native.read.mockResolvedValueOnce({ value: null });
    expect(await readLocal(session, 'task-1-operation')).toBeNull();
    native.read.mockRejectedValueOnce(new Error('LOCAL_DATA_UNREADABLE'));
    await expect(readLocal(session, 'task-1-operation')).rejects.toThrow(
        'LOCAL_DATA_UNREADABLE',
    );
    expect(native.write).not.toHaveBeenCalled();
    expect(native.remove).not.toHaveBeenCalled();
});
test.each(['false', '0', 'null', '[]', 'invalid-json'])(
    'malformed recovery %s cannot be treated as absent or deleted',
    async (value) => {
        native.read.mockResolvedValue({ value });
        await expect(readLocal(session, 'task-1-operation')).rejects.toThrow(
            'Format data lokal belum didukung. Data tidak dihapus; hubungi support.',
        );
        expect(native.write).not.toHaveBeenCalled();
        expect(native.remove).not.toHaveBeenCalled();
    },
);

test('photo thumbnails request a scoped sampled preview without transferring original evidence', async () => {
    native.preview.mockResolvedValue({
        base64: 'fixture',
        mime: 'image/jpeg',
        width: 400,
        height: 300,
    });
    const photo = {
        name: 'evidence-photo',
        kind: 'photo' as const,
        mime: 'image/jpeg',
        bytes: 5000000,
        sha256: 'a'.repeat(64),
    };
    expect(await evidencePreview(session, photo, 'thumbnail')).toBe(
        'data:image/jpeg;base64,fixture',
    );
    expect(native.preview).toHaveBeenCalledWith({
        account: '1',
        environment: session.environment,
        name: photo.name,
        sha256: photo.sha256,
        size: 'thumbnail',
    });
    expect(native.evidence).not.toHaveBeenCalled();
    expect(native.write).not.toHaveBeenCalled();
    expect(native.remove).not.toHaveBeenCalled();
});

test.each([
    { mime: 'text/html', width: 300, height: 200 },
    { mime: 'image/jpeg', width: 12000, height: 8000 },
    { mime: 'image/png', width: 0, height: 0 },
    { mime: 'image/jpeg', width: -1, height: 200 },
])(
    'invalid sampled preview metadata is rejected without deleting evidence: %j',
    async (image) => {
        native.preview.mockResolvedValue({ ...image, base64: 'fixture' });
        await expect(
            evidencePreview(
                session,
                {
                    name: 'evidence-photo',
                    kind: 'photo',
                    mime: 'image/png',
                    bytes: 1024,
                    sha256: 'a'.repeat(64),
                },
                'thumbnail',
            ),
        ).rejects.toThrow('Bukti asli tetap tersimpan');
        expect(native.remove).not.toHaveBeenCalled();
    },
);

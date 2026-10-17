import { registerPlugin } from '@capacitor/core';
import type { Session } from './types';
export type LocalEvidence = {
    name: string;
    kind: 'photo' | 'signature';
    mime: string;
    bytes: number;
    sha256: string;
};
type Scope = { account: string; environment: string; name: string };
const local = registerPlugin<{
    read(options: {
        account: string;
        environment: string;
        name: string;
    }): Promise<{ value: string | null }>;
    write(options: {
        account: string;
        environment: string;
        name: string;
        value: string;
    }): Promise<void>;
    remove(options: {
        account: string;
        environment: string;
        name: string;
    }): Promise<void>;
    list(options: Scope): Promise<{ names: string[] }>;
    importPhoto(
        options: Scope & { uri: string; operationId: string },
    ): Promise<LocalEvidence>;
    signature(options: Scope & { base64: string }): Promise<LocalEvidence>;
    evidence(options: Scope): Promise<{ base64: string; sha256: string }>;
    preview(
        options: Scope & { sha256: string; size: 'thumbnail' | 'fullscreen' },
    ): Promise<{ base64: string; mime: string; width: number; height: number }>;
    cleanupCamera(options: Scope & { uri: string }): Promise<void>;
    chooseFromGallery(
        options: Scope & { operationId: string },
    ): Promise<{ uri: string }>;
    beginCapture(
        options: Scope & {
            taskId: number;
            draftId: string;
            operationId: string;
            method: string;
        },
    ): Promise<void>;
    captureResult(options: {
        uri: string;
        method: string;
        operationId?: string;
    }): Promise<void>;
    finishCapture(options: Scope & { operationId: string }): Promise<void>;
    captureFailure(options: { method: string }): Promise<void>;
}>('MobileLocal');
const scope = (session: Session, name: string) => ({
    account: String(session.user.id),
    environment: session.environment,
    name,
});
const writes = new Map<string, Promise<void>>();
const key = (session: Session, name: string) =>
    `${session.environment}:${session.user.id}:${name}`;
function serialize(
    session: Session,
    name: string,
    action: () => Promise<void>,
): Promise<void> {
    const id = key(session, name);
    const operation = (writes.get(id) || Promise.resolve())
        .catch(() => undefined)
        .then(action);
    writes.set(id, operation);
    void operation
        .finally(() => {
            if (writes.get(id) === operation) writes.delete(id);
        })
        .catch(() => undefined);
    return operation;
}
export async function readLocal<T>(
    session: Session,
    name: string,
): Promise<T | null> {
    await writes.get(key(session, name))?.catch(() => undefined);
    const { value } = await local.read(scope(session, name));
    if (value === null) return null;
    let decoded: unknown;
    try {
        decoded = JSON.parse(value);
    } catch {
        throw new Error(
            'Format data lokal belum didukung. Data tidak dihapus; hubungi support.',
        );
    }
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded))
        throw new Error(
            'Format data lokal belum didukung. Data tidak dihapus; hubungi support.',
        );
    return decoded as T;
}
export async function writeLocal(
    session: Session,
    name: string,
    value: unknown,
) {
    const valueJson = JSON.stringify(value);
    await serialize(session, name, () =>
        local.write({
            ...scope(session, name),
            value: valueJson,
        }),
    );
}
export async function removeLocal(session: Session, name: string) {
    await serialize(session, name, () => local.remove(scope(session, name)));
}
export async function localNames(session: Session): Promise<string[]> {
    return (await local.list(scope(session, 'index'))).names;
}
export async function importPhoto(
    session: Session,
    name: string,
    uri: string,
    operationId: string,
) {
    return local.importPhoto({ ...scope(session, name), uri, operationId });
}
export async function chooseGallery(
    session: Session,
    operationId: string,
): Promise<{ uri: string }> {
    return local.chooseFromGallery({
        ...scope(session, 'camera'),
        operationId,
    });
}
export async function persistSignature(
    session: Session,
    name: string,
    dataUrl: string,
) {
    return local.signature({
        ...scope(session, name),
        base64: dataUrl.split(',')[1] || '',
    });
}
export async function evidenceBlob(
    session: Session,
    evidence: LocalEvidence,
): Promise<Blob> {
    const stored = await local.evidence(scope(session, evidence.name));
    if (stored.sha256 !== evidence.sha256)
        throw new Error('Checksum bukti berubah; draft dipertahankan.');
    const decoded = atob(stored.base64);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    if (bytes.length !== evidence.bytes)
        throw new Error('Ukuran bukti berubah.');
    return new Blob([bytes], { type: evidence.mime });
}
export async function cleanupCamera(session: Session, uri: string) {
    await local.cleanupCamera({ ...scope(session, 'camera'), uri });
}
export async function evidencePreview(
    session: Session,
    evidence: LocalEvidence,
    size: 'thumbnail' | 'fullscreen',
): Promise<string> {
    const image = await local.preview({
        ...scope(session, evidence.name),
        sha256: evidence.sha256,
        size,
    });
    if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(image.mime) ||
        !Number.isInteger(image.width) ||
        !Number.isInteger(image.height) ||
        image.width <= 0 ||
        image.height <= 0 ||
        Math.max(image.width, image.height) >
            (size === 'thumbnail' ? 512 : 1600)
    )
        throw new Error(
            'Pratinjau foto belum dapat dibaca. Bukti asli tetap tersimpan.',
        );
    return `data:${image.mime};base64,${image.base64}`;
}
export async function beginCapture(
    session: Session,
    name: string,
    taskId: number,
    draftId: string,
    operationId: string,
    method: string,
) {
    await local.beginCapture({
        ...scope(session, name),
        taskId,
        draftId,
        operationId,
        method,
    });
}
export async function captureResult(
    uri: string,
    method: string,
    operationId?: string,
) {
    await local.captureResult({ uri, method, operationId });
}
export async function finishCapture(session: Session, operationId: string) {
    await local.finishCapture({ ...scope(session, 'camera'), operationId });
}
export async function captureFailure(method: string) {
    await local.captureFailure({ method });
}

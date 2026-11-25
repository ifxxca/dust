import type { LocalEvidence } from './local-store';

type Scope = { account: string; environment: string; name: string };
const records = new Map<string, string>();
const captures = new Set<string>();
let activeAccount = '';
let generation = 0;

export function activateBrowserAccount(account: number, environment: string) {
    const next = `${environment}:${account}:`;
    if (activeAccount !== next) clearBrowserDrafts();
    activeAccount = next;
}

export function clearBrowserDrafts() {
    generation++;
    records.clear();
    for (const uri of captures) URL.revokeObjectURL(uri);
    captures.clear();
    activeAccount = '';
}

export function browserHasDrafts(): boolean {
    return [...records.keys()].some((id) =>
        /:(pop-\d+|task-\d+-operation|manual-pickup|handover-operation|cashless-handover)$/.test(
            id,
        ),
    );
}

function key(scope: Scope): string {
    const prefix = `${scope.environment}:${scope.account}:`;
    if (!activeAccount || prefix !== activeAccount)
        throw new Error('Draft tidak tersedia untuk sesi ini.');
    return prefix + scope.name;
}

async function dataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') resolve(reader.result);
            else reject(new Error('Foto belum dapat dibaca.'));
        };
        reader.onerror = () => reject(new Error('Foto belum dapat dibaca.'));
        reader.readAsDataURL(blob);
    });
}

function base64Blob(base64: string, mime: string): Blob {
    const decoded = atob(base64);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index++)
        bytes[index] = decoded.charCodeAt(index);
    return new Blob([bytes], { type: mime });
}

async function resize(
    blob: Blob,
    limit: number,
): Promise<{ blob: Blob; width: number; height: number }> {
    const image = new Image();
    const uri = URL.createObjectURL(blob);
    try {
        image.src = uri;
        await image.decode();
        const ratio = Math.min(
            1,
            limit / Math.max(image.naturalWidth, image.naturalHeight),
        );
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Pemrosesan foto tidak tersedia.');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const result = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
                (file) =>
                    file
                        ? resolve(file)
                        : reject(new Error('Foto gagal diproses.')),
                'image/jpeg',
                0.85,
            ),
        );
        return { blob: result, width: canvas.width, height: canvas.height };
    } finally {
        URL.revokeObjectURL(uri);
    }
}

async function saveEvidence(
    scope: Scope,
    blob: Blob,
    kind: LocalEvidence['kind'],
): Promise<LocalEvidence> {
    const id = key(scope);
    const epoch = generation;
    const digest = await crypto.subtle.digest(
        'SHA-256',
        await blob.arrayBuffer(),
    );
    const sha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
    const base64 = (await dataUrl(blob)).split(',')[1];
    if (epoch !== generation || id !== key(scope))
        throw new Error('Sesi berubah. Pilih bukti kembali.');
    records.set(id, JSON.stringify({ base64, sha256, mime: blob.type }));
    return {
        name: scope.name,
        kind,
        mime: blob.type,
        bytes: blob.size,
        sha256,
    };
}

export function chooseBrowserPhoto(
    source: 'camera' | 'gallery',
): Promise<{ uri: string }> {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
        if (source === 'camera') input.setAttribute('capture', 'environment');
        input.hidden = true;
        document.body.append(input);
        const account = activeAccount;
        const epoch = generation;
        const cleanup = () => {
            input.remove();
            window.removeEventListener('focus', focus);
        };
        const cancel = () => {
            cleanup();
            reject(
                Object.assign(new Error('Pemilihan foto dibatalkan.'), {
                    code: 'TakePhotoCancelled',
                }),
            );
        };
        const focus = () => {
            setTimeout(() => {
                if (input.isConnected && !input.files?.length) cancel();
            }, 1500);
        };
        input.addEventListener('cancel', cancel, { once: true });
        window.addEventListener('focus', focus, { once: true });
        input.addEventListener(
            'change',
            () => {
                const file = input.files?.[0];
                cleanup();
                if (
                    !file ||
                    epoch !== generation ||
                    account !== activeAccount
                ) {
                    reject(new Error('Sesi berubah atau foto tidak dipilih.'));
                    return;
                }
                if (
                    !file.type.startsWith('image/') ||
                    file.size > 25 * 1024 * 1024
                ) {
                    reject(
                        new Error(
                            'Pilih foto maksimal 25 MB. Jika HEIC gagal, gunakan JPEG.',
                        ),
                    );
                    return;
                }
                const uri = URL.createObjectURL(file);
                captures.add(uri);
                resolve({ uri });
            },
            { once: true },
        );
        input.click();
    });
}

export class BrowserLocal {
    async read(scope: Scope) {
        return { value: records.get(key(scope)) ?? null };
    }
    async write(scope: Scope & { value: string }) {
        records.set(key(scope), scope.value);
    }
    async remove(scope: Scope) {
        records.delete(key(scope));
    }
    async list(scope: Scope) {
        const prefix = key({ ...scope, name: '' });
        return {
            names: [...records.keys()]
                .filter((id) => id.startsWith(prefix))
                .map((id) => id.slice(prefix.length)),
        };
    }
    async importPhoto(scope: Scope & { uri: string }) {
        key(scope);
        if (!captures.has(scope.uri))
            throw new Error('Foto tidak berasal dari sesi ini.');
        const image = await resize(await (await fetch(scope.uri)).blob(), 1920);
        return saveEvidence(scope, image.blob, 'photo');
    }
    async signature(scope: Scope & { base64: string }) {
        return saveEvidence(
            scope,
            base64Blob(scope.base64, 'image/png'),
            'signature',
        );
    }
    async evidence(
        scope: Scope,
    ): Promise<{ base64: string; sha256: string; mime: string }> {
        const stored = records.get(key(scope));
        if (!stored)
            throw new Error(
                'Bukti sementara tidak tersedia. Ambil ulang foto atau tanda tangan.',
            );
        return JSON.parse(stored);
    }
    async preview(
        scope: Scope & { sha256: string; size: 'thumbnail' | 'fullscreen' },
    ) {
        const stored = await this.evidence(scope);
        if (stored.sha256 !== scope.sha256)
            throw new Error('Checksum bukti berubah.');
        const image = await resize(
            base64Blob(stored.base64, stored.mime),
            scope.size === 'thumbnail' ? 512 : 1600,
        );
        return {
            base64: (await dataUrl(image.blob)).split(',')[1],
            mime: image.blob.type,
            width: image.width,
            height: image.height,
        };
    }
    async cleanupCamera(scope: Scope & { uri: string }) {
        key(scope);
        URL.revokeObjectURL(scope.uri);
        captures.delete(scope.uri);
    }
    async chooseFromGallery() {
        return chooseBrowserPhoto('gallery');
    }
    async beginCapture(
        scope: Scope & { operationId: string; draftId: string },
    ) {
        records.set(
            key({ ...scope, name: `capture-${scope.operationId}` }),
            JSON.stringify(scope),
        );
    }
    async captureResult(options: { uri: string; operationId?: string }) {
        if (!activeAccount || !captures.has(options.uri)) return;
        const id = `${activeAccount}capture-${options.operationId}`;
        const record = records.get(id);
        if (record)
            records.set(
                id,
                JSON.stringify({ ...JSON.parse(record), uri: options.uri }),
            );
    }
    async finishCapture(scope: Scope & { operationId: string }) {
        records.delete(key({ ...scope, name: `capture-${scope.operationId}` }));
    }
    async captureFailure() {
        /* Tidak ada pemulihan proses native pada browser. */
    }
}

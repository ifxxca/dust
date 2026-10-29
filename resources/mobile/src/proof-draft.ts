import type { LocalEvidence } from './local-store';
import type { Task } from './types';
export type ProofDraft = {
    schema: 1;
    id: string;
    taskId: number;
    taskReference: string;
    visitId: number;
    version: number;
    submissionKey: string;
    step: 1 | 2 | 3;
    evidenceStep?: 'photos' | 'signature';
    quantities: {
        manual_hybrid: string;
        cashless_hybrid: string;
        css_orion: string;
    };
    notes: string;
    cashlessAwbs?: string[];
    photos: LocalEvidence[];
    signature: LocalEvidence | null;
    updatedAt: string;
    state: 'EDITING' | 'SENDING' | 'UNCERTAIN' | 'BLOCKED' | 'CONFIRMED';
    attempt?: {
        expected_version: number;
        submission_key: string;
        manual_hybrid: number;
        cashless_hybrid: number;
        css_orion: number;
        notes: string;
        cashless_capture?: number;
        cashless_awbs?: string[];
    };
    pendingCapture?: {
        operationId: string;
        evidenceName: string;
        uri?: string;
    };
};
export function newProofDraft(task: Task): ProofDraft {
    return {
        schema: 1,
        id: crypto.randomUUID(),
        taskId: task.id,
        taskReference: task.reference,
        visitId: task.visits?.at(-1)?.id || 0,
        version: task.version,
        submissionKey: crypto.randomUUID(),
        step: 1,
        quantities: {
            manual_hybrid: '0',
            cashless_hybrid: String(task.cashless_awbs?.length ?? 0),
            css_orion: '0',
        },
        notes: '',
        cashlessAwbs: [...(task.cashless_awbs ?? [])],
        photos: [],
        signature: null,
        updatedAt: new Date().toISOString(),
        state: 'EDITING',
    };
}
export function readableProofDraft(value: unknown): value is ProofDraft {
    if (!value || typeof value !== 'object') return false;
    const draft = value as Partial<ProofDraft>;
    return (
        draft.schema === 1 &&
        typeof draft.id === 'string' &&
        Number.isSafeInteger(draft.taskId) &&
        typeof draft.taskReference === 'string' &&
        Number.isSafeInteger(draft.version) &&
        Number.isSafeInteger(draft.visitId) &&
        typeof draft.submissionKey === 'string' &&
        typeof draft.notes === 'string' &&
        typeof draft.updatedAt === 'string' &&
        Number.isFinite(Date.parse(draft.updatedAt)) &&
        !!draft.quantities &&
        ['manual_hybrid', 'cashless_hybrid', 'css_orion'].every(
            (key) =>
                typeof draft.quantities?.[
                    key as keyof ProofDraft['quantities']
                ] === 'string',
        ) &&
        Array.isArray(draft.photos) &&
        (draft.cashlessAwbs === undefined ||
            (Array.isArray(draft.cashlessAwbs) &&
                draft.cashlessAwbs.length <= 500 &&
                draft.cashlessAwbs.every(
                    (awb) =>
                        typeof awb === 'string' &&
                        /^[A-Z0-9_-]{1,100}$/.test(awb) &&
                        !/^(0101|0166)[0-9]+$/.test(awb),
                ) &&
                new Set(draft.cashlessAwbs).size ===
                    draft.cashlessAwbs.length)) &&
        [1, 2, 3].includes(draft.step ?? 0) &&
        (draft.evidenceStep === undefined ||
            ['photos', 'signature'].includes(draft.evidenceStep)) &&
        ['EDITING', 'SENDING', 'UNCERTAIN', 'BLOCKED', 'CONFIRMED'].includes(
            draft.state ?? '',
        ) &&
        ((draft.state !== 'SENDING' && draft.state !== 'UNCERTAIN') ||
            !!draft.attempt)
    );
}
export function draftPayload(draft: ProofDraft) {
    const entries = Object.entries(draft.quantities);
    if (
        entries.some(
            ([, value]) =>
                !/^\d+$/.test(value) ||
                !Number.isSafeInteger(Number(value)) ||
                Number(value) > 1000000,
        )
    )
        throw new Error(
            'Jumlah paket harus bilangan bulat 0–1.000.000 per kategori.',
        );
    const values = {
        manual_hybrid: Number(draft.quantities.manual_hybrid),
        cashless_hybrid: Number(draft.quantities.cashless_hybrid),
        css_orion: Number(draft.quantities.css_orion),
    };
    const awbs = draft.cashlessAwbs ?? [];
    if (
        awbs.length !== values.cashless_hybrid ||
        new Set(awbs).size !== awbs.length
    )
        throw new Error(
            'Catat setiap resi Cashless agar jumlah sesuai hasil scan.',
        );
    if (Object.values(values).reduce((total, value) => total + value, 0) <= 0)
        throw new Error('Total paket harus lebih dari nol.');
    if (!draft.signature) throw new Error('Tanda tangan wajib.');
    if (
        draft.photos.length > 4 ||
        draft.photos.some((photo) => photo.bytes > 5120 * 1024)
    )
        throw new Error('Maksimal empat foto, masing-masing 5 MiB.');
    return {
        expected_version: draft.version,
        submission_key: draft.submissionKey,
        ...values,
        cashless_capture: 1,
        cashless_awbs: [...awbs],
        notes: draft.notes.trim(),
    };
}

export function packageQuantityError(value: string): string | null {
    if (!value.trim()) return 'Isi jumlah paket, gunakan 0 jika tidak ada.';
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
        return 'Gunakan bilangan bulat 0–1.000.000.';
    if (Number(value) > 1000000)
        return 'Maksimal 1.000.000 paket per kategori.';
    return null;
}

export function canDiscardProofDraft(draft: ProofDraft): boolean {
    return (
        (draft.state === 'EDITING' || draft.state === 'BLOCKED') &&
        !draft.attempt
    );
}

export function proofDraftStatus(
    draft: ProofDraft,
    saved: boolean,
): {
    title: string;
    tone: 'info' | 'loading' | 'success' | 'warning' | 'error';
} {
    if (draft.state === 'CONFIRMED')
        return { title: 'Berhasil diselesaikan', tone: 'success' };
    if (draft.state === 'SENDING')
        return { title: 'Sedang mengirim', tone: 'loading' };
    if (draft.state === 'UNCERTAIN')
        return { title: 'Menunggu konfirmasi server', tone: 'warning' };
    if (draft.state === 'BLOCKED')
        return { title: 'Perlu tindakan', tone: 'error' };
    return saved
        ? { title: 'Tersimpan di perangkat', tone: 'info' }
        : { title: 'Belum tersimpan', tone: 'warning' };
}
export function sameProofContext(
    task: Task,
    draft: ProofDraft,
    actor: number,
): boolean {
    return (
        task.id === draft.taskId &&
        task.reference === draft.taskReference &&
        task.assigned_staff?.id === actor &&
        task.status === 'ASSIGNED' &&
        task.can.execute === true &&
        task.visits?.at(-1)?.id === draft.visitId &&
        task.visits?.at(-1)?.outcome === 'COLLECTED' &&
        !task.proof
    );
}
export function receiptLabel(status?: string): string {
    return (
        (
            {
                PENDING_CONFIGURATION: 'Receipt belum dikonfigurasi',
                PENDING_RECIPIENT: 'Penerima receipt belum tersedia',
                PROCESSING: 'Receipt sedang diproses',
                UNKNOWN: 'Hasil pengiriman receipt belum diketahui',
                FAILED: 'Pengiriman receipt gagal',
                ACCEPTED_BY_PROVIDER:
                    'Receipt diterima provider; belum terbukti delivered',
                DELIVERED: 'Receipt delivered',
            } as Record<string, string>
        )[status || ''] || 'Status receipt belum diketahui'
    );
}

export function proofWizardStep(draft: ProofDraft): number {
    return draft.step === 1
        ? 1
        : draft.step === 3
          ? 4
          : draft.evidenceStep === 'signature'
            ? 3
            : 2;
}

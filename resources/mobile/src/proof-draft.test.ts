import { expect, test } from 'vitest';
import {
    draftPayload,
    newProofDraft,
    sameProofContext,
    receiptLabel,
    readableProofDraft,
    proofWizardStep,
    canDiscardProofDraft,
    proofDraftStatus,
    packageQuantityError,
} from './proof-draft';
import type { Task } from './types';
const task: Task = {
    id: 1,
    reference: 'test',
    customer: { id: 1, name: 'Test' },
    pickup_address: 'Test',
    scheduled_at: '2026-01-01',
    status: 'ASSIGNED',
    version: 3,
    pickup_type: 'on_demand',
    assigned_staff: { id: 2, name: 'Staff' },
    can: { take_over: false, execute: true },
    visits: [
        { id: 7, staff_id: 2, outcome: 'COLLECTED', reason: null, notes: null },
    ],
};
test('unsupported recovery remains blocked and an uncertain draft requires its frozen attempt', () => {
    const value = newProofDraft(task);
    expect(readableProofDraft(value)).toBe(true);
    expect(readableProofDraft({ ...value, schema: 2 })).toBe(false);
    expect(readableProofDraft({ ...value, state: 'UNCERTAIN' })).toBe(false);
    expect(readableProofDraft({ ...value, taskReference: undefined })).toBe(
        false,
    );
    expect(
        sameProofContext({ ...task, reference: 'replacement' }, value, 2),
    ).toBe(false);
});

test('package controls report invalid counts without accepting negative or excessive input', () => {
    for (const value of ['', '-1', '1.5', '1e2', '1000001', 'NaN'])
        expect(packageQuantityError(value)).not.toBeNull();
    for (const value of ['0', '7', '1000000'])
        expect(packageQuantityError(value)).toBeNull();
});

test('POP cashless count follows unique captured AWBs and remains inside the frozen submission', () => {
    const draft = newProofDraft({ ...task, cashless_awbs: ['TG001', 'CM002'] });
    draft.signature = {
        name: 'signature',
        kind: 'signature',
        mime: 'image/png',
        bytes: 100,
        sha256: 'test',
    };
    expect(draft.quantities.cashless_hybrid).toBe('2');
    expect(draftPayload(draft).cashless_awbs).toEqual(['TG001', 'CM002']);
    expect(draftPayload(draft).cashless_capture).toBe(1);
    expect(() =>
        draftPayload({ ...draft, cashlessAwbs: ['TG001', 'TG001'] }),
    ).toThrow('resi');
    expect(() =>
        draftPayload({
            ...draft,
            quantities: { ...draft.quantities, cashless_hybrid: '3' },
        }),
    ).toThrow('resi');
    expect(
        readableProofDraft({ ...draft, cashlessAwbs: ['016660047446626'] }),
    ).toBe(false);
});

test('unfinished submission evidence cannot be discarded before server reconciliation', () => {
    const draft = newProofDraft(task);
    const attempt = {
        expected_version: 3,
        submission_key: draft.submissionKey,
        manual_hybrid: 1,
        cashless_hybrid: 0,
        css_orion: 0,
        notes: '',
    };
    expect(canDiscardProofDraft(draft)).toBe(true);
    expect(canDiscardProofDraft({ ...draft, state: 'BLOCKED' })).toBe(true);
    for (const state of ['SENDING', 'UNCERTAIN', 'CONFIRMED'] as const) {
        expect(canDiscardProofDraft({ ...draft, state, attempt })).toBe(false);
    }
    expect(canDiscardProofDraft({ ...draft, attempt })).toBe(false);
});

test('draft status distinguishes unsaved data, delivery uncertainty and confirmed finality', () => {
    const draft = newProofDraft(task);
    expect(proofDraftStatus(draft, false).title).toBe('Belum tersimpan');
    expect(proofDraftStatus(draft, true).title).toBe('Tersimpan di perangkat');
    expect(proofDraftStatus({ ...draft, state: 'SENDING' }, true).title).toBe(
        'Sedang mengirim',
    );
    expect(proofDraftStatus({ ...draft, state: 'UNCERTAIN' }, true).title).toBe(
        'Menunggu konfirmasi server',
    );
    expect(proofDraftStatus({ ...draft, state: 'CONFIRMED' }, true).title).toBe(
        'Berhasil diselesaikan',
    );
    expect(proofDraftStatus({ ...draft, state: 'BLOCKED' }, true).tone).toBe(
        'error',
    );
});
test('draft keeps UUID and immutable context with validated package categories', () => {
    const draft = newProofDraft(task);
    draft.quantities.manual_hybrid = '2';
    draft.signature = {
        name: 'signature',
        kind: 'signature',
        mime: 'image/png',
        bytes: 100,
        sha256: 'test',
    };
    const payload = draftPayload(draft);
    expect(payload.submission_key).toBe(draft.submissionKey);
    expect(payload.expected_version).toBe(3);
    expect(payload.manual_hybrid).toBe(2);
    expect(
        draftPayload({
            ...draft,
            quantities: { ...draft.quantities, manual_hybrid: '3' },
        }).submission_key,
    ).toBe(payload.submission_key);
    for (const value of ['-1', '1.5', '1000001', 'NaN'])
        expect(() =>
            draftPayload({
                ...draft,
                quantities: { ...draft.quantities, manual_hybrid: value },
            }),
        ).toThrow();
    expect(() => draftPayload({ ...draft, signature: null })).toThrow(
        'Tanda tangan',
    );
    expect(() =>
        draftPayload({
            ...draft,
            quantities: {
                manual_hybrid: '0',
                cashless_hybrid: '0',
                css_orion: '0',
            },
        }),
    ).toThrow('Total');
});
test('draft submit preflight rejects changed visit, ownership or final task', () => {
    const draft = newProofDraft(task);
    expect(sameProofContext(task, draft, 2)).toBe(true);
    expect(sameProofContext(task, draft, 3)).toBe(false);
    expect(sameProofContext({ ...task, status: 'PICKED_UP' }, draft, 2)).toBe(
        false,
    );
    expect(
        sameProofContext(
            { ...task, visits: [{ ...task.visits![0], id: 8 }] },
            draft,
            2,
        ),
    ).toBe(false);
});
test('receipt provider acceptance never becomes delivered status', () => {
    expect(receiptLabel('ACCEPTED_BY_PROVIDER')).toContain(
        'belum terbukti delivered',
    );
    expect(receiptLabel('UNKNOWN')).toContain('belum diketahui');
    expect(receiptLabel('PENDING_CONFIGURATION')).toContain(
        'belum dikonfigurasi',
    );
    expect(receiptLabel()).toContain('belum diketahui');
});

test('legacy evidence/review steps keep their meaning with recoverable signature substep', () => {
    const legacy = { ...newProofDraft(task), step: 2 as const };
    expect(readableProofDraft(legacy)).toBe(true);
    expect(proofWizardStep(legacy)).toBe(2);
    const signature = { ...legacy, evidenceStep: 'signature' as const };
    expect(readableProofDraft(signature)).toBe(true);
    expect(proofWizardStep(signature)).toBe(3);
    expect(proofWizardStep({ ...legacy, step: 3 })).toBe(4);
    expect(readableProofDraft({ ...legacy, evidenceStep: 'unknown' })).toBe(
        false,
    );
    expect(signature.submissionKey).toBe(legacy.submissionKey);
});

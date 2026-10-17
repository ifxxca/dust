import { expect, test } from 'vitest';
import {
    confirmedAmend,
    confirmedHandoverLifecycle,
    readableHandoverAttempt,
    verificationErrors,
    receivedQuantity,
    differenceLabel,
    type Handover,
    type HandoverAttempt,
} from './handover';
const attempt: HandoverAttempt = {
    schema: 1,
    kind: 'amend',
    state: 'UNCERTAIN',
    key: 'key',
    sessionId: 1,
    sessionReference: 'original',
    version: 2,
    reason: 'review',
    taskIds: [2, 3],
    references: {},
    createdAt: '2026-10-13',
};
const value: Handover = {
    id: 1,
    reference: 'original',
    status: 'DRAFT',
    version: 4,
    created_by: 1,
    total_packages: 5,
    events: [
        {
            action: 'membership_changed',
            actor_id: 1,
            session_version: 3,
            reason: 'review',
            changes: { new_task_ids: [3, 2] },
        },
    ],
};

test.each(['-1', '1.5', '', '1000001', 'NaN'])(
    'received input %s cannot be submitted',
    (input) => {
        expect(receivedQuantity(input)).toBeNull();
    },
);
test('verification accepts excess and zero but requires a note for any category difference', () => {
    const pickup = { manual_hybrid: 3, cashless_hybrid: 2, css_orion: 1 };
    const matching = {
        manual_hybrid: '3',
        cashless_hybrid: '2',
        css_orion: '1',
        discrepancy_notes: '',
    };
    expect(verificationErrors(matching, pickup)).toEqual({});
    expect(
        verificationErrors({ ...matching, manual_hybrid: '5' }, pickup),
    ).toEqual({
        discrepancy_notes: [
            'Catatan wajib ketika ada selisih pada kategori mana pun.',
        ],
    });
    expect(
        verificationErrors(
            {
                ...matching,
                manual_hybrid: '5',
                discrepancy_notes: 'Dua paket lebih',
            },
            pickup,
        ),
    ).toEqual({});
    expect(
        verificationErrors(
            {
                ...matching,
                manual_hybrid: '0',
                cashless_hybrid: '0',
                css_orion: '0',
                discrepancy_notes: 'Tidak ada fisik',
            },
            pickup,
        ),
    ).toEqual({});
    expect(
        verificationErrors(
            { ...matching, manual_hybrid: '4', cashless_hybrid: '1' },
            pickup,
        ),
    ).toHaveProperty('discrepancy_notes');
});
test.each([
    [0, '0 · SESUAI'],
    [-1, '-1 · KURANG'],
    [2, '+2 · LEBIH'],
])('difference %s has a readable direction', (difference, label) => {
    expect(differenceLabel(difference as number)).toBe(label);
});
test('amend recovery requires exact actor version reason and whole list audit despite subsequent edits', () => {
    expect(confirmedAmend(value, attempt, 1)).toBe(true);
    expect(confirmedAmend(value, attempt, 2)).toBe(false);
    expect(confirmedAmend(value, { ...attempt, taskIds: [2] }, 1)).toBe(false);
    expect(
        confirmedAmend({ ...value, reference: 'replacement' }, attempt, 1),
    ).toBe(false);
    expect(confirmedAmend({ ...value, events: [] }, attempt, 1)).toBe(false);
});

const verification = {
    itemId: 5,
    pickupRevision: 0,
    manual_hybrid: 2,
    cashless_hybrid: 1,
    css_orion: 0,
    discrepancy_notes: null,
};
const verifyAttempt: HandoverAttempt = {
    ...attempt,
    kind: 'verify',
    verification,
};
const verified: Handover = {
    ...value,
    status: 'IN_VERIFICATION',
    items: [
        {
            id: 5,
            task_id: 2,
            reference: 'pck',
            customer_name: 'Customer',
            pickup_staff: null,
            pickup: {
                manual_hybrid: 2,
                cashless_hybrid: 1,
                css_orion: 0,
                total: 3,
            },
            retail: {
                manual_hybrid: 2,
                cashless_hybrid: 1,
                css_orion: 0,
                total: 3,
            },
            status: 'VERIFIED',
            differences: null,
            needs_review: false,
            pickup_revision: 0,
            discrepancy_notes: null,
            verified_by: 1,
            original_retail: verification,
            revisions: [],
        },
    ],
    events: [
        {
            action: 'item_verified',
            actor_id: 1,
            session_version: 3,
            handover_item_id: 5,
            reason: null,
            changes: {},
        },
    ],
};

test('verification recovery requires exact audit actor version item and original quantities', () => {
    expect(confirmedHandoverLifecycle(verified, verifyAttempt, 1)).toBe(true);
    expect(
        confirmedHandoverLifecycle(
            {
                ...verified,
                items: [
                    {
                        ...verified.items![0],
                        original_retail: {
                            ...verified.items![0].original_retail,
                            verified_pickup_revision: 1,
                        },
                    },
                ],
            },
            verifyAttempt,
            1,
        ),
    ).toBe(false);
    expect(confirmedHandoverLifecycle(verified, verifyAttempt, 2)).toBe(false);
    expect(
        confirmedHandoverLifecycle(
            verified,
            { ...verifyAttempt, version: 3 },
            1,
        ),
    ).toBe(false);
    expect(
        confirmedHandoverLifecycle(
            verified,
            { ...verifyAttempt, verification: { ...verification, itemId: 6 } },
            1,
        ),
    ).toBe(false);
    expect(
        confirmedHandoverLifecycle(
            verified,
            {
                ...verifyAttempt,
                verification: { ...verification, cashless_hybrid: 2 },
            },
            1,
        ),
    ).toBe(false);
    expect(
        confirmedHandoverLifecycle(
            verified,
            {
                ...verifyAttempt,
                verification: {
                    ...verification,
                    discrepancy_notes: 'Different',
                },
            },
            1,
        ),
    ).toBe(false);
    expect(
        confirmedHandoverLifecycle(
            { ...verified, events: [] },
            verifyAttempt,
            1,
        ),
    ).toBe(false);
    expect(
        confirmedHandoverLifecycle(
            { ...verified, reference: 'other' },
            verifyAttempt,
            1,
        ),
    ).toBe(false);
    expect(
        confirmedHandoverLifecycle(
            {
                ...verified,
                items: verified.items!.map((item) => ({
                    ...item,
                    retail: { ...item.retail, manual_hybrid: 9 },
                    revisions: [
                        { revision: 1, reason: 'Subsequent correction' },
                    ],
                })),
            },
            verifyAttempt,
            1,
        ),
    ).toBe(true);
});

test('closure recovery requires its audit and preserves authoritative later status', () => {
    const closeAttempt: HandoverAttempt = { ...attempt, kind: 'close' };
    const closed: Handover = {
        ...value,
        status: 'CLOSED',
        events: [
            {
                action: 'closed',
                actor_id: 1,
                session_version: 3,
                reason: null,
                changes: {},
            },
        ],
    };
    expect(confirmedHandoverLifecycle(closed, closeAttempt, 1)).toBe(true);
    expect(
        confirmedHandoverLifecycle(
            { ...closed, status: 'DRAFT', version: 5 },
            closeAttempt,
            1,
        ),
    ).toBe(true);
    expect(confirmedHandoverLifecycle(closed, closeAttempt, 2)).toBe(false);
    expect(confirmedHandoverLifecycle(value, closeAttempt, 1)).toBe(false);
    expect(confirmedHandoverLifecycle(closed, attempt, 1)).toBe(false);
});

test('existing journals remain readable while lifecycle journals reject incomplete or invalid quantities', () => {
    expect(readableHandoverAttempt({ ...attempt, kind: 'create' })).toBe(true);
    expect(readableHandoverAttempt({ ...attempt, kind: 'close' })).toBe(true);
    expect(readableHandoverAttempt(verifyAttempt)).toBe(true);
    expect(
        readableHandoverAttempt({ ...verifyAttempt, verification: undefined }),
    ).toBe(false);
    expect(
        readableHandoverAttempt({
            ...verifyAttempt,
            verification: { ...verification, manual_hybrid: -1 },
        }),
    ).toBe(false);
    expect(
        readableHandoverAttempt({
            ...verifyAttempt,
            verification: { ...verification, css_orion: 0.5 },
        }),
    ).toBe(false);
    expect(
        readableHandoverAttempt({
            ...verifyAttempt,
            verification: { ...verification, css_orion: 1000001 },
        }),
    ).toBe(false);
    expect(
        readableHandoverAttempt({
            ...verifyAttempt,
            verification: { ...verification, pickupRevision: -1 },
        }),
    ).toBe(false);
});
test('recovery refuses malformed or duplicate membership journals', () => {
    expect(readableHandoverAttempt(attempt)).toBe(true);
    expect(readableHandoverAttempt({ ...attempt, taskIds: [2, 2] })).toBe(
        false,
    );
    expect(readableHandoverAttempt({ ...attempt, version: undefined })).toBe(
        false,
    );
});

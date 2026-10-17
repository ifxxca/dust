import { expect, test } from 'vitest';
import { validateManualPending } from './manual-pickup';

const pending = {
    schema: 1,
    state: 'UNCERTAIN',
    body: {
        customer_id: 1,
        pickup_address: 'Jl A',
        notes: 'Customer meminta pickup',
        scheduled_at: '2026-10-15T09:00:00+07:00',
        previous_task_id: null,
        submission_key: 'acef420e-c10f-477c-8bcd-4ff26850f529',
    },
};

test('manual recovery retains immutable input and key for sending or uncertain attempts', () => {
    expect(validateManualPending(pending)).toBe(pending);
    expect(validateManualPending({ ...pending, state: 'SENDING' })).toEqual({
        ...pending,
        state: 'SENDING',
    });
    expect(validateManualPending(null)).toBeNull();
});

test.each([
    { ...pending, schema: 2 },
    { ...pending, body: null },
    { ...pending, state: 'CONFIRMED' },
    { ...pending, body: { ...pending.body, customer_id: 0 } },
    { ...pending, body: { ...pending.body, notes: ' ' } },
    {
        ...pending,
        body: { ...pending.body, scheduled_at: '2026-10-15T09:00:00' },
    },
    { ...pending, body: { ...pending.body, submission_key: 'broken' } },
    { ...pending, body: { ...pending.body, previous_task_id: -1 } },
    { ...pending, body: { ...pending.body, assigned_staff_id: 2 } },
])(
    'malformed manual journal blocks replay and does not become an absent draft',
    (value) => {
        expect(() => validateManualPending(value)).toThrow(
            'Data dipertahankan',
        );
    },
);

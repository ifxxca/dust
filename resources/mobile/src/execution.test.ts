import { expect, test } from 'vitest';
import { reconcileExecution, type Operation } from './execution';
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
    can: { take_over: false },
    visits: [
        { id: 5, staff_id: 2, outcome: 'COLLECTED', reason: null, notes: null },
    ],
    events: [{ action: 'visit_recorded', actor_id: 2, task_version: 3 }],
};
const operation: Operation = {
    schema: 1,
    kind: 'visit',
    taskId: 1,
    taskReference: task.reference,
    version: 2,
    visitId: 5,
    state: 'UNCERTAIN',
    body: { outcome: 'COLLECTED', reason: null, notes: null },
};
test('uncertain visit requires exact visit actor and immutable payload', () => {
    expect(() =>
        reconcileExecution({ ...task, reference: 'replacement' }, operation, 2),
    ).toThrow('recovery');
    expect(reconcileExecution(task, operation, 2)).toBe('confirmed');
    expect(reconcileExecution(task, operation, 3)).toBe('changed');
    expect(
        reconcileExecution(
            task,
            { ...operation, body: { ...operation.body, notes: 'changed' } },
            2,
        ),
    ).toBe('changed');
    expect(
        reconcileExecution({ ...task, version: 2, visits: [] }, operation, 2),
    ).toBe('unchanged');
});
test('takeover recovery requires exact actor audit at baseline plus one', () => {
    const op = { ...operation, kind: 'takeover' as const };
    expect(
        reconcileExecution(
            {
                ...task,
                events: [
                    { action: 'taken_over', actor_id: 2, task_version: 3 },
                ],
            },
            op,
            2,
        ),
    ).toBe('confirmed');
    expect(
        reconcileExecution(
            {
                ...task,
                events: [
                    { action: 'taken_over', actor_id: 2, task_version: 4 },
                ],
            },
            op,
            2,
        ),
    ).toBe('changed');
});

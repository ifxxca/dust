import type { Task } from './types';
export type Operation = {
    schema: 1;
    kind: 'takeover' | 'start' | 'visit' | 'retry';
    taskId: number;
    taskReference: string;
    version: number;
    visitId: number;
    body: Record<string, unknown>;
    state: 'SENDING' | 'UNCERTAIN';
};
export function reconcileExecution(
    task: Task,
    operation: Operation,
    actor: number,
): 'confirmed' | 'unchanged' | 'changed' {
    if (
        operation.schema !== 1 ||
        operation.taskId !== task.id ||
        operation.taskReference !== task.reference
    )
        throw new Error(
            'Versi recovery lokal tidak didukung; data dipertahankan.',
        );
    const action = {
        takeover: 'taken_over',
        start: 'execution_started',
        retry: 'retry_authorized',
        visit: 'visit_recorded',
    }[operation.kind];
    const event = task.events?.find(
        (item) =>
            item.action === action &&
            item.actor_id === actor &&
            item.task_version === operation.version + 1,
    );
    if (operation.kind === 'visit') {
        const visit = task.visits?.find(
            (item) => item.id === operation.visitId && item.staff_id === actor,
        );
        if (
            visit &&
            visit.outcome === operation.body.outcome &&
            visit.reason === operation.body.reason &&
            visit.notes === operation.body.notes
        )
            return 'confirmed';
    } else if (event) return 'confirmed';
    return task.version === operation.version ? 'unchanged' : 'changed';
}

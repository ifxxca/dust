export type HandoverCandidate = {
    id: number;
    reference: string;
    customer_name: string;
    staff_name: string | null;
    total: number;
};
export type Handover = {
    id: number;
    reference: string;
    status: 'DRAFT' | 'IN_VERIFICATION' | 'CLOSED';
    version: number;
    created_at?: string;
    creator?: { id: number; name: string };
    staff_names?: string[];
    created_by: number;
    task_count?: number;
    total_packages: number;
    pending_count?: number;
    discrepancy_count?: number;
    review_count?: number;
    verified_count?: number;
    can_close?: boolean;
    can?: { edit: boolean; verify: boolean; receive: boolean };
    closed_at?: string | null;
    closed_by?: number | null;
    items?: {
        id: number;
        task_id: number;
        reference: string;
        customer_name: string;
        pickup_staff: { id: number; name: string } | null;
        pickup: {
            manual_hybrid: number;
            cashless_hybrid: number;
            css_orion: number;
            total: number;
        };
        retail: {
            manual_hybrid: number | null;
            cashless_hybrid: number | null;
            css_orion: number | null;
            total: number | null;
        };
        status: string;
        differences: Record<string, number> | null;
        needs_review: boolean;
        pickup_revision: number;
        discrepancy_notes: string | null;
        verified_by: number | null;
        verified_at?: string | null;
        verified_pickup_revision?: number | null;
        verified_pickup?: Record<string, number> | null;
        verified_differences?: Record<string, number> | null;
        original_retail: {
            manual_hybrid: number | null;
            cashless_hybrid: number | null;
            css_orion: number | null;
            discrepancy_notes: string | null;
            verified_pickup_revision?: number | null;
        };
        revisions: { revision: number; reason: string }[];
    }[];
    events?: {
        occurred_at?: string;
        actor_id: number;
        action: string;
        session_version: number;
        handover_item_id?: number | null;
        reason: string | null;
        changes: { new_task_ids?: number[]; pickup_revision?: number } | null;
    }[];
};
export type HandoverAttempt = {
    schema: 1;
    kind: 'create' | 'amend' | 'verify' | 'close';
    state: 'SENDING' | 'UNCERTAIN';
    key: string;
    taskIds: number[];
    references: Record<string, string>;
    sessionId?: number;
    sessionReference?: string;
    version?: number;
    reason?: string;
    verification?: {
        itemId: number;
        pickupRevision: number;
        manual_hybrid: number;
        cashless_hybrid: number;
        css_orion: number;
        discrepancy_notes: string | null;
    };
    createdAt: string;
};
export function sameMembers(left: number[], right: number[]): boolean {
    return (
        left.length === right.length &&
        [...left]
            .sort((a, b) => a - b)
            .every(
                (value, index) =>
                    value === [...right].sort((a, b) => a - b)[index],
            )
    );
}
export function confirmedAmend(
    value: Handover,
    attempt: HandoverAttempt,
    actor: number,
): boolean {
    return (
        attempt.kind === 'amend' &&
        value.id === attempt.sessionId &&
        value.reference === attempt.sessionReference &&
        !!value.events?.some(
            (event) =>
                event.action === 'membership_changed' &&
                event.actor_id === actor &&
                event.session_version === (attempt.version ?? 0) + 1 &&
                event.reason === attempt.reason &&
                sameMembers(event.changes?.new_task_ids || [], attempt.taskIds),
        )
    );
}
export function readableHandoverAttempt(
    value: unknown,
): value is HandoverAttempt {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<HandoverAttempt>;
    const common =
        item.schema === 1 &&
        ['create', 'amend', 'verify', 'close'].includes(item.kind ?? '') &&
        ['SENDING', 'UNCERTAIN'].includes(item.state ?? '') &&
        typeof item.key === 'string' &&
        Array.isArray(item.taskIds) &&
        item.taskIds.length > 0 &&
        item.taskIds.length <= 100 &&
        new Set(item.taskIds).size === item.taskIds.length &&
        item.taskIds.every((id) => Number.isSafeInteger(id) && id > 0) &&
        !!item.references &&
        typeof item.createdAt === 'string';
    if (!common) return false;
    if (item.kind === 'create') return true;
    if (
        !Number.isSafeInteger(item.sessionId) ||
        (item.sessionId ?? 0) < 1 ||
        typeof item.sessionReference !== 'string' ||
        !Number.isSafeInteger(item.version) ||
        (item.version ?? 0) < 1
    )
        return false;
    if (item.kind === 'amend') return typeof item.reason === 'string';
    if (item.kind === 'close') return true;
    const verification = item.verification;
    return (
        !!verification &&
        Number.isSafeInteger(verification.itemId) &&
        verification.itemId > 0 &&
        Number.isSafeInteger(verification.pickupRevision) &&
        verification.pickupRevision >= 0 &&
        [
            verification.manual_hybrid,
            verification.cashless_hybrid,
            verification.css_orion,
        ].every(
            (quantity) =>
                Number.isSafeInteger(quantity) &&
                quantity >= 0 &&
                quantity <= 1000000,
        ) &&
        (verification.discrepancy_notes === null ||
            typeof verification.discrepancy_notes === 'string')
    );
}

export function confirmedHandoverLifecycle(
    value: Handover,
    attempt: HandoverAttempt,
    actor: number,
): boolean {
    if (
        value.id !== attempt.sessionId ||
        value.reference !== attempt.sessionReference
    )
        return false;
    const event = value.events?.find(
        (event) =>
            event.actor_id === actor &&
            event.session_version === (attempt.version ?? 0) + 1 &&
            event.action ===
                (attempt.kind === 'verify' ? 'item_verified' : 'closed'),
    );
    if (!event) return false;
    if (attempt.kind === 'close') return true;
    if (
        attempt.kind !== 'verify' ||
        !attempt.verification ||
        event.handover_item_id !== attempt.verification.itemId
    )
        return false;
    const verified = value.items?.find(
        (item) => item.id === attempt.verification!.itemId,
    )?.original_retail;
    return (
        !!verified &&
        (verified.verified_pickup_revision === undefined ||
            verified.verified_pickup_revision ===
                attempt.verification.pickupRevision) &&
        [
            'manual_hybrid',
            'cashless_hybrid',
            'css_orion',
            'discrepancy_notes',
        ].every(
            (key) =>
                verified[key as keyof typeof verified] ===
                attempt.verification![
                    key as
                        | 'manual_hybrid'
                        | 'cashless_hybrid'
                        | 'css_orion'
                        | 'discrepancy_notes'
                ],
        )
    );
}

export const handoverCategories = [
    ['manual_hybrid', 'Manual Hybrid Non-Cashless'],
    ['cashless_hybrid', 'Cashless Hybrid'],
    ['css_orion', 'CSS / Orion'],
] as const;
export type VerificationInput = Record<
    (typeof handoverCategories)[number][0] | 'discrepancy_notes',
    string
>;
export function receivedQuantity(value: string): number | null {
    return /^\d+$/.test(value) && Number(value) <= 1000000
        ? Number(value)
        : null;
}
export function differenceLabel(difference: number): string {
    return difference === 0
        ? '0 · SESUAI'
        : difference > 0
          ? `+${difference} · LEBIH`
          : `${difference} · KURANG`;
}
export function verificationErrors(
    values: VerificationInput,
    pickup: Record<string, number>,
): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    for (const [key] of handoverCategories) {
        if (receivedQuantity(values[key]) === null)
            errors[key] = ['Isi bilangan bulat 0–1.000.000.'];
    }
    if (
        !Object.keys(errors).length &&
        handoverCategories.some(
            ([key]) => Number(values[key]) !== pickup[key],
        ) &&
        !values.discrepancy_notes.trim()
    )
        errors.discrepancy_notes = [
            'Catatan wajib ketika ada selisih pada kategori mana pun.',
        ];
    return errors;
}

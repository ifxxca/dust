import type {
    CashlessPickup,
    SelectedCashlessPickup,
} from '../../js/types/cashless-handover';

export type CashlessDraft = {
    schema: 1;
    pickupId: number;
    awbs: string[];
    submissionKey: string;
    pending: boolean;
    source?: 'roberto' | 'nuralamt' | '';
    scanCounts?: { total: number; duplicate: number; invalid: number };
    book?: CashlessPickup;
};

export function cachedCashlessPickup(
    draft: CashlessDraft,
): SelectedCashlessPickup | null {
    return draft.book
        ? {
              ...draft.book,
              awbs: {
                  data: [],
                  current_page: 1,
                  last_page: 1,
                  total: draft.book.saved_count,
              },
          }
        : null;
}

export function readableScanCounts(value: unknown): boolean {
    if (value === undefined) return true;
    if (!value || typeof value !== 'object') return false;
    const counts = value as {
        total: number;
        duplicate: number;
        invalid: number;
    };
    return (
        [counts.total, counts.duplicate, counts.invalid].every(
            (count) => Number.isSafeInteger(count) && count >= 0,
        ) && counts.total >= counts.duplicate + counts.invalid
    );
}

export function readableCashlessDraft(value: unknown): value is CashlessDraft {
    if (!value || typeof value !== 'object') return false;
    const draft = value as Partial<CashlessDraft>;
    return (
        draft.schema === 1 &&
        Number.isSafeInteger(draft.pickupId) &&
        (draft.pickupId ?? 0) > 0 &&
        typeof draft.submissionKey === 'string' &&
        /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(
            draft.submissionKey,
        ) &&
        typeof draft.pending === 'boolean' &&
        readableScanCounts(draft.scanCounts) &&
        (draft.book === undefined ||
            (!!draft.book &&
                typeof draft.book === 'object' &&
                draft.book.id === draft.pickupId &&
                typeof draft.book.reference === 'string' &&
                typeof draft.book.customer === 'string' &&
                typeof draft.book.status === 'string' &&
                typeof draft.book.can_record === 'boolean' &&
                typeof draft.book.scheduled_at === 'string' &&
                Number.isFinite(Date.parse(draft.book.scheduled_at)) &&
                Number.isSafeInteger(draft.book.saved_count) &&
                draft.book.saved_count >= 0 &&
                (draft.book.target === null ||
                    (Number.isSafeInteger(draft.book.target) &&
                        draft.book.target >= 0)))) &&
        (draft.source === undefined ||
            ['', 'roberto', 'nuralamt'].includes(draft.source)) &&
        Array.isArray(draft.awbs) &&
        draft.awbs.length <= 500 &&
        draft.awbs.every(
            (awb) =>
                typeof awb === 'string' && /^[A-Z0-9_$-]{1,100}$/.test(awb),
        ) &&
        new Set(draft.awbs).size === draft.awbs.length &&
        (!draft.pending || draft.awbs.length > 0)
    );
}

export function confirmedCashlessHandover(
    value: unknown,
    pickupId: number,
    count: number,
): boolean {
    if (!value || typeof value !== 'object' || !('data' in value)) return false;
    const data = value.data;
    return (
        !!data &&
        typeof data === 'object' &&
        'pickup_task_id' in data &&
        'saved' in data &&
        'stored_count' in data &&
        data.pickup_task_id === pickupId &&
        data.saved === count &&
        typeof data.stored_count === 'number' &&
        Number.isSafeInteger(data.stored_count) &&
        data.stored_count >= count
    );
}

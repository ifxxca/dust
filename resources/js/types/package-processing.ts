export type ProcessingRow = {
    id: number;
    reference: string;
    customer_name: string;
    staff_name: string | null;
    scheduled_at: string;
    period_at: string | null;
    received_at: string | null;
    category: string;
    pop_quantity: number;
    received_quantity: number | null;
    confirmed_quantity: number | null;
    manual_quantity: number;
    failed_quantity: number;
    pending_quantity: number;
    unknown_outcome_quantity: number;
    unconfirmed_quantity: number;
    not_recorded_quantity: number;
    last_updated_at: string | null;
    processing_status: string;
    provenance: string;
    systems: string[];
    reconciliation_required: number;
    reconciliation_reasons: string[];
    needs_review: boolean;
};
export type ProcessingRecord = {
    id: number;
    category: string;
    system: string;
    revision: number;
    successful_quantity: number;
    failed_quantity: number;
    pending_quantity: number;
    unknown_quantity: number;
    external_reference: string | null;
    reason: string;
    pickup_revision: number;
    handover_revision: number | null;
    received_quantity: number | null;
    actor_id: number;
    actor_name: string;
    created_at: string;
    previous_successful?: number | null;
    previous_failed?: number | null;
    previous_pending?: number | null;
    previous_unknown?: number | null;
};
export type ProcessingPagination<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    prev_page_url: string | null;
    next_page_url: string | null;
};
export type ProcessingSummary = Record<string, number | null>;
export type ProcessingMonitor = {
    summary: ProcessingSummary;
    categories: (Record<string, number | string | null> & {
        category: string;
    })[];
    rows: ProcessingPagination<ProcessingRow>;
    source: string;
    generated_at: string;
};
export type ProcessingDetail = {
    summary?: ProcessingSummary;
    rows: ProcessingRow[];
    latest: ProcessingRecord[];
    history: ProcessingPagination<ProcessingRecord>;
    can_record: boolean;
};
export type ProcessingQuickDetail = {
    task: { id: number; reference: string; customer_name_snapshot: string };
    result: import('@/types/pickup-result').PickupResult;
    processing: ProcessingDetail & { summary: ProcessingSummary };
    timezone: string;
};

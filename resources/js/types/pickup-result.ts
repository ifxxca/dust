export type PickupResult = {
    id: number;
    reference: string;
    customer_name: string;
    staff_name: string | null;
    scheduled_at: string;
    period_at: string | null;
    period_source:
        | 'PICKUP'
        | 'VISIT_OUTCOME'
        | 'VISIT_STARTED'
        | 'SCHEDULE'
        | 'UNAVAILABLE';
    operational_date: string | null;
    handed_over_at: string | null;
    subsequent_handover: boolean;
    task_status: string;
    visit_outcome: string | null;
    visit_started_at: string | null;
    visit_recorded_at: string | null;
    execution_started_at: string | null;
    finalized_at: string | null;
    handover_status: string | null;
    verification_status: string | null;
    needs_review: boolean;
    total_packages: number;
    proof_id?: number | null;
    pickup_revision: number;
    handover_revision: number | null;
    session_id: number | null;
    next_action: string;
};
export type PickupQuickDetail = {
    result: PickupResult;
    visit: {
        outcome: string | null;
        started_at: string | null;
        recorded_at: string | null;
        reason: string | null;
        notes: string | null;
    } | null;
    proof: {
        revision: number;
        finalized_at: string | null;
        manual_hybrid: number;
        cashless_hybrid: number;
        css_orion: number;
        notes: string | null;
        attachments: { id: number; kind: string; url: string }[];
    } | null;
    handover: {
        reference: string;
        status: string;
        total_received: number | null;
        received: Record<string, number> | null;
        verified_by: string | null;
        verified_at: string | null;
        verified_pickup_revision: number | null;
        differences: Record<string, number> | null;
        discrepancy_notes: string | null;
    } | null;
    capabilities: Pick<
        ResultCapabilities,
        'correct_pop' | 'verify' | 'correct_verification'
    >;
    timezone: string;
};
export type ResultCapabilities = Record<
    'correct_pop' | 'verify' | 'correct_verification' | 'close' | 'reopen',
    boolean
>;
export type ResultTask = {
    id: number;
    reference: string;
    version: number;
    pickup_address: string;
    contact: string;
    notes: string | null;
    proof:
        | (import('@/components/pickup-proof').Proof & {
              finalized_at: string;
              staff_id: number;
          })
        | null;
};
export type ResultPage = {
    data: PickupResult[];
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    prev_page_url: string | null;
    next_page_url: string | null;
};

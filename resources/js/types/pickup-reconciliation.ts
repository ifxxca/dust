export type ReconciliationCounts = {
    pop: number | null;
    received: number | null;
    expected: number | null;
    confirmed: number;
    shortfall: number | null;
    excess: number | null;
};
export type ReconciliationPage<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from?: number | null;
    to?: number | null;
};
export type ReconciliationRow = {
    business_date?: string;
    pickup_count?: number;
    id: number;
    reference: string;
    customer_name: string;
    customer_code: string | null;
    staff_name: string | null;
    picked_up_at: string | null;
    automation_status: string;
    delivery_status: string;
    reconciliation_group: 'review' | 'waiting' | 'done';
    categories: Record<string, ReconciliationCounts>;
    reasons: string[];
    evaluated_at: string | null;
    last_error: string | null;
    dirty: boolean;
    manual_hybrid?: number;
    cashless_hybrid?: number;
    css_orion?: number;
};
export type AutomationMonitor = {
    pending_count: number;
    processing: {
        regular_target: number | null;
        regular_processed: number;
        pending_incoming: number;
        target: number | null;
        processed: number;
    };
    rows: ReconciliationPage<ReconciliationRow>;
    summary: {
        total: number;
        review: number;
        done: number;
        waiting: number;
        unsent: number;
    };
    generated_at: string;
    enabled: boolean;
};
export type ReconciliationDetail = {
    selected_task_id?: number;
    customer_day?: {
        id: number | null;
        business_date: string;
        pickup_count: number;
        members: {
            id: number;
            reference: string;
            staff_name: string | null;
            picked_up_at: string | null;
            status: string;
            categories: Record<string, ReconciliationCounts>;
        }[];
    };
    task: {
        id: number;
        reference: string;
        customer_id: number;
        customer_name_snapshot: string;
    };
    context: {
        customer_code: string | null;
        staff_name: string | null;
        scheduled_at: string;
        visited_at: string | null;
        finalized_at: string | null;
        verified_at: string | null;
        imported_at: string | null;
        warehouse_needs_review: boolean;
    };
    reconciliation: {
        input_version: number;
        review_open: boolean;
        locked_at: string | null;
        status: string;
        last_error: string | null;
        categories: Record<string, ReconciliationCounts> | null;
        reasons: string[] | null;
        evidence: {
            coverage?: {
                complete: boolean;
                method: string;
                reasons: string[];
                reports?: number[];
            };
        } | null;
        evaluated_at: string | null;
    } | null;
    delivery_attention: string | null;
    business_date: string | null;
    shipment_query: string;
    assigned_shipments: ReconciliationDetail['shipments'];
    pending_items: ReconciliationPage<PendingItem>;
    excluded: ReconciliationPage<{
        id: number;
        awb: string;
        version: number;
        category: string;
        reason: string;
        pickup_task_id: number | null;
    }>;
    review_events: ReconciliationPage<{
        id: number;
        action: string;
        reason: string;
        actor_name: string;
        created_at: string;
    }>;
    shipments: ReconciliationPage<{
        id: number;
        awb: string;
        version: number;
        pickup_task_id: number | null;
        category: string | null;
        category_status: string;
        match_status: string;
        customer_match_status: string;
    }>;
    manifests: ReconciliationPage<{
        id: number;
        revision: number;
        status: string;
        xlsx_path: string | null;
        pdf_path: string | null;
        last_error: string | null;
        deliveries: {
            id: number;
            recipient: string;
            status: string;
            last_error: string | null;
        }[];
    }>;
    preference: {
        enabled: boolean;
        recipient: string | null;
        revision: number;
    } | null;
    history: ReconciliationPage<{
        revision: number;
        created_at: string;
        snapshot: string;
    }>;
    send_enabled: boolean;
};

export type PendingItem = {
    id: number;
    reference: string;
    pickup_task_id: number;
    category: string;
    label: string;
    reason: string;
    status: 'PENDING' | 'READY' | 'PROCESSED' | 'CANCELLED';
    version: number;
    processing_date: string | null;
    shipment?: { id: number; awb: string } | null;
    pickup?: { id: number; reference: string; customer_name_snapshot: string };
};

export type AwbCandidate = {
    id: number;
    awb: string;
    version: number;
    category: string;
    category_status: string;
    shipper_name: string;
    entry_at: string;
    recommendation: string;
    excluded_reason: string | null;
    sertim_conflict: boolean;
};

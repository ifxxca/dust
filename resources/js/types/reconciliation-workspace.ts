import type {
    ReconciliationPage,
    ReconciliationCounts,
} from './pickup-reconciliation';
export type InvestigationAwb = {
    id: number;
    awb: string;
    version: number;
    customer_id: number | null;
    customer_account: string | null;
    customer: { id: number; name: string; customer_code: string | null } | null;
    category: string | null;
    category_status: string;
    match_status: string;
    match_method: string;
    customer_match_status: string;
    customer_match_method: string;
    pickup_task_id: number | null;
    shipper_name: string | null;
    consignee_name: string | null;
    recommendation?: string | null;
    source: string | null;
    report_id: number | null;
    source_id: number | null;
    source_row: number | null;
    entry_at: string | null;
    imported_at: string | null;
    included: boolean;
    review_status: string;
    conflict: boolean;
};
export type WorkspaceMember = {
    id: number;
    reference: string;
    staff_name: string | null;
    input_version: number;
    pop: Record<string, string | number | null> | null;
    handover: Record<string, string | number | null> | null;
    session_id: number | null;
};
export type Workspace = {
    header: {
        customer: { id: number; name: string; customer_code: string | null };
        business_date: string;
        pickup_count: number;
        account_mappings: {
            shipper_name: string;
            account_scope: string | null;
        }[];
        evaluated_at: string | null;
        last_import_at: string | null;
        last_reviewer: string | null;
    };
    status: string;
    calculation_status: string;
    quantity_status?: string;
    version: number;
    dirty: boolean;
    eligible: boolean;
    blockers: string[];
    schema_ready: boolean;
    capabilities: {
        review: boolean;
        lock: boolean;
        dispute: boolean;
        close_with_explanation?: boolean;
    };
    closure?: {
        ready: boolean;
        validated_at: string | null;
        due_at: string | null;
        overdue: boolean;
    };
    fingerprint: string;
    review_token: string;
    metrics: Record<string, number | null>;
    categories: Record<
        string,
        ReconciliationCounts & { observed: number | null; status: string }
    >;
    coverage: {
        status: string;
        required_for_lock?: boolean;
        members: {
            task_id: number;
            complete: boolean;
            method: string;
            reports: number[];
            reasons: string[];
        }[];
        requirements: {
            requirement: string;
            date: string;
            report_id: number | null;
            run_id: number | null;
            status: string;
            import_status: string | null;
            projection_status: string | null;
            last_attempt_at: string | null;
            last_success_at: string | null;
            record_count: number | null;
            linked_awb_count: number;
            blocking_reasons: string[];
            failure_reason: string | null;
            checksum: string | null;
            coverage_verified: boolean;
        }[];
    };
    members: WorkspaceMember[];
    discrepancies: {
        type: string;
        affected_count?: number;
        affected_awbs?: {
            id: number;
            awb: string;
            category: string | null;
            latest_report_job_id: number | null;
        }[];
        category?: string;
        expected?: number;
        observed?: number;
        difference?: number;
        reason?: string;
        next_action: string;
    }[];
    approval: {
        mode?: 'AUTOMATIC' | 'MANUAL' | 'EXCEPTION';
        exception?: {
            reason_code: string;
            reason_label: string;
            explanation: string;
            due_at: string;
            overdue: boolean;
            omitted_awb_count: number;
        };
        reviewer: { id: number | null; name: string };
        locked_at: string;
        reason: string;
        version: number;
        fingerprint: string;
        included_count: number;
        categories: Workspace['categories'];
    } | null;
    post_lock_change: {
        event: string;
        detected_at: string;
        added_count: number;
        removed_count: number;
    } | null;
    post_lock_review: boolean;
    documents: ReconciliationPage<{
        id: number;
        pickup_task_id: number;
        revision: number;
        status: string;
        created_at: string;
        xlsx_path: string | null;
        pdf_path: string | null;
        last_error: string | null;
        deliveries: {
            id: number;
            recipient: string;
            status: string;
            created_at: string;
            last_error: string | null;
        }[];
    }>;
    delivery: {
        send_enabled: boolean;
        preference: {
            enabled: boolean;
            recipient: string | null;
            recipients?: string[] | null;
            email_recipients?: string[];
            revision: number;
        } | null;
    };
    history: ReconciliationPage<{
        id: number;
        revision: number;
        created_at: string;
        snapshot: string;
    }>;
};
export type AwbEvidence = {
    identity: {
        awb: string;
        customer_account: string | null;
        category: string | null;
        category_method: string | null;
        category_status: string;
        match_status: string;
        match_method: string;
        match_note: string | null;
        customer_match_status: string;
        customer_match_method: string;
        customer_match_note: string | null;
        customer_match_candidates: Record<string, unknown>[];
        category_evidence: Record<string, unknown>[];
    };
    customer: { name: string; customer_code: string | null } | null;
    pickup: { id: number; reference: string } | null;
    shipper_name: string | null;
    sources: ReconciliationPage<{
        id: number;
        report_job_id: number;
        source_row: number;
        shipper_name: string | null;
        entry_at: string | null;
        reference: string | null;
        report_job: {
            source: string;
            report_type: string;
            imported_at: string | null;
            file_checksum: string | null;
            hybrid_batch_id: number | null;
        } | null;
    }>;
    history: ReconciliationPage<{
        id: number;
        previous_customer_id: number | null;
        customer_id: number | null;
        previous_pickup_task_id: number | null;
        pickup_task_id: number | null;
        method: string;
        reason: string | null;
        reviewer: string | null;
        created_at: string;
        evidence: string | null;
    }>;
};
export type SelectionBody = {
    action: string;
    expected_revision: number;
    expected_version: number;
    target_task_id: number;
    reason: string;
    items: { id: number; version: number }[];
};
export type SelectionPreview = {
    allowed: boolean;
    preview_hash: string;
    category_impact: Record<string, number>;
    required_permission: string;
    lock_implications: string;
    items: {
        id: number;
        awb: string;
        category: string;
        before_customer: {
            id: number;
            name: string;
            customer_code: string | null;
        } | null;
        after_customer: {
            id: number;
            name: string;
            customer_code: string | null;
        } | null;
        before: { customer_id: number | null; pickup_task_id: number | null };
        after: { customer_id: number | null; pickup_task_id: number | null };
        evidence: { source_id: number; report_id: number; source_row: number };
        conflicts: string[];
    }[];
};

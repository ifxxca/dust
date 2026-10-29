export type JneFilters = {
    q: string;
    account: string;
    status: string;
    match: string;
    category: string;
    customer_id: string;
    customer_match: string;
    date_from: string;
    date_thru: string;
    per_page: string;
};

export type JneSourceProvenance = {
    contract: {
        id: number;
        revision: number;
        customer_code_column: string | null;
    } | null;
    hybrid_origins: {
        report_job_id: number;
        source: string;
        report_type: string;
        checksum: string;
    }[];
};

export type JneCustomerCandidate = {
    customer_id: number;
    customer_code: string | null;
    customer_name: string;
    registered_name: string;
    distance: number;
};

export type JneMatchEvidence = {
    original_code?: string;
    registered_code?: string;
    contract_id?: number;
    contract_revision?: number;
    code_alias_id?: number;
    source_id?: number;
    alias_id?: number;
    customer_id?: number;
    sertim_id?: number;
    sertim_version?: number;
    pickup_task_id?: number;
    reference?: string;
    pickup_task_ids?: number[];
};

export type JneShipment = {
    id: number;
    awb: string;
    customer_account: string;
    tracking_status: string;
    match_status: string;
    category?: string | null;
    category_status?: string;
    entry_at: string | null;
    observed_at: string | null;
    status_web: string | null;
    status_pod: string | null;
    consignee_name: string | null;
    pickup_reference: string | null;
    pickup_task_id: number | null;
    customer_name?: string | null;
    customer_code?: string | null;
    customer_match_status?: string;
    customer_match_note?: string | null;
    customer_match_candidates?: JneCustomerCandidate[] | null;
    shipper_name?: string | null;
};

export type JneCustomer = {
    id: number;
    name: string;
    customer_code: string | null;
};
export type JnePage<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    from?: number | null;
    to?: number | null;
    per_page?: number;
};

export type JneDetail = {
    shipment: Pick<
        JneShipment,
        | 'id'
        | 'awb'
        | 'customer_account'
        | 'tracking_status'
        | 'category'
        | 'category_status'
        | 'match_status'
        | 'entry_at'
        | 'observed_at'
        | 'pickup_reference'
        | 'pickup_task_id'
        | 'customer_name'
        | 'customer_code'
        | 'customer_match_status'
        | 'customer_match_note'
        | 'customer_match_candidates'
    > & {
        last_report_received_at?: string | null;
        last_refresh_attempt?: {
            id: number;
            status: string;
            stage: string;
            requested_at: string;
            error_message: string | null;
            import_error: string | null;
            projection_error: string | null;
        } | null;
        match_method: string | null;
        match_note: string | null;
        pickup_customer: string | null;
        source: {
            report_job_id: number;
            source_row: number;
            reference: string | null;
            shipper_name: string | null;
            consignee_name: string | null;
            status_web: string | null;
            status_pod: string | null;
            awb_cancel: string | null;
            raw_data: Record<string, string | null> | null;
            original_customer_code?: string | null;
            source_evidence?: JneSourceProvenance | null;
        } | null;
    };
    history: JnePage<{
        id: number;
        observed_at: string;
        tracking_status: string;
        changes_current: boolean;
        status_web: string | null;
        status_pod: string | null;
        awb_cancel: string | null;
        report_job_id: number;
        source_row: number;
        shipper_name?: string | null;
        customer_account?: string | null;
        reference?: string | null;
    }>;
    timezone: string;
};

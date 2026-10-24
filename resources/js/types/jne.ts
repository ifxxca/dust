export type JneFilters = {
    q: string;
    account: string;
    status: string;
    match: string;
    customer_id: string;
    customer_match: string;
};

export type JneShipment = {
    id: number;
    awb: string;
    customer_account: string;
    tracking_status: string;
    match_status: string;
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
        | 'match_status'
        | 'observed_at'
        | 'pickup_reference'
        | 'pickup_task_id'
        | 'customer_name'
        | 'customer_code'
        | 'customer_match_status'
        | 'customer_match_note'
    > & {
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
    }>;
    timezone: string;
};

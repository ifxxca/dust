export type PerformanceCounts = {
    total: number;
    delivered: number;
    active: number;
    returned: number;
    exceptions: number;
    unknown: number;
    unlinked: number;
    attention: number;
};

export type PerformanceFilters = {
    period: 'daily' | 'weekly' | 'monthly' | 'custom';
    date_from: string;
    date_thru: string;
    customer_id?: number | string | null;
    outlet?: string;
    customer_page?: number;
};

export type PerformanceReason = {
    code: string | null;
    description: string | null;
    status_web: string | null;
    status_pod: string | null;
    total: number;
};

export type PerformanceData = {
    summary: PerformanceCounts & {
        observed_at: string | null;
        undated: number;
        on_sla: null;
        over_sla: null;
        on_time_success_rate: null;
        unrcc: null;
    };
    customers: {
        data: (PerformanceCounts & {
            customer_id: number | null;
            customer_name: string | null;
        })[];
        current_page: number;
        last_page: number;
        total: number;
    };
    services: (PerformanceCounts & { label: string })[];
    services_truncated: boolean;
    outlets: (PerformanceCounts & { label: string | null })[];
    outlets_truncated: boolean;
    outlet_options: string[];
    outlet_options_truncated: boolean;
    daily: (PerformanceCounts & { date: string })[];
    exceptions: { rows: PerformanceReason[]; truncated: boolean };
    returns: { rows: PerformanceReason[]; truncated: boolean };
    attention: {
        id: number;
        awb: string;
        customer_name: string | null;
        tracking_status: string;
        customer_match_status: string;
        status_web: string | null;
        status_pod: string | null;
        note: null;
        responsible_party: null;
        last_follow_up_at: null;
        follow_up_state: null;
    }[];
    limitations: Record<
        'sla' | 'unrcc' | 'returns' | 'follow_up' | 'outlet',
        string
    >;
};

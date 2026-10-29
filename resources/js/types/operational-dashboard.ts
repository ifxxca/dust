export type ChartDatum = {
    key: string;
    value: number;
    label?: string;
    color?: string;
};
export type OperationalOverviewData = {
    filters: { date_from: string; date_thru: string };
    previousPeriod: { date_from: string; date_thru: string };
    observed_at: string;
    operational_date: string;
    summary: {
        tasks: number;
        customers: number;
        packages: number;
        attention: number;
        picked_up: number;
        no_packages: number;
        cancelled: number;
        waiting_handover: number;
        discrepancies: number;
        completion_rate: number | null;
        previous: Record<
            'tasks' | 'customers' | 'packages' | 'attention',
            number
        > & { picked_up?: number };
        changes: Record<
            'tasks' | 'customers' | 'packages' | 'attention',
            number | null
        >;
    };
    daily: {
        date: string;
        tasks: number;
        packages: number;
        customers: number;
    }[];
    statuses: ChartDatum[];
    types: ChartDatum[];
    categories: ChartDatum[];
    team: {
        id: number;
        name: string;
        tasks: number;
        picked_up: number;
        packages: number;
        rate: number;
    }[];
    customers: { id: number; name: string; tasks: number; packages: number }[];
    customerCohorts: { new: number; returning: number };
    recent: {
        id: number;
        reference: string;
        customer_name: string;
        staff_name: string | null;
        status: string;
        at: string;
        packages: number | null;
    }[];
    attention: {
        id: number;
        reference: string;
        customer_name: string;
        reason: string;
    }[];
    tracking: {
        statuses: ChartDatum[];
        destinations: { code: string | null; name: string; value: number }[];
        observed_at: string | null;
    } | null;
};

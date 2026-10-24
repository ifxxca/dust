import type { JnePage } from './jne';

export type CustomerDashboardFilters = {
    customer_id: number | null;
    date_from: string;
    date_thru: string;
    mapping: string;
    server: string;
    age: string;
    service: string;
    destination: string;
    status: string;
};
export type CustomerDashboardDay = {
    date: string;
    shipments: number;
    amount: number | null;
    amount_known: number;
};
export type CustomerDashboardRank = {
    key?: string | null;
    label: string | null;
    multiple_names?: boolean;
    shipments: number;
    amount: number | null;
};
export type CustomerDashboardProps = {
    filters: CustomerDashboardFilters;
    selectedCustomer: {
        id: number;
        name: string;
        customer_code: string | null;
    } | null;
    timezone: string;
    selectedDestination: string | null;
    servers: {
        key: string;
        label: string;
        shipments: number;
        amount: number | null;
    }[];
    ages: { label: string; shipments: number }[];
    comparison: {
        date_from: string;
        date_thru: string;
        shipments: number;
        amount: number | null;
        shipment_change_percent: number | null;
        amount_change_percent: number | null;
        amount_known: number;
        amount_complete: boolean;
    };
    summary: {
        shipments: number;
        customers: number;
        accounts: number;
        mapped: number;
        pickup_matched?: number;
        candidates?: number;
        conflicts?: number;
        unmapped: number;
        ambiguous: number;
        undated: number;
        amount: number | null;
        amount_known: number;
        average_amount: number | null;
        weight_kg: number | null;
        weight_known: number;
        quantity: number;
        quantity_known: number;
        delivered: number;
        active: number;
        cancelled: number;
        returned: number;
        exceptions: number;
        active_7_plus: number;
        oldest_active_days: number | null;
        delivery_known: number;
        average_delivery_hours: number | null;
        destination_named: number;
        destination_multiple: number;
        destination_count: number;
        last_observed_at: string | null;
    };
    daily: CustomerDashboardDay[];
    destinations: CustomerDashboardRank[];
    services: CustomerDashboardRank[];
    statuses: { label: string; shipments: number }[];
    shipments: JnePage<{
        id: number;
        awb: string;
        customer_account: string;
        customer_name: string | null;
        customer_code: string | null;
        customer_match_status: string;
        tracking_status: string;
        entry_at: string;
        service: string | null;
        destination: string | null;
        destination_name: string | null;
        destination_multiple: boolean;
        server: string;
        etd_days: number | null;
        amount: number | null;
        weight_kg: number | null;
        quantity: number | null;
    }>;
};

import type { JneCustomer, JnePage } from "@/types/jne";

export type TrackingShipment = {
    service?: string | null;
    destination?: string | null;
    aging_days?: number | null;
    ongoing_days?: number | null;
    etd_days?: number | null;
    sla_status?: string;
    native_sla_grade?: "ON_TIME" | "OVER_SLA" | "UNKNOWN";
    potential_overdue?: boolean;
    potential_variance?: number | null;
    potential_reason?: string | null;
    sla_variance?: number | null;
    source_sla?: number | null;
    source_carrer?: string | null;
    sla_reason?: string | null;
    id: number;
    awb: string;
    shipper_name: string | null;
    customer_account: string;
    customer: JneCustomer | null;
    customer_match_status: string;
    pickup_reference: string | null;
    tracking_status: string;
    status_web: string | null;
    status_pod: string | null;
    entry_at: string | null;
    source_status_at: string | null;
    observed_at: string | null;
    received_at: string | null;
    terminal: boolean;
    freshness: "terminal" | "unobserved" | "unconfigured" | "stale" | "fresh";
    source_report_id: number | null;
};

export type TrackingHistory = {
    id: number;
    tracking_status: string;
    changes_current: boolean;
    observed_at: string;
    received_at: string;
    source_status_at: string | null;
    status_web: string | null;
    status_pod: string | null;
    report_id: number;
    source_row: number;
};

export type TrackingPage = JnePage<TrackingShipment>;

export type MonitoringSummary = {
    calculated_at?: string;
    over_sla: number;
    potential_overdue: number;
    native_sla_distribution: Record<string, number>;
    excluded: number;
    returned: number;
    sla_distribution: Record<string, number>;
    on_time_rate: number | null;
    delivered_evaluated: number;
    delivered_unknown: number;
    total: number;
    active: number;
    delivered: number;
    cancelled: number;
    unknown: number;
    exception: number;
    failed_final: null;
    stale: number | null;
    unobserved: number;
    source_missing: number;
    unlinked: number;
    attention: number;
    distribution: Record<string, number>;
    observed_at: string | null;
};

export const freshnessLabels: Record<TrackingShipment["freshness"], string> = {
    terminal: "Terminal",
    unobserved: "Belum diamati",
    unconfigured: "Waktu pengamatan tersedia",
    stale: "Data belum diperbarui",
    fresh: "Dalam batas usia",
};

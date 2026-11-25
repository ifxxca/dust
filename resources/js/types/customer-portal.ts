export type PortalCustomer = {
    id: number;
    name: string;
    customer_code: string | null;
};
export type PortalFilters = {
    date_from: string;
    date_to: string;
    q: string;
    status: string;
    category: string;
};
export type PortalPagination<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
};
export type PortalShipment = {
    id: number;
    awb: string;
    shipper_name: string | null;
    consignee_name: string | null;
    category: string | null;
    tracking_status: string;
    amount_cents: number | null;
    entry_at: string | null;
    picked_up_at: string | null;
    pickup_id: number | null;
    pickup_reference: string | null;
};
export type PortalPickup = {
    id: number;
    reference: string;
    picked_up_at: string | null;
    staff: string | null;
    manual: number;
    cashless: number;
    orion: number;
    total: number;
    awb_count: number;
    amount_cents: number | null;
    amount_complete: boolean;
    handover_status: string;
    reconciliation_status: string;
};
export type PortalSummary = {
    total: number;
    pickups: number;
    active: number;
    delivered: number;
    updated_at: string | null;
    by_status: { status: string; total: number }[];
    groups: {
        manual: number;
        cashless: number;
        cod: number;
        non_cod: number;
        cod_unknown: number;
    };
    recent_pickups: PortalPickup[];
};
export type PortalProps = {
    section: 'dashboard' | 'monitoring' | 'history';
    customer: PortalCustomer | null;
    filters: PortalFilters;
    isAdmin: boolean;
    summary: PortalSummary | null;
    shipments: PortalPagination<PortalShipment> | null;
    pickups: PortalPagination<PortalPickup> | null;
};
export type PortalPickupDetail = {
    pickup: PortalPickup;
    shipments: PortalPagination<PortalShipment>;
    manifests: { id: number; revision: number }[];
    attachments: { id: number; kind: string }[];
    notes: string | null;
};
export type PortalShipmentDetail = {
    awb: string;
    shipper: string | null;
    consignee: string | null;
    address: string;
    status: string;
    status_text: string | null;
    entry_at: string | null;
    picked_up_at: string | null;
    observed_at: string | null;
    service: string | null;
    destination: string | null;
    amount_cents: number | null;
    pickup: { id: number; reference: string } | null;
    category: string | null;
    district: string | null;
    weight_grams: number | null;
    quantity: number | null;
    delivered_at: string | null;
    status_at: string | null;
    history: PortalPagination<{
        status: string;
        description: string | null;
        pod: string | null;
        status_at: string | null;
        observed_at: string;
    }>;
};

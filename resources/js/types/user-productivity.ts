export type ProductivityFilters = {
    date_from: string;
    date_thru: string;
    q: string;
    manual_seconds: number | string;
    cashless_seconds: number | string;
    orion_seconds: number | string;
};

export type ProductivityRow = {
    staff: string | null;
    name: string;
    manual: number;
    cashless: number;
    orion: number;
    total: number;
    unclassified: number;
    estimated_seconds: number;
    productivity_percent: number | null;
};

export type ProductivityData = {
    rows: ProductivityRow[];
    days: number;
    capacity_seconds: number;
    totals: Record<
        | 'total'
        | 'manual'
        | 'cashless'
        | 'orion'
        | 'unclassified'
        | 'missing_staff',
        number
    >;
};

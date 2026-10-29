export type CashlessResult = {
    id: number;
    task_id: number;
    reference: string;
    customer: string;
    status: string;
    server: string;
    ho_number: string | null;
    message: string | null;
    total: number;
    accepted: number;
    items: {
        data: {
            id: number;
            awb: string;
            status: string;
            message: string | null;
        }[];
        current_page: number;
        last_page: number;
        total: number;
    };
};

export type CashlessPickup = {
    id: number;
    reference: string;
    customer: string;
    scheduled_at: string;
    status: string;
    target: number | null;
    saved_count: number;
    can_record: boolean;
};

export type CashlessPage<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
};

export type SelectedCashlessPickup = CashlessPickup & {
    awbs: CashlessPage<{ id: number; awb: string; created_at: string }>;
    entry_batches?: CashlessEntryBatch[];
    entry_enabled?: boolean;
};

export type CashlessEntryBatch = {
    id: number;
    source: string | null;
    status: string;
    ho_number: string | null;
    error_message: string | null;
    items_count: number;
    items: {
        id: number;
        awb: string;
        status: string;
        message: string | null;
    }[];
};
export type ScannedCashlessEntry = {
    status: string;
    message: string | null;
    updated_at: string;
    batch_id: number;
    batch_status: string;
    ho_number: string | null;
    approved_at: string | null;
    batch_message: string | null;
};

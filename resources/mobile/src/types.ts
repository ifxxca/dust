export type Account = {
    id: number;
    name: string;
    role: string;
    is_active: boolean;
};
export type Session = {
    token: string;
    user: Account;
    environment: string;
    expiresAt: string;
    timezone: string;
    locked: boolean;
};
export type Task = {
    id: number;
    reference: string;
    customer: { id: number; name: string };
    pickup_address: string;
    scheduled_at: string;
    status: string;
    version: number;
    pickup_type: string;
    assigned_staff: { id: number; name: string } | null;
    previous_task_id?: number | null;
    contact?: string;
    notes?: string | null;
    execution_started_at?: string | null;
    can: {
        take_over: boolean;
        execute?: boolean;
        retry?: boolean;
        create_follow_up?: boolean;
    };
    visits?: Visit[];
    events?: { action: string; actor_id: number; task_version: number }[];
    proof?: Proof | null;
    cashless_awbs?: string[];
    handover_session_id?: number | null;
};
export type Visit = {
    id: number;
    staff_id: number;
    outcome: 'COLLECTED' | 'NO_PACKAGES' | null;
    reason: string | null;
    notes: string | null;
};
export type TaskPage = {
    summary?: {
        date: string;
        total: number;
        waiting: number;
        handling: number;
        successful: number;
        no_packages: number;
    };
    data: Task[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
};
export type LoginResult = {
    data: { token: string; expires_at: string; user: Account };
    meta: { operational_timezone: string };
};
export type MeResult = {
    data: Account;
    meta: { operational_timezone: string };
};
export type Evidence = { id: number; kind: 'photo' | 'signature'; url: string };
export type Proof = {
    id: number;
    customer_name?: string;
    pickup_address?: string;
    contact?: string;
    manual_hybrid: number;
    cashless_hybrid: number;
    css_orion: number;
    total: number;
    notes: string | null;
    revision: number;
    finalized_at: string;
    attachments: Evidence[];
    original: Record<string, unknown>;
    revisions: {
        revision: number;
        reason: string;
        values: Record<string, unknown>;
    }[];
    receipt: {
        status: string;
        proof_revision?: number;
        accepted_at?: string | null;
        delivered_at?: string | null;
    } | null;
};

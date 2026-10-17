export type User = {
    id: number;
    name: string;
    email: string;
    role: 'cs' | 'pickup_staff' | 'retail_staff' | 'admin_supervisor';
    is_active: boolean;
    avatar?: string;
    email_verified_at: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
};

export type Auth = {
    user: User;
};

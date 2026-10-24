import { operations } from '@/routes';

export type CustomerListFilters = {
    q: string;
    status: 'all' | 'active' | 'inactive';
    page: number;
};

export function customerListFilters(url: string): CustomerListFilters {
    const params = new URL(url, 'http://localhost').searchParams;
    const status = params.get('status');
    const page = Number(params.get('page'));
    return {
        q: (params.get('q') ?? '').trim().slice(0, 100),
        status: status === 'active' || status === 'inactive' ? status : 'all',
        page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    };
}

export function customerListUrl(filters: CustomerListFilters): string {
    return operations.url(
        { screen: 'customers' },
        {
            query: {
                q: filters.q || undefined,
                status: filters.status !== 'all' ? filters.status : undefined,
                page: filters.page > 1 ? filters.page : undefined,
            },
        },
    );
}

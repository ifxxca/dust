import { Link } from '@inertiajs/react';
import { index } from '@/routes/pickup-results';
export default function PickupMonitoringViews({
    filters,
    current,
}: {
    filters: Record<string, string>;
    current: 'pickup' | 'processing';
}) {
    const shared = Object.fromEntries(
        Object.entries(filters).filter(([key]) =>
            [
                'date_from',
                'date_to',
                'date_basis',
                'scope',
                'q',
                'reference',
                'customer',
                'staff',
                'staff_id',
                'customer_id',
                'per_page',
            ].includes(key),
        ),
    );
    return (
        <nav
            aria-label="Monitoring Hasil Pickup"
            className="flex gap-5 overflow-x-auto border-b"
        >
            {(
                [
                    ['processing', 'Monitoring Pemrosesan Paket'],
                    ['pickup', 'Monitoring Pickup'],
                ] as const
            ).map(([key, label]) => (
                <Link
                    key={key}
                    href={index({
                        query: {
                            ...shared,
                            ...(shared.scope === 'outstanding'
                                ? { scope: 'daily' }
                                : {}),
                            monitoring: key,
                        },
                    })}
                    aria-current={current === key ? 'page' : undefined}
                    className={`shrink-0 border-b-2 px-1 py-3 text-sm font-medium ${current === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                    {label}
                </Link>
            ))}
        </nav>
    );
}

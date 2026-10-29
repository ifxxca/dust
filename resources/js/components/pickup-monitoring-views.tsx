import { Link } from '@inertiajs/react';
import { index } from '@/routes/pickup-results';
export default function PickupMonitoringViews({
    filters,
    current,
}: {
    filters: Record<string, string>;
    current: 'pickup' | 'processing';
}) {
    if (current === 'pickup') return null;
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
            aria-label="Kembali ke hasil pickup"
            className="flex items-center gap-3 text-sm"
        >
            <Link
                href={index({
                    query: {
                        ...shared,
                        ...(shared.scope === 'outstanding'
                            ? { scope: 'daily' }
                            : {}),
                        monitoring: 'pickup',
                    },
                })}
                className="font-medium text-primary underline-offset-4 hover:underline"
            >
                Kembali ke Hasil Pickup
            </Link>
        </nav>
    );
}

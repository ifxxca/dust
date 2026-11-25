import { index } from '@/routes/shipment-monitoring';
import type { PerformanceFilters } from '@/types/operational-performance';

export const performanceNumber = (value: number | null) =>
    value === null ? '—' : new Intl.NumberFormat('id-ID').format(value);

export function performanceDrilldown(
    filters: PerformanceFilters,
    extra: Record<string, string | number> = {},
) {
    return index.url({
        query: {
            date_from: filters.date_from,
            date_thru: filters.date_thru,
            ...(filters.outlet ? { outlet: filters.outlet } : {}),
            ...(filters.customer_id
                ? { customer_id: filters.customer_id, attribution: 'matched' }
                : {}),
            ...extra,
        },
    });
}

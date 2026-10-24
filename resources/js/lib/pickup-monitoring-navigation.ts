import { index, show } from '@/routes/pickup-results';

const base = 'http://monitoring.invalid';
export function pickupDetailUrl(
    id: number,
    context: string,
    tab = 'summary',
    action?: string,
): string {
    return show.url(id, {
        query: {
            tab,
            return_to: context,
            ...(action ? { operation: action } : {}),
        },
    });
}
export function quickPickupId(url: string): number | null {
    const value = new URL(url, base).searchParams.get('quick_pickup');
    const id = value && /^[1-9]\d*$/.test(value) ? Number(value) : null;
    return id && Number.isSafeInteger(id) ? id : null;
}
export function processingDetailUrl(
    id: number,
    context: string,
    record = false,
): string {
    return show.url(id, {
        query: {
            tab: 'processing',
            return_to: context,
            ...(record ? { record_processing: '1' } : {}),
        },
    });
}
export function monitoringBackUrl(pageUrl: string): string {
    const value = new URL(pageUrl, base).searchParams.get('return_to');
    if (value) {
        try {
            const target = new URL(value, base);
            if (target.origin === base && target.pathname === index.url()) {
                return index.url({
                    query: Object.fromEntries(target.searchParams),
                });
            }
        } catch {
            /* Invalid return context falls back to monitoring. */
        }
    }
    return index.url({ query: { monitoring: 'processing' } });
}

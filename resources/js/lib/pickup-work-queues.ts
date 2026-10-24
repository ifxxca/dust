export const pickupQueueLabels: Record<string, string> = {
    not_visited: 'Belum Dikunjungi',
    incomplete: 'POP Belum Final',
    waiting_handover: 'Menunggu Handover',
    unverified: 'Menunggu Verifikasi',
    discrepancy: 'Ada Selisih',
};
const identityKeys = [
    'q',
    'reference',
    'customer',
    'staff',
    'customer_id',
    'staff_id',
];
export function pickupQueueFilters(
    filters: Record<string, string>,
    queue: string,
    crossDay = false,
): Record<string, string> {
    return {
        ...Object.fromEntries(
            Object.entries(filters).filter(
                ([key]) =>
                    identityKeys.includes(key) ||
                    [
                        'date_from',
                        'date_to',
                        'date_basis',
                        'per_page',
                        'sort',
                        'direction',
                    ].includes(key),
            ),
        ),
        monitoring: 'pickup',
        scope: crossDay ? 'outstanding' : 'daily',
        pickup_queue: queue,
        page: '1',
    };
}

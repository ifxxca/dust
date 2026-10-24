export const trackingLabels: Record<string, string> = {
    DELIVERED: 'Terkirim',
    CANCELLED: 'Dibatalkan',
    RETURNED: 'Dikembalikan',
    IN_TRANSIT: 'Dalam proses',
    EXCEPTION: 'Kendala pengiriman',
    UNKNOWN: 'Status belum dikenali',
};
export const matchLabels: Record<string, string> = {
    MATCHED: 'Terhubung',
    UNMATCHED: 'Belum terhubung',
    AMBIGUOUS: 'Perlu pemeriksaan',
};
export function jneTimestamp(value: string | null, timezone: string): string {
    if (!value) return '—';
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
        ? value.replace(' ', 'T') + 'Z'
        : value;
    const date = new Date(normalized);
    return Number.isFinite(date.getTime())
        ? new Intl.DateTimeFormat('id-ID', {
              timeZone: timezone,
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(date)
        : '—';
}

export const emptyJneFilters = {
    q: '',
    account: '',
    status: '',
    match: '',
    customer_id: '',
    customer_match: '',
};

export function normalizeJneFilters(
    filters: Partial<
        Record<keyof typeof emptyJneFilters, string | number | null>
    >,
): typeof emptyJneFilters {
    return Object.fromEntries(
        Object.keys(emptyJneFilters).map((key) => [
            key,
            String(filters[key as keyof typeof emptyJneFilters] ?? ''),
        ]),
    ) as typeof emptyJneFilters;
}

export function latestJneObservation(
    rows: { observed_at: string | null }[],
): string | null {
    return rows.reduce<string | null>((latest, row) => {
        if (!row.observed_at || !Number.isFinite(Date.parse(row.observed_at)))
            return latest;
        return !latest || Date.parse(row.observed_at) > Date.parse(latest)
            ? row.observed_at
            : latest;
    }, null);
}

import { trackingLabels } from '@/lib/jne-monitoring';
import type { TrackingShipment } from '@/types/shipment-monitoring';

export function monitoringDateInput(value: string, end = false): string {
    if (!value || value.includes('T')) return value;
    if (!end) return value + 'T05:00';
    const date = new Date(value + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10) + 'T04:59';
}

export function monitoringPeriodLabel(from?: string, thru?: string): string {
    const format = (value?: string) =>
        value
            ? new Intl.DateTimeFormat('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  ...(value.includes('T')
                      ? { hour: '2-digit', minute: '2-digit' }
                      : {}),
                  timeZone: 'UTC',
              }).format(
                  new Date(
                      value.length === 10
                          ? value + 'T00:00:00Z'
                          : value + ':00Z',
                  ),
              )
            : '—';
    return from || thru
        ? format(from) + ' – ' + format(thru)
        : '14 hari terakhir';
}

export type TrackingFilters = {
    native_sla_grade: string;
    sla_status: string;
    service: string;
    destination: string;
    overdue_min: string;
    overdue_max: string;
    q: string;
    shipper: string;
    customer_id: string;
    customer_link: string;
    attention: string;
    status: string;
    lifecycle: string;
    date_from: string;
    date_thru: string;
    freshness_hours: string;
    freshness: string;
    per_page: string;
    outlet?: string;
    attribution?: string;
    source_service?: string;
    source_code?: string;
    source_reason?: string;
    source_web?: string;
    source_pod?: string;
};
export const emptyTrackingFilters: TrackingFilters = {
    native_sla_grade: '',
    sla_status: '',
    service: '',
    destination: '',
    overdue_min: '',
    overdue_max: '',
    q: '',
    shipper: '',
    customer_id: '',
    customer_link: '',
    attention: '',
    status: '',
    lifecycle: '',
    date_from: '',
    date_thru: '',
    freshness_hours: '',
    freshness: '',
    per_page: '20',
};

export function normalizeTrackingFilters(
    values: Partial<Record<keyof TrackingFilters, string | number | null>>,
): TrackingFilters {
    const normalized = Object.fromEntries(
        Object.entries(emptyTrackingFilters).map(([key, fallback]) => [
            key,
            String(values[key as keyof TrackingFilters] ?? fallback),
        ]),
    ) as TrackingFilters;
    for (const key of [
        'outlet',
        'attribution',
        'source_service',
        'source_code',
        'source_reason',
        'source_web',
        'source_pod',
    ] as const) {
        if (key in values) normalized[key] = String(values[key] ?? '');
    }
    return normalized;
}

export function trackingFilterChips(
    filters: TrackingFilters,
    customerName?: string,
) {
    const chips: { key: keyof TrackingFilters; label: string }[] = [];
    for (const [key, label] of [
        ['outlet', 'Outlet'],
        ['attribution', 'Atribusi'],
        ['source_service', 'Layanan sumber'],
        ['source_code', 'Kode sumber'],
        ['source_reason', 'Keterangan sumber'],
        ['source_web', 'Status web'],
        ['source_pod', 'Status POD'],
        ['sla_status', 'SLA'],
        ['native_sla_grade', 'Native SLA'],
        ['service', 'Layanan'],
        ['destination', 'Destinasi'],
        ['overdue_min', 'Nilai SLA minimal'],
        ['overdue_max', 'Nilai SLA maksimal'],
    ] as const) {
        if (
            filters[key] !== undefined &&
            (filters[key] !== '' ||
                key.startsWith('source_') ||
                key === 'outlet')
        )
            chips.push({
                key,
                label: `${label}: ${filters[key] || 'Belum tersedia'}`,
            });
    }
    if (filters.q) chips.push({ key: 'q', label: `AWB: ${filters.q}` });
    if (filters.shipper)
        chips.push({ key: 'shipper', label: `Pengirim: ${filters.shipper}` });
    if (filters.customer_id)
        chips.push({
            key: 'customer_id',
            label: customerName ?? 'Customer dipilih',
        });
    if (filters.customer_link)
        chips.push({
            key: 'customer_link',
            label:
                filters.customer_link === 'linked'
                    ? 'Customer terhubung'
                    : 'Customer belum terhubung',
        });
    if (filters.status)
        chips.push({
            key: 'status',
            label: trackingLabels[filters.status] ?? filters.status,
        });
    if (filters.lifecycle)
        chips.push({
            key: 'lifecycle',
            label:
                filters.lifecycle === 'terminal'
                    ? 'Pemantauan selesai'
                    : 'Masih Dipantau',
        });
    if (filters.date_from || filters.date_thru)
        chips.push({
            key: 'date_from',
            label: `Periode: ${monitoringPeriodLabel(filters.date_from, filters.date_thru)} · WIB`,
        });
    if (filters.freshness_hours)
        chips.push({
            key: 'freshness_hours',
            label: `Batas pembaruan: ${filters.freshness_hours} jam`,
        });
    if (filters.freshness)
        chips.push({
            key: 'freshness',
            label:
                filters.freshness === 'stale'
                    ? 'Data belum diperbarui'
                    : 'Belum pernah diamati',
        });
    return chips;
}

export function removeTrackingFilter(
    filters: TrackingFilters,
    key: keyof TrackingFilters,
): TrackingFilters {
    const next = { ...filters, [key]: emptyTrackingFilters[key] };
    if (key === 'date_from') next.date_thru = '';
    if (key === 'freshness_hours' && next.freshness === 'stale')
        next.freshness = '';
    return next;
}

export const attentionCategories = [
    ['all', 'Semua perhatian', 'attention'],
    ['over_sla', 'Over SLA', 'over_sla'],
    ['potential_overdue', 'Indikasi Over SLA', 'potential_overdue'],
    ['exception', 'Kendala pengiriman', 'exception'],
    ['return', 'Return', 'returned'],
] as const;

export const slaLabels: Record<string, string> = {
    ON_TIME: 'Sesuai SLA',
    OVER_SLA: 'Melewati SLA',
    DELIVERED_ON_TIME: 'Terkirim tepat waktu',
    DELIVERED_LATE: 'Terkirim terlambat',
    EXCLUDED: 'Dikecualikan',
    RETURN: 'Pemantauan return',
    UNKNOWN: 'Belum dapat dinilai',
};

export const nativeSlaLabels: Record<string, string> = {
    ON_TIME: 'Sesuai SLA',
    OVER_SLA: 'Melewati SLA',
    UNKNOWN: 'Belum dapat dinilai',
};

export function slaDuration(shipment: TrackingShipment): string {
    const variance = shipment.sla_variance;
    if (variance === null || variance === undefined)
        return 'Belum dapat dinilai';
    return `Nilai SLA JNE: ${variance}`;
}

export function attentionReasons(
    shipment: TrackingShipment,
): { label: string; group: string }[] {
    const reasons = [];
    if (shipment.sla_status === 'OVER_SLA')
        reasons.push({ label: 'Melewati SLA', group: 'SLA' });
    if (shipment.potential_overdue)
        reasons.push({
            label: 'Indikasi Over SLA',
            group: 'Indikator internal',
        });
    if (shipment.tracking_status === 'EXCEPTION')
        reasons.push({
            label: shipment.status_web?.includes('HELD')
                ? 'Paket ditahan'
                : ['UNDEL', 'UNDELIVERED'].includes(
                        shipment.status_pod?.toUpperCase() ?? '',
                    )
                  ? 'Gagal antar'
                  : 'Kendala dilaporkan sumber',
            group: 'Pengiriman',
        });
    if (shipment.tracking_status === 'RETURNED')
        reasons.push({
            label: 'Return perlu ditindaklanjuti',
            group: 'Pengiriman',
        });
    return reasons;
}

export function trackingStatusScope(filters: TrackingFilters): string {
    if (filters.status) return filters.status;
    if (filters.lifecycle === 'active') return 'active';
    return filters.lifecycle ? 'terminal' : 'all';
}

export function trackingStatusFilters(
    filters: TrackingFilters,
    scope: string,
): TrackingFilters {
    return {
        ...filters,
        status: ['all', 'active'].includes(scope) ? '' : scope,
        lifecycle: scope === 'active' ? 'active' : '',
    };
}

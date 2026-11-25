import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { MonitoringKpis } from '@/components/shipment-monitoring-ui';
import MonitoringTable from '@/components/shipment-monitoring-table';
import { OperationalDonut } from '@/components/operational-dashboard-charts';
import ShipmentOverview from '@/pages/shipment-monitoring-overview';
import DateRangeFields from '@/components/date-range-fields';
import { ShipmentTrend } from '@/components/shipment-monitoring-charts';
import {
    attentionReasons,
    slaDuration,
    emptyTrackingFilters,
    normalizeTrackingFilters,
    removeTrackingFilter,
    trackingFilterChips,
    trackingStatusFilters,
    trackingStatusScope,
    monitoringDateInput,
    monitoringPeriodLabel,
} from './shipment-monitoring';
import type {
    MonitoringSummary,
    TrackingShipment,
} from '@/types/shipment-monitoring';

vi.mock('@inertiajs/react', () => ({
    Deferred: ({ children }: { children: () => ReactNode }) => children(),
    Head: () => null,
    router: { get: vi.fn(), reload: vi.fn() },
    useForm: (data: Record<string, unknown>) => ({
        data,
        errors: {},
        setData: vi.fn(),
        get: vi.fn(),
    }),
    Link: ({
        href,
        children,
        className,
    }: {
        href: string | { url: string };
        children: ReactNode;
        className?: string;
    }) => (
        <a
            href={typeof href === 'string' ? href : href.url}
            className={className}
        >
            {children}
        </a>
    ),
}));
const summary: MonitoringSummary = {
    over_sla: 1,
    potential_overdue: 0,
    native_sla_distribution: {},
    excluded: 2,
    returned: 1,
    sla_distribution: {},
    on_time_rate: null,
    delivered_evaluated: 0,
    delivered_unknown: 1,
    total: 6,
    active: 4,
    delivered: 1,
    cancelled: 1,
    unknown: 1,
    exception: 1,
    failed_final: null,
    stale: null,
    unobserved: 0,
    source_missing: 0,
    unlinked: 1,
    attention: 2,
    distribution: {
        DELIVERED: 1,
        CANCELLED: 1,
        UNKNOWN: 1,
        RETURNED: 1,
        EXCEPTION: 1,
        IN_TRANSIT: 1,
    },
    observed_at: null,
};
const row: TrackingShipment = {
    id: 1,
    awb: '00123',
    shipper_name: '864C PT KREASI PANEN JAYA',
    customer_account: 'SHARED',
    customer: null,
    customer_match_status: 'AMBIGUOUS',
    pickup_reference: null,
    tracking_status: 'UNKNOWN',
    status_web: 'FAILED',
    status_pod: null,
    entry_at: '2026-11-01T04:30:00+00:00',
    source_status_at: null,
    observed_at: null,
    received_at: null,
    terminal: false,
    freshness: 'unobserved',
    source_report_id: null,
};

test('KPI links use verified status scopes and retain the entry date cohort', () => {
    const html = renderToStaticMarkup(
        <MonitoringKpis
            summary={summary}
            filters={{ date_from: '2026-11-02' }}
        />,
    );
    expect(html).toContain('lifecycle=active');
    expect(html).toContain('status=DELIVERED');
    expect(html).toContain('sla_status=OVER_SLA');
    expect(html).toContain('date_from=2026-11-02');
    expect(html).not.toContain('FAILED');
    expect(html).toContain('Pengiriman Aktif');
});

test('shipment rows expose the source entry date in Jakarta time and leave missing entry unavailable', () => {
    const html = renderToStaticMarkup(
        <MonitoringTable rows={[row]} timezone="Asia/Jakarta" />,
    );
    expect(html).toContain('Tanggal Entry AWB');
    expect(html).toContain('1 Nov 2026, 11.30');
    const missing = renderToStaticMarkup(
        <MonitoringTable
            rows={[{ ...row, entry_at: null }]}
            timezone="Asia/Jakarta"
        />,
    );
    expect(missing).toContain('Tidak tersedia');
    expect(missing).not.toContain('1 Nov 2026');
});

test('shipper names remain visible on desktop and mobile even for unmapped shipments', () => {
    const html = renderToStaticMarkup(
        <MonitoringTable rows={[row]} timezone="Asia/Jakarta" />,
    );
    expect(html).toContain('Customer / Pengirim (report)');
    expect(html.match(/864C PT KREASI PANEN JAYA/g)).toHaveLength(2);
    const missing = renderToStaticMarkup(
        <MonitoringTable
            rows={[{ ...row, shipper_name: null }]}
            timezone="Asia/Jakarta"
        />,
    );
    expect(missing).toContain('Tidak tersedia');
});

test('shipper filters survive normalization and status navigation and can be removed independently', () => {
    const filters = normalizeTrackingFilters({
        shipper: 'KREASI',
        q: '0166',
        status: 'DELIVERED',
    });
    expect(trackingFilterChips(filters)).toContainEqual({
        key: 'shipper',
        label: 'Pengirim: KREASI',
    });
    expect(trackingStatusFilters(filters, 'active').shipper).toBe('KREASI');
    expect(removeTrackingFilter(filters, 'shipper')).toEqual({
        ...filters,
        shipper: '',
    });
});

test('attention reasons keep unknown failed text separate from confirmed delivery exceptions', () => {
    expect(attentionReasons(row)).toEqual([]);
    expect(
        attentionReasons({
            ...row,
            tracking_status: 'EXCEPTION',
            customer: { id: 2, name: 'Known', customer_code: null },
            freshness: 'fresh',
        }),
    ).toEqual([{ group: 'Pengiriman', label: 'Kendala dilaporkan sumber' }]);
});

test('stale labels describe observation threshold rather than delivery delay', () => {
    expect(
        attentionReasons({
            ...row,
            tracking_status: 'IN_TRANSIT',
            freshness: 'stale',
        }),
    ).toEqual([]);
});

test('status tabs replace conflicting lifecycle while preserving unrelated customer filters', () => {
    const active = {
        ...emptyTrackingFilters,
        lifecycle: 'active',
        customer_link: 'unlinked',
        q: '001',
    };
    expect(trackingStatusScope(active)).toBe('active');
    expect(trackingStatusFilters(active, 'DELIVERED')).toEqual({
        ...active,
        lifecycle: '',
        status: 'DELIVERED',
    });
    expect(trackingFilterChips(active)).toContainEqual({
        key: 'customer_link',
        label: 'Customer belum terhubung',
    });
});

test('distribution exposes counts in accessible chart text and handles empty data', () => {
    const html = renderToStaticMarkup(
        <OperationalDonut
            title="Distribusi Status"
            data={[
                { key: 'DELIVERED', label: 'Terkirim', value: 2 },
                { key: 'UNKNOWN', label: 'Belum dikenali', value: 1 },
            ]}
        />,
    );
    expect(html).toContain('Terkirim 2, Belum dikenali 1');
    expect(html).toContain('66,7');
    const empty = renderToStaticMarkup(
        <OperationalDonut
            title="Distribusi Status"
            data={[]}
            empty="Belum ada resi"
        />,
    );
    expect(empty).toContain('Belum ada resi');
    expect(empty).not.toContain('NaN');
});

test('native On Time retains its grade while overdue indication gets a separate reason', () => {
    const shipment = {
        ...row,
        tracking_status: 'EXCEPTION',
        native_sla_grade: 'ON_TIME' as const,
        sla_status: 'ON_TIME',
        source_carrer: 'On Time SLA',
        sla_variance: 0,
        potential_overdue: true,
    };
    const reasons = attentionReasons(shipment);
    expect(reasons).toContainEqual({
        group: 'Indikator internal',
        label: 'Indikasi Over SLA',
    });
    expect(reasons).toHaveLength(2);
    expect(slaDuration(shipment)).toBe('Nilai SLA JNE: 0');
    const html = renderToStaticMarkup(
        <MonitoringTable rows={[shipment]} timezone="Asia/Jakarta" attention />,
    );
    expect(html).toContain('Sesuai SLA');
    expect(html).toContain('Indikasi Over SLA');
    expect(html).not.toMatch(
        /Terlambat .* hari|Jatuh tempo hari ini|Sisa .* hari/,
    );
});

test.each([undefined, null])(
    'overview remains readable when native distribution is unavailable: %s',
    (distribution) => {
        const legacy = {
            ...summary,
            native_sla_distribution: distribution,
        } as unknown as MonitoringSummary;
        const html = renderToStaticMarkup(
            <ShipmentOverview
                summary={legacy}
                preview={[]}
                filters={{}}
                timezone="Asia/Jakarta"
            />,
        );
        expect(html).toContain('Monitoring Resi');
        expect(html).toContain('Delivery Performance');
        expect(html).not.toContain('NaN');
        expect(html).not.toContain('Usia Keterlambatan Aktif');
    },
);

test('overview renders delivery performance using the evaluated delivered denominator', () => {
    const html = renderToStaticMarkup(
        <ShipmentOverview
            summary={{
                ...summary,
                sla_distribution: { DELIVERED_ON_TIME: 8, DELIVERED_LATE: 2 },
                on_time_rate: 80,
                delivered_evaluated: 10,
            }}
            preview={[]}
            filters={{}}
            timezone="Asia/Jakarta"
        />,
    );
    expect(html).toContain('80%');
    expect(html).toContain('10 delivered dapat dinilai');
    expect(html).toContain('Tepat waktu');
    expect(html).toContain('Terlambat');
});

test('date time inputs preserve legacy operational boundaries and explicit minute values', () => {
    expect(monitoringDateInput('2026-11-25')).toBe('2026-11-25T05:00');
    expect(monitoringDateInput('2026-11-25', true)).toBe('2026-11-26T04:59');
    expect(monitoringDateInput('2026-11-25T00:30', true)).toBe(
        '2026-11-25T00:30',
    );
    expect(
        monitoringPeriodLabel('2026-11-25T00:30', '2026-11-25T01:00'),
    ).toContain('00.30');
    const html = renderToStaticMarkup(
        <DateRangeFields
            id="period"
            type="datetime-local"
            from="2026-11-12T05:00"
            thru="2026-11-26T04:59"
            onFromChange={() => {}}
            onThruChange={() => {}}
        />,
    );
    expect(html.match(/type="datetime-local"/g)).toHaveLength(2);
    expect(html).toContain('min="2026-11-12T05:00"');
});

test('shipment trend exposes actual daily values and a readable data table', () => {
    const html = renderToStaticMarkup(
        <ShipmentTrend
            data={[{ date: '2026-11-25', entered: 12, delivered: 9 }]}
        />,
    );
    expect(html).toContain('AWB masuk 12');
    expect(html).toContain('Terkirim 9');
    expect(html).toContain('Data harian');
    expect(html).not.toContain('NaN');
});

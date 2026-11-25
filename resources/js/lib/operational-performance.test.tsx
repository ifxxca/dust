import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import {
    normalizeTrackingFilters,
    removeTrackingFilter,
    trackingFilterChips,
} from './shipment-monitoring';
import {
    PerformanceContent,
    PerformanceKpis,
} from '@/components/operational-performance-content';
import {
    performanceDrilldown,
    performanceNumber,
} from './operational-performance';
import type {
    PerformanceCounts,
    PerformanceData,
    PerformanceFilters,
} from '@/types/operational-performance';

vi.mock('@inertiajs/react', () => ({
    Link: ({
        href,
        children,
        ...props
    }: {
        href: string;
        children: ReactNode;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

const counts: PerformanceCounts = {
    total: 2,
    delivered: 1,
    active: 1,
    returned: 1,
    exceptions: 0,
    attention: 1,
    unknown: 0,
    unlinked: 1,
};
const filters: PerformanceFilters = {
    period: 'custom',
    date_from: '2026-11-01',
    date_thru: '2026-11-02',
    outlet: 'Outlet A',
    customer_id: 7,
};
const performance: PerformanceData = {
    summary: {
        ...counts,
        observed_at: null,
        undated: 1,
        on_sla: null,
        over_sla: null,
        on_time_success_rate: null,
        unrcc: null,
    },
    customers: {
        data: [{ ...counts, customer_id: null, customer_name: null }],
        current_page: 1,
        last_page: 1,
        total: 1,
    },
    services: [{ ...counts, label: 'UNVERIFIED_CODE' }],
    services_truncated: false,
    outlets: [{ ...counts, label: 'Outlet A' }],
    outlets_truncated: false,
    outlet_options: ['Outlet A'],
    outlet_options_truncated: false,
    daily: [{ ...counts, date: '2026-11-01' }],
    exceptions: { rows: [], truncated: false },
    returns: {
        rows: [
            {
                code: '0',
                description: '<script>source reason</script>',
                status_web: 'RETURNED',
                status_pod: null,
                total: 1,
            },
        ],
        truncated: false,
    },
    attention: [
        {
            id: 1,
            awb: '000123',
            customer_name: null,
            customer_match_status: 'AMBIGUOUS',
            tracking_status: 'RETURNED',
            status_web: 'RETURNED',
            status_pod: null,
            note: null,
            responsible_party: null,
            last_follow_up_at: null,
            follow_up_state: null,
        },
    ],
    limitations: {
        sla: 'SLA belum terverifikasi, termasuk 19:00.',
        unrcc: 'UNRCC belum terverifikasi.',
        returns: 'Kode sumber.',
        follow_up: 'Daftar baca saja.',
        outlet: 'Label sumber.',
    },
};

test('AWB drilldown retains every global population constraint', () => {
    const url = new URL(
        performanceDrilldown(filters, {
            status: 'RETURNED',
            source_code: '0',
            source_reason: '',
        }),
        'http://localhost',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
        date_from: '2026-11-01',
        date_thru: '2026-11-02',
        outlet: 'Outlet A',
        customer_id: '7',
        attribution: 'matched',
        status: 'RETURNED',
        source_code: '0',
        source_reason: '',
    });
});

test('unavailable counts are distinct from measured zero', () => {
    expect(performanceNumber(null)).toBe('—');
    expect(performanceNumber(0)).toBe('0');
});

test('monitoring keeps exact source drilldown filters across normalization and removes them deliberately', () => {
    const normalized = normalizeTrackingFilters({
        source_code: '0',
        source_reason: null,
        outlet: 'Outlet A',
        attribution: 'matched',
    });
    expect(normalized.source_code).toBe('0');
    expect(normalized.source_reason).toBe('');
    expect(trackingFilterChips(normalized)).toContainEqual({
        key: 'source_reason',
        label: 'Keterangan sumber: Belum tersedia',
    });
    expect(
        removeTrackingFilter(normalized, 'source_code').source_code,
    ).toBeUndefined();
    expect(normalizeTrackingFilters({}).source_code).toBeUndefined();
});

test('KPI links expose independent active return and exception populations', () => {
    const html = renderToStaticMarkup(
        <PerformanceKpis performance={performance} filters={filters} />,
    );
    expect(html).toContain('lifecycle=active');
    expect(html).toContain('status=RETURNED');
    expect(html).toContain('status=EXCEPTION');
    expect(html).not.toContain('NaN');
});

test('one cohesive page exposes SLA customer exceptions and followup without ERP or Batch Time', () => {
    const html = renderToStaticMarkup(
        <PerformanceContent
            performance={performance}
            filters={filters}
            onCustomerPage={() => {}}
        />,
    );
    for (const id of ['sla', 'customers', 'exceptions', 'follow-up'])
        expect(html).toContain(`id="${id}"`);
    expect(html).not.toContain('ERP');
    expect(html).not.toContain('Batch Time');
    expect(html).toContain('UNVERIFIED_CODE');
    expect(html).toContain('SLA On Time Success belum tersedia');
    expect(html).not.toContain('>0%<');
});

test('unresolved attribution uses a badge and an unresolved drilldown without guessing ownership', () => {
    const html = renderToStaticMarkup(
        <PerformanceContent
            performance={performance}
            filters={{ ...filters, customer_id: null }}
            onCustomerPage={() => {}}
        />,
    );
    expect(html).toContain('Belum Terhubung');
    expect(html).toContain('attribution=unresolved');
    expect(html).not.toContain('customer_id=7');
});

test('source reason text is escaped while original code and exact reason remain available for drilldown', () => {
    const html = renderToStaticMarkup(
        <PerformanceContent
            performance={performance}
            filters={filters}
            onCustomerPage={() => {}}
        />,
    );
    expect(html).toContain('&lt;script&gt;source reason&lt;/script&gt;');
    expect(html).not.toContain('<script>source reason');
    expect(html).toContain('source_code=0');
    expect(html).toContain('source_pod=');
});

test('read only followup never infers closure from the RETURNED carrier status', () => {
    const html = renderToStaticMarkup(
        <PerformanceContent
            performance={performance}
            filters={filters}
            onCustomerPage={() => {}}
        />,
    );
    expect(html).toContain('Belum dicatat');
    expect(html).toContain('Catatan follow-up');
    expect(html).not.toContain('Selesai otomatis');
    expect(html).toContain('/admin/shipment-monitoring/1?');
});

test('empty period keeps unavailable metrics explicit and offers a filter recovery', () => {
    const zero = Object.fromEntries(
        Object.keys(counts).map((key) => [key, 0]),
    ) as PerformanceCounts;
    const empty = {
        ...performance,
        summary: { ...performance.summary, ...zero },
        customers: { ...performance.customers, data: [] },
        services: [],
        outlets: [],
        returns: { rows: [], truncated: false },
        attention: [],
    };
    const html = renderToStaticMarkup(
        <PerformanceContent
            performance={empty}
            filters={filters}
            onCustomerPage={() => {}}
        />,
    );
    expect(html).toContain('Ubah periode, outlet, atau customer.');
    expect(html).toContain('Tidak ada AWB return');
    expect(html).toContain('Tidak ada AWB yang memerlukan perhatian');
    expect(html).not.toContain('NaN');
});

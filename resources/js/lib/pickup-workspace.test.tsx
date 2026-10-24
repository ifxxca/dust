import { MetricHelpContent } from '../components/monitoring-insights';
import PackageProcessingMonitoring from '../components/package-processing-monitoring';
import { expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import PickupMonitoring, {
    PickupPrimaryMetrics,
} from '../components/pickup-monitoring';
import { pickupQueueFilters } from './pickup-work-queues';
import {
    pickupDetailUrl,
    monitoringBackUrl,
} from './pickup-monitoring-navigation';
import { operationalRangeLabel } from '../components/pickup-monitoring-period';
import {
    ResultStatus,
    OperationalPickupContext,
} from '../components/pickup-result-ui';
import type { PickupResult } from '../types/pickup-result';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({
        href,
        children,
    }: {
        href: string | { url: string };
        children: ReactNode;
    }) => <a href={typeof href === 'string' ? href : href.url}>{children}</a>,
    usePage: () => ({ url: '/hasil-pickup?monitoring=pickup' }),
    useForm: (data: Record<string, string>) => ({
        data,
        errors: {},
        processing: false,
    }),
}));
const filters = {
    monitoring: 'pickup',
    date_from: '2026-10-19',
    date_to: '2026-10-19',
    date_basis: 'pickup',
};
const operations = {
    today: '2026-10-19',
    presets: {
        today: { date_from: '2026-10-19', date_to: '2026-10-19' },
        yesterday: { date_from: '2026-10-18', date_to: '2026-10-18' },
    },
    activity: { scheduled: 8, visited: 5 },
    backlog: {
        unconfirmed_quantity: 0,
        manual_remaining_quantity: 0,
        waiting_handover: 0,
        waiting_verification: 0,
        reconciliation_count: 0,
    },
};

test('primary Pickup cards expose five real work queue links within the same operational pickup day', () => {
    const html = renderToStaticMarkup(
        <PickupPrimaryMetrics
            filters={filters}
            operations={operations}
            overview={{ pop_final: 3, waiting_handover: 2, unverified: 1 }}
        />,
    );
    expect(html.match(/<a /g)).toHaveLength(5);
    expect(html).toContain('Pickup Dijadwalkan');
    expect(html).toContain('Pickup Dikunjungi');
    expect(html).toContain('date_basis=pickup');
    expect(html).toContain('visit_outcome=visited');
    expect(html).not.toContain('date_basis=visit');
    expect(html).toContain('pickup_queue=unverified');
    expect(html).not.toContain('Berhasil Diinput');
});
test('cross-day queues preserve identity and dates while clearing contradictory state filters and pagination', () => {
    expect(
        pickupQueueFilters(
            {
                ...filters,
                customer: 'Toko',
                q: 'ABC',
                pop_status: 'incomplete',
                verification_status: 'verified',
                group_by: 'staff',
                quick_pickup: '7',
                page: '3',
            },
            'waiting_handover',
            true,
        ),
    ).toEqual({
        ...filters,
        customer: 'Toko',
        q: 'ABC',
        scope: 'outstanding',
        pickup_queue: 'waiting_handover',
        page: '1',
    });
    const url = pickupDetailUrl(
        7,
        '/hasil-pickup?monitoring=pickup&page=3&scope=outstanding&pickup_queue=unverified&quick_pickup=7',
        'handover',
        'verify',
    );
    expect(monitoringBackUrl(url)).toContain(
        'monitoring=pickup&page=3&scope=outstanding',
    );
    expect(new URL(url, 'http://local').searchParams.get('tab')).toBe(
        'handover',
    );
    expect(new URL(url, 'http://local').searchParams.get('operation')).toBe(
        'verify',
    );
});
test('advanced Pickup controls are hidden and the main page ends at the operational table', () => {
    const html = renderToStaticMarkup(
        <PickupMonitoring
            pickups={{
                data: [],
                current_page: 1,
                last_page: 1,
                total: 0,
                from: null,
                to: null,
                prev_page_url: null,
                next_page_url: null,
            }}
            report={null}
            summary={{}}
            overview={{}}
            queues={{ not_visited: 2 }}
            filters={filters}
            timezone="Asia/Jakarta"
            operations={operations}
        />,
    );
    expect(html).toContain('id="pickup-advanced" hidden=""');
    expect(html).toContain('Tidak ada pickup sesuai filter');
    expect(html).not.toContain('Definisi, aktivitas');
    expect(html).not.toContain('Aktivitas Hari Ini');
    expect(html).not.toContain('Backlog paket belum terkonfirmasi');
    expect(html).toContain('Bantuan Metrik');
    expect(html).toContain('Aktivitas Harian');
    expect(html).toContain('Pekerjaan Tertunda');
    expect(html).toContain('Halaman 1 / 1');
    expect(html).toContain('scope=outstanding');
    expect(html.match(/placeholder="Cari referensi/g)).toHaveLength(1);
});
test('POP final, verified discrepancy, and closed handover retain separate labels', () => {
    const result = {
        finalized_at: '2026-10-19T05:00:00Z',
        handover_status: 'CLOSED',
        verification_status: 'DISCREPANCY',
        needs_review: false,
    } as PickupResult;
    const html = renderToStaticMarkup(
        <>
            {(['pop', 'handover', 'verification', 'discrepancy'] as const).map(
                (dimension) => (
                    <ResultStatus
                        key={dimension}
                        result={result}
                        dimension={dimension}
                    />
                ),
            )}
        </>,
    );
    expect(html).toContain('POP Final');
    expect(html).toContain('Ditutup');
    expect(html).toContain('Sudah diverifikasi');
    expect(html).toContain('Ada selisih');
    const noProof = renderToStaticMarkup(
        <ResultStatus
            result={{ task_status: 'ASSIGNED' } as PickupResult}
            dimension="pop"
        />,
    );
    expect(noProof).toContain('Belum dibuat');
});

test('metric help explains lifecycle and date scopes in plain Indonesian', () => {
    const html = renderToStaticMarkup(<MetricHelpContent processing />);
    for (const label of [
        'Pickup Dijadwalkan',
        'Pickup Dikunjungi',
        'POP Final',
        'Menunggu Handover',
        'Menunggu Verifikasi',
        'Ada Selisih',
        'Hari operasional dan status terbaru',
        'Pekerjaan lintas hari',
    ])
        expect(html).toContain(label);
    expect(html).toContain('konfirmasi belum tersedia');
    expect(html).toContain(
        'Catatan berhasil manual tetap ditampilkan terpisah',
    );
    expect(html).not.toMatch(/\bSQL\b|\bkohort\b|\bdelta\b|\brevisi\b/i);
});

test('processing monitoring also leaves analytics out of the main layout', () => {
    const html = renderToStaticMarkup(
        <PackageProcessingMonitoring
            data={{
                summary: {},
                categories: [],
                rows: {
                    data: [],
                    current_page: 1,
                    last_page: 1,
                    total: 0,
                    prev_page_url: null,
                    next_page_url: null,
                },
                source: 'MANUAL_ONLY',
                generated_at: '2026-10-19T05:00:00Z',
            }}
            filters={{ ...filters, monitoring: 'processing' }}
            operations={operations}
            timezone="Asia/Jakarta"
        />,
    );
    expect(html).not.toContain('Definisi, aktivitas');
    expect(html).not.toContain('Aktivitas Hari Ini');
    expect(html).toContain('Bantuan Metrik');
    expect(html).toContain('Pekerjaan Tertunda');
    expect(html).toContain('Halaman 1 / 1');
    expect(html.match(/text-3xl/g)).toHaveLength(4);
});

test('the shared operational label and subsequent handover context keep the pickup date explicit', () => {
    expect(operationalRangeLabel('2026-10-19')).toBe(
        'Hari Operasional: 19 Okt 2026 · 05.00–04.59 WIB',
    );
    expect(operationalRangeLabel('2026-10-13', '2026-10-19')).toContain(
        '13 Okt 2026 – 19 Okt 2026',
    );
    const html = renderToStaticMarkup(
        <OperationalPickupContext
            result={
                {
                    operational_date: '2026-10-19',
                    period_source: 'PICKUP',
                    handed_over_at: '2026-10-22T02:00:00Z',
                    subsequent_handover: true,
                } as PickupResult
            }
            timezone="Asia/Jakarta"
        />,
    );
    expect(html).toContain('Hari Operasional: 19 Okt 2026');
    expect(html).toContain('Handover pada hari berikutnya');
    expect(html).not.toContain('SLA');
    const planned = renderToStaticMarkup(
        <OperationalPickupContext
            result={
                {
                    operational_date: '2026-10-19',
                    period_source: 'SCHEDULE',
                } as PickupResult
            }
            timezone="Asia/Jakarta"
        />,
    );
    expect(planned).toContain('Rencana · belum dikunjungi');
});

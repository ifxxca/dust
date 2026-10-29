import { expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { PickupOperationsSummary } from '../components/pickup-monitoring-period';
import type { MonitoringOperations } from '../components/pickup-monitoring-period';
import {
    ProcessingMetrics,
    ProcessingSource,
    processingDate,
    ProcessingDeclarations,
} from '../components/package-processing-ui';

vi.mock('@inertiajs/react', () => ({
    Link: ({
        href,
        children,
    }: {
        href: string | { url: string };
        children: ReactNode;
    }) => <a href={typeof href === 'string' ? href : href.url}>{children}</a>,
    router: {},
    useForm: () => ({}),
}));

test('manual success is shown independently while external confirmation is explicitly unavailable', () => {
    const summary = {
        pop_quantity: 10,
        received_quantity: 12,
        confirmed_quantity: null,
        manual_quantity: 7,
        pending_quantity: 0,
        failed_quantity: 0,
        unconfirmed_quantity: 12,
        attention_count: 0,
    };
    const html = renderToStaticMarkup(
        <>
            <ProcessingMetrics summary={summary} />
            <ProcessingDeclarations summary={summary} />
        </>,
    );
    const confirmedCard = html.split('Berhasil Diinput')[1].split('</div>')[0];
    const manualCard = html.split('Berhasil manual')[1].split('</div>')[0];
    expect(confirmedCard).toContain('Belum tersedia');
    expect(confirmedCard).not.toMatch(/>0<|>7</);
    expect(manualCard).toContain('>7<');
    expect(html).toContain('Paket Diterima');
    expect(html).toContain('Belum Terkonfirmasi');
    expect(html).toContain('Perlu Perhatian');
});
test('processing provenance explicitly explains overlapping unknown and manual quantities', () => {
    const html = renderToStaticMarkup(<ProcessingSource />);
    expect(html).toContain('Hasil pencocokan resi tersedia di');
    expect(html).toContain('Rekonsiliasi Paket');
    expect(html).toContain('Berhasil manual bukan konfirmasi sistem');
    expect(html).toContain('dapat tumpang tindih');
});
test('server timestamps without offsets are interpreted as UTC consistently with explicit offsets', () => {
    expect(processingDate('2026-10-18 17:00:00', 'Asia/Jakarta')).toBe(
        processingDate('2026-10-18T17:00:00Z', 'Asia/Jakarta'),
    );
    expect(processingDate(null, 'Asia/Jakarta')).toBe('—');
});

test('daily activity distinguishes manual corrections and received cohort remainder from unavailable system throughput', () => {
    const operations: MonitoringOperations = {
        today: '2026-10-19',
        presets: {},
        activity: {
            pop_quantity: 8,
            scheduled: 0,
            visited: 1,
            received_quantity: 5,
            confirmed_processed_quantity: null,
            manual_success_change: -2,
            manual_failed_change: 0,
            manual_unknown_change: 2,
            received_cohort_manual_remaining: 3,
        },
        backlog: {
            unconfirmed_quantity: 10,
            manual_remaining_quantity: 3,
            waiting_handover: 1,
            waiting_verification: 1,
            reconciliation_count: 0,
        },
    };
    const html = renderToStaticMarkup(
        <PickupOperationsSummary
            operations={operations}
            filters={{ date_from: '2026-10-19', date_to: '2026-10-19' }}
        />,
    );
    expect(html).toContain('Aktivitas Hari Ini');
    expect(html.match(/Total paket POP/g)).toHaveLength(1);
    expect(html).toContain('Pekerjaan Tertunda');
    expect(
        html.split('Berhasil dikonfirmasi sistem')[1].split('</div>')[0],
    ).toContain('—');
    expect(
        html.split('Perubahan berhasil manual')[1].split('</div>')[0],
    ).toContain('>-2<');
    expect(html).toContain('Sisa menurut catatan Admin');
    expect(html).toContain('sebelum 2026-10-19 WIB');
    const historical = renderToStaticMarkup(
        <PickupOperationsSummary
            operations={operations}
            filters={{ date_from: '2026-09-01', date_to: '2026-09-02' }}
        />,
    );
    expect(historical).toContain('Aktivitas Periode Terpilih');
    expect(historical).toContain('sebelum 2026-10-19 WIB');
});

test('activity and backlog details can be requested separately without changing their figures', () => {
    const operations: MonitoringOperations = {
        today: '2026-10-19',
        presets: {},
        activity: {
            scheduled: 9,
            visited: 4,
            received_quantity: 12,
            confirmed_processed_quantity: null,
            manual_success_change: -2,
            manual_failed_change: 1,
            manual_unknown_change: 0,
            received_cohort_manual_remaining: 5,
        },
        backlog: {
            unconfirmed_quantity: 21,
            manual_remaining_quantity: 8,
            waiting_handover: 2,
            waiting_verification: 3,
            reconciliation_count: 1,
        },
    };
    const filters = {
        monitoring: 'pickup',
        date_from: '2026-10-18',
        date_to: '2026-10-18',
        pickup_queue: 'unverified',
        scope: 'outstanding',
        customer: 'Toko',
    };
    const activity = renderToStaticMarkup(
        <PickupOperationsSummary
            operations={operations}
            filters={filters}
            section="activity"
        />,
    );
    expect(activity).toContain('Aktivitas Periode Terpilih');
    expect(activity).not.toContain('Pekerjaan Tertunda');
    expect(
        activity.split('Perubahan berhasil manual')[1].split('</div>')[0],
    ).toContain('>-2<');
    const backlog = renderToStaticMarkup(
        <PickupOperationsSummary
            operations={operations}
            filters={filters}
            section="backlog"
        />,
    );
    expect(backlog).not.toContain('Aktivitas Periode Terpilih');
    expect(backlog).toContain('>21<');
    expect(backlog).toContain('scope=backlog');
    expect(backlog).toContain('customer=Toko');
    expect(backlog).toContain('date_from=2026-10-18');
    expect(backlog).not.toContain('pickup_queue=');
});

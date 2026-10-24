import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import JneReportAwbs from '../pages/jne-report-awbs';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ href, children }: { href: string; children: ReactNode }) => (
        <a href={href}>{children}</a>
    ),
    router: { post: vi.fn() },
    usePoll: vi.fn(),
    useForm: (data: { q: string }) => ({
        data,
        errors: {},
        processing: false,
        setData: vi.fn(),
        get: vi.fn(),
    }),
}));

const props = {
    report: {
        id: 2,
        customer_account: 'TESTACCOUNT',
        date_from: '2026-10-01',
        date_thru: '2026-10-05',
        status: 'COMPLETED',
        import_status: 'IMPORTED',
        imported_awb_count: 1,
        duplicate_awb_count: 0,
        imported_at: '2026-10-21T05:00:00Z',
        import_error: null,
    },
    awbs: {
        data: [
            {
                id: 1,
                awb: '001234567890123456789',
                customer_account: 'TESTACCOUNT',
                source_row: 2,
                status_web: 'Pending',
                status_pod: 'Error On Push',
                awb_cancel: null,
                shipper_name: '<script>alert(1)</script>',
                consignee_name: 'Recipient',
            },
        ],
        current_page: 1,
        last_page: 2,
        total: 51,
    },
    filters: { q: '001' },
    timezone: 'Asia/Jakarta',
};

test('AWB page preserves identifiers shows source statuses and escapes CSV text', () => {
    const html = renderToStaticMarkup(<JneReportAwbs {...props} />);
    expect(html).toContain('001234567890123456789');
    expect(html).toContain('Error On Push');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('Snapshot report ini tetap dipertahankan.');
    expect(html).toContain('/admin/jne-reports/2/awbs?q=001&amp;page=2');
    expect(html).not.toContain('Ulangi antrean impor');
});

test('failed import shows recovery and source download while leaving CSV completion separate', () => {
    const html = renderToStaticMarkup(
        <JneReportAwbs
            {...props}
            report={{
                ...props.report,
                import_status: 'FAILED',
                import_error: 'Checksum CSV berubah.',
            }}
        />,
    );
    expect(html).toContain('Impor gagal');
    expect(html).toContain('Checksum CSV berubah.');
    expect(html).toContain('Ulangi antrean impor');
    expect(html).toContain('/admin/jne-reports/2/download');
});

test('empty unimported report offers import from stored CSV', () => {
    const html = renderToStaticMarkup(
        <JneReportAwbs
            {...props}
            report={{ ...props.report, import_status: 'NOT_IMPORTED' }}
            awbs={{ data: [], current_page: 1, last_page: 1, total: 0 }}
        />,
    );
    expect(html).toContain('Impor AWB dari CSV');
    expect(html).toContain('Belum ada AWB yang sesuai.');
});

test('failed monitoring processing offers a local retry and explains examination separately', () => {
    const html = renderToStaticMarkup(
        <JneReportAwbs
            {...props}
            report={{
                ...props.report,
                projection_status: 'FAILED',
                projection_error: 'Pembaruan monitoring gagal.',
            }}
        />,
    );
    expect(html).toContain('Perlu tindakan');
    expect(html).toContain('Ulangi pemrosesan monitoring');
    expect(html).toContain('Tidak meminta report baru ke JNE.');
    expect(html).toContain(
        'Tidak memperbaiki kegagalan atau mengirim ulang report.',
    );
    expect(html).not.toContain('Ulangi antrean impor');
});

test('queued import cannot be resubmitted while the worker is processing', () => {
    const html = renderToStaticMarkup(
        <JneReportAwbs
            {...props}
            report={{ ...props.report, import_status: 'QUEUED' }}
        />,
    );
    expect(html).toContain('Memproses data CSV');
    expect(html).not.toContain('Ulangi antrean impor');
    expect(html).not.toContain('Impor AWB dari CSV');
});

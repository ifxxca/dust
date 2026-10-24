import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import JneReports from '@/pages/jne-reports';
import JneReportRequests from '@/components/jne-report-requests';
import { JneRunState } from '@/components/jne-run-state';
import { reportStage } from './jne-report-flow';

test.each([
    ['ATTENTION', 'Perlu diperiksa'],
    ['PROCESSING', 'Memproses CSV APEX'],
    ['READY', 'Siap dimonitor'],
    ['CSV_STORED', 'CSV tersimpan'],
])(
    'a downloaded run reflects its %s processing stage',
    (workflow_stage, label) => {
        const html = renderToStaticMarkup(
            <JneRunState run={{ status: 'COMPLETED', workflow_stage }} />,
        );
        expect(html).toContain(label);
        if (workflow_stage !== 'READY') {
            expect(html).not.toContain('Siap dimonitor');
        }
    },
);

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ href, children }: { href: string; children: ReactNode }) => (
        <a href={href}>{children}</a>
    ),
    router: { post: vi.fn() },
    usePoll: vi.fn(),
    useForm: (data: Record<string, string>) => ({
        data,
        errors: {},
        processing: false,
        setData: vi.fn(),
        post: vi.fn(),
    }),
}));

test('reviewed failures remain failures but no longer ask for the same review', () => {
    const html = renderToStaticMarkup(
        <JneRunState
            run={{
                status: 'NEEDS_ATTENTION',
                workflow_stage: 'ATTENTION',
                reviewed_at: '2026-10-23T16:00:00Z',
            }}
        />,
    );
    expect(html).toContain('Kegagalan ditinjau');
    expect(html).not.toContain('Perlu diperiksa');
    expect(html).not.toContain('Siap dimonitor');
});

test.each([
    ['NOT_IMPORTED', 'NOT_PROJECTED', 'CSV tersimpan · belum diproses', false],
    ['QUEUED', 'NOT_PROJECTED', 'Memproses data CSV', false],
    ['IMPORTED', 'FAILED', 'Perlu tindakan', true],
    ['IMPORTED', 'PROJECTED', 'Siap dimonitor', false],
] as const)(
    'stored CSV with %s and %s shows the actual processing stage',
    (import_status, projection_status, label, issue) => {
        expect(
            reportStage({
                status: 'COMPLETED',
                import_status,
                projection_status,
            }),
        ).toEqual({ label, issue });
    },
);

test('one request contains all date parts with aggregate readiness and server pagination', () => {
    const jobs = Array.from({ length: 6 }, (_, i) => ({
        id: i + 1,
        customer_account: 'TESTACCOUNT',
        date_from: `2026-10-${String(i * 5 + 1).padStart(2, '0')}`,
        date_thru: `2026-10-${String(i * 5 + 5).padStart(2, '0')}`,
        status: 'COMPLETED',
        import_status: 'IMPORTED',
        projection_status: i === 0 ? 'PROJECTED' : 'FAILED',
        started_at: null,
        completed_at: null,
        imported_awb_count: 1,
        error_message: null,
        import_error: null,
        projection_error: i === 0 ? null : 'Pemrosesan gagal',
        lease_expired: false,
    }));
    const html = renderToStaticMarkup(
        <JneReportRequests
            jobs={jobs}
            requests={{
                data: [
                    {
                        id: 6,
                        customer_account: 'TESTACCOUNT',
                        created_at: '2026-10-21T01:00:00Z',
                        date_from: '2026-10-01',
                        date_thru: '2026-10-30',
                        job_ids: [1, 2, 3, 4, 5, 6],
                        ready_count: 1,
                        stored_count: 6,
                        issue_count: 5,
                        total: 6,
                    },
                ],
                current_page: 1,
                last_page: 2,
                total: 21,
            }}
            timezone="Asia/Jakarta"
        />,
    );
    expect(html).toContain('1/6 report siap dimonitor');
    expect(html).toContain('5 report perlu tindakan');
    expect(html).toContain('Report #1');
    expect(html).toContain('Report #6');
    expect(html).toContain('/admin/jne-reports?page=2');
    expect(html).toContain('Periksa &amp; pulihkan');
    expect(html).not.toContain('Administrasi');
});

test('pull report page keeps history and developer failures in the run workspace', () => {
    const html = renderToStaticMarkup(
        <JneReports
            jobs={[]}
            requests={{ data: [], current_page: 1, last_page: 1, total: 0 }}
            timezone="Asia/Jakarta"
            limits={{ max_days: 5, max_request_days: 366, max_awbs: 6000 }}
        />,
    );
    expect(html).toContain('Banyak account');
    expect(html).toContain('National Acc/Cust');
    expect(html).toContain('/admin/report-runs');
    expect(html).not.toContain('Riwayat permintaan');
    expect(html).not.toContain('Worker tidak merespons');
});

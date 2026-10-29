import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ShipmentDetailContent } from '@/components/jne-shipment-detail-sheet';
import ShipmentInlineDetail from '@/components/jne-shipment-inline-detail';
import DataTable from '@/components/data-table';
import ShipmentFilters from '@/components/jne-shipment-filters';
import ShipmentStatusBadge from '@/components/jne-shipment-status';
import JneCategoryBadge from '@/components/jne-category-badge';
import ShipmentDataTable, { copyJneAwb } from '@/components/jne-shipment-table';
import Monitoring from '@/pages/jne-monitoring';
import type { JneDetail } from '@/types/jne';
import ShipmentOverview, {
    ShipmentSourceDetails,
} from '@/components/jne-shipment-overview';
import JneShipment from '@/pages/jne-shipment';
import {
    emptyJneFilters,
    latestJneObservation,
    normalizeJneFilters,
} from './jne-monitoring';
import { loadJneShipmentDetail } from './jne-shipment-detail';
import { toast } from 'sonner';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
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
    router: { get: vi.fn(), post: vi.fn() },
    usePoll: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    usePage: () => ({ version: 'test-version' }),
    useHttp: () => ({ get: vi.fn(), cancel: vi.fn(), processing: false }),
    useForm: (data: Record<string, number>) => ({
        data,
        errors: {},
        processing: false,
        setData: vi.fn(),
        post: vi.fn(),
    }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

test.each([
    ['manual_hybrid', 'MATCHED', 'Manual'],
    ['cashless_hybrid', 'MATCHED', 'Cashless'],
    ['css_orion', 'MATCHED', 'CSS / Orion'],
    [null, 'UNMATCHED', 'Belum ditandai'],
    [null, 'CONFLICT', 'Kategori perlu diperiksa'],
    ['manual_hybrid', 'CONFLICT', 'Manual · Perlu diperiksa'],
])('category markers label %s with status %s', (category, status, label) => {
    expect(
        renderToStaticMarkup(
            <JneCategoryBadge
                category={category}
                status={status || undefined}
            />,
        ),
    ).toContain(label);
});

function detailFixture(): JneDetail {
    return {
        shipment: {
            id: 7,
            awb: '0001234567890123456789',
            customer_account: 'SHARED',
            tracking_status: 'UNKNOWN',
            customer_name: 'PT A',
            customer_code: '00100',
            customer_match_status: 'MATCHED',
            match_status: 'UNMATCHED',
            match_method: null,
            match_note: null,
            entry_at: '2026-10-13T01:00:00Z',
            observed_at: '2026-10-21T00:00:00Z',
            pickup_task_id: null,
            pickup_reference: null,
            pickup_customer: null,
            source: {
                report_job_id: 3,
                source_row: 22,
                reference: 'REF001',
                shipper_name: '100 STORE A',
                consignee_name: 'Recipient',
                status_web: '<script>private()</script>',
                status_pod: 'Error On Push',
                awb_cancel: 'N',
                raw_data: { EXTRA_COLUMN: 'untouched' },
                original_customer_code: "'004000A",
                source_evidence: {
                    contract: {
                        id: 11,
                        revision: 3,
                        customer_code_column: 'RETAIL_CODE_FIXTURE',
                    },
                    hybrid_origins: [
                        {
                            report_job_id: 18,
                            source: 'roberto',
                            report_type: 'manual',
                            checksum: 'original-checksum',
                        },
                    ],
                },
            },
        },
        history: { data: [], current_page: 1, last_page: 1, total: 0 },
        timezone: 'Asia/Jakarta',
    };
}

test('full detail overview shows only recorded timeline observations in chronological order', () => {
    const detail = detailFixture();
    const observation = {
        id: 1,
        observed_at: '2026-10-20T01:00:00Z',
        tracking_status: 'UNKNOWN',
        changes_current: true,
        status_web: 'OLDER_SOURCE_STATUS',
        status_pod: null,
        awb_cancel: null,
        report_job_id: 3,
        source_row: 22,
    };
    const html = renderToStaticMarkup(
        <ShipmentOverview
            shipment={detail.shipment}
            history={{
                data: [
                    {
                        ...observation,
                        id: 2,
                        observed_at: '2026-10-21T01:00:00Z',
                        status_web: 'NEWER_SOURCE_STATUS',
                    },
                    observation,
                ],
                current_page: 1,
                last_page: 1,
            }}
            timezone={detail.timezone}
        />,
    );
    const timeline = html.slice(
        html.indexOf('aria-label="Timeline observasi report"'),
    );
    expect(timeline.indexOf('OLDER_SOURCE_STATUS')).toBeLessThan(
        timeline.indexOf('NEWER_SOURCE_STATUS'),
    );
    expect(timeline).not.toContain('Data diterima');
    expect(html).toContain('bukan waktu kejadian pengiriman');
    expect(html).toContain('Salin nomor resi');
    expect(html).not.toContain('Unduh CSV sumber');
});

test('full detail overview leaves missing source and timeline explicitly unavailable', () => {
    const detail = detailFixture();
    const html = renderToStaticMarkup(
        <ShipmentOverview
            shipment={{ ...detail.shipment, source: null }}
            history={{ data: [], current_page: 1, last_page: 1 }}
            timezone={detail.timezone}
        />,
    );
    expect(html).toContain('Informasi pengiriman');
    expect(html).toContain('Belum ada riwayat observasi.');
    expect(html).not.toContain('Unduh CSV sumber');
});

test('operational shipment page starts with closed corrections and technical details while preserving all evidence', () => {
    const detail = detailFixture();
    const html = renderToStaticMarkup(
        <JneShipment
            shipment={{ ...detail.shipment, version: 1 }}
            history={detail.history}
            timezone={detail.timezone}
            matchHistory={Array.from({ length: 50 }, (_, index) => ({
                id: 50 - index,
                method: 'AUTO',
                match_status: 'UNMATCHED',
                reason: `Stored decision ${index}`,
                created_at: '2026-10-27T01:00:00Z',
                actor_name: null,
                pickup_reference: null,
                previous_pickup_reference: null,
            }))}
            decisionPages={{
                data: [],
                total: 120,
                prev_page_url: null,
                next_page_url: null,
            }}
        />,
    );
    expect(html).toContain('Hubungkan pickup');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('<form');
    expect(html).toContain('120 catatan pencocokan');
    expect(html).toContain('Detail teknis &amp; audit');
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).toContain('Stored decision 49');
    expect(html).toContain('EXTRA_COLUMN');
    expect(html).toContain('untouched');
    expect(html).toContain('original-checksum');
    expect(html).toContain('/admin/jne-reports/3/download');
});

test('linked shipment keeps pickup accessible and offers correction without an unnecessary warning', () => {
    const detail = detailFixture();
    const html = renderToStaticMarkup(
        <JneShipment
            shipment={{
                ...detail.shipment,
                version: 1,
                match_status: 'MATCHED',
                pickup_task_id: 4,
                pickup_reference: 'POP-004',
                pickup_customer: 'PT A',
                match_note: 'Old diagnostic note',
            }}
            history={detail.history}
            timezone={detail.timezone}
            matchHistory={[]}
        />,
    );
    expect(html).toContain('POP-004');
    expect(html).toContain('Ubah pickup');
    expect(html).not.toContain('Old diagnostic note');
    expect(html).not.toContain('<form');
});

test('technical source disclosure preserves timestamps and missing-source state', () => {
    const detail = detailFixture();
    const html = renderToStaticMarkup(
        <ShipmentSourceDetails
            shipment={{ ...detail.shipment, source: null }}
            timezone={detail.timezone}
        />,
    );
    expect(html).toContain('Belum ada sumber report.');
    expect(html).toContain('Report terakhir diterima');
    expect(html).not.toMatch(/<details[^>]* open/);
});

test('expanded AWB content preserves entry time source evidence and observed history without inventing tracking events', () => {
    const detail = detailFixture();
    const html = renderToStaticMarkup(
        <ShipmentInlineDetail detail={detail} onRetry={vi.fn()} />,
    );
    expect(html).toContain('13 Okt 2026, 08.00');
    expect(html).toContain('Riwayat observasi');
    expect(html).toContain('Belum ada riwayat observasi.');
    expect(html).toContain('Report #3');
    expect(html).toContain('Recipient');
    expect(html).toContain('&lt;script&gt;private()&lt;/script&gt;');
    expect(html).not.toContain('<script>private()');
    expect(html).not.toContain('Data diterima dari pengirim');
});

test('expanded AWB has recoverable loading and request failure states', () => {
    expect(
        renderToStaticMarkup(<ShipmentInlineDetail onRetry={vi.fn()} />),
    ).toContain('Memuat detail AWB');
    const error = renderToStaticMarkup(
        <ShipmentInlineDetail error="Koneksi terputus" onRetry={vi.fn()} />,
    );
    expect(error).toContain('Koneksi terputus');
    expect(error).toContain('Coba lagi');
});

test('table expansion stays beneath its own row and respects visible column count', () => {
    const html = renderToStaticMarkup(
        <DataTable
            data={[{ id: 7 }, { id: 8 }]}
            getRowId={(row) => String(row.id)}
            columns={[
                { id: 'awb', header: 'AWB', cell: (row) => `AWB-${row.id}` },
                { id: 'hidden', header: 'Sumber', cell: () => 'Privat' },
            ]}
            initialHiddenColumns={['hidden']}
            expandedRow="7"
            renderExpandedRow={(row) => <div>Detail-{row.id}</div>}
        />,
    );
    expect(html).toMatch(/AWB-7[\s\S]*colSpan="1"[\s\S]*Detail-7[\s\S]*AWB-8/i);
    expect(html).not.toContain('Detail-8');
    expect(html).not.toContain('Privat');
});

test('quick detail retains raw statuses separately from customer, shipper, source and pickup identities', () => {
    const html = renderToStaticMarkup(
        <ShipmentDetailContent detail={detailFixture()} />,
    );

    expect(html).toContain('Status belum dikenali');
    expect(html).toContain('Tanggal AWB (JNE)');
    expect(html).toContain('13 Okt 2026, 08.00');
    expect(html).toContain('&lt;script&gt;private()&lt;/script&gt;');
    expect(html).not.toContain('<script>private()');
    expect(html).toContain('Error On Push');
    expect(html).toContain('00100 · PT A');
    expect(html).toContain('100 STORE A');
    expect(html).toContain('SHARED');
    expect(html).toContain('Ini tidak menunjukkan kegagalan pengiriman.');
    expect(html).toContain('/admin/jne-reports/3/download');
    expect(html).toContain('/admin/jne-monitoring/7');
    expect(html).toContain('Semua kolom CSV asli');
    expect(html).toContain('004000A');
    expect(html).toContain('RETAIL_CODE_FIXTURE');
    expect(html).toContain('original-checksum');
    expect(html).toContain('Belum ada riwayat observasi.');
});

test('quick detail shows only stored observations and links to existing related pickup', () => {
    const detail = detailFixture();
    Object.assign(detail.shipment, {
        match_status: 'MATCHED',
        pickup_task_id: 4,
        pickup_reference: 'POP-004',
    });
    detail.history.data = [
        {
            id: 1,
            observed_at: '2026-10-20T23:00:00Z',
            tracking_status: 'IN_TRANSIT',
            changes_current: true,
            status_web: 'WITH COURIER',
            status_pod: null,
            awb_cancel: null,
            report_job_id: 2,
            source_row: 9,
        },
    ];
    const html = renderToStaticMarkup(
        <ShipmentDetailContent detail={detail} />,
    );

    expect(html).toContain('/hasil-pickup/4');
    expect(html).toContain('POP-004');
    expect(html).toContain('WITH COURIER');
    expect(html).toContain('21 Okt 2026');
    expect(html).toContain('Report #2');
    expect(html).not.toContain('Belum ada riwayat observasi.');
});

test('quick detail distinguishes a received snapshot from its observation and surfaces refresh failures', () => {
    const detail = detailFixture();
    detail.shipment.last_report_received_at = '2026-10-24T00:00:00Z';
    detail.shipment.last_refresh_attempt = {
        id: 91,
        status: 'NEEDS_ATTENTION',
        stage: 'ATTENTION',
        requested_at: '2026-10-24T00:05:00Z',
        error_message: 'WORKER_EXPIRED: fixture',
        import_error: null,
        projection_error: null,
    };
    const html = renderToStaticMarkup(
        <ShipmentDetailContent detail={detail} />,
    );
    expect(html).toContain('Report terakhir diterima');
    expect(html).toContain('21 Okt 2026');
    expect(html).toContain('24 Okt 2026');
    expect(html).toContain('WORKER_EXPIRED: fixture');
    expect(html).toContain(
        'bukan waktu kejadian pengiriman atau pembaruan real-time',
    );
});

test.each(['UNKNOWN', 'NEW_UNRECOGNIZED_STATUS'])(
    'unknown delivery state %s stays recognizable by text',
    (status) => {
        const html = renderToStaticMarkup(
            <ShipmentStatusBadge status={status} />,
        );
        expect(html).toContain(
            status === 'UNKNOWN' ? 'Status belum dikenali' : status,
        );
        expect(html).not.toContain('Terkirim');
    },
);

test('URL filter normalization preserves literal AWB prefixes and shipment filters', () => {
    expect(
        normalizeJneFilters({
            q: '0001%_!',
            account: 'SHARED',
            status: 'UNKNOWN',
            match: 'UNMATCHED',
            customer_id: 19,
            customer_match: 'AMBIGUOUS',
            category: 'cashless_hybrid',
        }),
    ).toEqual({
        ...emptyJneFilters,
        q: '0001%_!',
        account: 'SHARED',
        status: 'UNKNOWN',
        match: 'UNMATCHED',
        customer_id: '19',
        customer_match: 'AMBIGUOUS',
        category: 'cashless_hybrid',
    });
    expect(normalizeJneFilters({ q: null })).toEqual(emptyJneFilters);
});

test('latest observation comes only from available rows without fabricating an update time', () => {
    expect(latestJneObservation([])).toBeNull();
    expect(
        latestJneObservation([
            { observed_at: 'invalid' },
            { observed_at: null },
        ]),
    ).toBeNull();
    expect(
        latestJneObservation([
            { observed_at: '2026-10-20T00:00:00Z' },
            { observed_at: '2026-10-21T07:00:00+07:00' },
            { observed_at: 'invalid' },
        ]),
    ).toBe('2026-10-21T07:00:00+07:00');
});

test('selected status and its count remain visible and empty results do not claim an observation timestamp', () => {
    const html = renderToStaticMarkup(
        <Monitoring
            shipments={{ data: [], current_page: 1, last_page: 1, total: 0 }}
            summary={{ DELIVERED: 9 }}
            filters={{ status: 'DELIVERED' }}
            accounts={[]}
            timezone="Asia/Jakarta"
        />,
    );
    const selected = html.match(
        /<button\b[^>]*id="jne-status-filter"[\s\S]*?<\/button>/g,
    );
    expect(selected).toHaveLength(1);
    expect(selected?.[0]).toContain('Terkirim');
    expect(html).toContain('aria-label="Terkirim: 9"');
    expect(html).not.toContain('Diamati di halaman ini:');
    expect(html).toContain('Tidak ada AWB yang sesuai');
    expect(html).toContain('Urutan: observasi terbaru');
    expect(html).toContain('jne-status-filter');
    expect(html).toContain('Ringkasan status pengiriman');
});

test('applied advanced filters are visible as removable controls outside the sheet', () => {
    const filters = {
        ...emptyJneFilters,
        account: 'SHARED',
        match: 'UNMATCHED',
        customer_match: 'AMBIGUOUS',
    };
    const html = renderToStaticMarkup(
        <ShipmentFilters
            applied={filters}
            accounts={['SHARED']}
            customers={[]}
            loading={false}
            errors={{}}
            onApply={vi.fn()}
            onReset={vi.fn()}
            onRemove={vi.fn()}
        />,
    );

    expect(html).toContain('Hapus filter Sumber: SHARED');
    expect(html).toContain('Hapus filter Pickup: Belum terhubung');
    expect(html).toContain('Hapus filter Pemetaan: Perlu pemeriksaan');
    expect(html).toContain('Reset filter');
});

test('customer filter reuses a searchable picker and keeps customer code distinct from the shipper identity', () => {
    const filters = { ...emptyJneFilters, customer_id: '17' };
    const html = renderToStaticMarkup(
        <ShipmentFilters
            applied={filters}
            accounts={[]}
            customers={[{ id: 17, name: 'PT A', customer_code: '00100' }]}
            loading={false}
            errors={{}}
            onApply={vi.fn()}
            onReset={vi.fn()}
            onRemove={vi.fn()}
        />,
    );

    expect(html).toMatch(/id="jne-customer-filter"[^>]*role="combobox"/);
    expect(html).toContain('00100 · PT A');
    expect(html).toContain('Hapus filter Customer: PT A');
});

test('server pagination metadata and loading state use the shared table without a page-size or sorting claim', () => {
    const props = {
        shipments: {
            data: [],
            current_page: 2,
            last_page: 8,
            total: 400,
            from: 51,
            to: 100,
        },
        timezone: 'Asia/Jakarta',
        error: '',
        filtered: false,
        onPage: vi.fn(),
        onDetail: vi.fn(),
        onReset: vi.fn(),
    };
    const html = renderToStaticMarkup(
        <ShipmentDataTable {...props} loading={false} />,
    );
    const loading = renderToStaticMarkup(
        <ShipmentDataTable {...props} loading />,
    );
    expect(html).toContain('51–100 dari 400 AWB');
    expect(html).not.toContain('Jumlah AWB per halaman');
    expect(html).not.toContain('aria-sort');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('Memuat AWB');
});

test('quick detail reads the authorized existing Inertia route with version and cancellation support', async () => {
    const detail = detailFixture();
    const fetcher = vi
        .fn()
        .mockResolvedValue(
            Response.json({ component: 'jne-shipment', props: detail }),
        );
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();

    await expect(
        loadJneShipmentDetail(7, 'test-version', controller.signal),
    ).resolves.toEqual(detail);

    expect(fetcher).toHaveBeenCalledWith(
        '/admin/jne-monitoring/7',
        expect.objectContaining({
            credentials: 'same-origin',
            cache: 'no-store',
            signal: controller.signal,
            headers: expect.objectContaining({
                'X-Inertia': 'true',
                'X-Inertia-Version': 'test-version',
                'X-Inertia-Partial-Component': 'jne-shipment',
                'X-Inertia-Partial-Data': 'shipment,history,timezone',
            }),
        }),
    );
});

test.each([401, 403, 404, 409, 500])(
    'failed quick detail response %s never displays another record or response body',
    async (status) => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValue(
                    new Response('PRIVATE SERVER BODY', { status }),
                ),
        );

        await expect(
            loadJneShipmentDetail(7, null, new AbortController().signal),
        ).rejects.toThrow(/Sesi|ditemukan|diperbarui|belum dapat dimuat/);
    },
);

test('quick detail rejects a redirected login page and a mismatched AWB response', async () => {
    const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
            new Response('<html>Login</html>', {
                headers: { 'content-type': 'text/html' },
            }),
        )
        .mockResolvedValueOnce(
            Response.json({
                component: 'jne-shipment',
                props: detailFixture(),
            }),
        );
    vi.stubGlobal('fetch', fetcher);

    await expect(
        loadJneShipmentDetail(7, null, new AbortController().signal),
    ).rejects.toThrow('respons tidak sesuai');
    await expect(
        loadJneShipmentDetail(8, null, new AbortController().signal),
    ).rejects.toThrow('AWB yang dipilih');
});

test('copy AWB keeps leading zeroes and reports a denied clipboard without failing navigation', async () => {
    const writeText = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await copyJneAwb('0001234567890123456789');
    await copyJneAwb('0001234567890123456789');

    expect(writeText).toHaveBeenNthCalledWith(1, '0001234567890123456789');
    expect(toast.success).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledOnce();
});

test('malformed JSON never exposes response contents in quick detail errors', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
            new Response('PRIVATE REPORT CONTENT', {
                headers: { 'content-type': 'application/json' },
            }),
        ),
    );

    await expect(
        loadJneShipmentDetail(7, null, new AbortController().signal),
    ).rejects.toThrow('Respons detail tidak dapat dibaca. Silakan coba lagi.');
});

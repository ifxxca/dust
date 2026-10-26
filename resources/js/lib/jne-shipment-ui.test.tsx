import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { ShipmentDetailContent } from '@/components/jne-shipment-detail-sheet';
import ShipmentFilters from '@/components/jne-shipment-filters';
import ShipmentStatusBadge from '@/components/jne-shipment-status';
import ShipmentDataTable, { copyJneAwb } from '@/components/jne-shipment-table';
import Monitoring from '@/pages/jne-monitoring';
import type { JneDetail } from '@/types/jne';
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
    usePoll: vi.fn(),
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

test('quick detail retains raw statuses separately from customer, shipper, source and pickup identities', () => {
    const html = renderToStaticMarkup(
        <ShipmentDetailContent detail={detailFixture()} />,
    );

    expect(html).toContain('Status belum dikenali');
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

test('URL filter normalization preserves literal AWB prefixes and all six server filters', () => {
    expect(
        normalizeJneFilters({
            q: '0001%_!',
            account: 'SHARED',
            status: 'UNKNOWN',
            match: 'UNMATCHED',
            customer_id: 19,
            customer_match: 'AMBIGUOUS',
        }),
    ).toEqual({
        q: '0001%_!',
        account: 'SHARED',
        status: 'UNKNOWN',
        match: 'UNMATCHED',
        customer_id: '19',
        customer_match: 'AMBIGUOUS',
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
    expect(selected?.[0]).toContain('Terkirim · 9');
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
            draft={filters}
            applied={filters}
            accounts={['SHARED']}
            customers={[]}
            loading={false}
            errors={{}}
            onChange={vi.fn()}
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
            draft={filters}
            applied={filters}
            accounts={[]}
            customers={[{ id: 17, name: 'PT A', customer_code: '00100' }]}
            loading={false}
            errors={{}}
            onChange={vi.fn()}
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

import { useState, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import Monitoring from '../pages/jne-monitoring';
import Shipment from '../pages/jne-shipment';
import Profiles from '../pages/jne-profiles';
import Reconciliation from '../pages/jne-reconciliation';
import ShipperAliases from '../pages/jne-shipper-aliases';
import { jneTimestamp } from './jne-monitoring';

vi.mock('react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react')>();
    return { ...actual, useState: vi.fn(actual.useState) };
});

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ href, children }: { href: string; children: ReactNode }) => (
        <a href={href}>{children}</a>
    ),
    router: { post: vi.fn(), get: vi.fn() },
    usePoll: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
    usePage: () => ({ version: 'test-version' }),
    useHttp: () => ({ get: vi.fn(), cancel: vi.fn(), processing: false }),
    useForm: (data: Record<string, string | number | boolean>) => ({
        data,
        errors: {},
        processing: false,
        setData: vi.fn(),
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        reset: vi.fn(),
        clearErrors: vi.fn(),
    }),
}));

test('monitoring emphasizes normalized status and preserves the AWB detail link as a string', () => {
    const html = renderToStaticMarkup(
        <Monitoring
            shipments={{
                data: [
                    {
                        id: 1,
                        awb: '001234567890123456789',
                        customer_account: 'TESTACCOUNT',
                        tracking_status: 'UNKNOWN',
                        match_status: 'UNMATCHED',
                        entry_at: '2026-10-13T01:00:00Z',
                        observed_at: '2026-10-21T00:00:00Z',
                        status_web: '<script>private()</script>',
                        status_pod: 'Error On Push',
                        consignee_name: 'Recipient',
                        pickup_reference: null,
                        pickup_task_id: null,
                    },
                ],
                current_page: 1,
                last_page: 1,
                total: 1,
            }}
            summary={{ UNKNOWN: 1 }}
            identitySummary={{
                collected: 1,
                customer_matched: 0,
                pickup_matched: 0,
                candidates: 1,
                conflicts: 0,
                ambiguous: 0,
                unmatched: 0,
            }}
            filters={{ q: '', account: '', status: '', match: '' }}
            accounts={['TESTACCOUNT']}
            timezone="Asia/Jakarta"
        />,
    );
    expect(html).toContain('001234567890123456789');
    expect(html).toContain('Status belum dikenali');
    expect(html).not.toContain('Error On Push');
    expect(html).not.toContain('&lt;script&gt;private()&lt;/script&gt;');
    expect(html).not.toContain('<script>private()');
    expect(html).toContain('/admin/jne-monitoring/1');
    expect(html).toContain('Salin AWB 001234567890123456789');
    expect(html).toContain('Diamati di halaman ini:');
    expect(html).toContain('Snapshot report');
    expect(html).toContain('0 AWB customer terkonfirmasi');
    expect(html).toContain('0 AWB pickup terkonfirmasi');
    expect(html).toContain('customer_match=CANDIDATE');
    expect(html).toContain('Periksa kategori POP');
});

test.each([
    { candidates: 1, conflicts: 0, status: 'CANDIDATE' },
    { candidates: 0, conflicts: 1, status: 'CONFLICT' },
])(
    'ownership summary keeps $status records in review even with no unmatched or ambiguous names',
    (review) => {
        const html = renderToStaticMarkup(
            <ShipperAliases
                aliases={{ data: [], current_page: 1, last_page: 1, total: 0 }}
                directory={{
                    data: [],
                    current_page: 1,
                    last_page: 1,
                    total: 0,
                }}
                selectedCustomer={null}
                stats={{ customers: 1, without_names: 0, conflicts: 0 }}
                ownership={{
                    total: 1,
                    recognized: 0,
                    ambiguous: 0,
                    unmatched: 0,
                    ...review,
                }}
                filters={{
                    customer_id: '',
                    q: '',
                    alias_q: '',
                    conflicts: false,
                }}
                importResult={null}
            />,
        );
        expect(html).toContain('1 AWB belum dikenali pemiliknya');
        expect(html).toContain('customer_match=' + review.status);
        expect(html).not.toContain('Semua 0 AWB');
    },
);

test.each([false, true])(
    'shipment detail retains source fields with pickup editor open=%s',
    (editingPickup) => {
        vi.mocked(useState).mockReturnValueOnce([editingPickup, vi.fn()]);
        const html = renderToStaticMarkup(
            <Shipment
                shipment={{
                    id: 1,
                    awb: '001234',
                    customer_account: 'TESTACCOUNT',
                    version: 1,
                    tracking_status: 'UNKNOWN',
                    match_status: 'UNMATCHED',
                    match_method: null,
                    match_note: null,
                    entry_at: '2026-10-13T01:00:00Z',
                    observed_at: '2026-10-21T00:00:00Z',
                    pickup_reference: null,
                    pickup_task_id: null,
                    pickup_customer: null,
                    source: {
                        report_job_id: 2,
                        source_row: 2,
                        reference: 'REF001',
                        shipper_name: 'Sender',
                        consignee_name: 'Recipient',
                        status_web: 'Unknown',
                        status_pod: null,
                        awb_cancel: null,
                        raw_data: {
                            AWB: "'001234",
                            EXTRA_COLUMN: '="Pure Text"',
                        },
                    },
                }}
                history={{ data: [], current_page: 1, last_page: 1 }}
                matchHistory={[]}
                timezone="Asia/Jakarta"
            />,
        );
        expect(html).toContain('EXTRA_COLUMN');
        expect(html).toContain('=&quot;Pure Text&quot;');
        expect(html).toContain(
            `aria-expanded="${editingPickup}" aria-controls="pickup-editor"`,
        );
        if (editingPickup) {
            expect(html).toContain('id="pickup-editor"');
            expect(html).toContain('tidak ditimpa pencocokan otomatis');
            expect(html).toContain(
                'Cashless dicatat melalui Sertim; CSS / Orion tidak wajib dipindai satu per satu.',
            );
        } else {
            expect(html).not.toContain('id="pickup-editor"');
            expect(html).not.toContain('tidak ditimpa pencocokan otomatis');
        }
        expect(html).toContain('/admin/jne-reports/2/download');
    },
);

test('empty profiles clearly leave automatic retrieval disabled', () => {
    const html = renderToStaticMarkup(
        <Profiles profiles={[]} issues={[]} timezone="Asia/Jakarta" />,
    );
    expect(html).toContain('Tidak ada penarikan otomatis yang aktif.');
    expect(html).toContain('Tambah konfigurasi');
    expect(html).toContain('Aturan pembaruan status');
});

test('active refresh settings explain eligible AWBs stop rules and separate retrieval flows', () => {
    const html = renderToStaticMarkup(
        <Profiles
            profiles={[]}
            issues={[]}
            timezone="Asia/Jakarta"
            activeAwbs={{ total: 9, eligible: 7 }}
        />,
    );
    expect(html).toContain('AWB siap diperbarui');
    expect(html).toContain('>7</p>');
    expect(html).toContain('9 resi belum delivered/cancel');
    expect(html).toContain('Atur resi aktif');
    expect(html).toContain('Aturan pembaruan status');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Terus dipantau');
    expect(html).toContain('Atur Server PM');
    expect(html).toContain('Atur Server Puman');
    expect(html).not.toContain('4 report');
});

test('monitoring exposes the active AWB schedule and its next run without confusing display refresh', () => {
    const html = renderToStaticMarkup(
        <Monitoring
            shipments={{ data: [], total: 0, current_page: 1, last_page: 1 }}
            summary={{}}
            filters={{}}
            accounts={[]}
            timezone="Asia/Jakarta"
            trackingRefresh={{
                active_count: 9,
                profile: {
                    id: 7,
                    enabled: true,
                    interval_minutes: 17,
                    lookback_days: 60,
                    next_run_at: '2026-10-23T05:17:00Z',
                    last_run_at: null,
                    last_error: null,
                },
            }}
        />,
    );
    expect(html).toContain('>9</span>');
    expect(html).toContain('Jadwal otomatis');
    expect(html).toContain('>Aktif</span>');
    expect(html).toContain('17 menit');
    expect(html).toContain('Perbarui resi aktif sekarang');
    expect(html).toContain('Berikutnya');
    expect(html).toContain('Segarkan');
});

test('matching counts in reconciliation do not claim that POP or retail differences are resolved', () => {
    const html = renderToStaticMarkup(
        <Reconciliation
            pickups={{
                data: [
                    {
                        id: 1,
                        reference: 'PICKUPREF',
                        customer_name: 'Customer',
                        declared_successful: 1,
                        received_quantity: 1,
                        matched_awbs: 1,
                        difference: 0,
                        state: 'MATCHED_COUNTS',
                        comparison_ready: true,
                    },
                ],
                total: 1,
                current_page: 1,
                last_page: 1,
            }}
            filters={{ q: '' }}
        />,
    );
    expect(html).toContain('Jumlah cocok');
    expect(html).toContain('tidak otomatis menutup selisih');
    expect(html).toContain('/hasil-pickup/1');
});

test('database UTC timestamps display in configured operational timezone', () => {
    expect(jneTimestamp('2026-10-20 23:00:00', 'Asia/Jakarta')).toContain(
        '21 Okt 2026',
    );
    expect(jneTimestamp(null, 'Asia/Jakarta')).toBe('—');
    expect(jneTimestamp('invalid', 'Asia/Jakarta')).toBe('—');
});

test('customer name management escapes names and shows conflicts without report source selection', () => {
    const html = renderToStaticMarkup(
        <ShipperAliases
            aliases={{
                data: [
                    {
                        id: 1,
                        shipper_name: '<script>private()</script>',
                        is_active: true,
                        version: 1,
                        active_candidates: 2,
                        customer: {
                            id: 1,
                            name: 'Customer One',
                            customer_code: '00102',
                            is_active: true,
                        },
                    },
                ],
                current_page: 1,
                last_page: 1,
                total: 1,
            }}
            directory={{ data: [], current_page: 1, last_page: 1, total: 0 }}
            selectedCustomer={null}
            stats={{ customers: 1, without_names: 0, conflicts: 1 }}
            filters={{ customer_id: '', q: '', alias_q: '', conflicts: true }}
            importResult={null}
        />,
    );
    expect(html).toContain('Periksa pemilik');
    expect(html).toContain('&lt;script&gt;private()&lt;/script&gt;');
    expect(html).not.toContain('<script>private()');
    expect(html).toContain('00102');
    expect(html).not.toContain('Pilih akun');
    expect(html).toContain(
        'Perubahan diterapkan otomatis ke AWB yang sudah tersimpan',
    );
    expect(html).not.toContain('Perbarui pengelompokan');
    expect(html).toContain('Nonaktifkan');
});

test('report source has a descriptive label and never offers customer ownership settings', () => {
    const html = renderToStaticMarkup(
        <Profiles
            profiles={[
                {
                    id: 1,
                    customer_account: 'SHARED',
                    source: 'apex',
                    report_type: 'apex',
                    label: 'Report gabungan',
                    enabled: false,
                    mode: 'rolling',
                    lookback_days: 30,
                    date_from: null,
                    date_thru: null,
                    interval_minutes: 360,
                    last_error: null,
                    version: 1,
                    next_run_at: null,
                    last_run_at: null,
                },
            ]}
            issues={[]}
            timezone="Asia/Jakarta"
        />,
    );
    expect(html).toContain('Report gabungan');
    expect(html).toContain('Alur Report customer');
    expect(html).not.toContain('Customer Retail Operations');
    expect(html).toContain('Nonaktif');
    expect(html).toContain('Account APEX');
    expect(html).toContain('National Acc/Cust');
    expect(html).not.toContain('Penarikan yang perlu diperiksa');
});

test('identity imported from a directory distinguishes AWB ownership from missing pickup details', () => {
    const html = renderToStaticMarkup(
        <ShipperAliases
            aliases={{ data: [], current_page: 1, last_page: 1, total: 0 }}
            directory={{ data: [], current_page: 1, last_page: 1, total: 0 }}
            selectedCustomer={{
                id: 1,
                name: 'PT A',
                customer_code: '00100',
                is_active: true,
                pickup_details_missing: true,
            }}
            stats={{ customers: 1, without_names: 1, conflicts: 0 }}
            filters={{ customer_id: 1, q: '', alias_q: '', conflicts: false }}
            importResult={null}
        />,
    );
    expect(html).toContain(
        'Identitas customer sudah tersedia untuk pengelompokan AWB.',
    );
    expect(html).toContain('Lengkapi alamat dan kontak');
    expect(html).toContain('00100');
});

test('unrelated duplicate directory names let users continue to shipments without disabling mappings', () => {
    const html = renderToStaticMarkup(
        <ShipperAliases
            aliases={{ data: [], current_page: 1, last_page: 1, total: 0 }}
            directory={{ data: [], current_page: 1, last_page: 1, total: 0 }}
            selectedCustomer={null}
            stats={{ customers: 189, without_names: 2, conflicts: 12 }}
            ownership={{
                total: 428,
                recognized: 428,
                ambiguous: 0,
                unmatched: 0,
            }}
            conflictGroups={{
                data: [
                    {
                        name: 'SAME NAME',
                        customers: [
                            { id: 1, code: '100', name: 'PT A' },
                            { id: 2, code: '101', name: 'PT B' },
                        ],
                    },
                ],
                current_page: 1,
                last_page: 1,
                total: 1,
            }}
            filters={{ customer_id: '', q: '', alias_q: '', conflicts: true }}
            importResult={null}
        />,
    );
    expect(html).toContain('Semua 428 AWB sudah dikenali customernya');
    expect(html).toContain('Lihat Pengiriman');
    expect(html).toContain('tidak menghambat AWB yang tersimpan saat ini');
    expect(html).not.toContain('Nonaktifkan');
    expect(html).toContain('PT A');
    expect(html).toContain('PT B');
});

test('ownership problems link to affected AWBs and do not report a healthy result', () => {
    const html = renderToStaticMarkup(
        <ShipperAliases
            aliases={{ data: [], current_page: 1, last_page: 1, total: 0 }}
            directory={{ data: [], current_page: 1, last_page: 1, total: 0 }}
            selectedCustomer={null}
            stats={{ customers: 2, without_names: 0, conflicts: 1 }}
            ownership={{ total: 4, recognized: 1, ambiguous: 2, unmatched: 1 }}
            filters={{ customer_id: '', q: '', alias_q: '', conflicts: false }}
            importResult={null}
        />,
    );
    expect(html).toContain('3 AWB belum dikenali pemiliknya');
    expect(html).toContain('customer_match=AMBIGUOUS');
    expect(html).toContain('customer_match=UNMATCHED');
    expect(html).not.toContain('Semua 4 AWB sudah dikenali');
});

test('a pickup without linked AWBs is not presented as a parcel discrepancy', () => {
    const html = renderToStaticMarkup(
        <Reconciliation
            pickups={{
                data: [
                    {
                        id: 1,
                        reference: 'PICKUPREF',
                        customer_name: 'Customer',
                        declared_successful: 10,
                        received_quantity: 10,
                        matched_awbs: 0,
                        difference: 10,
                        state: 'MISMATCH',
                        comparison_ready: false,
                    },
                ],
                total: 1,
                current_page: 1,
                last_page: 1,
            }}
            filters={{ q: '' }}
        />,
    );
    expect(html).toContain('Belum ada AWB terhubung');
    expect(html).not.toContain('Jumlah berbeda');
    expect(html).toContain('bukan bukti paket hilang');
});

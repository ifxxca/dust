import { mkdirSync, writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import CustomerPortal, {
    PortalShipmentInformation,
} from '@/components/customer-portal';
import type {
    PortalProps,
    PortalShipmentDetail,
} from '@/types/customer-portal';

const state = vi.hoisted(() => ({ role: 'customer' }));
vi.mock('@inertiajs/react', async () => {
    const { createElement } = await import('react');
    return {
        Head: () => null,
        usePage: () => ({
            props: { auth: { user: { role: state.role } }, errors: {} },
        }),
        useHttp: () => ({ get: vi.fn(), cancel: vi.fn() }),
        router: { get: vi.fn() },
        Link: ({
            href,
            children,
            as,
            method: _method,
            ...props
        }: {
            href: string | { url: string };
            children: unknown;
            as?: string;
            method?: string;
        }) =>
            createElement(
                as ?? 'a',
                { ...props, href: typeof href === 'string' ? href : href.url },
                children as never,
            ),
    };
});
vi.mock('@/components/customer-picker', () => ({
    default: () => <button>Pilih customer</button>,
}));

beforeEach(() => {
    state.role = 'customer';
});

const base: PortalProps = {
    section: 'dashboard',
    isAdmin: false,
    customer: { id: 1, name: 'Irfan', customer_code: '401' },
    filters: {
        date_from: '2026-11-01',
        date_to: '2026-11-20',
        q: '',
        status: '',
        category: '',
    },
    summary: {
        total: 50,
        pickups: 2,
        active: 8,
        delivered: 40,
        updated_at: '2026-11-20T08:00:00Z',
        by_status: [
            { status: 'DELIVERED', total: 40 },
            { status: 'IN_TRANSIT', total: 8 },
            { status: 'EXCEPTION', total: 2 },
        ],
        groups: {
            manual: 20,
            cashless: 30,
            cod: 0,
            non_cod: 20,
            cod_unknown: 0,
        },
        recent_pickups: [],
    },
    shipments: null,
    pickups: null,
};
function render(props: PortalProps): string {
    const html = renderToStaticMarkup(<CustomerPortal {...props} />);
    if (process.env.CUSTOMER_PORTAL_PREVIEW) {
        mkdirSync('output/customer-portal', { recursive: true });
        writeFileSync(
            `output/customer-portal/${props.section}.html`,
            `<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="font-sans antialiased">${html}</body></html>`,
        );
    }
    return html;
}

test('customer dashboard exposes three navigation pages and actionable scoped summaries', () => {
    const html = render(base);
    expect(html).toContain('Dashboard');
    expect(html).toContain('Monitoring Kiriman');
    expect(html).toContain('History Pickup');
    expect(html).toContain('customer_id=1');
    expect(html).not.toContain('Bermasalah');
    expect(html).not.toContain('status=EXCEPTION');
    expect(html).not.toContain('Amount');
    expect(html).not.toContain('COD');
    expect(html).toContain('Manual');
    expect(html).toContain('Cashless');
    expect(html).toContain('Pickup terbaru');
    expect(html).toContain('Status kiriman');
    expect(html).toContain('80%');
    expect(html).not.toContain('Pilih customer');
    expect(html).not.toContain('Kembali ke admin');
});

test('dashboard shows COD and non-COD only when manual COD exists in the selected range', () => {
    const html = render({
        ...base,
        summary: {
            ...base.summary!,
            groups: {
                manual: 20,
                cashless: 30,
                cod: 5,
                non_cod: 14,
                cod_unknown: 1,
            },
        },
    });
    expect(html).toContain('Non-COD');
    expect(html).toContain('<dt>COD</dt>');
    expect(html).toContain('5 resi');
    expect(html).toContain('14 resi');
    expect(html).toContain('Status COD belum tersedia untuk 1 resi manual.');
    expect(html).not.toContain('CSS / Orion');
});

test('dashboard recent pickups use two groups and hide the amount column', () => {
    const html = render({
        ...base,
        summary: {
            ...base.summary!,
            recent_pickups: [
                {
                    id: 1,
                    reference: 'PICKUP-001',
                    picked_up_at: null,
                    staff: 'Rizky',
                    manual: 5,
                    cashless: 3,
                    orion: 2,
                    total: 10,
                    awb_count: 10,
                    amount_cents: 12345600,
                    amount_complete: true,
                    handover_status: 'PENDING',
                    reconciliation_status: 'Dalam proses',
                },
            ],
        },
    });
    expect(html).toContain('Manual 7');
    expect(html).not.toContain('CSS/Orion');
    expect(html).not.toContain('Amount');
    expect(html).not.toContain('123.456');
});

test('shipment detail distinguishes recorded history from package scans and escapes report text', () => {
    const shipment: PortalShipmentDetail = {
        awb: 'CM123456789',
        shipper: 'Pengirim',
        consignee: 'Penerima',
        address: 'Jalan Uji',
        category: 'cashless_hybrid',
        district: 'Kecamatan Uji',
        destination: 'SURABAYA',
        service: 'REG23',
        weight_grams: 1500,
        quantity: 2,
        amount_cents: 0,
        pickup: null,
        status: 'IN_TRANSIT',
        status_text: 'Sedang diproses',
        entry_at: null,
        picked_up_at: null,
        status_at: null,
        observed_at: '2026-11-20T08:00:00Z',
        delivered_at: null,
        history: {
            current_page: 1,
            last_page: 1,
            total: 1,
            data: [
                {
                    status: 'IN_TRANSIT',
                    description: '<script>sorting</script>',
                    pod: null,
                    status_at: null,
                    observed_at: '2026-11-20T08:00:00Z',
                },
            ],
        },
    };
    const html = renderToStaticMarkup(
        <PortalShipmentInformation
            shipment={shipment}
            onHistoryPage={() => {}}
        />,
    );
    if (process.env.CUSTOMER_PORTAL_PREVIEW) {
        mkdirSync('output/customer-portal', { recursive: true });
        writeFileSync(
            'output/customer-portal/shipment.html',
            `<html lang="id"><meta name="viewport" content="width=device-width,initial-scale=1"><body class="bg-background text-foreground"><main class="mx-auto flex max-w-3xl flex-col gap-5 p-4"><h1>Detail resi ${shipment.awb}</h1>${html}</main></body></html>`,
        );
    }
    expect(html).toContain('Riwayat status kiriman');
    expect(html).toContain('waktu report bukan waktu scan paket');
    expect(html).toContain('Tercatat di report');
    expect(html).toContain('1,5 kg');
    expect(html).toContain('SURABAYA');
    expect(html).toContain('&lt;script&gt;sorting&lt;/script&gt;');
    expect(html).not.toContain('<script>sorting</script>');
    expect(html).not.toContain('Amount');
    expect(html).not.toContain('Rp');

    const empty = renderToStaticMarkup(
        <PortalShipmentInformation
            shipment={{
                ...shipment,
                history: { ...shipment.history, data: [], total: 0 },
            }}
            onHistoryPage={() => {}}
        />,
    );
    expect(empty).toContain('Riwayat perubahan belum tersedia');
});

test('monitoring shows searchable AWBs and status without amounts', () => {
    const html = render({
        ...base,
        section: 'monitoring',
        shipments: {
            data: [
                {
                    id: 1,
                    awb: '010150080519926',
                    shipper_name: '401 IRFAN',
                    consignee_name: '<script>receiver</script>',
                    category: 'manual_hybrid',
                    tracking_status: 'DELIVERED',
                    amount_cents: 1250000,
                    entry_at: '2026-11-20T08:00:00Z',
                    picked_up_at: '2026-11-19T08:00:00Z',
                    pickup_id: null,
                    pickup_reference: null,
                },
            ],
            current_page: 1,
            last_page: 1,
            total: 1,
        },
    });
    expect(html).toContain('Pickup mulai');
    expect(html).toContain('Tanggal pickup (WIB)');
    expect(html).toContain('19 Nov 2026');
    expect(html).not.toContain('20 Nov 2026');
    expect(html).not.toContain('Tanggal AWB');
    expect(html).toContain('Terapkan');
    expect(html).toContain('010150080519926');
    expect(html).toContain('Terkirim');
    expect(html).not.toContain('Amount');
    expect(html).not.toContain('12.500');
    expect(html).not.toContain('Rp');
    expect(html).toContain('&lt;script&gt;receiver&lt;/script&gt;');
    expect(html).not.toContain('<script>receiver</script>');
    expect(html).toContain('for="portal-search"');
    expect(html).toContain('name="q"');
    expect(html).toContain('Detail resi');
    expect(html).toContain('aria-label="Detail resi 010150080519926"');
});

test('pickup history shows the pickup period and counts without amounts', () => {
    const html = render({
        ...base,
        section: 'history',
        pickups: {
            data: [
                {
                    id: 1,
                    reference: 'PICKUP-001',
                    picked_up_at: '2026-11-20T08:00:00Z',
                    staff: 'Rizky',
                    manual: 20,
                    cashless: 30,
                    orion: 0,
                    total: 50,
                    awb_count: 45,
                    amount_cents: 25000000,
                    amount_complete: false,
                    handover_status: 'DISCREPANCY',
                    reconciliation_status: 'Dalam proses',
                },
            ],
            current_page: 1,
            last_page: 1,
            total: 1,
        },
    });
    expect(html).toContain('Pickup mulai');
    expect(html).toContain('PICKUP-001');
    expect(html).toContain('Manual 20');
    expect(html).toContain('Cashless 30');
    expect(html).not.toContain('Amount');
    expect(html).not.toContain('250.000');
    expect(html).not.toContain('Belum lengkap');
    expect(html).not.toContain('Rp');
    expect(html).toContain('Ada selisih');
});

test('admin can select a customer and open customer access settings', () => {
    state.role = 'admin_supervisor';
    const html = renderToStaticMarkup(<CustomerPortal {...base} isAdmin />);
    expect(html).toContain('Pilih customer');
    expect(html).toContain('Akses customer');
    expect(html).toContain('Kembali ke admin');
});

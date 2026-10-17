import { expect, test, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import CustomerDataTable from '../components/customer-data-table';
import type { CustomerDetails } from '../components/customer-form';

const customer: CustomerDetails = {
    id: 21,
    name: 'Maju Bersama',
    customer_code: 'CUST-21',
    email: 'customer@example.test',
    phone: '081234567890',
    contact: 'Kontak pickup',
    pickup_address: 'Jalan Merdeka 10',
    latitude: '0.0000000',
    longitude: '0.0000000',
    is_active: true,
    version: 1,
};
const callbacks = { onPage: vi.fn(), onEdit: vi.fn(), onReset: vi.fn() };

test('customer datatable preserves authoritative page and totals rather than paginating the loaded slice again', () => {
    const html = renderToString(
        <CustomerDataTable
            customers={[customer]}
            meta={{
                current_page: 2,
                last_page: 5,
                total: 81,
                from: 21,
                to: 21,
                per_page: 20,
            }}
            page={2}
            loading={false}
            error=""
            filtered={false}
            {...callbacks}
        />,
    );

    expect(html).toContain('Maju Bersama');
    expect(html).toContain('21–21 dari 81 customer');
    expect(html).toMatch(/Halaman .*2.* dari .*5/);
    expect(html).toContain('081234567890');
    expect(html).not.toContain('Customer tidak ditemukan');
});

test('customer datatable distinguishes failed and loading requests from an empty customer master', () => {
    const failed = renderToString(
        <CustomerDataTable
            customers={[]}
            page={1}
            loading={false}
            error="Koneksi gagal"
            filtered={false}
            {...callbacks}
        />,
    );
    const loading = renderToString(
        <CustomerDataTable
            customers={[]}
            page={1}
            loading
            error=""
            filtered={false}
            {...callbacks}
        />,
    );

    expect(failed).toContain('Daftar belum dapat dimuat');
    expect(failed).not.toContain('Belum ada customer');
    expect(loading).toContain('Memuat customer');
    expect(loading).not.toContain('Belum ada customer');
});

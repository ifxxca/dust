import { expect, test } from 'vitest';
import { jneBreadcrumbs, jneNavigation } from './jne-navigation';

test.each([
    [
        '/admin/jne-monitoring/customer-dashboard?customer_id=2',
        'Dashboard customer',
    ],
    ['/admin/jne-monitoring', 'Daftar pengiriman'],
    ['/admin/jne-monitoring/123', 'Daftar pengiriman'],
    ['/admin/jne-monitoring/reconciliation', 'Daftar pengiriman'],
    ['/admin/jne-reports?source=hybrid', 'Tarik report'],
    ['/admin/jne-reports/24/awbs', 'Tarik report'],
    ['/admin/jne-monitoring/profiles', 'Pengaturan penarikan'],
    ['/admin/jne-monitoring/evidence-rules', 'Pengaturan penarikan'],
    ['/admin/jne-monitoring/refresh-policies', 'Pengaturan penarikan'],
    ['/admin/jne-monitoring/exceptions?cause=pickup', 'Daftar pengiriman'],
    ['/admin/jne-monitoring/collections/42', 'Daftar pengiriman'],
    ['/admin/report-runs?status=NEEDS_ATTENTION', 'Riwayat run'],
])('JNE menu selects exactly one entry for %s', (url, title) => {
    expect(
        jneNavigation(url)
            .filter((item) => item.active)
            .map((item) => item.title),
    ).toEqual([title]);
    expect(
        jneBreadcrumbs(url)
            .slice(0, 2)
            .map((item) => item.title),
    ).toEqual(['Pengiriman JNE', title]);
});

test.each([
    '/dashboard',
    '/operations/customers',
    '/admin/jne-shipper-aliases',
    '/admin/jne-monitoring-not-a-page',
])('unrelated page %s does not activate the JNE group', (url) => {
    expect(jneNavigation(url).some((item) => item.active)).toBe(false);
    expect(jneBreadcrumbs(url)).toEqual([]);
});

test('detail breadcrumbs keep their parent entry for return navigation', () => {
    expect(
        jneBreadcrumbs('/admin/jne-monitoring/123').map((item) => item.title),
    ).toEqual(['Pengiriman JNE', 'Daftar pengiriman', 'Detail resi']);
    expect(
        jneBreadcrumbs('/admin/jne-reports/24/awbs').map((item) => item.title),
    ).toEqual(['Pengiriman JNE', 'Tarik report', 'Detail report']);
});

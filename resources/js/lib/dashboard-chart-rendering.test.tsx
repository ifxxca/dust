import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { ReactNode } from 'react';
import RoleDashboard from '@/components/operational-role-dashboard';
import {
    OperationalActivityChart,
    OperationalDonut,
} from '@/components/operational-dashboard-charts';
import { CustomerDailyChart } from '@/components/jne-customer-charts';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
    usePage: () => ({
        props: { auth: { user: { name: 'Audit', role: 'pickup_staff' } } },
    }),
    router: { reload: vi.fn() },
}));
vi.mock('@/components/create-pickup-dialog', () => ({ default: () => null }));

test('operational charts expose nonempty server-rendered graphic titles', () => {
    const activity = renderToStaticMarkup(
        <OperationalActivityChart
            daily={[
                { date: '2026-10-26', tasks: 3, packages: 7, customers: 2 },
            ]}
        />,
    );
    const donut = renderToStaticMarkup(
        <OperationalDonut
            title="Kategori paket"
            description="Jumlah final"
            data={[{ key: 'cashless', label: 'Cashless Hybrid', value: 7 }]}
        />,
    );

    expect(activity).toContain('<title>26 Okt: 3</title>');
    expect(donut).toContain('Kategori paket: Cashless Hybrid 7</title>');
    expect(donut).toContain('<title>Cashless Hybrid: 7 (100%)</title>');
    expect(activity + donut).not.toContain('<title></title>');
});

test('customer trend exposes its title and dated values during server rendering', () => {
    const html = renderToStaticMarkup(
        <CustomerDailyChart
            days={[
                {
                    date: '2026-10-26',
                    shipments: 3,
                    amount: 15000,
                    amount_known: 3,
                },
            ]}
        />,
    );

    expect(html).toContain('Jumlah resi per hari</title>');
    expect(html).toContain('<title>26 Okt · 3 resi</title>');
    expect(html).not.toContain('<title></title>');
});

test('pickup dashboard sparklines retain their seven day values during server rendering', () => {
    const html = renderToStaticMarkup(
        <RoleDashboard
            operationalDate="2026-10-26"
            timezone="Asia/Jakarta"
            stats={{
                today: 2,
                waiting: 0,
                assigned_today: 2,
                picked_up_today: 1,
                no_packages_today: 0,
            }}
            trends={{
                today: [1, 2],
                waiting: [0, 0],
                assigned_today: [1, 2],
                picked_up_today: [0, 1],
            }}
            recent={[]}
            attention={[]}
            nextTasks={[]}
            retail={null}
        />,
    );

    expect(html).toContain(
        'Pickup hari ini — status saat ini per hari jadwal, 7 hari terakhir: 1, 2</title>',
    );
    expect(html).not.toContain('<title></title>');
});

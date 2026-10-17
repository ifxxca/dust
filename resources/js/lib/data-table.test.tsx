import { expect, test, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { ReactNode } from 'react';
import DataTable, { DataTablePagination } from '../components/data-table';
import PickupOperationalList from '../components/pickup-operational-list';

vi.mock('@inertiajs/react', () => ({
    Link: ({
        href,
        children,
    }: {
        href: string | { url: string };
        children: ReactNode;
    }) => <a href={typeof href === 'string' ? href : href.url}>{children}</a>,
}));

test('shared datatable preserves server ordering and pagination metadata without reprocessing the page', () => {
    const html = renderToString(
        <DataTable
            data={[
                { id: 21, name: 'Zeta Staff' },
                { id: 22, name: 'Alpha Staff' },
            ]}
            getRowId={(row) => String(row.id)}
            columns={[
                {
                    id: 'name',
                    header: 'Petugas',
                    hideable: false,
                    cell: (row) => row.name,
                },
            ]}
            pagination={{
                meta: { total: 81, last_page: 5, from: 21, to: 22 },
                page: 2,
                onPage: vi.fn(),
                itemLabel: 'petugas',
            }}
        />,
    );

    expect(html.indexOf('Zeta Staff')).toBeLessThan(
        html.indexOf('Alpha Staff'),
    );
    expect(html).toContain('21–22 dari 81 petugas');
    expect(html).toMatch(/Halaman .*2.* dari .*5/);
});

test.each([
    { loading: true, error: '' },
    { loading: false, error: 'Request gagal' },
])(
    'pagination cannot navigate during an unresolved request: %j',
    ({ loading, error }) => {
        const html = renderToString(
            <DataTablePagination
                page={2}
                meta={{ last_page: 5, total: 100 }}
                onPage={vi.fn()}
                loading={loading}
                error={error}
            />,
        );
        const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(
            (match) => match[0],
        );

        expect(buttons).toHaveLength(4);
        expect(buttons.every((button) => button.includes('disabled=""'))).toBe(
            true,
        );
    },
);

test('unknown record total is not inferred from the loaded slice or displayed as zero', () => {
    const html = renderToString(
        <DataTablePagination
            page={2}
            meta={{ last_page: 3 }}
            onPage={vi.fn()}
            itemLabel="session"
        />,
    );

    expect(html).toMatch(/Halaman .*2.* dari .*3/);
    expect(html).not.toContain('0 session');
});

test('pickup table and card view keep mass assignment eligibility and selection after migration', () => {
    const tasks = [
        {
            id: 1,
            reference: 'REF-1',
            customer: { name: 'Customer A' },
            pickup_address: 'Jalan A',
            scheduled_at: '2026-10-15T08:00:00Z',
            status: 'SCHEDULED',
            assigned_staff: null,
            can: { assign: true, take_over: false },
        },
        {
            id: 2,
            reference: 'REF-2',
            customer: { name: 'Customer B' },
            pickup_address: 'Jalan B',
            scheduled_at: '2026-10-15T09:00:00Z',
            status: 'ASSIGNED',
            assigned_staff: { name: 'Petugas B' },
            can: { assign: false, take_over: false },
        },
    ];
    const html = renderToString(
        <PickupOperationalList
            tasks={tasks}
            loading={false}
            error=""
            timezone="Asia/Jakarta"
            page={1}
            perPage={20}
            sort="newest"
            onPage={vi.fn()}
            onPerPage={vi.fn()}
            onSort={vi.fn()}
            onAssign={vi.fn()}
            onTakeover={vi.fn()}
            selection={{ ids: [1], disabled: false, onToggle: vi.fn() }}
        />,
    );
    const buttons = [
        ...html.matchAll(
            /<button\b[^>]*aria-label="Pilih PCK-(000[12]) untuk assignment"[^>]*>/g,
        ),
    ];

    expect(buttons).toHaveLength(4);
    for (const [tag, id] of buttons) {
        if (id === '0001') {
            expect(tag).toContain('aria-checked="true"');
            expect(tag).not.toContain('disabled=""');
        } else {
            expect(tag).toContain('disabled=""');
        }
    }
});

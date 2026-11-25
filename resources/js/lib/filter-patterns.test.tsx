import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import DateRangeFields from '@/components/date-range-fields';
import FilterSelect from '@/components/filter-select';
import { DataTablePagination } from '@/components/data-table';
import {
    emptyTrackingFilters,
    normalizeTrackingFilters,
    removeTrackingFilter,
    trackingFilterChips,
} from './shipment-monitoring';

vi.mock('@inertiajs/react', () => ({
    Link: ({
        href,
        children,
        ...props
    }: {
        href: string;
        children: ReactNode;
        preserveScroll?: boolean;
        'aria-label'?: string;
    }) => (
        <a href={href} aria-label={props['aria-label']}>
            {children}
        </a>
    ),
}));

test('date range keeps literal calendar dates and associates each error with its control', () => {
    const html = renderToStaticMarkup(
        <DateRangeFields
            id="range"
            from="2026-11-02"
            thru="2026-11-01"
            onFromChange={vi.fn()}
            onThruChange={vi.fn()}
            thruError="Tanggal akhir harus setelah tanggal awal."
        />,
    );
    expect(html).toContain('value="2026-11-02"');
    expect(html).toContain('value="2026-11-01"');
    expect(html).toContain('min="2026-11-02"');
    expect(html).toContain('for="range-from"');
    expect(html).toContain('aria-describedby="range-thru-error"');
    expect(html).toContain('id="range-thru-error"');
    expect(html).not.toContain('aria-describedby="range-from-error"');
});

test('select exposes its current option and validation without a dangling error reference', () => {
    const valid = renderToStaticMarkup(
        <FilterSelect
            id="status"
            label="Status"
            value="DELIVERED"
            all="Semua status"
            options={[['DELIVERED', 'Terkirim']]}
            onChange={vi.fn()}
        />,
    );
    expect(valid).toContain('Terkirim');
    expect(valid).toContain('for="status"');
    expect(valid).not.toContain('aria-describedby="status-error"');
    const invalid = renderToStaticMarkup(
        <FilterSelect
            id="status"
            label="Status"
            value=""
            all="Semua status"
            options={[]}
            error="Pilih status yang tersedia."
            onChange={vi.fn()}
        />,
    );
    expect(invalid).toContain('aria-invalid="true"');
    expect(invalid).toContain('aria-describedby="status-error"');
    expect(invalid).toContain('id="status-error"');
});

test('filter reset and normalization preserve leading zero AWBs and accepted page sizes', () => {
    expect(
        normalizeTrackingFilters({
            q: '00123',
            per_page: 50,
            freshness_hours: null,
        }),
    ).toEqual({ ...emptyTrackingFilters, q: '00123', per_page: '50' });
    expect(normalizeTrackingFilters({})).toEqual(emptyTrackingFilters);
});

test('removing period clears both endpoints while retaining independent search and status', () => {
    const filters = {
        ...emptyTrackingFilters,
        q: '00123',
        status: 'DELIVERED',
        date_from: '2026-11-01',
        date_thru: '2026-11-02',
    };
    expect(removeTrackingFilter(filters, 'date_from')).toEqual({
        ...emptyTrackingFilters,
        q: '00123',
        status: 'DELIVERED',
    });
});

test('removing a freshness threshold also removes the dependent stale filter', () => {
    expect(
        removeTrackingFilter(
            {
                ...emptyTrackingFilters,
                freshness: 'stale',
                freshness_hours: '6',
                q: '00123',
            },
            'freshness_hours',
        ),
    ).toEqual({ ...emptyTrackingFilters, q: '00123' });
    expect(
        removeTrackingFilter(
            {
                ...emptyTrackingFilters,
                freshness: 'unobserved',
                freshness_hours: '6',
            },
            'freshness_hours',
        ).freshness,
    ).toBe('unobserved');
});

test('active filter indicators cover an open ended period and retain independently removable freshness', () => {
    expect(
        trackingFilterChips(
            {
                ...emptyTrackingFilters,
                q: '00123',
                customer_id: '4',
                date_thru: '2026-11-02',
                freshness: 'stale',
                freshness_hours: '6',
            },
            'Customer contoh',
        ),
    ).toEqual([
        { key: 'q', label: 'AWB: 00123' },
        { key: 'customer_id', label: 'Customer contoh' },
        { key: 'date_from', label: 'Periode: Awal – 2026-11-02' },
        { key: 'freshness_hours', label: 'Batas pembaruan: 6 jam' },
        { key: 'freshness', label: 'Data belum diperbarui' },
    ]);
});

test('link pagination retains navigable URLs and disables unavailable boundaries', () => {
    const html = renderToStaticMarkup(
        <DataTablePagination
            meta={{ total: 51, last_page: 3 }}
            page={1}
            onPage={vi.fn()}
            hrefForPage={(page) => `/example?q=00123&page=${page}`}
        />,
    );
    expect(html).toContain('href="/example?q=00123&amp;page=2"');
    expect(html).not.toContain('href="/example?q=00123&amp;page=0"');
    expect(html).toContain('aria-label="Halaman sebelumnya" disabled=""');
});

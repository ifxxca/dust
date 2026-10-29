import { expect, test } from 'vitest';
import {
    customerListFilters,
    customerListUrl,
} from './customer-list-navigation';

test('customer links preserve search status and page without changing the operations route', () => {
    const url = customerListUrl({ q: 'PT A & B', status: 'inactive', page: 3 });
    expect(url.split('?')[0]).toBe('/operations/customers');
    expect(customerListFilters(url)).toEqual({
        q: 'PT A & B',
        status: 'inactive',
        page: 3,
    });
    expect(customerListUrl({ q: '', status: 'all', page: 1 })).toBe(
        '/operations/customers',
    );
});

test('invalid and oversized customer query state is normalized safely', () => {
    for (const value of [
        '-1',
        '0',
        'abc',
        '1.5',
        'Infinity',
        '999999999999999999',
    ]) {
        expect(
            customerListFilters(
                `/operations/customers?page=${value}&status=unknown`,
            ).page,
        ).toBe(1);
    }
    const filters = customerListFilters(
        '/operations/customers?status=other&q=' + 'a'.repeat(120),
    );
    expect(filters.status).toBe('all');
    expect(filters.q).toHaveLength(100);
});

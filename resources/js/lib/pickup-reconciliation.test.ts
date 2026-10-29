import { expect, test } from 'vitest';
import {
    reconciliationIssue,
    reconciliationTotal,
} from './pickup-reconciliation';

const counts = {
    manual_hybrid: {
        pop: 50,
        received: 50,
        expected: 50,
        confirmed: 60,
        shortfall: 0,
        excess: 10,
    },
    cashless_hybrid: {
        pop: 50,
        received: 50,
        expected: 50,
        confirmed: 40,
        shortfall: 10,
        excess: 0,
    },
};
test('a queued pickup without an evaluation has a waiting message rather than crashing on null reasons', () => {
    expect(reconciliationIssue({}, null).title).toBe(
        'Menunggu kelengkapan data',
    );
});
test('equal total AWBs still exposes differences across categories', () => {
    expect(reconciliationTotal(counts, 'confirmed')).toBe(100);
    expect(reconciliationIssue(counts).title).toBe(
        'Indikasi kategori tertukar',
    );
});
test('an unverified warehouse target stays unavailable even when POP and JNE have numbers', () => {
    const unverified = {
        manual_hybrid: {
            pop: 10,
            received: null,
            expected: null,
            confirmed: 10,
            shortfall: null,
            excess: null,
        },
    };
    expect(reconciliationTotal(unverified, 'expected')).toBeNull();
    expect(reconciliationIssue(unverified).title).toBe(
        'Menunggu kelengkapan data',
    );
    expect(reconciliationTotal({}, 'pop')).toBeNull();
});

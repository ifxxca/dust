import { expect, test } from 'vitest';
import {
    reconciliationIssue,
    reconciliationTotal,
    reconciliationCategoryStates,
    reconciliationProgress,
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

const categoryCounts = (expected: number | null, confirmed: number) => ({
    pop: expected,
    received: expected,
    expected,
    confirmed,
    shortfall: expected === null ? null : Math.max(0, expected - confirmed),
    excess: expected === null ? null : Math.max(0, confirmed - expected),
});
const allocation = (
    manual = categoryCounts(4, 4),
    cashless = categoryCounts(2, 2),
    orion = categoryCounts(3, 3),
) => ({
    categories: {
        manual_hybrid: manual,
        cashless_hybrid: cashless,
        css_orion: orion,
    },
    quantity_status: 'MATCHED',
    finalization_status: 'PENDING',
    dirty: false,
});

test.each(['manual_hybrid', 'cashless_hybrid', 'css_orion'] as const)(
    'identifies a shortage and excess for %s independently',
    (key) => {
        const row = allocation();
        row.categories[key] = categoryCounts(4, 2);
        expect(
            reconciliationCategoryStates(row).find(
                (category) => category.key === key,
            )?.text,
        ).toContain('kurang 2');
        row.categories[key] = categoryCounts(4, 7);
        expect(
            reconciliationCategoryStates(row).find(
                (category) => category.key === key,
            )?.text,
        ).toContain('lebih 3');
    },
);

test('offsetting category differences never display a complete progress bar', () => {
    const row = allocation(categoryCounts(4, 2), categoryCounts(2, 4));
    expect(
        reconciliationCategoryStates(row).map((category) => category.text),
    ).toEqual(['Manual kurang 2', 'Cashless lebih 2', 'CSS/Orion cocok']);
    expect(reconciliationProgress(row)).toEqual({
        percent: 78,
        fill: 78,
        tone: 'danger',
    });
});

test('unavailable targets and stale evaluations do not present old shortages or fabricated percentages', () => {
    const row = allocation(categoryCounts(null, 2));
    expect(reconciliationCategoryStates(row)[0].text).toBe(
        'Manual menunggu target',
    );
    expect(reconciliationProgress(row).percent).toBeNull();
    row.categories.manual_hybrid = categoryCounts(4, 1);
    row.dirty = true;
    expect(reconciliationCategoryStates(row)[0].text).toBe(
        'Manual belum diperiksa',
    );
    expect(reconciliationProgress(row).percent).toBeNull();
});

test('quantity completion stays pending until finalization and excess never overflows the bar', () => {
    const row = allocation();
    expect(reconciliationProgress(row)).toEqual({
        percent: 100,
        fill: 100,
        tone: 'warning',
    });
    row.finalization_status = 'LOCKED';
    expect(reconciliationProgress(row).tone).toBe('success');
    row.categories.manual_hybrid = categoryCounts(4, 14);
    expect(reconciliationProgress(row)).toEqual({
        percent: 211,
        fill: 100,
        tone: 'danger',
    });
});

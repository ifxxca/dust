import { expect, test } from 'vitest';
import { reportPeriodEnd, reportPeriods } from './jne-report-limits';

test.each([
    ['2026-10-13', '2026-10-17'],
    ['2026-10-30', '2026-11-03'],
    ['2024-02-27', '2024-03-02'],
    ['2026-12-30', '2027-01-03'],
])(
    'report interval ends after five inclusive calendar days from %s',
    (from, expected) => {
        expect(reportPeriodEnd(from, 5)).toBe(expected);
    },
);

test('30 day request previews six consecutive five day reports', () => {
    expect(reportPeriods('2026-10-01', '2026-10-30', 5, 366)).toEqual([
        { from: '2026-10-01', thru: '2026-10-05' },
        { from: '2026-10-06', thru: '2026-10-10' },
        { from: '2026-10-11', thru: '2026-10-15' },
        { from: '2026-10-16', thru: '2026-10-20' },
        { from: '2026-10-21', thru: '2026-10-25' },
        { from: '2026-10-26', thru: '2026-10-30' },
    ]);
});

test('partial final report crosses year boundary without overlaps or extra dates', () => {
    expect(reportPeriods('2026-12-29', '2027-01-04', 5, 366)).toEqual([
        { from: '2026-12-29', thru: '2027-01-02' },
        { from: '2027-01-03', thru: '2027-01-04' },
    ]);
});

test('single day and leap day requests retain all requested dates', () => {
    expect(reportPeriods('2026-10-13', '2026-10-13', 5, 366)).toEqual([
        { from: '2026-10-13', thru: '2026-10-13' },
    ]);
    expect(reportPeriods('2024-02-26', '2024-03-02', 5, 366)).toEqual([
        { from: '2024-02-26', thru: '2024-03-01' },
        { from: '2024-03-02', thru: '2024-03-02' },
    ]);
});

test.each([
    ['', '2026-10-13'],
    ['2026-02-30', '2026-03-01'],
    ['2026-10-13', 'invalid'],
    ['2026-10-14', '2026-10-13'],
    ['2024-01-01', '2025-01-01'],
])('invalid or oversized request %s to %s has no preview', (from, thru) => {
    expect(reportPeriods(from, thru, 5, 366)).toEqual([]);
});

test('request preview stops at the 366 day limit', () => {
    const periods = reportPeriods('2024-01-01', '2024-12-31', 5, 366);
    expect(periods).toHaveLength(74);
    expect(periods.at(-1)).toEqual({ from: '2024-12-31', thru: '2024-12-31' });
    expect(reportPeriods('2026-10-01', '2026-10-30', 0, 366)).toEqual([]);
});

test.each(['', 'invalid', '2026-02-30'])(
    'invalid starting date %s has no upper date',
    (from) => {
        expect(reportPeriodEnd(from, 5)).toBe('');
    },
);

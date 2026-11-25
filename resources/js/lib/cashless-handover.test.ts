import { expect, test } from 'vitest';
import { prepareCashlessAwb } from './cashless-handover';

test('scans preserve leading zeroes while normalizing case and scanner whitespace', () => {
    expect(prepareCashlessAwb(' tg0000000012\r\n', [], [])).toEqual({
        awb: 'TG0000000012',
        matchedPatterns: ['TG##########'],
    });
    expect(prepareCashlessAwb('0000000000000001', [], [])).toMatchObject({
        awb: '0000000000000001',
    });
});

test('queued and saved AWBs cannot be scanned again', () => {
    expect(prepareCashlessAwb('tg0000000001', ['TG0000000001'], [])).toEqual({
        error: 'Resi TG0000000001 sudah dipindai.',
        kind: 'duplicate',
    });
    expect(prepareCashlessAwb('TG0000000001', [], ['TG0000000001'])).toEqual({
        error: 'Resi TG0000000001 sudah dipindai.',
        kind: 'duplicate',
    });
});

test.each([
    '',
    '1234',
    '12345',
    'SKU12',
    'TG 001',
    '<script>',
    '010150075649226',
    '016660047940726',
])('rejects invalid or Manual AWB %s', (awb) => {
    expect(prepareCashlessAwb(awb, [], [])).toHaveProperty('error');
});

test('limits each unsaved batch without limiting subsequent batches', () => {
    expect(
        prepareCashlessAwb(
            'TG0000000999',
            Array.from({ length: 500 }, (_, i) => `TG${i}`),
            [],
        ),
    ).toHaveProperty('error');
    expect(prepareCashlessAwb('TG0000000999', [], [])).toMatchObject({
        awb: 'TG0000000999',
    });
});

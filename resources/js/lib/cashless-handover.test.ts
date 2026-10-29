import { expect, test } from 'vitest';
import { prepareCashlessAwb } from './cashless-handover';

test('scans preserve leading zeroes while normalizing case and scanner whitespace', () => {
    expect(prepareCashlessAwb(' tg00012\r\n', [], [])).toEqual({
        awb: 'TG00012',
    });
    expect(prepareCashlessAwb('000001', [], [])).toEqual({ awb: '000001' });
});

test('queued and saved AWBs cannot be scanned again', () => {
    expect(prepareCashlessAwb('tg001', ['TG001'], [])).toHaveProperty('error');
    expect(prepareCashlessAwb('TG001', [], ['TG001'])).toHaveProperty('error');
});

test.each(['', 'TG 001', '<script>', '010150075649226', '016660047940726'])(
    'rejects invalid or Manual AWB %s',
    (awb) => {
        expect(prepareCashlessAwb(awb, [], [])).toHaveProperty('error');
    },
);

test('limits each unsaved batch without limiting subsequent batches', () => {
    expect(
        prepareCashlessAwb(
            'TGNEW',
            Array.from({ length: 500 }, (_, i) => `TG${i}`),
            [],
        ),
    ).toHaveProperty('error');
    expect(prepareCashlessAwb('TGNEW', [], [])).toEqual({ awb: 'TGNEW' });
});

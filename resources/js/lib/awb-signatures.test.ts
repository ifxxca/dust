import { expect, test } from 'vitest';
import {
    auditAwbSignatures,
    awbSignatures,
    matchedAwbSignatures,
    normalizeAwb,
} from './awb-signatures';
import { prepareCashlessAwb } from './cashless-handover';

test.each(awbSignatures)(
    'matches a full concrete value for signature %s',
    (pattern) => {
        expect(matchedAwbSignatures(pattern.replaceAll('#', '0'))).toContain(
            pattern,
        );
    },
);

test.each([
    'AKJNE1234567',
    'AKJNE123456789',
    'XAKJNE12345678',
    'AKJNE1234567X',
    'JNAC3064401124',
    'JNAC-306440112',
    'JNAC-30644011245',
    'JNAC-306440112X',
    'BSC123456789012',
    'RMA9110089',
    'QR:TG1234567890',
    'SKU260',
    '１２３４５６７８９０１２３260',
    '\u0000TG1234567890',
    'TG1234567890\u0000',
    '\u00a0TG1234567890',
])('rejects unsupported raw barcode %s', (raw) => {
    expect(matchedAwbSignatures(raw)).toEqual([]);
    expect(prepareCashlessAwb(raw, [], [])).toHaveProperty('error');
});

test('normalizes only documented ASCII framing and case without extraction or loss of zeroes', () => {
    expect(normalizeAwb(' \ttg0000000001\r\n')).toBe('TG0000000001');
    expect(normalizeAwb('\u0000TG0000000001')).toBe('\u0000TG0000000001');
    expect(matchedAwbSignatures('akjne12345678')).toEqual([]);
    expect(matchedAwbSignatures('$333260100123456')).toEqual([
        '$333260100######',
    ]);
    expect(matchedAwbSignatures('BSC-123456789012')).toEqual([
        'BSC-############',
    ]);
    expect(matchedAwbSignatures('RMA911008')).toEqual(['RMA911008']);
});

test('audits the exact supplied list without deduplicating or rewriting ambiguous signatures', () => {
    expect(awbSignatures).toHaveLength(155);
    const audit = auditAwbSignatures();
    expect(audit.duplicates).toEqual([]);
    expect(audit.overlaps).toHaveLength(217);
    expect(audit.overlaps).toContainEqual([
        'BLIJC0450#######',
        'BLIJC###########',
    ]);
    expect(audit.literals).toEqual(['RMA911008']);
    const duplicates = ['BLIJC########', 'BLIJC########'];
    expect(auditAwbSignatures(duplicates).duplicates).toEqual([
        'BLIJC########',
    ]);
    expect(duplicates).toHaveLength(2);
});

test.each(['JNAC-3064401124', 'JNAC-3064401235'])(
    'accepts cashless %s without removing its separator and detects a repeated scan',
    (awb) => {
        expect(prepareCashlessAwb(` ${awb.toLowerCase()}\r\n`, [], [])).toEqual(
            {
                awb,
                matchedPatterns: ['JNAC-##########'],
            },
        );
        expect(prepareCashlessAwb(awb, [awb], [])).toMatchObject({
            kind: 'duplicate',
        });
        expect(prepareCashlessAwb(awb, [], [awb])).toMatchObject({
            kind: 'duplicate',
        });
    },
);

test('overlapping signatures produce one accepted AWB and diagnostics for all matches', () => {
    const result = prepareCashlessAwb('BLIJC04501234567', [], []);
    expect(result).toEqual({
        awb: 'BLIJC04501234567',
        matchedPatterns: ['BLIJC0450#######', 'BLIJC###########'],
    });
    expect(
        prepareCashlessAwb('BLIJC04501234567', [result.awb!], []),
    ).toMatchObject({ kind: 'duplicate' });
});

test('a recognized Manual signature remains excluded from Cashless by business rules', () => {
    expect(matchedAwbSignatures('010112345678901')).toContain(
        '0101###########',
    );
    expect(prepareCashlessAwb('010112345678901', [], [])).toMatchObject({
        error: 'Resi ini termasuk Manual. Gunakan resi Cashless.',
    });
});

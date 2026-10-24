import { expect, test } from 'vitest';
import { parseJneAccounts } from './jne-accounts';

test('Excel and Markdown account lists preserve leading zeros and National Acc/Cust', () => {
    expect(
        parseJneAccounts(
            '| Account | National |\n| --- | --- |\n| 00117298 | NO |\n80089400\tYES\n80545000,YES',
        ).accounts,
    ).toEqual([
        { customer_account: '00117298', national_account: 'N' },
        { customer_account: '80089400', national_account: 'Y' },
        { customer_account: '80545000', national_account: 'Y' },
    ]);
});

test('identical duplicates merge and conflicting flags require correction', () => {
    const parsed = parseJneAccounts('001 NO\n001 N\n001 YES');
    expect(parsed.duplicates).toBe(1);
    expect(parsed.errors).toEqual([
        'Baris 3: National Acc/Cust 001 bertentangan.',
    ]);
});

test.each(['001', '001 MAYBE', '001 NO extra', '<script> NO'])(
    'invalid account row %s cannot be submitted',
    (input) => {
        const parsed = parseJneAccounts(input);
        expect(parsed.accounts).toHaveLength(0);
        expect(parsed.errors).toHaveLength(1);
    },
);

test('500 accounts fit and 501 require a smaller batch', () => {
    const input = Array.from({ length: 500 }, (_, i) => `${i} NO`).join('\n');
    expect(parseJneAccounts(input).errors).toHaveLength(0);
    expect(parseJneAccounts(input + '\n500 YES').errors).toHaveLength(1);
});

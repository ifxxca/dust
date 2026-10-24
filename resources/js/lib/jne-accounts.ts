export type JneAccount = {
    customer_account: string;
    national_account: 'Y' | 'N';
};

export function parseJneAccounts(input: string) {
    const accounts = new Map<string, JneAccount>();
    const errors: string[] = [];
    let duplicates = 0;
    input.split(/\r?\n/).forEach((line, index) => {
        const cells = line
            .trim()
            .replace(/^\||\|$/g, '')
            .split(/[\t,;|]+|\s+/)
            .map((cell) => cell.trim())
            .filter(Boolean);
        if (!cells.length || cells.every((cell) => /^:?-+:?$/.test(cell)))
            return;
        if (/^(account|nomor|customer_account)$/i.test(cells[0])) return;
        const [number, flag] = cells;
        if (
            cells.length !== 2 ||
            !/^[\p{L}\p{N}._-]+$/u.test(number) ||
            number.length > 100 ||
            !/^(YES|NO|Y|N)$/i.test(flag || '')
        ) {
            errors.push(
                `Baris ${index + 1}: gunakan nomor account dan YES atau NO.`,
            );
            return;
        }
        const customer_account = number.toUpperCase();
        const national_account = flag.toUpperCase().startsWith('Y') ? 'Y' : 'N';
        const existing = accounts.get(customer_account);
        if (existing) {
            if (existing.national_account !== national_account)
                errors.push(
                    `Baris ${index + 1}: National Acc/Cust ${customer_account} bertentangan.`,
                );
            else duplicates++;
        } else
            accounts.set(customer_account, {
                customer_account,
                national_account,
            });
    });
    if (accounts.size > 500)
        errors.push('Maksimal 500 account per pengiriman form.');
    return { accounts: [...accounts.values()], errors, duplicates };
}

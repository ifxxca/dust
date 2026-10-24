import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { parseJneAccounts } from '@/lib/jne-accounts';

export default function JneAccountInput({
    value,
    onChange,
    id = 'jne-account-list',
}: {
    value: string;
    onChange: (value: string) => void;
    id?: string;
}) {
    const parsed = parseJneAccounts(value);
    return (
        <div className="space-y-3">
            <div className="space-y-2">
                <Label htmlFor={id}>Daftar account & National Acc/Cust</Label>
                <Textarea
                    id={id}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={'11729800\tNO\n80089400\tYES'}
                    className="min-h-36 font-mono text-sm"
                    aria-describedby={`${id}-help`}
                    aria-invalid={parsed.errors.length > 0}
                />
                <p
                    id={`${id}-help`}
                    className="text-xs leading-5 text-muted-foreground"
                >
                    Tempel dua kolom dari Excel atau tabel: nomor account, lalu
                    YES/NO. Maksimal 500 account. Nomor dengan nol di depan
                    tetap utuh.
                </p>
            </div>
            {parsed.errors.length > 0 && (
                <div
                    role="alert"
                    className="space-y-1 text-sm text-destructive"
                >
                    {parsed.errors.slice(0, 5).map((error) => (
                        <p key={error}>{error}</p>
                    ))}
                    {parsed.errors.length > 5 && (
                        <p>
                            {parsed.errors.length - 5} baris lain perlu
                            diperbaiki.
                        </p>
                    )}
                </div>
            )}
            {parsed.accounts.length > 0 && (
                <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                            {parsed.accounts.length} account unik
                        </Badge>
                        <Badge variant="outline">
                            {
                                parsed.accounts.filter(
                                    (account) =>
                                        account.national_account === 'Y',
                                ).length
                            }{' '}
                            YES
                        </Badge>
                        <Badge variant="outline">
                            {
                                parsed.accounts.filter(
                                    (account) =>
                                        account.national_account === 'N',
                                ).length
                            }{' '}
                            NO
                        </Badge>
                    </div>
                    <ul
                        aria-label="Pratinjau account"
                        className="grid max-h-44 gap-2 overflow-y-auto text-sm sm:grid-cols-2"
                    >
                        {parsed.accounts.map((account) => (
                            <li
                                key={account.customer_account}
                                className="flex justify-between gap-3 rounded bg-muted/40 px-2 py-1"
                            >
                                <span className="font-mono break-all">
                                    {account.customer_account}
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                    {account.national_account === 'Y'
                                        ? 'YES'
                                        : 'NO'}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {parsed.duplicates > 0 && (
                        <p className="text-xs text-muted-foreground">
                            {parsed.duplicates} duplikat identik digabung.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

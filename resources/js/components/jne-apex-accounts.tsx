import { useState } from 'react';
import { useForm } from '@inertiajs/react';
import { ListPlus, Search, Settings2 } from 'lucide-react';
import JneAccountInput from '@/components/jne-account-input';
import type { PullProfile } from '@/components/jne-pull-settings';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { parseJneAccounts } from '@/lib/jne-accounts';
import * as monitoring from '@/routes/jne-monitoring';

export default function JneApexAccounts({
    profiles,
    onEdit,
    onToggle,
    busy,
}: {
    profiles: PullProfile[];
    onEdit: (profile: PullProfile) => void;
    onToggle: (profile: PullProfile, enabled: boolean) => void;
    busy: number | null;
}) {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const form = useForm({
        accounts: [] as ReturnType<typeof parseJneAccounts>['accounts'],
        enabled: false,
        interval_minutes: 30,
        lookback_days: 1,
    });
    const parsed = parseJneAccounts(text);
    const accounts = profiles.filter(
        (profile) =>
            profile.source === 'apex' && profile.report_type === 'apex',
    );
    const filtered = accounts.filter((profile) =>
        `${profile.customer_account} ${profile.label || ''}`
            .toLowerCase()
            .includes(query.toLowerCase()),
    );
    const pages = Math.max(1, Math.ceil(filtered.length / 20));
    const current = Math.min(page, pages);
    return (
        <section
            id="apex-accounts"
            aria-label="Account APEX"
            className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
        >
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="font-semibold">
                        Account APEX{' '}
                        <span className="text-sm font-normal text-muted-foreground">
                            ({accounts.length})
                        </span>
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        National Acc/Cust disimpan per account. Antrean APEX
                        berjalan bergiliran.
                    </p>
                </div>
                <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => {
                        form.clearErrors();
                        setOpen(true);
                    }}
                >
                    <ListPlus aria-hidden="true" />
                    Impor banyak account
                </Button>
            </header>
            <div className="relative max-w-md">
                <Search
                    aria-hidden="true"
                    className="absolute top-3.5 left-3 size-4 text-muted-foreground"
                />
                <Label htmlFor="apex-account-search" className="sr-only">
                    Cari account APEX
                </Label>
                <Input
                    id="apex-account-search"
                    className="min-h-11 pl-9"
                    placeholder="Cari nomor atau nama account"
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setPage(1);
                    }}
                />
            </div>
            <ul className="divide-y">
                {filtered
                    .slice((current - 1) * 20, current * 20)
                    .map((profile) => (
                        <li
                            key={profile.id}
                            aria-label={`Account ${profile.customer_account}`}
                            className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                        >
                            <div>
                                <p className="font-mono text-sm font-semibold break-all">
                                    {profile.customer_account}
                                </p>
                                {profile.label && (
                                    <p className="text-xs text-muted-foreground">
                                        {profile.label}
                                    </p>
                                )}
                                <p className="mt-1 text-xs text-muted-foreground">
                                    National Acc/Cust:{' '}
                                    <strong>
                                        {profile.national_account === 'Y'
                                            ? 'YES'
                                            : 'NO'}
                                    </strong>{' '}
                                    · {profile.interval_minutes} menit ·{' '}
                                    {profile.mode === 'fixed'
                                        ? `${profile.date_from} – ${profile.date_thru}`
                                        : `${profile.lookback_days} hari terakhir`}
                                </p>
                            </div>
                            <Label className="flex min-h-11 cursor-pointer items-center gap-2">
                                <Checkbox
                                    aria-label={`Jadwal account ${profile.customer_account}`}
                                    checked={profile.enabled}
                                    disabled={busy !== null}
                                    onCheckedChange={(checked) =>
                                        onToggle(profile, checked === true)
                                    }
                                />
                                {profile.enabled ? 'Aktif' : 'Nonaktif'}
                            </Label>
                            <Button
                                variant="outline"
                                className="min-h-11"
                                onClick={() => onEdit(profile)}
                            >
                                <Settings2 aria-hidden="true" />
                                Atur
                            </Button>
                        </li>
                    ))}
            </ul>
            {!filtered.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                    {accounts.length
                        ? 'Account tidak ditemukan.'
                        : 'Belum ada account APEX. Tambahkan satu atau impor daftar sekaligus.'}
                </p>
            )}
            {filtered.length > 20 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <p className="text-xs text-muted-foreground">
                        {filtered.length} account · Halaman {current} dari{' '}
                        {pages}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            className="min-h-11"
                            disabled={current === 1}
                            onClick={() => setPage(current - 1)}
                        >
                            Sebelumnya
                        </Button>
                        <Button
                            variant="outline"
                            className="min-h-11"
                            disabled={current === pages}
                            onClick={() => setPage(current + 1)}
                        >
                            Berikutnya
                        </Button>
                    </div>
                </div>
            )}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Impor banyak account APEX</DialogTitle>
                        <DialogDescription>
                            Account baru memakai pengaturan di bawah. Account
                            yang sudah tersimpan tetap memakai jadwalnya;
                            perbedaan YES/NO harus diperbaiki melalui Atur.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="space-y-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            form.transform((data) => ({
                                ...data,
                                accounts: parsed.accounts,
                            }));
                            form.post(monitoring.profileBulk.url(), {
                                preserveScroll: true,
                                onSuccess: () => {
                                    setOpen(false);
                                    setText('');
                                },
                            });
                        }}
                    >
                        <JneAccountInput
                            value={text}
                            onChange={setText}
                            id="import-apex-accounts"
                        />
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="bulk-interval">
                                    Interval account baru (menit)
                                </Label>
                                <Input
                                    id="bulk-interval"
                                    className="min-h-11"
                                    type="number"
                                    min={5}
                                    max={1440}
                                    required
                                    value={form.data.interval_minutes}
                                    onChange={(event) =>
                                        form.setData(
                                            'interval_minutes',
                                            Number(event.target.value),
                                        )
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="bulk-lookback">
                                    Periode account baru (hari)
                                </Label>
                                <Input
                                    id="bulk-lookback"
                                    className="min-h-11"
                                    type="number"
                                    min={1}
                                    max={366}
                                    required
                                    value={form.data.lookback_days}
                                    onChange={(event) =>
                                        form.setData(
                                            'lookback_days',
                                            Number(event.target.value),
                                        )
                                    }
                                />
                            </div>
                        </div>
                        <Label className="flex min-h-11 cursor-pointer items-center gap-2">
                            <Checkbox
                                checked={form.data.enabled}
                                onCheckedChange={(value) =>
                                    form.setData('enabled', value === true)
                                }
                            />
                            Aktifkan jadwal account baru
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            Menyimpan account nonaktif tidak menarik report.
                            Aktifkan jadwal atau tarik manual saat diperlukan.
                        </p>
                        {Object.entries(form.errors).map(([key, error]) => (
                            <InputError key={key} message={error} />
                        ))}
                        <Button
                            className="min-h-11 w-full"
                            disabled={
                                form.processing ||
                                !parsed.accounts.length ||
                                parsed.errors.length > 0
                            }
                        >
                            {form.processing
                                ? 'Menyimpan…'
                                : `Simpan ${parsed.accounts.length} account`}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </section>
    );
}

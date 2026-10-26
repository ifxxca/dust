import * as aliases from '@/routes/jne-shipper-aliases';
import { Head, Link, router, useForm, usePoll } from '@inertiajs/react';
import { useState } from 'react';
import { Plus, History, ChevronDown, Users } from 'lucide-react';
import JnePullSettings, {
    type PullProfile,
} from '@/components/jne-pull-settings';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import JneApexAccounts from '@/components/jne-apex-accounts';
import PageContainer from '@/components/page-container';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import * as monitoring from '@/routes/jne-monitoring';
import * as runs from '@/routes/report-runs';
import { reportLabel, scrapingSources } from '@/lib/scraping';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type Profile = PullProfile;

type Issue = {
    id: number;
    source?: string;
    customer_account: string;
    status: string;
    error_message: string | null;
    import_error: string | null;
    projection_error: string | null;
};

const emptyProfile = {
    source: 'apex',
    report_type: 'apex',
    customer_account: '',
    national_account: 'N',
    label: '',
    enabled: false,
    mode: 'rolling',
    lookback_days: 30,
    date_from: '',
    date_thru: '',
    interval_minutes: 360,
    version: 1,
};

export default function JneProfiles({
    profiles,
    timezone,
    activeAwbs = { total: 0, eligible: 0 },
}: {
    profiles: Profile[];
    issues: Issue[];
    timezone: string;
    activeAwbs?: { total: number; eligible: number };
}) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<number | null>(null);
    const [busy, setBusy] = useState<number | null>(null);
    const [running, setRunning] = useState<number | null>(null);
    const [toggleError, setToggleError] = useState('');
    const run = useForm({ profile_id: 0 });
    const form = useForm(emptyProfile);
    usePoll(15000, { only: ['profiles', 'activeAwbs'] });
    const edit = (profile: Profile) => {
        setEditing(profile.id);
        form.clearErrors();
        form.setData({
            source: profile.source,
            report_type: profile.report_type,
            customer_account: profile.customer_account,
            national_account: profile.national_account || 'N',
            label: profile.label || '',
            enabled: profile.enabled,
            mode: profile.mode,
            lookback_days: profile.lookback_days,
            date_from: profile.date_from || '',
            date_thru: profile.date_thru || '',
            interval_minutes: profile.interval_minutes,
            version: profile.version,
        });
        setOpen(true);
    };
    const createProfile = (source: string, reportType: string) => {
        const existing = profiles.find((profile) =>
            source === 'hybrid'
                ? profile.source === 'hybrid'
                : reportType === 'unresolved' &&
                  profile.report_type === 'unresolved',
        );
        if (existing) {
            edit(existing);
            return;
        }
        setEditing(null);
        form.setData({
            ...emptyProfile,
            source,
            report_type: reportType,
            customer_account:
                source === 'hybrid'
                    ? 'HYBRID_GABUNGAN'
                    : reportType === 'unresolved'
                      ? 'AWB_AKTIF'
                      : '',
            label:
                source === 'hybrid'
                    ? 'Hybrid gabungan → APEX'
                    : reportType === 'unresolved'
                      ? 'Pembaruan resi aktif'
                      : '',
            lookback_days:
                source === 'hybrid' ? 1 : reportType === 'unresolved' ? 60 : 30,
            interval_minutes:
                source === 'hybrid' || reportType === 'unresolved' ? 30 : 360,
        });
        form.clearErrors();
        setOpen(true);
    };
    const toggle = (profile: Profile, enabled: boolean) => {
        setBusy(profile.id);
        setToggleError('');
        router.put(
            monitoring.profileUpdate.url(profile.id),
            {
                ...profile,
                date_from: profile.date_from || '',
                date_thru: profile.date_thru || '',
                enabled,
            },
            {
                preserveScroll: true,
                onFinish: () => setBusy(null),
                onError: (errors) =>
                    setToggleError(
                        Object.values(errors)[0] ||
                            'Jadwal belum berhasil disimpan.',
                    ),
                onNetworkError: () => {
                    setToggleError(
                        'Koneksi terputus. Perubahan jadwal belum tersimpan.',
                    );
                    return false;
                },
            },
        );
    };
    return (
        <PageContainer className="flex flex-col gap-4 space-y-0 py-4">
            <Head title="Pengaturan penarikan" />
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Pengaturan penarikan
                    </h1>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="min-h-11" asChild>
                        <a href="#apex-accounts">Kelola account APEX</a>
                    </Button>
                    <Button variant="outline" className="min-h-11" asChild>
                        <Link href={runs.index.url()}>
                            <History
                                aria-hidden="true"
                                data-icon="inline-start"
                            />
                            Riwayat run
                        </Link>
                    </Button>
                    <Button
                        className="min-h-11"
                        onClick={() => createProfile('apex', 'apex')}
                    >
                        <Plus aria-hidden="true" data-icon="inline-start" />
                        Tambah konfigurasi
                    </Button>
                </div>
            </header>
            <InputError
                message={
                    (run.errors as Record<string, string>).run || toggleError
                }
            />
            <JnePullSettings
                profiles={profiles}
                activeAwbs={activeAwbs}
                timezone={timezone}
                busy={busy}
                running={running}
                onCreate={createProfile}
                onEdit={edit}
                onRun={(profile) => {
                    setRunning(profile.id);
                    run.transform(() => ({ profile_id: profile.id }));
                    run.post(runs.store.url(), {
                        preserveScroll: true,
                        onFinish: () => setRunning(null),
                        onSuccess: () =>
                            router.visit(
                                runs.index.url({
                                    query: { source: profile.source },
                                }),
                            ),
                    });
                }}
                onToggle={toggle}
            />
            <JneApexAccounts
                profiles={profiles}
                onEdit={edit}
                onToggle={toggle}
                busy={busy}
            />
            <Collapsible className="group rounded-xl border bg-card">
                <CollapsibleTrigger className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Users
                        aria-hidden="true"
                        className="size-5 text-muted-foreground"
                    />
                    <span className="flex-1">
                        Data customer & hubungan pickup
                    </span>
                    <ChevronDown
                        aria-hidden="true"
                        className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                    />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 border-t p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-medium">
                                Nama pengirim milik customer
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Tentukan customer dari nama pengirim yang
                                tercantum dalam CSV. Terpisah dari nomor
                                penarikan JNE.
                            </p>
                        </div>
                        <Button variant="outline" asChild>
                            <Link href={aliases.index.url()}>
                                Kelola nama pengirim
                            </Link>
                        </Button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-medium">
                                Perbandingan paket & AWB
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Pemeriksaan terpisah setelah AWB terhubung ke
                                pickup. Tidak menentukan status pengiriman.
                            </p>
                        </div>
                        <Button variant="outline" asChild>
                            <Link href={monitoring.reconciliation.url()}>
                                Buka perbandingan
                            </Link>
                        </Button>
                    </div>
                </CollapsibleContent>
            </Collapsible>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>
                            {editing
                                ? 'Atur sumber report'
                                : 'Tambah sumber report'}
                        </DialogTitle>
                        <DialogDescription>
                            Pilih sumber dan interval. Kredensial tetap disimpan
                            di worker.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="space-y-5"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const options = {
                                preserveScroll: true,
                                onSuccess: () => setOpen(false),
                            };
                            if (editing)
                                form.put(
                                    monitoring.profileUpdate.url(editing),
                                    options,
                                );
                            else
                                form.post(
                                    monitoring.profileStore.url(),
                                    options,
                                );
                        }}
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="scraping-source">Sumber</Label>
                                <Select
                                    disabled={editing !== null}
                                    value={form.data.source}
                                    onValueChange={(source) =>
                                        form.setData({
                                            ...form.data,
                                            source,
                                            report_type:
                                                source === 'apex'
                                                    ? 'apex'
                                                    : source === 'hybrid'
                                                      ? 'combined'
                                                      : 'cashless',
                                            customer_account:
                                                source === 'apex'
                                                    ? ''
                                                    : source === 'hybrid'
                                                      ? 'HYBRID_GABUNGAN'
                                                      : source.toUpperCase(),
                                            lookback_days:
                                                source === 'apex' ? 30 : 1,
                                            interval_minutes:
                                                source === 'apex' ? 360 : 30,
                                            mode: 'rolling',
                                        })
                                    }
                                >
                                    <SelectTrigger
                                        id="scraping-source"
                                        className="w-full"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            {Object.entries(
                                                scrapingSources,
                                            ).map(([key, label]) => (
                                                <SelectItem
                                                    key={key}
                                                    value={key}
                                                >
                                                    {label}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <InputError message={form.errors.source} />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="scraping-kind">
                                    Jenis report
                                </Label>
                                <Select
                                    disabled={
                                        editing !== null ||
                                        form.data.source === 'hybrid'
                                    }
                                    value={form.data.report_type}
                                    onValueChange={(value) =>
                                        form.setData({
                                            ...form.data,
                                            report_type: value,
                                            customer_account:
                                                value === 'unresolved'
                                                    ? 'AWB_AKTIF'
                                                    : form.data.source ===
                                                        'apex'
                                                      ? ''
                                                      : form.data
                                                            .customer_account,
                                            mode: 'rolling',
                                            lookback_days:
                                                value === 'unresolved'
                                                    ? 60
                                                    : 30,
                                            date_from: '',
                                            date_thru: '',
                                        })
                                    }
                                >
                                    <SelectTrigger
                                        id="scraping-kind"
                                        className="w-full"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            {(form.data.source === 'apex'
                                                ? ['apex', 'unresolved']
                                                : form.data.source === 'hybrid'
                                                  ? ['combined']
                                                  : ['cashless', 'manual']
                                            ).map((kind) => (
                                                <SelectItem
                                                    key={kind}
                                                    value={kind}
                                                >
                                                    {reportLabel(kind)}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <InputError message={form.errors.report_type} />
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="source-name">Nama sumber</Label>
                                <Input
                                    id="source-name"
                                    placeholder="Contoh: Report gabungan retail"
                                    maxLength={150}
                                    value={form.data.label}
                                    onChange={(event) =>
                                        form.setData(
                                            'label',
                                            event.target.value,
                                        )
                                    }
                                />
                                <InputError message={form.errors.label} />
                            </div>
                            {form.data.source === 'apex' &&
                                form.data.report_type === 'apex' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="source-national">
                                            National Acc/Cust
                                        </Label>
                                        <Select
                                            value={form.data.national_account}
                                            onValueChange={(value) =>
                                                form.setData(
                                                    'national_account',
                                                    value,
                                                )
                                            }
                                        >
                                            <SelectTrigger
                                                id="source-national"
                                                className="min-h-11 w-full"
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="N">
                                                    NO
                                                </SelectItem>
                                                <SelectItem value="Y">
                                                    YES
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <InputError
                                            message={
                                                form.errors.national_account
                                            }
                                        />
                                    </div>
                                )}
                            <div className="space-y-2">
                                <Label htmlFor="source-number">
                                    Nomor penarikan JNE
                                </Label>
                                <Input
                                    id="source-number"
                                    required
                                    readOnly={
                                        editing !== null ||
                                        form.data.source !== 'apex' ||
                                        form.data.report_type === 'unresolved'
                                    }
                                    maxLength={100}
                                    value={
                                        form.data.report_type === 'unresolved'
                                            ? 'Semua account'
                                            : form.data.customer_account
                                    }
                                    onChange={(event) =>
                                        form.setData(
                                            'customer_account',
                                            event.target.value,
                                        )
                                    }
                                />
                                <InputError
                                    message={form.errors.customer_account}
                                />
                            </div>
                        </div>
                        <div className="space-y-4 rounded-lg border p-4">
                            <Label className="flex items-center gap-3">
                                <Checkbox
                                    checked={form.data.enabled}
                                    onCheckedChange={(checked) =>
                                        form.setData(
                                            'enabled',
                                            checked === true,
                                        )
                                    }
                                />
                                Tarik report secara berkala
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Biarkan nonaktif untuk menarik report hanya saat
                                diperlukan.
                            </p>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="source-period">
                                        Periode data
                                    </Label>
                                    <select
                                        id="source-period"
                                        disabled={
                                            form.data.source !== 'apex' ||
                                            form.data.report_type ===
                                                'unresolved'
                                        }
                                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                        value={form.data.mode}
                                        onChange={(event) =>
                                            form.setData(
                                                'mode',
                                                event.target.value,
                                            )
                                        }
                                    >
                                        <option value="rolling">
                                            {form.data.report_type ===
                                            'unresolved'
                                                ? 'Daftar AWB aktif'
                                                : form.data.source === 'apex'
                                                  ? 'Beberapa hari terakhir'
                                                  : 'Hari ini (WIB)'}
                                        </option>
                                        <option value="fixed">
                                            Tanggal tertentu
                                        </option>
                                    </select>
                                    <InputError message={form.errors.mode} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="source-interval">
                                        Frekuensi
                                    </Label>
                                    <Input
                                        id="source-interval"
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
                                    <p className="text-xs text-muted-foreground">
                                        Interval dalam menit · minimal 5 menit.
                                    </p>
                                    <InputError
                                        message={form.errors.interval_minutes}
                                    />
                                </div>
                            </div>
                            {form.data.source === 'hybrid' ? (
                                <p className="text-sm text-muted-foreground">
                                    Satu siklus mengambil cashless dan manual
                                    dari ROBERTO serta NURALAMT. Setelah keempat
                                    report lengkap, AWB unik digabung, diunggah
                                    ke APEX, lalu hasil APEX diproses ke
                                    monitoring.
                                </p>
                            ) : form.data.source !== 'apex' ? (
                                <p className="text-sm text-muted-foreground">
                                    Mengambil seluruh pengguna untuk tanggal
                                    hari ini (WIB), lalu mengunggah AWB unik ke
                                    APEX untuk menghasilkan CSV berformat APEX.
                                    Browser dan sesi kedua akun Hybrid terpisah.
                                </p>
                            ) : form.data.mode === 'rolling' ? (
                                <div className="space-y-2">
                                    <Label htmlFor="source-lookback">
                                        {form.data.report_type === 'unresolved'
                                            ? 'Batas usia entry resi (hari)'
                                            : 'Jumlah hari terakhir'}
                                    </Label>
                                    <Input
                                        id="source-lookback"
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
                                    <InputError
                                        message={form.errors.lookback_days}
                                    />
                                    {form.data.report_type === 'unresolved' && (
                                        <p className="text-sm text-muted-foreground">
                                            Seluruh account dan sumber, termasuk
                                            Hybrid. Hanya AWB yang belum
                                            delivered/cancel. Tanggal entry
                                            kosong tetap ikut; batas usia tidak
                                            menghapus resi dari monitoring.
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        {form.data.report_type === 'unresolved'
                                            ? 'AWB di luar batas usia tetap tersimpan, tetapi tidak masuk pembaruan otomatis ini.'
                                            : 'Kiriman lama yang belum selesai juga diperbarui melalui periode asalnya.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="source-from">
                                            Dari tanggal
                                        </Label>
                                        <Input
                                            id="source-from"
                                            type="date"
                                            required
                                            value={form.data.date_from}
                                            onChange={(event) =>
                                                form.setData(
                                                    'date_from',
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        <InputError
                                            message={form.errors.date_from}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="source-thru">
                                            Sampai tanggal
                                        </Label>
                                        <Input
                                            id="source-thru"
                                            type="date"
                                            required
                                            min={form.data.date_from}
                                            value={form.data.date_thru}
                                            onChange={(event) =>
                                                form.setData(
                                                    'date_thru',
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        <InputError
                                            message={form.errors.date_thru}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                        <Button
                            className="w-full"
                            type="submit"
                            disabled={form.processing}
                        >
                            {form.processing ? 'Menyimpan…' : 'Simpan sumber'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </PageContainer>
    );
}

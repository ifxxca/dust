import { useState } from 'react';
import JneAccountInput from '@/components/jne-account-input';
import { parseJneAccounts } from '@/lib/jne-accounts';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    ArrowDown,
    CalendarDays,
    CheckCheck,
    ChevronDown,
    Clock3,
    FileDown,
    History,
    Inbox,
    Layers3,
    LoaderCircle,
    PackageSearch,
    Settings2,
} from 'lucide-react';
import InputError from '@/components/input-error';
import JneWorkspaceMetrics from '@/components/jne-workspace-metrics';
import {
    reportDate,
    type ReportJobView,
    type RequestGroupView,
} from '@/components/jne-report-requests';
import PageContainer from '@/components/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { reportPeriodEnd, reportPeriods } from '@/lib/jne-report-limits';
import * as reports from '@/routes/jne-reports';
import * as runs from '@/routes/report-runs';
import * as monitoring from '@/routes/jne-monitoring';

export default function JneReports({
    timezone,
    limits,
    sources = [],
}: {
    jobs: ReportJobView[];
    requests: {
        data: RequestGroupView[];
        current_page: number;
        last_page: number;
        total: number;
    };
    timezone: string;
    limits: { max_days: number; max_request_days: number; max_awbs: number };
    sources?: {
        id: number;
        customer_account: string;
        label: string | null;
        national_account?: string;
    }[];
}) {
    const [bulk, setBulk] = useState(false);
    const [accountText, setAccountText] = useState('');
    const parsed = parseJneAccounts(accountText);
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
    }).format(new Date());
    const form = useForm({
        customer_account: '',
        national_account: 'N',
        date_from: today,
        date_thru: today,
    });
    const periods = reportPeriods(
        form.data.date_from,
        form.data.date_thru,
        limits.max_days,
        limits.max_request_days,
    );
    const preset = (days: number, yesterday = false) => {
        const date = new Date(today + 'T12:00:00Z');
        date.setUTCDate(date.getUTCDate() - (yesterday ? 1 : days - 1));
        const from = date.toISOString().slice(0, 10);
        form.setData({
            ...form.data,
            date_from: from,
            date_thru: yesterday ? from : today,
        });
    };
    const selectedAccounts = bulk
        ? parsed.accounts
        : form.data.customer_account
          ? [
                {
                    customer_account: form.data.customer_account,
                    national_account: form.data.national_account,
                },
            ]
          : [];
    return (
        <PageContainer className="flex flex-col gap-4 space-y-0 py-4">
            <Head title="Penarikan Report JNE" />
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Penarikan Report JNE
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Pilih account dan tanggal, lalu pantau hasilnya sampai
                        siap dimonitor.
                    </p>
                </div>
                <Button variant="outline" className="min-h-11" asChild>
                    <Link href={runs.index.url()}>
                        <History aria-hidden="true" data-icon="inline-start" />
                        Riwayat run
                    </Link>
                </Button>
            </header>
            <JneWorkspaceMetrics
                scope="Rencana permintaan saat ini. Setiap account menghasilkan report terpisah di antrean APEX."
                items={[
                    {
                        label: 'Account dipilih',
                        value: selectedAccounts.length,
                        icon: Layers3,
                    },
                    {
                        label: 'National YES',
                        value: selectedAccounts.filter(
                            (account) => account.national_account === 'Y',
                        ).length,
                        icon: CheckCheck,
                    },
                    {
                        label: 'National NO',
                        value: selectedAccounts.filter(
                            (account) => account.national_account === 'N',
                        ).length,
                        icon: Clock3,
                    },
                    {
                        label: 'Bagian report',
                        value: selectedAccounts.length * periods.length,
                        icon: FileDown,
                    },
                ]}
            />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
                <Card className="gap-5 shadow-none">
                    <CardHeader className="flex-row items-center gap-3">
                        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <FileDown aria-hidden="true" className="size-5" />
                        </span>
                        <div>
                            <h2 className="font-semibold">Permintaan report</h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Report customer dari APEX JNE CCC
                            </p>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <form
                            className="space-y-5"
                            onSubmit={(event) => {
                                event.preventDefault();
                                form.transform((data) =>
                                    bulk
                                        ? {
                                              accounts: parsed.accounts,
                                              date_from: data.date_from,
                                              date_thru: data.date_thru,
                                          }
                                        : data,
                                );
                                form.post(reports.store.url(), {
                                    preserveScroll: true,
                                    onSuccess: () =>
                                        router.visit(runs.index.url()),
                                });
                            }}
                        >
                            <div className="space-y-3">
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant={bulk ? 'outline' : 'secondary'}
                                        className="min-h-11"
                                        aria-pressed={!bulk}
                                        onClick={() => setBulk(false)}
                                    >
                                        Satu account
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={bulk ? 'secondary' : 'outline'}
                                        className="min-h-11"
                                        aria-pressed={bulk}
                                        onClick={() => setBulk(true)}
                                    >
                                        Banyak account
                                    </Button>
                                    {sources.length > 0 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="min-h-11"
                                            onClick={() => {
                                                setBulk(true);
                                                setAccountText(
                                                    sources
                                                        .map(
                                                            (source) =>
                                                                `${source.customer_account}\t${source.national_account === 'Y' ? 'YES' : 'NO'}`,
                                                        )
                                                        .join('\n'),
                                                );
                                            }}
                                        >
                                            Gunakan semua account tersimpan (
                                            {sources.length})
                                        </Button>
                                    )}
                                </div>
                                {bulk ? (
                                    <JneAccountInput
                                        value={accountText}
                                        onChange={setAccountText}
                                    />
                                ) : (
                                    <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                                        <div className="space-y-2">
                                            <Label htmlFor="customer_account">
                                                Nomor penarikan JNE
                                            </Label>
                                            <Input
                                                className="min-h-11"
                                                id="customer_account"
                                                value={
                                                    form.data.customer_account
                                                }
                                                maxLength={100}
                                                required
                                                list="report-sources"
                                                placeholder="Pilih atau ketik nomor penarikan"
                                                onChange={(event) => {
                                                    const number =
                                                        event.target.value;
                                                    const source = sources.find(
                                                        (item) =>
                                                            item.customer_account ===
                                                            number,
                                                    );
                                                    form.setData({
                                                        ...form.data,
                                                        customer_account:
                                                            number,
                                                        national_account:
                                                            source?.national_account ||
                                                            form.data
                                                                .national_account,
                                                    });
                                                }}
                                            />
                                            <datalist id="report-sources">
                                                {sources.map((source) => (
                                                    <option
                                                        key={source.id}
                                                        value={
                                                            source.customer_account
                                                        }
                                                    >
                                                        {source.label ||
                                                            'Sumber report'}{' '}
                                                        · National{' '}
                                                        {source.national_account ===
                                                        'Y'
                                                            ? 'YES'
                                                            : 'NO'}
                                                    </option>
                                                ))}
                                            </datalist>
                                            <InputError
                                                message={
                                                    form.errors.customer_account
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="request-national">
                                                National Acc/Cust
                                            </Label>
                                            <Select
                                                value={
                                                    form.data.national_account
                                                }
                                                onValueChange={(value) =>
                                                    form.setData(
                                                        'national_account',
                                                        value,
                                                    )
                                                }
                                            >
                                                <SelectTrigger
                                                    id="request-national"
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
                                        </div>
                                    </div>
                                )}
                                {Object.entries(form.errors)
                                    .filter(
                                        ([key]) =>
                                            key.startsWith('accounts') ||
                                            key === 'national_account',
                                    )
                                    .map(([key, error]) => (
                                        <InputError key={key} message={error} />
                                    ))}
                            </div>
                            <div className="space-y-3">
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="min-h-11"
                                        onClick={() => preset(1)}
                                    >
                                        Hari ini
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="min-h-11"
                                        onClick={() => preset(1, true)}
                                    >
                                        Kemarin
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="min-h-11"
                                        onClick={() => preset(7)}
                                    >
                                        7 hari terakhir
                                    </Button>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="date_from">
                                            Tanggal dari
                                        </Label>
                                        <Input
                                            className="min-h-11 dark:scheme-dark"
                                            id="date_from"
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
                                        <Label htmlFor="date_thru">
                                            Tanggal sampai
                                        </Label>
                                        <Input
                                            className="min-h-11 dark:scheme-dark"
                                            id="date_thru"
                                            type="date"
                                            min={form.data.date_from}
                                            max={reportPeriodEnd(
                                                form.data.date_from,
                                                limits.max_request_days,
                                            )}
                                            required
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
                            </div>
                            {periods.length > 0 && (
                                <Collapsible className="group rounded-lg border bg-muted/20">
                                    <CollapsibleTrigger className="flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-lg px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                        <CalendarDays
                                            aria-hidden="true"
                                            className="size-4 text-muted-foreground"
                                        />
                                        <span className="flex-1">
                                            {bulk
                                                ? 'Per account'
                                                : 'Satu permintaan'}
                                            , {periods.length} bagian report
                                        </span>
                                        <ChevronDown
                                            aria-hidden="true"
                                            className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                                        />
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                        <ol className="grid gap-2 border-t p-3 text-xs text-muted-foreground sm:grid-cols-2">
                                            {periods.map((period, index) => (
                                                <li
                                                    key={period.from}
                                                    className="flex items-center gap-2"
                                                >
                                                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium">
                                                        {index + 1}
                                                    </span>
                                                    {reportDate(period.from)} –{' '}
                                                    {reportDate(period.thru)}
                                                </li>
                                            ))}
                                        </ol>
                                    </CollapsibleContent>
                                </Collapsible>
                            )}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                                <p className="text-xs text-muted-foreground">
                                    Tanggal mengikuti {timezone}.
                                </p>
                                <Button
                                    className="min-h-11 w-full sm:w-auto"
                                    disabled={
                                        form.processing ||
                                        (bulk &&
                                            (!parsed.accounts.length ||
                                                parsed.errors.length > 0))
                                    }
                                    type="submit"
                                >
                                    {form.processing ? (
                                        <LoaderCircle
                                            aria-hidden="true"
                                            data-icon="inline-start"
                                            className="animate-spin motion-reduce:animate-none"
                                        />
                                    ) : (
                                        <FileDown
                                            aria-hidden="true"
                                            data-icon="inline-start"
                                        />
                                    )}
                                    {form.processing
                                        ? 'Membuat permintaan…'
                                        : 'Tarik Report'}
                                </Button>
                            </div>
                            {form.recentlySuccessful && (
                                <p role="status" className="text-sm">
                                    Permintaan dibuat. Report masuk antrean
                                    worker.
                                </p>
                            )}
                        </form>
                    </CardContent>
                </Card>
                <aside
                    aria-label="Alur pemrosesan report"
                    className="space-y-4"
                >
                    <Card className="gap-4 shadow-none">
                        <CardHeader>
                            <h2 className="text-sm font-semibold">
                                Setelah report diminta
                            </h2>
                        </CardHeader>
                        <CardContent>
                            <ol className="space-y-3">
                                {[
                                    {
                                        icon: Inbox,
                                        title: 'Masuk antrean',
                                        text: 'Worker mengambil permintaan.',
                                    },
                                    {
                                        icon: FileDown,
                                        title: 'Unduh dari APEX',
                                        text: 'Menunggu file report tersedia.',
                                    },
                                    {
                                        icon: PackageSearch,
                                        title: 'Siap dimonitor',
                                        text: 'CSV diimpor ke daftar pengiriman.',
                                    },
                                ].map(({ icon: Icon, title, text }, index) => (
                                    <li key={title}>
                                        <div className="flex items-start gap-3">
                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                                                <Icon
                                                    aria-hidden="true"
                                                    className="size-4 text-muted-foreground"
                                                />
                                            </span>
                                            <div>
                                                <p className="text-sm font-medium">
                                                    {title}
                                                </p>
                                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                    {text}
                                                </p>
                                            </div>
                                        </div>
                                        {index < 2 && (
                                            <ArrowDown
                                                aria-hidden="true"
                                                className="my-2 ml-2.5 size-3 text-muted-foreground"
                                            />
                                        )}
                                    </li>
                                ))}
                            </ol>
                            <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                                <Badge variant="outline">
                                    {limits.max_days} hari / report
                                </Badge>
                                <Badge variant="outline">
                                    {limits.max_awbs.toLocaleString('id-ID')}{' '}
                                    AWB / CSV
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                    <Button
                        variant="outline"
                        className="min-h-11 w-full"
                        asChild
                    >
                        <Link href={monitoring.profiles.url()}>
                            <Settings2
                                aria-hidden="true"
                                data-icon="inline-start"
                            />
                            Atur penarikan otomatis
                        </Link>
                    </Button>
                </aside>
            </div>
            <Collapsible className="group rounded-xl border bg-card">
                <CollapsibleTrigger className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-2 px-4 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Batas penarikan & nomor account
                    <ChevronDown
                        aria-hidden="true"
                        className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                    />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 border-t p-4 text-sm leading-6 text-muted-foreground">
                    <p>
                        Maksimal {limits.max_request_days} hari per permintaan,
                        dibagi per {limits.max_days} hari dan diproses satu per
                        satu. Hasil di atas{' '}
                        {limits.max_awbs.toLocaleString('id-ID')} AWB ditolak;
                        persempit periode report tersebut.
                    </p>
                    <p>
                        Nomor penarikan adalah account JNE, bukan kode customer
                        internal. Satu report bisa memuat banyak customer.
                    </p>
                </CollapsibleContent>
            </Collapsible>
        </PageContainer>
    );
}
JneReports.layout = {
    breadcrumbs: [{ title: 'Penarikan Report JNE', href: reports.index() }],
};

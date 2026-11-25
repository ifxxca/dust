import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    CalendarDays,
    ChevronDown,
    FileDown,
    History,
    LoaderCircle,
    Settings2,
} from 'lucide-react';
import { useState } from 'react';
import InputError from '@/components/input-error';
import JneAccountInput from '@/components/jne-account-input';
import JneAccountPicker, {
    type JneAccountSource,
} from '@/components/jne-account-picker';
import { reportDate } from '@/components/jne-report-requests';
import PageContainer from '@/components/page-container';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { parseJneAccounts } from '@/lib/jne-accounts';
import { reportPeriodEnd, reportPeriods } from '@/lib/jne-report-limits';
import { focusFormError } from '@/lib/utils';
import * as monitoring from '@/routes/jne-monitoring';
import * as reports from '@/routes/jne-reports';
import * as runs from '@/routes/report-runs';

export default function JneReports({
    timezone,
    limits,
    sources = [],
}: {
    timezone: string;
    limits: { max_days: number; max_request_days: number; max_awbs: number };
    sources?: JneAccountSource[];
}) {
    const [bulk, setBulk] = useState(false);
    const [accountText, setAccountText] = useState('');
    const parsed = parseJneAccounts(accountText);
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
    }).format(new Date());
    const form = useForm({
        source: 'apex',
        retail_server: 'all',
        customer_account: '',
        national_account: 'N',
        date_from: today,
        date_thru: today,
    });
    const retail = form.data.source === 'hybrid';
    const periods = reportPeriods(
        form.data.date_from,
        form.data.date_thru,
        retail ? 1 : limits.max_days,
        limits.max_request_days,
    );
    const accountCount = retail
        ? form.data.retail_server === 'all'
            ? 2
            : 1
        : bulk
          ? parsed.accounts.length
          : form.data.customer_account
            ? 1
            : 0;
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

    return (
        <PageContainer className="flex flex-col gap-4 space-y-0 py-4">
            <Head title="Penarikan Report JNE" />
            <header className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Penarikan Report JNE
                </h1>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" asChild className="min-h-11">
                        <Link href={monitoring.profiles.url()}>
                            <Settings2
                                aria-hidden="true"
                                data-icon="inline-start"
                            />
                            Pengaturan sumber
                        </Link>
                    </Button>
                    <Button variant="outline" asChild className="min-h-11">
                        <Link href={runs.index.url()}>
                            <History
                                aria-hidden="true"
                                data-icon="inline-start"
                            />
                            Riwayat run
                        </Link>
                    </Button>
                </div>
            </header>
            <Card className="min-w-0 shadow-none">
                <CardHeader>
                    <CardTitle>Permintaan report</CardTitle>
                    <CardDescription>
                        Pilih sumber dan periode penarikan.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        className="flex flex-col gap-5"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const element = event.currentTarget;
                            if (
                                !retail &&
                                !bulk &&
                                !form.data.customer_account
                            ) {
                                form.setError(
                                    'customer_account',
                                    'Pilih atau masukkan nomor penarikan JNE.',
                                );
                                document
                                    .getElementById('customer_account')
                                    ?.focus();
                                return;
                            }
                            form.transform((data) =>
                                retail
                                    ? {
                                          source: 'hybrid',
                                          retail_server: data.retail_server,
                                          date_from: data.date_from,
                                          date_thru: data.date_thru,
                                      }
                                    : {
                                          source: 'apex',
                                          date_from: data.date_from,
                                          date_thru: data.date_thru,
                                          ...(bulk
                                              ? { accounts: parsed.accounts }
                                              : {
                                                    customer_account:
                                                        data.customer_account,
                                                    national_account:
                                                        data.national_account,
                                                }),
                                      },
                            );
                            form.post(reports.store.url(), {
                                preserveScroll: true,
                                onError: () => focusFormError(element),
                                onSuccess: () =>
                                    router.visit(
                                        runs.index.url(
                                            retail
                                                ? {
                                                      query: {
                                                          source: 'hybrid',
                                                      },
                                                  }
                                                : undefined,
                                        ),
                                    ),
                            });
                        }}
                    >
                        <fieldset
                            disabled={form.processing}
                            className="flex min-w-0 flex-col gap-2"
                        >
                            <legend className="mb-2 text-sm font-medium">
                                Sumber report
                            </legend>
                            <ToggleGroup
                                type="single"
                                variant="outline"
                                value={form.data.source}
                                aria-label="Sumber report"
                                onValueChange={(value) => {
                                    if (value) {
                                        form.setData('source', value);
                                        form.clearErrors();
                                    }
                                }}
                                className="w-full sm:w-fit"
                            >
                                <ToggleGroupItem
                                    value="apex"
                                    className="min-h-11 flex-1 px-2 whitespace-normal sm:flex-none sm:px-4"
                                >
                                    Customer APEX
                                </ToggleGroupItem>
                                <ToggleGroupItem
                                    value="hybrid"
                                    className="min-h-11 flex-1 px-2 whitespace-normal sm:flex-none sm:px-4"
                                >
                                    Retail PM / Puman
                                </ToggleGroupItem>
                            </ToggleGroup>
                            <InputError message={form.errors.source} />
                        </fieldset>
                        {retail ? (
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="retail-server">
                                    Server retail
                                </Label>
                                <Select
                                    value={form.data.retail_server}
                                    disabled={form.processing}
                                    onValueChange={(value) =>
                                        form.setData('retail_server', value)
                                    }
                                >
                                    <SelectTrigger
                                        id="retail-server"
                                        className="min-h-11 w-full sm:max-w-md"
                                        aria-invalid={
                                            !!form.errors.retail_server
                                        }
                                        aria-describedby={
                                            form.errors.retail_server
                                                ? 'retail-server-error'
                                                : undefined
                                        }
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all">
                                                PM dan Puman
                                            </SelectItem>
                                            <SelectItem value="HYBRID_PM">
                                                PM
                                            </SelectItem>
                                            <SelectItem value="HYBRID_PUMAN">
                                                Puman
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <InputError
                                    id="retail-server-error"
                                    message={form.errors.retail_server}
                                />
                            </div>
                        ) : (
                            <fieldset
                                disabled={form.processing}
                                className="flex min-w-0 flex-col gap-3"
                            >
                                <legend className="sr-only">Account JNE</legend>
                                <div className="flex flex-wrap items-center gap-2">
                                    <ToggleGroup
                                        type="single"
                                        variant="outline"
                                        value={bulk ? 'many' : 'one'}
                                        aria-label="Jumlah account"
                                        onValueChange={(value) => {
                                            if (value)
                                                setBulk(value === 'many');
                                        }}
                                    >
                                        <ToggleGroupItem
                                            value="one"
                                            className="min-h-11 px-4"
                                        >
                                            Satu account
                                        </ToggleGroupItem>
                                        <ToggleGroupItem
                                            value="many"
                                            className="min-h-11 px-4"
                                        >
                                            Banyak account
                                        </ToggleGroupItem>
                                    </ToggleGroup>
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
                                            Pilih semua ({sources.length})
                                        </Button>
                                    )}
                                </div>
                                {bulk ? (
                                    <JneAccountInput
                                        value={accountText}
                                        onChange={setAccountText}
                                    />
                                ) : (
                                    <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                                        <div className="flex min-w-0 flex-col gap-2">
                                            <Label htmlFor="customer_account">
                                                Nomor penarikan JNE
                                            </Label>
                                            <JneAccountPicker
                                                sources={sources}
                                                value={
                                                    form.data.customer_account
                                                }
                                                nationalAccount={
                                                    form.data.national_account
                                                }
                                                disabled={form.processing}
                                                invalid={
                                                    !!form.errors
                                                        .customer_account
                                                }
                                                onSelect={(
                                                    account,
                                                    national,
                                                ) => {
                                                    form.setData({
                                                        ...form.data,
                                                        customer_account:
                                                            account,
                                                        national_account:
                                                            national,
                                                    });
                                                    form.clearErrors(
                                                        'customer_account',
                                                    );
                                                }}
                                            />
                                            <InputError
                                                id="report-customer_account-error"
                                                message={
                                                    form.errors.customer_account
                                                }
                                            />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <Label htmlFor="request-national">
                                                National Acc/Cust
                                            </Label>
                                            <Select
                                                value={
                                                    form.data.national_account
                                                }
                                                disabled={form.processing}
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
                                                    aria-invalid={
                                                        !!form.errors
                                                            .national_account
                                                    }
                                                    aria-describedby={
                                                        form.errors
                                                            .national_account
                                                            ? 'report-national_account-error'
                                                            : undefined
                                                    }
                                                >
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectGroup>
                                                        <SelectItem value="N">
                                                            NO
                                                        </SelectItem>
                                                        <SelectItem value="Y">
                                                            YES
                                                        </SelectItem>
                                                    </SelectGroup>
                                                </SelectContent>
                                            </Select>
                                            <InputError
                                                id="report-national_account-error"
                                                message={
                                                    form.errors.national_account
                                                }
                                            />
                                        </div>
                                    </div>
                                )}
                                {Object.entries(form.errors)
                                    .filter(([key]) =>
                                        key.startsWith('accounts'),
                                    )
                                    .map(([key, error]) => (
                                        <InputError
                                            id={`report-${key}-error`}
                                            key={key}
                                            message={error}
                                        />
                                    ))}
                            </fieldset>
                        )}
                        <fieldset
                            disabled={form.processing}
                            className="flex min-w-0 flex-col gap-3"
                        >
                            <legend className="mb-2 text-sm font-medium">
                                Periode penarikan
                            </legend>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="min-h-11"
                                    onClick={() => preset(1)}
                                >
                                    Hari ini
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="min-h-11"
                                    onClick={() => preset(1, true)}
                                >
                                    Kemarin
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="min-h-11"
                                    onClick={() => preset(7)}
                                >
                                    7 hari terakhir
                                </Button>
                            </div>
                            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                                <div className="flex min-w-0 flex-col gap-2">
                                    <Label htmlFor="date_from">
                                        Tanggal dari
                                    </Label>
                                    <Input
                                        id="date_from"
                                        name="date_from"
                                        type="date"
                                        required
                                        className="min-h-11 min-w-0"
                                        value={form.data.date_from}
                                        onChange={(event) =>
                                            form.setData(
                                                'date_from',
                                                event.target.value,
                                            )
                                        }
                                        aria-invalid={!!form.errors.date_from}
                                        aria-describedby={
                                            form.errors.date_from
                                                ? 'report-date_from-error'
                                                : undefined
                                        }
                                    />
                                    <InputError
                                        id="report-date_from-error"
                                        message={form.errors.date_from}
                                    />
                                </div>
                                <div className="flex min-w-0 flex-col gap-2">
                                    <Label htmlFor="date_thru">
                                        Tanggal sampai
                                    </Label>
                                    <Input
                                        id="date_thru"
                                        name="date_thru"
                                        type="date"
                                        required
                                        className="min-h-11 min-w-0"
                                        min={form.data.date_from}
                                        max={reportPeriodEnd(
                                            form.data.date_from,
                                            limits.max_request_days,
                                        )}
                                        value={form.data.date_thru}
                                        onChange={(event) =>
                                            form.setData(
                                                'date_thru',
                                                event.target.value,
                                            )
                                        }
                                        aria-invalid={!!form.errors.date_thru}
                                        aria-describedby={
                                            form.errors.date_thru
                                                ? 'report-date_thru-error'
                                                : undefined
                                        }
                                    />
                                    <InputError
                                        id="report-date_thru-error"
                                        message={form.errors.date_thru}
                                    />
                                </div>
                            </div>
                        </fieldset>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                            <div
                                className="flex flex-col gap-1 text-sm"
                                role="status"
                            >
                                <span>
                                    {retail
                                        ? `${accountCount} server · ${periods.length} hari · ${accountCount * periods.length * 2} report sumber`
                                        : `${accountCount} account · ${accountCount * periods.length} bagian report`}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {retail
                                        ? 'Manual dan Cashless per hari'
                                        : `APEX dibagi maksimal ${limits.max_days} hari per report`}{' '}
                                    · {timezone}
                                </span>
                            </div>
                            <Button
                                type="submit"
                                className="min-h-11 w-full sm:w-auto"
                                disabled={
                                    form.processing ||
                                    (!retail &&
                                        bulk &&
                                        (!parsed.accounts.length ||
                                            parsed.errors.length > 0))
                                }
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
                                    : retail
                                      ? 'Tarik report retail'
                                      : 'Tarik report APEX'}
                            </Button>
                        </div>
                        {periods.length > 0 && (
                            <Collapsible className="group rounded-lg border">
                                <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring">
                                    <CalendarDays
                                        aria-hidden="true"
                                        className="size-4"
                                    />
                                    <span className="flex-1">
                                        Rincian periode ({periods.length})
                                    </span>
                                    <ChevronDown
                                        aria-hidden="true"
                                        className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                                    />
                                </CollapsibleTrigger>
                                <CollapsibleContent className="max-h-64 overflow-y-auto border-t p-3">
                                    <ol className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                                        {periods.map((period) => (
                                            <li key={period.from}>
                                                {reportDate(period.from)}
                                                {period.thru !== period.from
                                                    ? ` – ${reportDate(period.thru)}`
                                                    : ''}
                                            </li>
                                        ))}
                                    </ol>
                                </CollapsibleContent>
                            </Collapsible>
                        )}
                    </form>
                </CardContent>
            </Card>
        </PageContainer>
    );
}
JneReports.layout = {
    breadcrumbs: [{ title: 'Penarikan Report JNE', href: reports.index() }],
};

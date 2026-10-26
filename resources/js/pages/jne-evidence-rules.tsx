import { Head, Link, useForm } from '@inertiajs/react';
import { useRef, useState } from 'react';
import InputError from '@/components/input-error';
import { focusFormError } from '@/lib/utils';
import JneSourceContractFields from '@/components/jne-source-contract-fields';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import PageContainer from '@/components/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import * as evidence from '@/routes/jne-evidence';
import * as monitoring from '@/routes/jne-monitoring';

type Rule = {
    id: number;
    source?: string;
    report_type?: string;
    revision?: number;
    version?: number;
    customer_id?: number;
    code?: string;
    shipper_name?: string;
    account_scope?: string | null;
    valid_from?: string | null;
    valid_thru?: string | null;
    active_key?: string | null;
    is_active?: boolean;
    verified_at: string | null;
    reason?: string;
    verification_reason?: string | null;
    definition?: Record<string, unknown>;
};
type Props = {
    q?: string;
    pages?: Record<
        string,
        { previous: string | null; next: string | null; total: number }
    >;
    installed: boolean;
    enabled: boolean;
    contracts: Rule[];
    codeAliases: Rule[];
    scopedAliases: Rule[];
    customers: { id: number; name: string; customer_code: string | null }[];
    events: {
        id: number;
        kind: string;
        rule_id: number;
        actor_name: string;
        reason: string;
        created_at: string;
        before: string;
        after: string;
    }[];
};
const initialDefinition = JSON.stringify(
    {
        customer_code_column: null,
        category_column: null,
        category_values: {},
        hybrid_categories: {},
        collection_requirements: [],
    },
    null,
    2,
);
const ruleLabels: Record<string, string> = {
    contract: 'Kontrak sumber',
    code_alias: 'Alias kode',
    shipper_alias: 'Nama pengirim',
};

export default function JneEvidenceRules({
    installed,
    enabled,
    contracts,
    codeAliases,
    scopedAliases,
    customers,
    events,
    q = '',
    pages = {},
}: Props) {
    const search = useForm({ q });
    const [creating, setCreating] = useState(false);
    const [ruleActionOpen, setRuleActionOpen] = useState(false);
    const createTrigger = useRef<HTMLButtonElement>(null);
    const ruleTrigger = useRef<HTMLButtonElement | null>(null);
    const form = useForm({
        kind: 'contract',
        source: 'apex',
        report_type: 'apex',
        definition: initialDefinition,
        customer_id: '',
        code: '',
        shipper_name: '',
        account_scope: '',
        valid_from: '',
        valid_thru: '',
        reason: '',
        verified: false,
    });
    const disable = useForm({
        action: 'disable',
        kind: 'contract',
        id: '',
        version: 1,
        reason: '',
    });
    const rows = [
        ...contracts.map((row) => ({ ...row, kind: 'contract' })),
        ...codeAliases.map((row) => ({ ...row, kind: 'code_alias' })),
        ...scopedAliases.map((row) => ({ ...row, kind: 'shipper_alias' })),
    ];
    const label = (row: Rule) =>
        row.code ||
        row.shipper_name ||
        row.source + ' / ' + row.report_type + ' revisi ' + row.revision;
    return (
        <PageContainer className="flex flex-col gap-4 py-4">
            <Head title="Aturan bukti JNE" />
            <header className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold">Aturan bukti JNE</h1>
                <Button ref={createTrigger} onClick={() => setCreating(true)}>
                    Tambah aturan
                </Button>
            </header>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <Link className="underline" href={monitoring.index.url()}>
                    Pengiriman
                </Link>
                <span>
                    {!installed
                        ? 'Migrasi belum tersedia'
                        : enabled
                          ? 'Aktivasi tersedia'
                          : 'Mode draft · aktivasi nonaktif'}
                </span>
            </div>
            <form
                className="flex gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    search.get(evidence.index.url());
                }}
            >
                <Input
                    aria-label="Cari aturan bukti"
                    value={search.data.q}
                    onChange={(event) =>
                        search.setData('q', event.target.value)
                    }
                />
                <Button variant="outline">Cari aturan</Button>
            </form>
            <nav className="flex flex-wrap gap-4">
                {Object.entries(pages).map(([label, page]) => (
                    <div key={label} className="space-x-2 text-sm">
                        {label}: {page.total}{' '}
                        {page.previous && (
                            <Link className="underline" href={page.previous}>
                                Sebelumnya
                            </Link>
                        )}
                        {page.next && (
                            <Link className="underline" href={page.next}>
                                Berikutnya
                            </Link>
                        )}
                    </div>
                ))}
            </nav>
            <Sheet open={creating} onOpenChange={setCreating}>
                <SheetContent
                    className="w-full overflow-y-auto sm:max-w-2xl"
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        createTrigger.current?.focus();
                    }}
                >
                    <SheetHeader>
                        <SheetTitle>Tambah aturan bukti</SheetTitle>
                        <SheetDescription>
                            Aturan draft tidak digunakan untuk pencocokan.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="px-4 pb-6">
                        <form
                            data-rule-form
                            className="grid gap-4 sm:grid-cols-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                const element = event.currentTarget;
                                let definition: Record<string, unknown> = {};
                                if (form.data.kind === 'contract') {
                                    try {
                                        definition = JSON.parse(
                                            form.data.definition,
                                        );
                                    } catch {
                                        form.setError(
                                            'definition',
                                            'Definisi harus berupa JSON yang valid.',
                                        );
                                        focusFormError(element);
                                        return;
                                    }
                                }
                                form.transform((data) => ({
                                    ...data,
                                    definition,
                                }));
                                form.post(evidence.store.url(), {
                                    preserveScroll: true,
                                    onSuccess: () => {
                                        form.reset('reason', 'verified');
                                        setCreating(false);
                                    },
                                    onError: () => focusFormError(element),
                                });
                            }}
                        >
                            <div className="space-y-2">
                                <Label htmlFor="evidence-kind">
                                    Jenis aturan
                                </Label>
                                <select
                                    id="evidence-kind"
                                    aria-invalid={!!form.errors.kind}
                                    aria-describedby={
                                        form.errors.kind
                                            ? 'evidence-kind-error'
                                            : undefined
                                    }
                                    className="h-10 w-full rounded-md border bg-background px-3"
                                    value={form.data.kind}
                                    onChange={(event) => {
                                        form.setData(
                                            'kind',
                                            event.target.value,
                                        );
                                        form.clearErrors();
                                    }}
                                >
                                    <option value="contract">
                                        Kontrak sumber
                                    </option>
                                    <option value="code_alias">
                                        Alias kode customer
                                    </option>
                                    <option value="shipper_alias">
                                        Nama pengirim berscope
                                    </option>
                                </select>
                                <InputError
                                    id="evidence-kind-error"
                                    message={form.errors.kind}
                                />
                            </div>
                            {form.data.kind === 'contract' ? (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="evidence-source">
                                            Sistem sumber
                                        </Label>
                                        <select
                                            id="evidence-source"
                                            aria-invalid={!!form.errors.source}
                                            aria-describedby={
                                                form.errors.source
                                                    ? 'evidence-source-error'
                                                    : undefined
                                            }
                                            className="h-10 w-full rounded-md border bg-background px-3"
                                            value={form.data.source}
                                            onChange={(event) => {
                                                form.setData(
                                                    'source',
                                                    event.target.value,
                                                );
                                                form.setData(
                                                    'report_type',
                                                    event.target.value ===
                                                        'hybrid'
                                                        ? 'combined'
                                                        : event.target.value ===
                                                            'apex'
                                                          ? 'apex'
                                                          : 'cashless',
                                                );
                                            }}
                                        >
                                            {[
                                                'apex',
                                                'hybrid',
                                                'roberto',
                                                'nuralamt',
                                            ].map((source) => (
                                                <option key={source}>
                                                    {source}
                                                </option>
                                            ))}
                                        </select>
                                        <InputError
                                            id="evidence-source-error"
                                            message={form.errors.source}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="evidence-type">
                                            Jenis report
                                        </Label>
                                        <Input
                                            id="evidence-type"
                                            aria-invalid={
                                                !!form.errors.report_type
                                            }
                                            aria-describedby={
                                                form.errors.report_type
                                                    ? 'evidence-type-error'
                                                    : undefined
                                            }
                                            value={form.data.report_type}
                                            onChange={(event) =>
                                                form.setData(
                                                    'report_type',
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        <InputError
                                            id="evidence-type-error"
                                            message={form.errors.report_type}
                                        />
                                    </div>
                                    <div className="space-y-2 sm:col-span-2">
                                        <JneSourceContractFields
                                            value={form.data.definition}
                                            onChange={(value) => {
                                                form.setData(
                                                    'definition',
                                                    value,
                                                );
                                                form.clearErrors('definition');
                                            }}
                                            error={form.errors.definition}
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="evidence-customer">
                                            Customer pemilik
                                        </Label>
                                        <select
                                            id="evidence-customer"
                                            aria-invalid={
                                                !!form.errors.customer_id
                                            }
                                            aria-describedby={
                                                form.errors.customer_id
                                                    ? 'evidence-customer-error'
                                                    : undefined
                                            }
                                            className="h-10 w-full rounded-md border bg-background px-3"
                                            value={form.data.customer_id}
                                            onChange={(event) =>
                                                form.setData(
                                                    'customer_id',
                                                    event.target.value,
                                                )
                                            }
                                            required
                                        >
                                            <option value="">
                                                Pilih customer
                                            </option>
                                            {customers.map((customer) => (
                                                <option
                                                    key={customer.id}
                                                    value={customer.id}
                                                >
                                                    {customer.customer_code ||
                                                        '—'}{' '}
                                                    · {customer.name}
                                                </option>
                                            ))}
                                        </select>
                                        <InputError
                                            id="evidence-customer-error"
                                            message={form.errors.customer_id}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="evidence-value">
                                            {form.data.kind === 'code_alias'
                                                ? 'Kode alias persis'
                                                : 'Nama pengirim persis'}
                                        </Label>
                                        <Input
                                            id="evidence-value"
                                            spellCheck={false}
                                            aria-invalid={
                                                !!(
                                                    form.errors.code ||
                                                    form.errors.shipper_name
                                                )
                                            }
                                            aria-describedby={
                                                form.errors.code ||
                                                form.errors.shipper_name
                                                    ? 'evidence-value-error'
                                                    : undefined
                                            }
                                            required
                                            value={
                                                form.data.kind === 'code_alias'
                                                    ? form.data.code
                                                    : form.data.shipper_name
                                            }
                                            onChange={(event) =>
                                                form.setData(
                                                    form.data.kind ===
                                                        'code_alias'
                                                        ? 'code'
                                                        : 'shipper_name',
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        <InputError
                                            id="evidence-value-error"
                                            message={
                                                form.errors.code ||
                                                form.errors.shipper_name
                                            }
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="evidence-account">
                                            Scope akun (kosong berarti global)
                                        </Label>
                                        <Input
                                            id="evidence-account"
                                            aria-invalid={
                                                !!form.errors.account_scope
                                            }
                                            aria-describedby={
                                                form.errors.account_scope
                                                    ? 'evidence-account-error'
                                                    : undefined
                                            }
                                            value={form.data.account_scope}
                                            onChange={(event) =>
                                                form.setData(
                                                    'account_scope',
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        <InputError
                                            id="evidence-account-error"
                                            message={form.errors.account_scope}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="evidence-from">
                                            Berlaku mulai
                                        </Label>
                                        <Input
                                            id="evidence-from"
                                            aria-invalid={
                                                !!form.errors.valid_from
                                            }
                                            aria-describedby={
                                                form.errors.valid_from
                                                    ? 'evidence-from-error'
                                                    : undefined
                                            }
                                            type="date"
                                            value={form.data.valid_from}
                                            onChange={(event) =>
                                                form.setData(
                                                    'valid_from',
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        <InputError
                                            id="evidence-from-error"
                                            message={form.errors.valid_from}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="evidence-thru">
                                            Berlaku sampai
                                        </Label>
                                        <Input
                                            id="evidence-thru"
                                            aria-invalid={
                                                !!form.errors.valid_thru
                                            }
                                            aria-describedby={
                                                form.errors.valid_thru
                                                    ? 'evidence-thru-error'
                                                    : undefined
                                            }
                                            type="date"
                                            value={form.data.valid_thru}
                                            onChange={(event) =>
                                                form.setData(
                                                    'valid_thru',
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        <InputError
                                            id="evidence-thru-error"
                                            message={form.errors.valid_thru}
                                        />
                                    </div>
                                </>
                            )}
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="evidence-reason">
                                    Alasan dan referensi verifikasi
                                </Label>
                                <Input
                                    id="evidence-reason"
                                    aria-invalid={!!form.errors.reason}
                                    aria-describedby={
                                        form.errors.reason
                                            ? 'evidence-reason-error'
                                            : undefined
                                    }
                                    required
                                    maxLength={500}
                                    value={form.data.reason}
                                    onChange={(event) =>
                                        form.setData(
                                            'reason',
                                            event.target.value,
                                        )
                                    }
                                />
                                <InputError
                                    id="evidence-reason-error"
                                    message={form.errors.reason}
                                />
                            </div>
                            <label className="flex items-start gap-2 text-sm sm:col-span-2">
                                <input
                                    type="checkbox"
                                    disabled={!enabled}
                                    checked={form.data.verified}
                                    onChange={(event) =>
                                        form.setData(
                                            'verified',
                                            event.target.checked,
                                        )
                                    }
                                />
                                Verifikasi dan aktifkan aturan ini
                            </label>
                            <div
                                data-form-errors
                                tabIndex={-1}
                                className="scroll-mt-20 sm:col-span-2"
                            >
                                {Object.entries(form.errors)
                                    .filter(
                                        ([key]) =>
                                            ![
                                                'definition',
                                                'kind',
                                                'source',
                                                'report_type',
                                                'customer_id',
                                                'account_scope',
                                                'valid_from',
                                                'valid_thru',
                                                'reason',
                                                'code',
                                                'shipper_name',
                                            ].includes(key),
                                    )
                                    .map(([key, error]) => (
                                        <p
                                            key={key}
                                            role="alert"
                                            className="text-sm text-destructive"
                                        >
                                            {error}
                                        </p>
                                    ))}
                            </div>
                            <Button
                                disabled={!installed || form.processing}
                                type="submit"
                            >
                                {form.processing
                                    ? 'Menyimpan…'
                                    : 'Simpan aturan'}
                            </Button>
                        </form>
                    </div>
                </SheetContent>
            </Sheet>
            <Card>
                <CardHeader>
                    <CardTitle>Aturan tersimpan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {rows.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                            Belum ada konfigurasi bukti.
                        </p>
                    )}
                    {rows.map((row) => (
                        <details
                            key={row.kind + row.id}
                            className="rounded-lg border p-3 text-sm"
                        >
                            <summary className="cursor-pointer break-words">
                                #{row.id} · {ruleLabels[row.kind] ?? row.kind} ·{' '}
                                {label(row)} ·{' '}
                                {row.active_key || row.is_active
                                    ? 'Aktif terverifikasi'
                                    : 'Draft / dinonaktifkan'}
                            </summary>
                            <p className="mt-2">
                                Customer #{row.customer_id ?? '—'} · Scope:{' '}
                                {row.account_scope || 'global'} ·{' '}
                                {row.valid_from || 'tanpa awal'} —{' '}
                                {row.valid_thru || 'tanpa akhir'}
                            </p>
                            <p>{row.reason || row.verification_reason}</p>
                            {row.definition && (
                                <pre className="mt-2 overflow-x-auto text-xs">
                                    {JSON.stringify(row.definition, null, 2)}
                                </pre>
                            )}
                            <Button
                                className="mt-2"
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                    ruleTrigger.current = event.currentTarget;
                                    disable.setData({
                                        action:
                                            row.active_key || row.is_active
                                                ? 'disable'
                                                : 'activate',
                                        kind: row.kind,
                                        id: String(row.id),
                                        version:
                                            row.revision ?? row.version ?? 1,
                                        reason: '',
                                    });
                                    setRuleActionOpen(true);
                                }}
                            >
                                {row.active_key || row.is_active
                                    ? 'Pilih untuk dinonaktifkan'
                                    : 'Pilih untuk diverifikasi dan diaktifkan'}
                            </Button>
                        </details>
                    ))}
                    <Sheet
                        open={ruleActionOpen}
                        onOpenChange={setRuleActionOpen}
                    >
                        <SheetContent
                            className="w-full overflow-y-auto sm:max-w-lg"
                            onCloseAutoFocus={(event) => {
                                event.preventDefault();
                                disable.reset();
                                ruleTrigger.current?.focus();
                            }}
                        >
                            <SheetHeader>
                                <SheetTitle>
                                    {disable.data.action === 'activate'
                                        ? 'Aktifkan aturan'
                                        : 'Nonaktifkan aturan'}
                                </SheetTitle>
                                <SheetDescription>
                                    Perubahan dicatat dalam audit.
                                </SheetDescription>
                            </SheetHeader>
                            <form
                                className="flex flex-col gap-3 px-4 pb-6"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    disable.post(
                                        disable.data.action === 'activate'
                                            ? evidence.activate.url()
                                            : evidence.disable.url(),
                                        {
                                            preserveScroll: true,
                                            onSuccess: () =>
                                                setRuleActionOpen(false),
                                        },
                                    );
                                }}
                            >
                                <p className="text-sm">
                                    {disable.data.action === 'activate'
                                        ? 'Verifikasi dan aktifkan'
                                        : 'Nonaktifkan'}{' '}
                                    {ruleLabels[disable.data.kind] ??
                                        disable.data.kind}{' '}
                                    #{disable.data.id}; versi{' '}
                                    {disable.data.version}. Riwayat tetap
                                    disimpan.
                                </p>
                                <Label htmlFor="evidence-disable-reason">
                                    Alasan perubahan aturan
                                </Label>
                                <Input
                                    id="evidence-disable-reason"
                                    required
                                    maxLength={500}
                                    value={disable.data.reason}
                                    onChange={(event) =>
                                        disable.setData(
                                            'reason',
                                            event.target.value,
                                        )
                                    }
                                />
                                {Object.values(disable.errors).map(
                                    (error, index) => (
                                        <p
                                            key={index}
                                            role="alert"
                                            className="text-sm text-destructive"
                                        >
                                            {error}
                                        </p>
                                    ),
                                )}
                                <Button
                                    type="submit"
                                    disabled={
                                        disable.processing ||
                                        (disable.data.action === 'activate' &&
                                            !enabled)
                                    }
                                >
                                    {disable.data.action === 'activate'
                                        ? 'Verifikasi, aktifkan dan evaluasi ulang'
                                        : 'Nonaktifkan dan evaluasi ulang'}
                                </Button>
                            </form>
                        </SheetContent>
                    </Sheet>
                </CardContent>
            </Card>
            <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                    Riwayat konfigurasi
                </summary>
                <div className="mt-3 flex flex-col gap-2">
                    {events.map((event) => (
                        <details
                            key={event.id}
                            className="rounded-lg border p-3 text-sm"
                        >
                            <summary className="cursor-pointer">
                                {event.kind} #{event.rule_id} ·{' '}
                                {event.actor_name} · {event.reason}
                            </summary>
                            <p>{event.created_at}</p>
                            <pre className="overflow-x-auto text-xs">
                                {JSON.stringify(
                                    {
                                        before: JSON.parse(event.before),
                                        after: JSON.parse(event.after),
                                    },
                                    null,
                                    2,
                                )}
                            </pre>
                        </details>
                    ))}
                </div>
            </details>
        </PageContainer>
    );
}

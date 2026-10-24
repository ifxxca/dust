import { Head, Link, useForm } from '@inertiajs/react';
import PageContainer from '@/components/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
        <PageContainer className="space-y-4 py-4">
            <Head title="Aturan bukti JNE" />
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
            <Link className="text-sm underline" href={monitoring.index.url()}>
                Kembali ke pengiriman
            </Link>
            <h1 className="text-2xl font-semibold">Aturan bukti JNE</h1>
            <p className="text-sm text-muted-foreground">
                Simpan kontrak kolom, alias kode dan nama pengirim beserta scope
                yang telah diperiksa. Akun bersama tidak menetapkan pemilik.
                Draft tidak dipakai untuk pencocokan.
            </p>
            <p role="status" className="rounded-lg border p-3 text-sm">
                {!installed
                    ? 'Migrasi konfigurasi belum dipasang. Gunakan lingkungan UAT terisolasi.'
                    : enabled
                      ? 'Aktivasi tersedia pada lingkungan ini; setiap aturan tetap memerlukan verifikasi dan alasan.'
                      : 'Aktivasi aturan baru dinonaktifkan. Draft dapat disiapkan untuk UAT.'}
            </p>
            <Card>
                <CardHeader>
                    <CardTitle>Daftarkan aturan atau revisi baru</CardTitle>
                </CardHeader>
                <CardContent>
                    <form
                        className="grid gap-4 sm:grid-cols-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            let definition: Record<string, unknown>;
                            try {
                                definition = JSON.parse(form.data.definition);
                            } catch {
                                form.setError(
                                    'definition',
                                    'Definisi harus berupa JSON yang valid.',
                                );
                                return;
                            }
                            form.transform((data) => ({
                                ...data,
                                definition,
                            }));
                            form.post(evidence.store.url(), {
                                preserveScroll: true,
                                onSuccess: () =>
                                    form.reset('reason', 'verified'),
                            });
                        }}
                    >
                        <div className="space-y-2">
                            <Label htmlFor="evidence-kind">Jenis aturan</Label>
                            <select
                                id="evidence-kind"
                                className="h-10 w-full rounded-md border bg-background px-3"
                                value={form.data.kind}
                                onChange={(event) =>
                                    form.setData('kind', event.target.value)
                                }
                            >
                                <option value="contract">Kontrak sumber</option>
                                <option value="code_alias">
                                    Alias kode customer
                                </option>
                                <option value="shipper_alias">
                                    Nama pengirim berscope
                                </option>
                            </select>
                        </div>
                        {form.data.kind === 'contract' ? (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="evidence-source">
                                        Sistem sumber
                                    </Label>
                                    <select
                                        id="evidence-source"
                                        className="h-10 w-full rounded-md border bg-background px-3"
                                        value={form.data.source}
                                        onChange={(event) => {
                                            form.setData(
                                                'source',
                                                event.target.value,
                                            );
                                            form.setData(
                                                'report_type',
                                                event.target.value === 'hybrid'
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
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="evidence-type">
                                        Jenis report
                                    </Label>
                                    <Input
                                        id="evidence-type"
                                        value={form.data.report_type}
                                        onChange={(event) =>
                                            form.setData(
                                                'report_type',
                                                event.target.value,
                                            )
                                        }
                                    />
                                </div>
                                <div className="space-y-2 sm:col-span-2">
                                    <Label htmlFor="evidence-definition">
                                        Definisi kolom dan aturan terverifikasi
                                    </Label>
                                    <Textarea
                                        id="evidence-definition"
                                        className="min-h-52 font-mono text-xs"
                                        value={form.data.definition}
                                        onChange={(event) =>
                                            form.setData(
                                                'definition',
                                                event.target.value,
                                            )
                                        }
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Kolom kode customer dibiarkan null
                                        sampai terbukti. category_values
                                        memetakan nilai persis ke manual_hybrid,
                                        cashless_hybrid atau css_orion.
                                        hybrid_categories memakai kunci proses
                                        seperti roberto:cashless hanya bila
                                        disahkan. collection_requirements berisi
                                        pasangan sumber:jenis report yang wajib
                                        lengkap.
                                    </p>
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
                                        <option value="">Pilih customer</option>
                                        {customers.map((customer) => (
                                            <option
                                                key={customer.id}
                                                value={customer.id}
                                            >
                                                {customer.customer_code || '—'}{' '}
                                                · {customer.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="evidence-value">
                                        {form.data.kind === 'code_alias'
                                            ? 'Kode alias persis'
                                            : 'Nama pengirim persis'}
                                    </Label>
                                    <Input
                                        id="evidence-value"
                                        required
                                        value={
                                            form.data.kind === 'code_alias'
                                                ? form.data.code
                                                : form.data.shipper_name
                                        }
                                        onChange={(event) =>
                                            form.setData(
                                                form.data.kind === 'code_alias'
                                                    ? 'code'
                                                    : 'shipper_name',
                                                event.target.value,
                                            )
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="evidence-account">
                                        Scope akun (kosong berarti global)
                                    </Label>
                                    <Input
                                        id="evidence-account"
                                        value={form.data.account_scope}
                                        onChange={(event) =>
                                            form.setData(
                                                'account_scope',
                                                event.target.value,
                                            )
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="evidence-from">
                                        Berlaku mulai
                                    </Label>
                                    <Input
                                        id="evidence-from"
                                        type="date"
                                        value={form.data.valid_from}
                                        onChange={(event) =>
                                            form.setData(
                                                'valid_from',
                                                event.target.value,
                                            )
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="evidence-thru">
                                        Berlaku sampai
                                    </Label>
                                    <Input
                                        id="evidence-thru"
                                        type="date"
                                        value={form.data.valid_thru}
                                        onChange={(event) =>
                                            form.setData(
                                                'valid_thru',
                                                event.target.value,
                                            )
                                        }
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
                                required
                                maxLength={500}
                                value={form.data.reason}
                                onChange={(event) =>
                                    form.setData('reason', event.target.value)
                                }
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
                            Verifikasi dan aktifkan aturan ini. Data terdampak
                            akan dievaluasi ulang; keputusan manual tetap
                            dilindungi.
                        </label>
                        <div className="sm:col-span-2">
                            {Object.entries(form.errors).map(([key, error]) => (
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
                                : 'Simpan aturan bukti'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
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
                                #{row.id} · {row.kind} · {label(row)} ·{' '}
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
                                onClick={() =>
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
                                    })
                                }
                            >
                                {row.active_key || row.is_active
                                    ? 'Pilih untuk dinonaktifkan'
                                    : 'Pilih untuk diverifikasi dan diaktifkan'}
                            </Button>
                        </details>
                    ))}
                    {disable.data.id && (
                        <form
                            className="space-y-2 rounded-lg border p-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                disable.post(
                                    disable.data.action === 'activate'
                                        ? evidence.activate.url()
                                        : evidence.disable.url(),
                                    {
                                        preserveScroll: true,
                                        onSuccess: () => disable.reset(),
                                    },
                                );
                            }}
                        >
                            <p className="text-sm">
                                {disable.data.action === 'activate'
                                    ? 'Verifikasi dan aktifkan'
                                    : 'Nonaktifkan'}{' '}
                                {disable.data.kind} #{disable.data.id}; versi{' '}
                                {disable.data.version}. Riwayat tetap disimpan.
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
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Riwayat konfigurasi terbaru</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
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
                </CardContent>
            </Card>
        </PageContainer>
    );
}

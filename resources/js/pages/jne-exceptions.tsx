import { Head, Link, useForm } from '@inertiajs/react';
import PageContainer from '@/components/page-container';
import JneCustomerCandidates from '@/components/jne-customer-candidates';
import type { JneCustomerCandidate } from '@/types/jne';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import * as review from '@/routes/jne-exceptions';
import * as evidence from '@/routes/jne-evidence';
import * as monitoring from '@/routes/jne-monitoring';

type Row = {
    id: number;
    awb: string;
    version: number;
    group_key: string;
    customer_match_status: string;
    customer_match_note: string | null;
    customer_match_candidates?: JneCustomerCandidate[] | null;
    match_status: string;
    match_note: string | null;
    category: string | null;
    category_status: string | null;
    sources: Record<string, unknown>[];
};
export default function JneExceptions({
    enabled,
    filters,
    rows,
    customers,
}: {
    enabled: boolean;
    filters: { q: string; cause: string };
    rows: {
        data: Row[];
        total: number;
        prev_page_url: string | null;
        next_page_url: string | null;
    };
    customers: { id: number; name: string; customer_code: string | null }[];
}) {
    const search = useForm(filters);
    const form = useForm({
        items: [] as { id: number; version: number }[],
        group_key: '',
        action: 'CONFIRM',
        customer_id: '',
        pickup_reference: '',
        category: '',
        reason: '',
    });
    const groups = Map.groupBy(rows.data, (row) => row.group_key);
    return (
        <PageContainer className="space-y-4 py-4">
            <Head title="Pemeriksaan exception JNE" />
            <Link href={monitoring.index.url()} className="underline">
                Monitoring JNE
            </Link>
            <h1 className="text-2xl font-semibold">
                Pemeriksaan exception JNE
            </h1>
            <p className="text-sm text-muted-foreground">
                Keputusan berlaku untuk AWB yang dipilih. Pemetaan permanen
                memerlukan tindakan terpisah pada{' '}
                <Link className="underline" href={evidence.index.url()}>
                    aturan bukti
                </Link>
                . Bukti Sertim aktif harus dikoreksi melalui alur Sertim.
            </p>
            {!enabled && (
                <p role="status">
                    Review keputusan belum diaktifkan untuk lingkungan ini.
                </p>
            )}
            <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    search.get(review.index.url());
                }}
            >
                <Input
                    aria-label="Cari AWB exception"
                    value={search.data.q}
                    onChange={(event) =>
                        search.setData('q', event.target.value)
                    }
                />
                <select
                    aria-label="Penyebab exception"
                    className="rounded border bg-background p-2"
                    value={search.data.cause}
                    onChange={(event) =>
                        search.setData('cause', event.target.value)
                    }
                >
                    <option value="identity">Identitas customer</option>
                    <option value="pickup">Identitas pickup</option>
                    <option value="category">Kategori</option>
                </select>
                <Button variant="outline">Cari exception</Button>
            </form>
            <p>
                {rows.total} AWB memerlukan pemeriksaan pada filter ini.
                Kelompok hanya menggabungkan bukti sumber dan konteks keputusan
                yang sama.
            </p>
            {Array.from(groups, ([key, members]) => (
                <section key={key} className="space-y-2 rounded border p-3">
                    <Button
                        variant="outline"
                        onClick={() => {
                            form.setData(
                                'items',
                                members.map(({ id, version }) => ({
                                    id,
                                    version,
                                })),
                            );
                            form.setData('group_key', key);
                        }}
                    >
                        Pilih kelompok ({members.length} AWB)
                    </Button>
                    {members.map((row) => (
                        <details key={row.id}>
                            <summary className="break-all">
                                {row.awb} · {row.customer_match_status} /{' '}
                                {row.match_status} /{' '}
                                {row.category_status ?? 'UNCONFIGURED'}
                            </summary>
                            <JneCustomerCandidates
                                candidates={row.customer_match_candidates ?? []}
                            />
                            <p className="text-sm">
                                {row.customer_match_note} {row.match_note}
                            </p>
                            <pre className="max-w-full overflow-auto text-xs">
                                {JSON.stringify(row.sources, null, 2)}
                            </pre>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    form.setData('items', [
                                        { id: row.id, version: row.version },
                                    ]);
                                    form.setData('group_key', key);
                                }}
                            >
                                Pilih AWB {row.awb}
                            </Button>
                        </details>
                    ))}
                </section>
            ))}
            <nav className="flex gap-4">
                {rows.prev_page_url && (
                    <Link href={rows.prev_page_url}>Sebelumnya</Link>
                )}
                {rows.next_page_url && (
                    <Link href={rows.next_page_url}>Berikutnya</Link>
                )}
            </nav>
            <form
                className="space-y-3 rounded border p-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.post(review.store.url(), {
                        onSuccess: () => form.reset(),
                    });
                }}
            >
                <h2 className="text-lg font-semibold">
                    Keputusan untuk {form.data.items.length} AWB terpilih
                </h2>
                <Label htmlFor="review-action">Tindakan review</Label>
                <select
                    id="review-action"
                    className="block w-full rounded border bg-background p-2"
                    value={form.data.action}
                    onChange={(event) =>
                        form.setData('action', event.target.value)
                    }
                >
                    <option value="CONFIRM">
                        Konfirmasi berdasarkan bukti yang diperiksa
                    </option>
                    <option value="RELEASE">
                        Cabut keputusan dan evaluasi otomatis ulang
                    </option>
                </select>
                <Label htmlFor="review-owner">Customer yang dikonfirmasi</Label>
                <select
                    id="review-owner"
                    className="block w-full rounded border bg-background p-2"
                    value={form.data.customer_id}
                    onChange={(event) =>
                        form.setData('customer_id', event.target.value)
                    }
                >
                    <option value="">Tidak mengubah customer</option>
                    {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                            {customer.name} ({customer.customer_code})
                        </option>
                    ))}
                </select>
                <Label htmlFor="review-pickup">
                    Referensi pickup final (opsional)
                </Label>
                <Input
                    id="review-pickup"
                    value={form.data.pickup_reference}
                    onChange={(event) =>
                        form.setData('pickup_reference', event.target.value)
                    }
                />
                <Label htmlFor="review-category">
                    Kategori yang dikonfirmasi
                </Label>
                <select
                    id="review-category"
                    className="block w-full rounded border bg-background p-2"
                    value={form.data.category}
                    onChange={(event) =>
                        form.setData('category', event.target.value)
                    }
                >
                    <option value="">Tidak mengubah kategori</option>
                    <option value="manual_hybrid">Manual</option>
                    <option value="cashless_hybrid">Cashless</option>
                    <option value="css_orion">CSS / Orion</option>
                </select>
                <Label htmlFor="review-reason">
                    Alasan dan referensi bukti review
                </Label>
                <Textarea
                    id="review-reason"
                    required
                    maxLength={500}
                    value={form.data.reason}
                    onChange={(event) =>
                        form.setData('reason', event.target.value)
                    }
                />
                {Object.entries(form.errors).map(([field, message]) => (
                    <p role="alert" key={field} className="text-destructive">
                        {message}
                    </p>
                ))}
                <Button
                    disabled={
                        !enabled ||
                        form.processing ||
                        form.data.items.length === 0
                    }
                >
                    Simpan keputusan review
                </Button>
            </form>
        </PageContainer>
    );
}

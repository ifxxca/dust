import { Head, Link, useForm } from '@inertiajs/react';
import { useRef, useState } from 'react';
import { focusFormError } from '@/lib/utils';
import PageContainer from '@/components/page-container';
import InputError from '@/components/input-error';
import JneCustomerCandidates from '@/components/jne-customer-candidates';
import type { JneCustomerCandidate } from '@/types/jne';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import {
    Table,
    TableHeader,
    TableBody,
    TableHead,
    TableRow,
    TableCell,
} from '@/components/ui/table';
import * as review from '@/routes/jne-exceptions';
import * as evidence from '@/routes/jne-evidence';

const statusLabels: Record<string, string> = {
    MATCHED: 'Terkonfirmasi',
    CONFIRMED: 'Terkonfirmasi',
    CANDIDATE: 'Kandidat',
    AMBIGUOUS: 'Ambigu',
    CONFLICT: 'Konflik',
    UNMATCHED: 'Belum dikenali',
    UNCONFIGURED: 'Belum diatur',
};

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
    const [reviewOpen, setReviewOpen] = useState(false);
    const selectionTrigger = useRef<HTMLButtonElement | null>(null);
    const searchInput = useRef<HTMLInputElement>(null);
    const selectRows = (
        members: Row[],
        key: string,
        origin: HTMLButtonElement,
    ) => {
        selectionTrigger.current = origin;
        form.setData(
            'items',
            members.map(({ id, version }) => ({ id, version })),
        );
        form.setData('group_key', key);
        form.clearErrors();
        setReviewOpen(true);
    };
    return (
        <PageContainer className="space-y-4 py-4">
            <Head title="Pemeriksaan exception JNE" />
            <h1 className="text-2xl font-semibold">
                Pemeriksaan exception JNE
            </h1>
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
                    ref={searchInput}
                    className="min-w-40 flex-1"
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
            <p className="text-sm text-muted-foreground">
                {rows.total} AWB memerlukan pemeriksaan pada filter ini.
            </p>
            {Array.from(groups, ([key, members]) => (
                <section
                    key={key}
                    className="min-w-0 overflow-hidden rounded-lg border"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 px-3 py-2">
                        <span className="text-sm font-medium">
                            {members.length} AWB · Bukti setara
                        </span>
                        <Button
                            size="sm"
                            variant={
                                form.data.group_key === key
                                    ? 'secondary'
                                    : 'outline'
                            }
                            aria-pressed={
                                form.data.group_key === key &&
                                form.data.items.length === members.length
                            }
                            onClick={(event) =>
                                selectRows(members, key, event.currentTarget)
                            }
                        >
                            Pilih kelompok ({members.length} AWB)
                        </Button>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>AWB / Bukti</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Pickup</TableHead>
                                <TableHead>Kategori</TableHead>
                                <TableHead>
                                    <span className="sr-only">Tindakan</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {members.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={
                                        form.data.items.some(
                                            (item) => item.id === row.id,
                                        )
                                            ? 'selected'
                                            : undefined
                                    }
                                >
                                    <TableCell className="min-w-44 whitespace-normal">
                                        <details>
                                            <summary className="cursor-pointer font-mono font-medium">
                                                {row.awb}
                                            </summary>
                                            <JneCustomerCandidates
                                                candidates={
                                                    row.customer_match_candidates ??
                                                    []
                                                }
                                            />
                                            <p className="text-sm">
                                                {row.customer_match_note}{' '}
                                                {row.match_note}
                                            </p>
                                            <pre className="max-w-64 overflow-auto text-xs">
                                                {JSON.stringify(
                                                    row.sources,
                                                    null,
                                                    2,
                                                )}
                                            </pre>
                                        </details>
                                    </TableCell>
                                    {[
                                        row.customer_match_status,
                                        row.match_status,
                                        row.category_status ?? 'UNCONFIGURED',
                                    ].map((status, index) => (
                                        <TableCell key={index}>
                                            <Badge
                                                variant={
                                                    status === 'CONFLICT'
                                                        ? 'destructive'
                                                        : 'outline'
                                                }
                                            >
                                                {statusLabels[status] ?? status}
                                            </Badge>
                                        </TableCell>
                                    ))}
                                    <TableCell>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            aria-label={'Pilih AWB ' + row.awb}
                                            onClick={(event) =>
                                                selectRows(
                                                    [row],
                                                    key,
                                                    event.currentTarget,
                                                )
                                            }
                                        >
                                            Periksa
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
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
            <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
                <SheetContent
                    className="w-full overflow-y-auto sm:max-w-lg"
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        form.reset();
                        (selectionTrigger.current?.isConnected
                            ? selectionTrigger.current
                            : searchInput.current
                        )?.focus();
                    }}
                >
                    <SheetHeader>
                        <SheetTitle>
                            Keputusan untuk {form.data.items.length} AWB
                            terpilih
                        </SheetTitle>
                        <SheetDescription>
                            {rows.data
                                .filter((row) =>
                                    form.data.items.some(
                                        (item) => item.id === row.id,
                                    ),
                                )
                                .map((row) => row.awb)
                                .join(', ')}
                        </SheetDescription>
                    </SheetHeader>
                    <form
                        className="flex flex-col gap-3 px-4 pb-6"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const element = event.currentTarget;
                            form.post(review.store.url(), {
                                onSuccess: () => {
                                    setReviewOpen(false);
                                },
                                onError: () => focusFormError(element),
                            });
                        }}
                    >
                        {Object.keys(form.errors).length > 0 && (
                            <div
                                data-form-errors
                                tabIndex={-1}
                                role="alert"
                                className="rounded border border-destructive p-3 text-sm text-destructive"
                            >
                                {Object.entries(form.errors).map(
                                    ([field, message]) => (
                                        <p key={field}>{message}</p>
                                    ),
                                )}
                            </div>
                        )}
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
                        {form.data.action === 'CONFIRM' && (
                            <>
                                <Label htmlFor="review-owner">
                                    Customer yang dikonfirmasi
                                </Label>
                                <select
                                    id="review-owner"
                                    aria-invalid={!!form.errors.customer_id}
                                    aria-describedby={
                                        form.errors.customer_id
                                            ? 'review-owner-error'
                                            : undefined
                                    }
                                    className="block w-full rounded border bg-background p-2"
                                    value={form.data.customer_id}
                                    onChange={(event) =>
                                        form.setData(
                                            'customer_id',
                                            event.target.value,
                                        )
                                    }
                                >
                                    <option value="">
                                        Tidak mengubah customer
                                    </option>
                                    {customers.map((customer) => (
                                        <option
                                            key={customer.id}
                                            value={customer.id}
                                        >
                                            {customer.name} (
                                            {customer.customer_code})
                                        </option>
                                    ))}
                                </select>
                                <InputError
                                    id="review-owner-error"
                                    message={form.errors.customer_id}
                                />
                                <Label htmlFor="review-pickup">
                                    Referensi pickup final (opsional)
                                </Label>
                                <Input
                                    id="review-pickup"
                                    aria-invalid={
                                        !!form.errors.pickup_reference
                                    }
                                    aria-describedby={
                                        form.errors.pickup_reference
                                            ? 'review-pickup-error'
                                            : undefined
                                    }
                                    value={form.data.pickup_reference}
                                    onChange={(event) =>
                                        form.setData(
                                            'pickup_reference',
                                            event.target.value,
                                        )
                                    }
                                />
                                <InputError
                                    id="review-pickup-error"
                                    message={form.errors.pickup_reference}
                                />
                                <Label htmlFor="review-category">
                                    Kategori yang dikonfirmasi
                                </Label>
                                <select
                                    id="review-category"
                                    aria-invalid={!!form.errors.category}
                                    aria-describedby={
                                        form.errors.category
                                            ? 'review-category-error'
                                            : undefined
                                    }
                                    className="block w-full rounded border bg-background p-2"
                                    value={form.data.category}
                                    onChange={(event) =>
                                        form.setData(
                                            'category',
                                            event.target.value,
                                        )
                                    }
                                >
                                    <option value="">
                                        Tidak mengubah kategori
                                    </option>
                                    <option value="manual_hybrid">
                                        Manual
                                    </option>
                                    <option value="cashless_hybrid">
                                        Cashless
                                    </option>
                                    <option value="css_orion">
                                        CSS / Orion
                                    </option>
                                </select>
                                <InputError
                                    id="review-category-error"
                                    message={form.errors.category}
                                />
                            </>
                        )}
                        <Label htmlFor="review-reason">
                            Alasan dan referensi bukti review
                        </Label>
                        <Textarea
                            id="review-reason"
                            aria-invalid={!!form.errors.reason}
                            aria-describedby={
                                form.errors.reason
                                    ? 'review-reason-error'
                                    : undefined
                            }
                            required
                            maxLength={500}
                            value={form.data.reason}
                            onChange={(event) =>
                                form.setData('reason', event.target.value)
                            }
                        />
                        <InputError
                            id="review-reason-error"
                            message={form.errors.reason}
                        />
                        <Button
                            disabled={
                                !enabled ||
                                form.processing ||
                                form.data.items.length === 0
                            }
                        >
                            Simpan keputusan
                        </Button>
                    </form>
                </SheetContent>
            </Sheet>
            <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                    Ketentuan review
                </summary>
                <p className="mt-2">
                    Keputusan hanya berlaku untuk AWB terpilih dengan bukti
                    setara. Aturan permanen disimpan pada{' '}
                    <Link className="underline" href={evidence.index.url()}>
                        aturan bukti
                    </Link>
                    . Koreksi bukti Sertim aktif melalui alur Sertim.
                </p>
            </details>
        </PageContainer>
    );
}

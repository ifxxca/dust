import { router, useHttp } from '@inertiajs/react';
import { HttpResponseError } from '@inertiajs/core';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ReconciliationPager } from '@/components/pickup-reconciliation-detail';
import {
    reconciliationCategories,
    reconciliationTime,
} from '@/lib/pickup-reconciliation';
import type {
    AwbCandidate,
    PendingItem,
    ReconciliationDetail,
    ReconciliationPage,
} from '@/types/pickup-reconciliation';
import * as routes from '@/routes/pickup-automation';

function errorMessage(error: unknown): string {
    if (error instanceof HttpResponseError) {
        const data = error.response.data as {
            message?: string;
            errors?: Record<string, string[]>;
        };
        return (
            Object.values(data.errors ?? {})
                .flat()
                .join(' ') ||
            data.message ||
            'Perubahan belum tersimpan.'
        );
    }
    return 'Koneksi atau sesi bermasalah. Muat ulang sebelum mencoba lagi.';
}

export default function PickupAwbReview({
    detail,
    reload,
    loadPage,
    timezone,
    onBusyChange,
}: {
    detail: ReconciliationDetail;
    reload: () => void;
    loadPage: (pages: Record<string, string | number>) => void;
    timezone: string;
    onBusyChange: (busy: boolean) => void;
}) {
    const [reason, setReason] = useState('');
    const reasonRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [q, setQ] = useState('');
    const [boundQuery, setBoundQuery] = useState(detail.shipment_query);
    const [candidates, setCandidates] =
        useState<ReconciliationPage<AwbCandidate> | null>(null);
    const [pending, setPending] = useState<PendingItem | null>(null);
    const [date, setDate] = useState('');
    const [label, setLabel] = useState('');
    const [category, setCategory] = useState('manual_hybrid');
    const write = useHttp<Record<string, string | number>, { status: string }>(
        {},
    );
    const search = useHttp<
        Record<string, never>,
        { rows: ReconciliationPage<AwbCandidate>; business_date: string }
    >({});
    const locked =
        !!detail.reconciliation?.locked_at ||
        detail.reconciliation?.status === 'DONE';
    const busy = write.processing;
    const mutate = async (
        action: string,
        extra: Record<string, string | number> = {},
    ) => {
        if (reason.trim().length < 5) {
            setError('Isi alasan dan bukti perubahan, minimal 5 karakter.');
            reasonRef.current?.focus();
            return;
        }
        setError('');
        setNotice('');
        write.transform(() => ({
            action,
            expected_version: detail.reconciliation?.input_version ?? 0,
            reason,
            ...extra,
        }));
        onBusyChange(true);
        try {
            const result = await write.post(routes.review.url(detail.task.id));
            setCandidates(null);
            setPending(null);
            setNotice(
                action === 'VALIDATE'
                    ? result.status === 'DONE'
                        ? 'Rekonsiliasi selesai dan terkunci.'
                        : 'Validasi selesai. Masih ada selisih atau bukti yang perlu dilengkapi.'
                    : 'Perubahan tersimpan. Periksa isi lalu pilih Simpan & validasi.',
            );
            reload();
            router.reload({ only: ['automation'] });
        } catch (failure) {
            setError(errorMessage(failure));
        } finally {
            onBusyChange(false);
        }
    };
    const find = async (item: PendingItem | null = pending, page = 1) => {
        setPending(item);
        setError('');
        setCandidates(null);
        try {
            const result = await search.get(
                routes.candidates.url(detail.task.id, {
                    query: {
                        q,
                        page,
                        pending_id: item?.id,
                        process_date: item && date ? date : undefined,
                    },
                }),
            );
            setCandidates(result.rows);
            if (item) setDate(result.business_date);
        } catch (failure) {
            setError(errorMessage(failure));
        }
    };
    return (
        <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>
                    Bucket {detail.business_date ?? '—'} · 05.00–04.59 WIB
                </span>
                <Badge variant={locked ? 'secondary' : 'outline'}>
                    {locked ? 'Terkunci' : 'Dapat dikoreksi'}
                </Badge>
            </div>
            <div className="flex flex-col gap-2">
                <Label htmlFor="awb-review-reason">
                    Alasan dan bukti koreksi
                </Label>
                <Input
                    id="awb-review-reason"
                    ref={reasonRef}
                    value={reason}
                    maxLength={500}
                    placeholder="Contoh: customer mengonfirmasi typo kode; AWB sesuai Sertim…"
                    onChange={(event) => setReason(event.target.value)}
                    aria-invalid={!!error}
                    aria-describedby={error ? 'awb-review-error' : undefined}
                />
            </div>
            {error && (
                <Alert variant="destructive" id="awb-review-error">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {notice && (
                <p role="status" className="text-xs text-muted-foreground">
                    {notice}
                </p>
            )}
            {locked ? (
                <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void mutate('UNLOCK')}
                >
                    Buka koreksi pickup
                </Button>
            ) : (
                <>
                    <details aria-label="Resi terikat">
                        <summary className="cursor-pointer py-2 text-sm font-medium">
                            Resi terikat ({detail.assigned_shipments.total})
                        </summary>
                        <form
                            className="my-3 flex gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                loadPage({
                                    shipment_q: boundQuery,
                                    attached_page: 1,
                                });
                            }}
                        >
                            <Input
                                aria-label="Cari resi terikat"
                                placeholder="Cari AWB terikat"
                                value={boundQuery}
                                onChange={(event) =>
                                    setBoundQuery(event.target.value)
                                }
                            />
                            <Button variant="outline">Cari</Button>
                        </form>
                        {detail.assigned_shipments.data
                            .filter(
                                (row) => row.pickup_task_id === detail.task.id,
                            )
                            .map((row) => (
                                <div
                                    key={row.id}
                                    className="flex items-center justify-between gap-3 border-b py-2 text-xs"
                                >
                                    <div className="min-w-0">
                                        <p className="font-medium break-all">
                                            {row.awb}
                                        </p>
                                        <p className="mt-1 text-muted-foreground">
                                            {reconciliationCategories.find(
                                                ([key]) => key === row.category,
                                            )?.[1] ?? 'Kategori belum sah'}
                                        </p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() =>
                                            void mutate('REMOVE', {
                                                shipment_id: row.id,
                                                shipment_version: row.version,
                                            })
                                        }
                                    >
                                        Keluarkan
                                    </Button>
                                </div>
                            ))}
                        <ReconciliationPager
                            page={detail.assigned_shipments}
                            change={(attached_page) =>
                                loadPage({ attached_page })
                            }
                        />
                    </details>
                    <section
                        className="flex flex-col gap-3"
                        aria-label="Rekomendasi resi"
                    >
                        <h4 className="text-sm font-medium">
                            {pending
                                ? `Resi untuk pending: ${pending.label}`
                                : 'Rekomendasi & pencarian resi'}
                        </h4>
                        {pending && (
                            <div className="flex items-end gap-2">
                                <div className="flex flex-1 flex-col gap-2">
                                    <Label htmlFor="pending-process-date">
                                        Tanggal operasional sumber
                                    </Label>
                                    <Input
                                        id="pending-process-date"
                                        type="date"
                                        value={date}
                                        min={detail.business_date ?? undefined}
                                        onChange={(event) =>
                                            setDate(event.target.value)
                                        }
                                    />
                                </div>
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setPending(null);
                                        setCandidates(null);
                                        setDate('');
                                    }}
                                >
                                    Batal
                                </Button>
                            </div>
                        )}
                        <form
                            className="flex gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void find();
                            }}
                        >
                            <Input
                                aria-label="Cari AWB atau nama pengirim"
                                placeholder="Cari AWB atau nama pengirim"
                                value={q}
                                onChange={(event) => setQ(event.target.value)}
                            />
                            <Button
                                variant="outline"
                                disabled={search.processing}
                            >
                                {search.processing ? 'Memuat…' : 'Cari'}
                            </Button>
                        </form>
                        {!candidates && !pending && (
                            <Button
                                variant="outline"
                                disabled={search.processing}
                                onClick={() => void find(null)}
                            >
                                Lihat rekomendasi bucket ini
                            </Button>
                        )}
                        {candidates?.data.map((row) => (
                            <article
                                key={row.id}
                                className="flex flex-col gap-2 border-b py-3 text-xs"
                            >
                                <p className="font-medium break-all">
                                    {row.awb} · {row.shipper_name}
                                </p>
                                <p className="text-muted-foreground">
                                    {row.recommendation}
                                </p>
                                <p className="text-muted-foreground">
                                    {reconciliationTime(row.entry_at, timezone)}{' '}
                                    ·{' '}
                                    {reconciliationCategories.find(
                                        ([key]) => key === row.category,
                                    )?.[1] ?? 'Kategori belum sah'}
                                </p>
                                {row.excluded_reason && (
                                    <p className="text-warning">
                                        Pernah dikeluarkan:{' '}
                                        {row.excluded_reason}
                                    </p>
                                )}
                                {row.sertim_conflict && (
                                    <p className="text-destructive">
                                        Sertim menunjuk pickup lain. Koreksi
                                        bukti asal terlebih dahulu.
                                    </p>
                                )}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="self-start"
                                    disabled={
                                        busy ||
                                        row.sertim_conflict ||
                                        row.category_status !== 'MATCHED'
                                    }
                                    onClick={() =>
                                        void mutate('ADD', {
                                            shipment_id: row.id,
                                            shipment_version: row.version,
                                            ...(pending
                                                ? {
                                                      pending_id: pending.id,
                                                      pending_version:
                                                          pending.version,
                                                  }
                                                : {}),
                                        })
                                    }
                                >
                                    {row.excluded_reason
                                        ? 'Tambahkan kembali'
                                        : 'Tambahkan ke pickup'}
                                </Button>
                            </article>
                        ))}
                        {candidates?.total === 0 && (
                            <p className="text-xs text-muted-foreground">
                                Tidak ada resi bebas yang sesuai. Resi terikat
                                ke pickup lain tidak ditampilkan.
                            </p>
                        )}
                        {candidates && (
                            <ReconciliationPager
                                page={candidates}
                                change={(page) => void find(pending, page)}
                            />
                        )}
                    </section>
                    <section
                        className="flex flex-col gap-3"
                        aria-label="Barang pending pickup"
                    >
                        <h4 className="text-sm font-medium">
                            Barang pending ({detail.pending_items.total})
                        </h4>
                        {detail.pending_items.data.map((item) => (
                            <article
                                key={item.id}
                                className="flex flex-col gap-2 border-b py-3 text-xs"
                            >
                                <p className="font-medium">
                                    {item.label} · {item.status}
                                </p>
                                <p className="text-muted-foreground">
                                    {item.reason}
                                </p>
                                {item.shipment && (
                                    <p>
                                        AWB {item.shipment.awb} · Diproses{' '}
                                        {item.processing_date?.slice(0, 10)}
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {item.status === 'PENDING' && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={busy}
                                            onClick={() =>
                                                void mutate('READY', {
                                                    pending_id: item.id,
                                                    pending_version:
                                                        item.version,
                                                })
                                            }
                                        >
                                            Konfirmasi siap diproses
                                        </Button>
                                    )}
                                    {item.status === 'READY' && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={busy}
                                            onClick={() => {
                                                setDate('');
                                                void find(item);
                                            }}
                                        >
                                            Pilih resi hasil proses
                                        </Button>
                                    )}
                                    {['PENDING', 'READY'].includes(
                                        item.status,
                                    ) && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={busy}
                                            onClick={() =>
                                                void mutate('CANCEL_PENDING', {
                                                    pending_id: item.id,
                                                    pending_version:
                                                        item.version,
                                                })
                                            }
                                        >
                                            Batalkan catatan pending
                                        </Button>
                                    )}
                                </div>
                            </article>
                        ))}
                        <ReconciliationPager
                            page={detail.pending_items}
                            change={(pending_page) =>
                                loadPage({ pending_page })
                            }
                        />
                        <details>
                            <summary className="cursor-pointer py-2 text-xs font-medium">
                                Catat satu barang pending
                            </summary>
                            <form
                                className="mt-3 flex flex-col gap-3"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void mutate('PENDING', { label, category });
                                }}
                            >
                                <Label htmlFor="pending-label">
                                    Identitas paket / nomor order
                                </Label>
                                <Input
                                    id="pending-label"
                                    value={label}
                                    maxLength={150}
                                    required
                                    onChange={(event) =>
                                        setLabel(event.target.value)
                                    }
                                />
                                <Label htmlFor="pending-category">
                                    Kategori
                                </Label>
                                <select
                                    id="pending-category"
                                    className="h-10 rounded-md border bg-card px-3 text-sm"
                                    value={category}
                                    onChange={(event) =>
                                        setCategory(event.target.value)
                                    }
                                >
                                    {reconciliationCategories.map(
                                        ([key, name]) => (
                                            <option key={key} value={key}>
                                                {name}
                                            </option>
                                        ),
                                    )}
                                </select>
                                <Button variant="outline" disabled={busy}>
                                    Catat pending
                                </Button>
                            </form>
                        </details>
                    </section>
                    <details aria-label="Resi dikeluarkan">
                        <summary className="cursor-pointer py-2 text-sm font-medium">
                            Dikeluarkan ({detail.excluded.total})
                        </summary>
                        {detail.excluded.data.map((row) => (
                            <div key={row.id} className="border-b py-2 text-xs">
                                <p className="break-all">{row.awb}</p>
                                <p className="mt-1 text-muted-foreground">
                                    {row.reason}
                                </p>
                                <Button
                                    className="mt-2"
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                        busy || row.pickup_task_id !== null
                                    }
                                    onClick={() =>
                                        void mutate('ADD', {
                                            shipment_id: row.id,
                                            shipment_version: row.version,
                                        })
                                    }
                                >
                                    {row.pickup_task_id !== null
                                        ? 'Sudah terikat pickup'
                                        : 'Tambahkan kembali'}
                                </Button>
                            </div>
                        ))}
                        <ReconciliationPager
                            page={detail.excluded}
                            change={(excluded_page) =>
                                loadPage({ excluded_page })
                            }
                        />
                    </details>
                    <form
                        id="awb-review-validate-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (!busy) void mutate('VALIDATE');
                        }}
                    />
                </>
            )}
            <details>
                <summary className="cursor-pointer py-2 text-xs font-medium">
                    Riwayat koreksi isi pickup
                </summary>
                {detail.review_events.data.map((event) => (
                    <div key={event.id} className="border-b py-3 text-xs">
                        <p>
                            {event.action} · {event.actor_name}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                            {event.reason} ·{' '}
                            {reconciliationTime(event.created_at, timezone)}
                        </p>
                    </div>
                ))}
                <ReconciliationPager
                    page={detail.review_events}
                    change={(review_page) => loadPage({ review_page })}
                />
            </details>
        </div>
    );
}

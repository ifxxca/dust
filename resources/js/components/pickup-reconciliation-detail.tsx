import { Link, router } from '@inertiajs/react';
import {
    AlertCircle,
    Check,
    CheckCircle2,
    Circle,
    Clock3,
    FileDown,
    Files,
    RefreshCw,
    Search,
    Truck,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { DeliveryPreference } from '@/components/pickup-awb-delivery-preference';
import PickupAwbReview from '@/components/pickup-awb-review';
import { cn } from '@/lib/utils';
import {
    deliveryLabels,
    reconciliationCategories as categories,
    reconciliationIssue,
    reconciliationLabels,
    reconciliationTime,
    reconciliationTotal,
} from '@/lib/pickup-reconciliation';
import type {
    ReconciliationCounts,
    ReconciliationDetail,
    ReconciliationPage,
} from '@/types/pickup-reconciliation';
import * as automation from '@/routes/pickup-automation';
import * as shipments from '@/routes/jne-monitoring';

export function ReconciliationStatus({
    status,
    group,
}: {
    status: string;
    group?: string;
}) {
    const tone =
        group ??
        (status === 'REVIEW'
            ? 'review'
            : status === 'DONE'
              ? 'done'
              : 'waiting');
    const Icon =
        tone === 'review'
            ? AlertCircle
            : tone === 'done'
              ? CheckCircle2
              : Clock3;
    return (
        <span
            className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium whitespace-nowrap',
                tone === 'review'
                    ? 'bg-destructive/10 text-destructive'
                    : tone === 'done'
                      ? 'bg-success/10 text-success'
                      : 'bg-warning/10 text-warning',
            )}
        >
            <Icon className="size-3 shrink-0" aria-hidden="true" />
            {tone === 'review' && status === 'DONE'
                ? 'Periksa pengiriman'
                : (reconciliationLabels[status] ?? status)}
        </span>
    );
}

export function ReconciliationPager({
    page,
    change,
}: {
    page: ReconciliationPage<unknown>;
    change: (page: number) => void;
}) {
    if (page.last_page < 2) return null;
    return (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
                Halaman {page.current_page} / {page.last_page}
            </span>
            <div className="flex gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    disabled={page.current_page <= 1}
                    onClick={() => change(page.current_page - 1)}
                >
                    Sebelumnya
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={page.current_page >= page.last_page}
                    onClick={() => change(page.current_page + 1)}
                >
                    Berikutnya
                </Button>
            </div>
        </div>
    );
}

function CategoryComparison({
    counts,
    full = false,
}: {
    counts: Record<string, ReconciliationCounts>;
    full?: boolean;
}) {
    return (
        <div className="overflow-x-auto rounded-lg border">
            <Table className="text-xs">
                <TableHeader>
                    <TableRow className="bg-muted/40">
                        <TableHead>Kategori</TableHead>
                        {full && (
                            <TableHead className="text-right">POP</TableHead>
                        )}
                        <TableHead className="text-right">Gudang</TableHead>
                        <TableHead className="text-right">JNE</TableHead>
                        <TableHead className="text-right">Selisih</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {categories.map(([key, label]) => {
                        const row = counts[key];
                        const delta =
                            row?.expected == null
                                ? null
                                : row.confirmed - row.expected;
                        return (
                            <TableRow key={key}>
                                <TableCell className="text-[11px]">
                                    {label}
                                </TableCell>
                                {full && (
                                    <TableCell className="text-right tabular-nums">
                                        {row?.pop ?? '—'}
                                    </TableCell>
                                )}
                                <TableCell className="text-right tabular-nums">
                                    {row?.expected ?? '—'}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {row?.confirmed ?? '—'}
                                </TableCell>
                                <TableCell className="text-right">
                                    <span
                                        className={cn(
                                            'inline-flex rounded px-1.5 py-0.5 tabular-nums',
                                            delta !== null &&
                                                delta > 0 &&
                                                'bg-destructive/10 text-destructive',
                                            delta !== null &&
                                                delta < 0 &&
                                                'bg-warning/10 text-warning',
                                        )}
                                    >
                                        {delta === null
                                            ? '—'
                                            : delta > 0
                                              ? `+${delta}`
                                              : delta}
                                    </span>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                    <TableRow className="font-semibold">
                        <TableCell>Total</TableCell>
                        {full && (
                            <TableCell className="text-right tabular-nums">
                                {reconciliationTotal(counts, 'pop') ?? '—'}
                            </TableCell>
                        )}
                        <TableCell className="text-right tabular-nums">
                            {reconciliationTotal(counts, 'expected') ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {reconciliationTotal(counts, 'confirmed') ?? '—'}
                        </TableCell>
                        <TableCell />
                    </TableRow>
                </TableBody>
            </Table>
        </div>
    );
}

export default function PickupReconciliationDetail({
    detail,
    error,
    timezone,
    enabled,
    close,
    reload,
    loadPage,
}: {
    detail: ReconciliationDetail | null;
    error: string;
    timezone: string;
    enabled: boolean;
    close: () => void;
    reload: () => void;
    loadPage: (pages: Record<string, string | number>) => void;
}) {
    const [tab, setTab] = useState('summary');
    const [rechecking, setRechecking] = useState(false);
    const [reviewBusy, setReviewBusy] = useState(false);
    const [actionError, setActionError] = useState('');
    const taskId = detail?.task.id;
    useEffect(() => {
        if (!enabled || !taskId || ['manage', 'evidence'].includes(tab)) return;
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible' && !reviewBusy) reload();
        }, 15000);
        return () => window.clearInterval(timer);
    }, [enabled, taskId, tab, reviewBusy, reload]);
    const status = detail?.reconciliation?.status ?? 'NOT_EVALUATED';
    const attention =
        detail?.delivery_attention || detail?.reconciliation?.last_error;
    const needsReview = status === 'REVIEW' || !!attention;
    const counts = detail?.reconciliation?.categories ?? {};
    const issue = reconciliationIssue(counts, detail?.reconciliation?.reasons);
    const timeline = detail
        ? ([
              [
                  'Pickup dikunjungi',
                  detail.context.visited_at,
                  !!detail.context.visited_at,
              ],
              [
                  'POP final',
                  detail.context.finalized_at,
                  !!detail.context.finalized_at,
              ],
              [
                  'Verifikasi gudang',
                  detail.context.verified_at,
                  !!detail.context.verified_at &&
                      !detail.context.warehouse_needs_review,
              ],
              [
                  'Data JNE diimpor',
                  detail.context.imported_at,
                  !!detail.context.imported_at,
              ],
              [
                  'Rekonsiliasi',
                  detail.reconciliation?.evaluated_at ?? null,
                  status === 'DONE',
              ],
          ] as const)
        : [];
    const recheck = () => {
        if (!detail) return;
        router.post(
            automation.recheck.url(detail.task.id),
            {},
            {
                preserveScroll: true,
                onStart: () => setRechecking(true),
                onFinish: () => setRechecking(false),
                onSuccess: () => {
                    setActionError('');
                    reload();
                },
                onError: () =>
                    setActionError(
                        'Validasi belum dapat diantrekan. Muat ulang status atau coba lagi.',
                    ),
            },
        );
    };
    return (
        <div className="flex h-full min-h-0 flex-col bg-card">
            <div className="flex items-center justify-between border-b px-5 py-4">
                <h2
                    className="text-base font-semibold"
                    id="reconciliation-detail-title"
                >
                    Detail Rekonsiliasi
                </h2>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Tutup detail rekonsiliasi"
                    onClick={close}
                >
                    <X className="size-4" />
                </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {error && (
                    <div className="flex flex-col gap-3 p-5" role="alert">
                        <p className="text-sm text-destructive">{error}</p>
                        <Button variant="outline" onClick={reload}>
                            Coba lagi
                        </Button>
                    </div>
                )}
                {!detail && !error && (
                    <div className="flex flex-col gap-4 p-5" role="status">
                        <span className="sr-only">
                            Memuat detail rekonsiliasi…
                        </span>
                        <Skeleton className="h-12" />
                        <Skeleton className="h-36" />
                        <Skeleton className="h-48" />
                    </div>
                )}
                {detail && (
                    <>
                        <div className="flex items-start justify-between gap-3 px-5 pt-4">
                            <div className="min-w-0">
                                <h3 className="text-sm leading-5 font-semibold">
                                    {detail.task.customer_name_snapshot}
                                </h3>
                                {!detail.customer_day &&
                                    detail.selected_task_id && (
                                        <Button
                                            variant="link"
                                            size="sm"
                                            className="h-auto px-0"
                                            onClick={() =>
                                                loadPage({
                                                    view: 'customer_day',
                                                })
                                            }
                                        >
                                            Kembali ke gabungan customer
                                        </Button>
                                    )}
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {detail.task.reference}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {reconciliationTime(
                                        detail.context.visited_at,
                                        timezone,
                                        true,
                                    )}
                                </p>
                            </div>
                            <ReconciliationStatus
                                status={status}
                                group={needsReview ? 'review' : undefined}
                            />
                        </div>
                        <div
                            role="tablist"
                            aria-label="Bagian detail rekonsiliasi"
                            className="mt-4 flex overflow-x-auto border-b px-4"
                        >
                            {[
                                ['summary', 'Ringkasan'],
                                ['categories', 'Rincian kategori'],
                                [
                                    'manage',
                                    detail.customer_day
                                        ? 'Buku pickup'
                                        : 'Atur resi',
                                ],
                                ['evidence', 'Bukti & AWB'],
                                ['history', 'Riwayat'],
                            ].map(([key, label], index, tabs) => (
                                <button
                                    key={key}
                                    id={`recon-tab-${key}`}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === key}
                                    aria-controls={`recon-panel-${key}`}
                                    tabIndex={tab === key ? 0 : -1}
                                    className={cn(
                                        'min-h-11 min-w-20 flex-1 border-b-2 px-1 text-[11px] font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                        tab === key
                                            ? 'border-primary text-primary'
                                            : 'border-transparent text-muted-foreground',
                                    )}
                                    onClick={() => setTab(key)}
                                    onKeyDown={(event) => {
                                        if (
                                            [
                                                'ArrowLeft',
                                                'ArrowRight',
                                                'Home',
                                                'End',
                                            ].includes(event.key)
                                        ) {
                                            event.preventDefault();
                                            const next =
                                                event.key === 'Home'
                                                    ? 0
                                                    : event.key === 'End'
                                                      ? tabs.length - 1
                                                      : (index +
                                                            (event.key ===
                                                            'ArrowRight'
                                                                ? 1
                                                                : -1) +
                                                            tabs.length) %
                                                        tabs.length;
                                            setTab(tabs[next][0]);
                                            document
                                                .getElementById(
                                                    `recon-tab-${tabs[next][0]}`,
                                                )
                                                ?.focus();
                                        }
                                    }}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div
                            id={`recon-panel-${tab}`}
                            role="tabpanel"
                            aria-labelledby={`recon-tab-${tab}`}
                            className="flex flex-col gap-5 p-5"
                        >
                            {tab === 'manage' && detail.customer_day && (
                                <div className="flex flex-col gap-3">
                                    <h4 className="text-sm font-semibold">
                                        {detail.customer_day.pickup_count} buku
                                        pickup
                                    </h4>
                                    {detail.customer_day.members.map(
                                        (member) => (
                                            <div
                                                key={member.id}
                                                className="flex flex-col gap-2 rounded-lg border p-3"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-medium break-all">
                                                            {member.reference}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {member.staff_name ??
                                                                'Belum ada petugas'}{' '}
                                                            ·{' '}
                                                            {reconciliationTime(
                                                                member.picked_up_at,
                                                                timezone,
                                                                true,
                                                            )}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="min-h-11 shrink-0"
                                                        onClick={() => {
                                                            setTab('summary');
                                                            loadPage({
                                                                view: 'pickup',
                                                                member_task:
                                                                    member.id,
                                                            });
                                                        }}
                                                    >
                                                        Periksa buku
                                                    </Button>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    {categories
                                                        .map(
                                                            ([key, label]) =>
                                                                label.replace(
                                                                    ' Hybrid',
                                                                    '',
                                                                ) +
                                                                ': ' +
                                                                (member
                                                                    .categories[
                                                                    key
                                                                ]?.received ??
                                                                    '—'),
                                                        )
                                                        .join(' · ')}
                                                </p>
                                            </div>
                                        ),
                                    )}
                                </div>
                            )}
                            {tab === 'manage' && !detail.customer_day && (
                                <PickupAwbReview
                                    detail={detail}
                                    reload={reload}
                                    loadPage={loadPage}
                                    timezone={timezone}
                                    onBusyChange={setReviewBusy}
                                />
                            )}
                            {tab === 'summary' && (
                                <>
                                    {(status !== 'DONE' || attention) && (
                                        <div
                                            className={cn(
                                                'flex gap-3 rounded-lg border p-3',
                                                needsReview
                                                    ? 'border-destructive/15 bg-destructive/5'
                                                    : 'border-warning/20 bg-warning/5',
                                            )}
                                        >
                                            <AlertCircle
                                                className={cn(
                                                    'mt-1 size-5 shrink-0',
                                                    needsReview
                                                        ? 'text-destructive'
                                                        : 'text-warning',
                                                )}
                                                aria-hidden="true"
                                            />
                                            <div>
                                                <h4 className="text-xs font-semibold">
                                                    {attention
                                                        ? detail.delivery_attention
                                                            ? 'Periksa pengiriman resi'
                                                            : 'Validasi perlu diperiksa'
                                                        : issue.title}
                                                </h4>
                                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                    {attention ||
                                                        issue.description}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                    <dl className="grid grid-cols-3 gap-3 text-xs">
                                        <div>
                                            <dt className="text-[10px] text-muted-foreground">
                                                Customer
                                            </dt>
                                            <dd className="mt-1 font-medium break-words">
                                                {
                                                    detail.task
                                                        .customer_name_snapshot
                                                }
                                            </dd>
                                            <dd className="mt-1 text-[10px] break-all text-muted-foreground">
                                                {detail.context.customer_code ??
                                                    'Kode belum tersedia'}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-[10px] text-muted-foreground">
                                                Petugas
                                            </dt>
                                            <dd className="mt-1 font-medium">
                                                {detail.context.staff_name ??
                                                    'Belum ditetapkan'}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-[10px] text-muted-foreground">
                                                Jadwal pickup
                                            </dt>
                                            <dd className="mt-1 font-medium">
                                                {reconciliationTime(
                                                    detail.context.scheduled_at,
                                                    timezone,
                                                    true,
                                                )}
                                            </dd>
                                        </div>
                                    </dl>
                                    <div className="flex gap-3 rounded-lg border p-4">
                                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                            <Truck className="size-6" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground">
                                                {detail.customer_day
                                                    ? 'Total paket gabungan'
                                                    : 'Total paket pada POP'}
                                            </p>
                                            <p className="mt-1 text-2xl font-semibold tabular-nums">
                                                {reconciliationTotal(
                                                    counts,
                                                    'pop',
                                                ) ?? '—'}
                                            </p>
                                            <p className="mt-1 text-[11px] text-muted-foreground">
                                                Dihitung sebagai AWB unik
                                            </p>
                                        </div>
                                    </div>
                                    <section className="flex flex-col gap-2">
                                        <h4 className="text-xs font-semibold">
                                            Perbandingan paket per kategori
                                        </h4>
                                        <CategoryComparison counts={counts} />
                                        <p className="text-[10px] leading-4 text-muted-foreground">
                                            Target mengikuti verifikasi gudang
                                            yang sah. Selisih total nol tetap
                                            perlu diperiksa bila kategori
                                            berbeda.
                                        </p>
                                    </section>
                                    <section className="rounded-lg border p-3">
                                        <h4 className="mb-3 text-xs font-semibold">
                                            Status proses
                                        </h4>
                                        <ol className="flex flex-col gap-4">
                                            {timeline.map(
                                                ([label, at, complete]) => (
                                                    <li
                                                        key={label}
                                                        className="flex items-start gap-2 text-[11px]"
                                                    >
                                                        <span
                                                            className={cn(
                                                                'flex size-4 shrink-0 items-center justify-center rounded-full',
                                                                complete
                                                                    ? 'bg-success text-white'
                                                                    : 'bg-muted text-muted-foreground',
                                                            )}
                                                        >
                                                            {complete ? (
                                                                <Check className="size-3" />
                                                            ) : (
                                                                <Circle className="size-2.5" />
                                                            )}
                                                        </span>
                                                        <span className="flex-1">
                                                            {label}
                                                        </span>
                                                        <span className="text-right text-muted-foreground">
                                                            {complete &&
                                                            typeof at ===
                                                                'string'
                                                                ? reconciliationTime(
                                                                      at,
                                                                      timezone,
                                                                      true,
                                                                  )
                                                                : label ===
                                                                    'Rekonsiliasi'
                                                                  ? reconciliationLabels[
                                                                        status
                                                                    ]
                                                                  : 'Menunggu proses'}
                                                        </span>
                                                    </li>
                                                ),
                                            )}
                                        </ol>
                                    </section>
                                </>
                            )}
                            {tab === 'categories' && (
                                <>
                                    <h4 className="text-sm font-semibold">
                                        Jumlah per kategori
                                    </h4>
                                    <CategoryComparison counts={counts} full />
                                    <p className="text-xs leading-5 text-muted-foreground">
                                        POP dan gudang ditampilkan terpisah.
                                        Jumlah yang belum diverifikasi tidak
                                        menjadi target pencocokan.
                                    </p>
                                    {detail.reconciliation?.reasons?.map(
                                        (reason) => (
                                            <p
                                                key={reason}
                                                className="text-xs text-destructive"
                                            >
                                                {reason}
                                            </p>
                                        ),
                                    )}
                                </>
                            )}
                            {tab === 'evidence' && (
                                <>
                                    <div className="flex items-center justify-between gap-2">
                                        <h4 className="text-sm font-semibold">
                                            Daftar resi (
                                            {detail.shipments.total})
                                        </h4>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={!enabled || rechecking}
                                            onClick={recheck}
                                        >
                                            <RefreshCw
                                                className={cn(
                                                    'size-3.5',
                                                    rechecking &&
                                                        'animate-spin',
                                                )}
                                            />
                                            Validasi ulang
                                        </Button>
                                    </div>
                                    {actionError && (
                                        <p
                                            role="alert"
                                            className="text-xs text-destructive"
                                        >
                                            {actionError}
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        Kelengkapan sumber:{' '}
                                        {detail.reconciliation?.evidence
                                            ?.coverage?.complete
                                            ? 'sudah terbukti'
                                            : 'belum terbukti'}
                                        .
                                    </p>
                                    <Table className="text-xs">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Resi</TableHead>
                                                <TableHead>Kategori</TableHead>
                                                <TableHead>Status</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {detail.shipments.data.map(
                                                (shipment) => (
                                                    <TableRow key={shipment.id}>
                                                        <TableCell>
                                                            <Link
                                                                href={shipments.show(
                                                                    shipment.id,
                                                                )}
                                                                className="font-mono text-primary underline-offset-4 hover:underline"
                                                            >
                                                                {shipment.awb}
                                                            </Link>
                                                        </TableCell>
                                                        <TableCell>
                                                            {categories.find(
                                                                ([key]) =>
                                                                    key ===
                                                                    shipment.category,
                                                            )?.[1] ??
                                                                'Belum diketahui'}
                                                        </TableCell>
                                                        <TableCell>
                                                            {shipment.match_status ===
                                                                'MATCHED' &&
                                                            shipment.category_status ===
                                                                'MATCHED' &&
                                                            shipment.customer_match_status ===
                                                                'MATCHED'
                                                                ? 'Cocok'
                                                                : 'Perlu diperiksa'}
                                                        </TableCell>
                                                    </TableRow>
                                                ),
                                            )}
                                        </TableBody>
                                    </Table>
                                    {detail.shipments.total === 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            Belum ada resi yang dapat
                                            ditampilkan.
                                        </p>
                                    )}
                                    <ReconciliationPager
                                        page={detail.shipments}
                                        change={(page) => loadPage({ page })}
                                    />
                                    <section className="flex flex-col gap-3 border-t pt-4">
                                        <h4 className="text-sm font-semibold">
                                            Dokumen & pengiriman
                                        </h4>
                                        {!detail.manifests.total && (
                                            <p className="text-xs text-muted-foreground">
                                                Dokumen tersedia setelah seluruh
                                                kategori dan bukti sumber cocok.
                                            </p>
                                        )}
                                        {detail.manifests.data.map(
                                            (manifest) => (
                                                <div
                                                    key={manifest.id}
                                                    className="flex flex-col gap-2 rounded-lg border p-3"
                                                >
                                                    <p className="text-xs font-medium">
                                                        Versi{' '}
                                                        {manifest.revision} ·{' '}
                                                        {manifest.status ===
                                                        'READY'
                                                            ? 'Dokumen siap'
                                                            : manifest.status}
                                                    </p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {(
                                                            [
                                                                'xlsx',
                                                                'pdf',
                                                            ] as const
                                                        )
                                                            .filter(
                                                                (format) =>
                                                                    manifest[
                                                                        `${format}_path`
                                                                    ],
                                                            )
                                                            .map((format) => (
                                                                <Button
                                                                    key={format}
                                                                    variant="outline"
                                                                    size="sm"
                                                                    asChild
                                                                >
                                                                    <a
                                                                        href={automation.download.url(
                                                                            {
                                                                                task: detail
                                                                                    .task
                                                                                    .id,
                                                                                manifest:
                                                                                    manifest.id,
                                                                                format,
                                                                            },
                                                                        )}
                                                                    >
                                                                        <FileDown className="size-3.5" />
                                                                        {format ===
                                                                        'xlsx'
                                                                            ? 'Excel'
                                                                            : 'PDF'}
                                                                    </a>
                                                                </Button>
                                                            ))}
                                                        {manifest.status ===
                                                            'FAILED' && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() =>
                                                                    router.post(
                                                                        automation.retryDocument.url(
                                                                            {
                                                                                task: detail
                                                                                    .task
                                                                                    .id,
                                                                                manifest:
                                                                                    manifest.id,
                                                                            },
                                                                        ),
                                                                        {},
                                                                        {
                                                                            preserveScroll: true,
                                                                            onSuccess:
                                                                                reload,
                                                                        },
                                                                    )
                                                                }
                                                            >
                                                                Ulangi dokumen
                                                            </Button>
                                                        )}
                                                    </div>
                                                    {manifest.last_error && (
                                                        <p className="text-xs text-destructive">
                                                            {
                                                                manifest.last_error
                                                            }
                                                        </p>
                                                    )}
                                                    {manifest.deliveries.map(
                                                        (delivery) => (
                                                            <div
                                                                key={
                                                                    delivery.id
                                                                }
                                                                className="text-xs"
                                                            >
                                                                <p className="break-all">
                                                                    {
                                                                        delivery.recipient
                                                                    }{' '}
                                                                    ·{' '}
                                                                    {deliveryLabels[
                                                                        delivery
                                                                            .status
                                                                    ] ??
                                                                        delivery.status}
                                                                </p>
                                                                {delivery.last_error && (
                                                                    <p className="mt-1 text-destructive">
                                                                        {
                                                                            delivery.last_error
                                                                        }
                                                                    </p>
                                                                )}
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                            ),
                                        )}
                                        <ReconciliationPager
                                            page={detail.manifests}
                                            change={(manifest_page) =>
                                                loadPage({ manifest_page })
                                            }
                                        />
                                    </section>
                                    <DeliveryPreference
                                        key={detail.preference?.revision ?? 0}
                                        detail={detail}
                                        saved={reload}
                                    />
                                </>
                            )}
                            {tab === 'history' && (
                                <>
                                    <h4 className="text-sm font-semibold">
                                        Riwayat rekonsiliasi
                                    </h4>
                                    {detail.history.data.map((event) => {
                                        let state = 'Evaluasi tersimpan';
                                        let reasons: string[] = [];
                                        try {
                                            const snapshot =
                                                typeof event.snapshot ===
                                                'string'
                                                    ? JSON.parse(event.snapshot)
                                                    : event.snapshot;
                                            state =
                                                reconciliationLabels[
                                                    snapshot.status
                                                ] ?? snapshot.status;
                                            reasons = snapshot.reasons ?? [];
                                        } catch {
                                            /* The immutable source remains available in the audit record. */
                                        }
                                        return (
                                            <article
                                                key={event.revision}
                                                className="border-b pb-3"
                                            >
                                                <p className="text-xs font-medium">
                                                    Evaluasi #{event.revision} ·{' '}
                                                    {state}
                                                </p>
                                                <p className="mt-1 text-[11px] text-muted-foreground">
                                                    {reconciliationTime(
                                                        event.created_at,
                                                        timezone,
                                                    )}
                                                </p>
                                                {reasons.map((reason) => (
                                                    <p
                                                        key={reason}
                                                        className="mt-2 text-xs text-muted-foreground"
                                                    >
                                                        {reason}
                                                    </p>
                                                ))}
                                            </article>
                                        );
                                    })}
                                    <ReconciliationPager
                                        page={detail.history}
                                        change={(history_page) =>
                                            loadPage({ history_page })
                                        }
                                    />
                                    <details className="text-xs">
                                        <summary className="cursor-pointer py-2 font-medium">
                                            Rincian bukti sumber
                                        </summary>
                                        <p className="mt-2 text-muted-foreground">
                                            {detail.reconciliation?.evidence
                                                ?.coverage?.method ??
                                                'Belum diperiksa'}
                                        </p>
                                        <p className="mt-2 text-muted-foreground">
                                            Report:{' '}
                                            {detail.reconciliation?.evidence?.coverage?.reports?.join(
                                                ', ',
                                            ) || 'Belum ditetapkan'}
                                        </p>
                                    </details>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
            {detail && (
                <footer className="grid grid-cols-2 gap-3 border-t bg-card p-4">
                    <Button
                        variant="outline"
                        onClick={() => setTab('evidence')}
                    >
                        <Files className="size-4" />
                        Lihat bukti AWB
                    </Button>
                    <Button
                        type={
                            tab === 'manage' && !detail.customer_day
                                ? 'submit'
                                : 'button'
                        }
                        form={
                            tab === 'manage' && !detail.customer_day
                                ? 'awb-review-validate-form'
                                : undefined
                        }
                        disabled={
                            tab === 'manage' &&
                            !detail.customer_day &&
                            (reviewBusy ||
                                !!detail.reconciliation?.locked_at ||
                                status === 'DONE')
                        }
                        onClick={() =>
                            detail.customer_day && tab === 'manage'
                                ? setTab('summary')
                                : tab !== 'manage' &&
                                  setTab(
                                      status === 'DONE' ||
                                          detail.delivery_attention
                                          ? 'evidence'
                                          : 'manage',
                                  )
                        }
                    >
                        <Search className="size-4" />
                        {tab === 'manage' && detail.customer_day
                            ? 'Ringkasan gabungan'
                            : tab === 'manage' && !detail.customer_day
                              ? reviewBusy
                                  ? 'Menyimpan…'
                                  : 'Simpan & validasi'
                              : detail.delivery_attention
                                ? 'Periksa pengiriman'
                                : status === 'DONE'
                                  ? 'Lihat dokumen'
                                  : 'Periksa kasus'}
                    </Button>
                </footer>
            )}
        </div>
    );
}

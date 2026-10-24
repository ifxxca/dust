import { Head, Link, router, usePage } from '@inertiajs/react';
import { useState } from 'react';
import PageContainer from '@/components/page-container';
import { Button } from '@/components/ui/button';
import { EmptyState, StatusBadge } from '@/components/operational-ui';
import {
    ResultStatus,
    categories,
    resultDate,
    OperationalPickupContext,
} from '@/components/pickup-result-ui';
import { RecordedValues } from '@/components/operational-change';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import * as routes from '@/routes/pickup-results';
import { handover } from '@/routes';
import type { HandoverSession } from '@/types/handover';
import type {
    PickupResult,
    ResultTask,
    ResultCapabilities,
} from '@/types/pickup-result';
import PickupResultActions from '@/components/pickup-result-actions';
import PickupProcessingDetail from '@/components/pickup-processing-detail';
import type { ProcessingDetail } from '@/types/package-processing';
import { monitoringBackUrl } from '@/lib/pickup-monitoring-navigation';

type Activity = {
    source: string;
    id: number;
    action: string;
    actor_id: number;
    actor_name: string | null;
    at: string;
    reason?: string | null;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
};
const actionLabels: Record<string, string> = {
    created: 'Pickup dibuat',
    assigned: 'Petugas ditugaskan',
    taken_over: 'Tugas diambil alih',
    execution_started: 'Kunjungan dimulai',
    visit_recorded: 'Hasil kunjungan dicatat',
    visit_outcome: 'Rincian hasil kunjungan',
    pickup_finalized: 'POP difinalisasi',
    pop_finalized: 'Nilai POP asli',
    proof_corrected: 'POP dikoreksi',
    pop_revision: 'Revisi POP',
    pickup_corrected: 'POP terkait handover dikoreksi',
    item_verified: 'Penerimaan fisik diverifikasi',
    verification_corrected: 'Verifikasi dikoreksi',
    verification_revision: 'Revisi verifikasi',
    closed: 'Session ditutup',
    reopened: 'Session dibuka kembali',
    membership_changed: 'Anggota session diubah',
    cancelled: 'Pickup dibatalkan',
    scheduled_generated: 'Pickup dibuat dari jadwal',
    processing_recorded: 'Pemrosesan dicatat manual',
    processing_corrected: 'Catatan pemrosesan dikoreksi',
};
export type PickupResultDetailProps = {
    processing?: ProcessingDetail;
    task: ResultTask;
    result: PickupResult;
    session: HandoverSession | null;
    timeline: Activity[];
    timezone: string;
    actors: Record<number, string>;
    capabilities: ResultCapabilities;
};
export default function PickupResultDetail({
    task,
    result,
    session,
    timeline,
    timezone,
    actors,
    capabilities,
    processing,
}: PickupResultDetailProps) {
    const pageUrl = usePage().url;
    const params = new URL(pageUrl, 'http://localhost').searchParams;
    const initialTab = params.get('tab');
    const [tab, setTab] = useState(
        ['proof', 'handover', 'activity', 'processing'].includes(
            initialTab ?? '',
        )
            ? initialTab!
            : 'summary',
    );
    const [preview, setPreview] = useState<{
        url: string;
        kind: string;
    } | null>(null);
    const proof = task.proof;
    const item = session?.items?.find((entry) => entry.task_id === task.id);
    const tabs = [
        ['summary', 'Ringkasan'],
        ['proof', 'Bukti POP'],
        ['handover', 'Verifikasi & Handover'],
        ['activity', 'Riwayat Aktivitas'],
        ['processing', 'Pemrosesan Paket'],
    ];
    return (
        <PageContainer variant="wide">
            <Head title={`Hasil Pickup · ${task.reference}`} />
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Link
                        className="text-sm text-primary hover:underline"
                        href={monitoringBackUrl(pageUrl)}
                    >
                        ← Hasil Pickup
                    </Link>
                    <h1 className="mt-2 text-2xl font-semibold">
                        {result.customer_name}
                    </h1>
                    <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
                        {task.reference}
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() =>
                        router.visit(
                            routes.show(task.id, {
                                query: Object.fromEntries(params),
                            }),
                            {
                                preserveState: true,
                                preserveScroll: true,
                                fresh: true,
                            },
                        )
                    }
                >
                    Muat ulang
                </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                <div>
                    <p className="text-xs font-medium text-muted-foreground">
                        Tindak lanjut operasional
                    </p>
                    <p className="mt-1 font-medium">{result.next_action}</p>
                </div>
                <PickupResultActions
                    task={task}
                    session={session}
                    capabilities={capabilities}
                    initialOperation={
                        [
                            'correct_pop',
                            'verify',
                            'correct_verification',
                        ].includes(params.get('operation') ?? '')
                            ? (params.get(
                                  'operation',
                              ) as keyof ResultCapabilities)
                            : undefined
                    }
                />
            </div>
            <div
                role="tablist"
                aria-label="Detail hasil pickup"
                className="flex gap-1 overflow-x-auto border-b"
            >
                {tabs.map(([key, label], index) => (
                    <button
                        id={`tab-${key}`}
                        aria-controls={`panel-${key}`}
                        role="tab"
                        aria-selected={tab === key}
                        tabIndex={tab === key ? 0 : -1}
                        className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium ${tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
                        key={key}
                        onClick={() => setTab(key)}
                        onKeyDown={(event) => {
                            const next =
                                event.key === 'ArrowRight'
                                    ? (index + 1) % tabs.length
                                    : event.key === 'ArrowLeft'
                                      ? (index + tabs.length - 1) % tabs.length
                                      : event.key === 'Home'
                                        ? 0
                                        : event.key === 'End'
                                          ? tabs.length - 1
                                          : null;
                            if (next === null) return;
                            event.preventDefault();
                            setTab(tabs[next][0]);
                            event.currentTarget.parentElement
                                ?.querySelectorAll<HTMLButtonElement>(
                                    '[role="tab"]',
                                )
                                [next]?.focus();
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <section
                role="tabpanel"
                id={`panel-${tab}`}
                aria-labelledby={`tab-${tab}`}
                className="space-y-5"
            >
                {tab === 'processing' && processing && (
                    <PickupProcessingDetail
                        data={processing}
                        timezone={timezone}
                        task={task}
                        result={result}
                        autoRecord={params.get('record_processing') === '1'}
                    />
                )}
                {tab === 'summary' && (
                    <div className="grid gap-5 lg:grid-cols-2">
                        <div className="space-y-4 rounded-xl border bg-card p-5">
                            <h2 className="font-semibold">Informasi Pickup</h2>
                            <OperationalPickupContext
                                result={result}
                                timezone={timezone}
                            />
                            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
                                <dt>Customer</dt>
                                <dd>{result.customer_name}</dd>
                                <dt>Alamat</dt>
                                <dd className="break-words">
                                    {task.pickup_address}
                                </dd>
                                <dt>Kontak</dt>
                                <dd>{task.contact}</dd>
                                <dt>Petugas</dt>
                                <dd>
                                    {result.staff_name ?? 'Belum ditugaskan'}
                                </dd>
                                <dt>Jadwal</dt>
                                <dd>
                                    {resultDate(result.scheduled_at, timezone)}
                                </dd>
                                <dt>Mulai kunjungan</dt>
                                <dd>
                                    {resultDate(
                                        result.visit_started_at,
                                        timezone,
                                    )}
                                </dd>
                                <dt>Hasil dicatat</dt>
                                <dd>
                                    {resultDate(
                                        result.visit_recorded_at,
                                        timezone,
                                    )}
                                </dd>
                                <dt>Status tugas</dt>
                                <dd>
                                    <StatusBadge status={result.task_status} />
                                </dd>
                            </dl>
                            {task.notes && (
                                <p className="text-sm">{task.notes}</p>
                            )}
                        </div>
                        <div className="space-y-4 rounded-xl border bg-card p-5">
                            <h2 className="font-semibold">
                                Tahapan Operasional
                            </h2>
                            {(
                                [
                                    'visit',
                                    'pop',
                                    'handover',
                                    'verification',
                                    'discrepancy',
                                ] as const
                            ).map((dimension, index) => (
                                <div
                                    key={dimension}
                                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                                >
                                    <span>
                                        {
                                            [
                                                'Kunjungan',
                                                'Bukti POP',
                                                'Handover',
                                                'Verifikasi Retail',
                                                'Hasil hitung fisik',
                                            ][index]
                                        }
                                    </span>
                                    <ResultStatus
                                        result={result}
                                        dimension={dimension}
                                    />
                                </div>
                            ))}
                            <p className="text-xs text-muted-foreground">
                                POP final, verifikasi, dan penutupan sesi adalah
                                tahapan berbeda. Hasil terverifikasi dapat
                                memiliki selisih.
                            </p>
                        </div>
                    </div>
                )}
                {tab === 'proof' &&
                    (proof ? (
                        <div className="space-y-5">
                            <div className="rounded-xl border bg-card p-5">
                                <h2 className="font-semibold">
                                    POP asli dan revisi efektif #
                                    {proof.revision ?? 0}
                                </h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Finalisasi:{' '}
                                    {resultDate(proof.finalized_at, timezone)} ·
                                    Petugas POP:{' '}
                                    {actors[proof.staff_id] ??
                                        `Pengguna #${proof.staff_id}`}
                                </p>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Kategori</TableHead>
                                            <TableHead>POP Asli</TableHead>
                                            <TableHead>POP Efektif</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {categories.map(([key, label]) => (
                                            <TableRow key={key}>
                                                <TableCell>{label}</TableCell>
                                                <TableCell>
                                                    {proof.original?.[key] ??
                                                        '—'}
                                                </TableCell>
                                                <TableCell>
                                                    {proof[key]}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow>
                                            <TableCell>Total paket</TableCell>
                                            <TableCell>
                                                {categories.reduce(
                                                    (sum, [key]) =>
                                                        sum +
                                                        Number(
                                                            proof.original?.[
                                                                key
                                                            ] ?? 0,
                                                        ),
                                                    0,
                                                )}
                                            </TableCell>
                                            <TableCell>{proof.total}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                                <p className="mt-4 text-sm">
                                    Catatan: {proof.notes ?? '—'}
                                </p>
                            </div>
                            <div className="rounded-xl border bg-card p-5">
                                <h2 className="mb-4 font-semibold">
                                    Foto dan tanda tangan
                                </h2>
                                <div className="grid gap-4 sm:grid-cols-3">
                                    {proof.attachments.map((file) => (
                                        <button
                                            key={file.id}
                                            className="space-y-2 rounded-lg border p-2 text-sm"
                                            onClick={() => setPreview(file)}
                                        >
                                            <img
                                                className="h-40 w-full bg-white object-contain"
                                                src={file.url}
                                                alt={
                                                    file.kind === 'signature'
                                                        ? 'Tanda tangan customer'
                                                        : 'Foto bukti pickup'
                                                }
                                                loading="lazy"
                                            />
                                            <span>
                                                {file.kind === 'signature'
                                                    ? 'Tanda tangan customer'
                                                    : 'Foto bukti pickup'}{' '}
                                                · Perbesar
                                            </span>
                                        </button>
                                    ))}
                                </div>
                                {proof.attachments.length === 0 && (
                                    <p className="text-sm text-muted-foreground">
                                        Tidak ada lampiran tersimpan.
                                    </p>
                                )}
                            </div>
                            <div className="space-y-3 rounded-xl border bg-card p-5">
                                <h2 className="font-semibold">
                                    Riwayat revisi POP
                                </h2>
                                <details>
                                    <summary>POP asli</summary>
                                    <RecordedValues values={proof.original} />
                                </details>
                                {proof.revisions?.map((revision) => (
                                    <details key={revision.revision}>
                                        <summary>
                                            Revisi #{revision.revision} ·{' '}
                                            {actors[revision.actor_id] ??
                                                `Pengguna #${revision.actor_id}`}{' '}
                                            ·{' '}
                                            {resultDate(
                                                revision.created_at,
                                                timezone,
                                            )}
                                        </summary>
                                        <p className="mt-2 text-sm">
                                            Alasan: {revision.reason}
                                        </p>
                                        <RecordedValues
                                            values={revision.values}
                                        />
                                    </details>
                                ))}
                                {!proof.revisions?.length && (
                                    <p className="text-sm text-muted-foreground">
                                        Belum ada koreksi POP.
                                    </p>
                                )}
                            </div>
                        </div>
                    ) : (
                        <EmptyState
                            title="POP belum tersedia"
                            description="Bukti baru tersedia setelah finalisasi. Sistem tidak menyimpan draft POP sebagai transaksi terpisah."
                        />
                    ))}
                {tab === 'handover' &&
                    (session && item ? (
                        <div className="space-y-5">
                            <div className="space-y-3 rounded-xl border bg-card p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <h2 className="font-semibold">
                                        {session.reference}
                                    </h2>
                                    <Link
                                        className="text-sm text-primary hover:underline"
                                        href={handover(
                                            { session: session.id },
                                            { query: { item: item.id } },
                                        )}
                                    >
                                        Lihat sesi lengkap →
                                    </Link>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    <StatusBadge status={session.status} />
                                    <ResultStatus
                                        result={result}
                                        dimension="verification"
                                    />
                                </div>
                                <p className="text-sm">
                                    Dibuat {session.creator?.name ?? '—'} ·{' '}
                                    {resultDate(session.created_at, timezone)}
                                </p>
                                <p className="text-sm">
                                    Pemeriksa:{' '}
                                    {item.verified_by
                                        ? (actors[item.verified_by] ??
                                          `Pengguna #${item.verified_by}`)
                                        : 'Belum diperiksa'}{' '}
                                    · {resultDate(item.verified_at, timezone)}
                                </p>
                                <p className="text-sm">
                                    Penutupan:{' '}
                                    {resultDate(session.closed_at, timezone)} ·{' '}
                                    {session.closed_by
                                        ? (actors[session.closed_by] ??
                                          `Pengguna #${session.closed_by}`)
                                        : '—'}
                                </p>
                                <p className="text-sm">
                                    Progres sesi: {session.verified_count ?? 0}{' '}
                                    / {session.items?.length ?? 0} pickup
                                    diverifikasi atas POP terkini.
                                </p>
                            </div>
                            <div className="rounded-xl border bg-card p-5">
                                <h2 className="font-semibold">
                                    Penerimaan fisik pickup ini
                                </h2>
                                <p className="my-2 text-sm text-muted-foreground">
                                    Revisi POP yang diperiksa:{' '}
                                    {item.verified_pickup_revision ??
                                        (item.status === 'PENDING'
                                            ? 'Belum diperiksa'
                                            : 'Tidak tercatat pada histori lama')}
                                    . Selisih = aktual diterima − POP yang
                                    diperiksa.
                                </p>
                                {item.needs_review && (
                                    <p
                                        role="alert"
                                        className="mb-3 text-sm text-amber-800 dark:text-amber-300"
                                    >
                                        POP terkini berubah. Hasil sebelumnya
                                        tetap disimpan dan memerlukan tinjau
                                        ulang.
                                    </p>
                                )}
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {[
                                                'Kategori',
                                                'POP diperiksa',
                                                'POP terkini',
                                                'Aktual diterima',
                                                'Selisih',
                                            ].map((label) => (
                                                <TableHead key={label}>
                                                    {label}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {categories.map(([key, label]) => {
                                            const difference =
                                                item.verified_differences?.[
                                                    key
                                                ];
                                            return (
                                                <TableRow key={key}>
                                                    <TableCell>
                                                        {label}
                                                    </TableCell>
                                                    <TableCell>
                                                        {item.verified_pickup?.[
                                                            key
                                                        ] ?? '—'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {item.pickup[key]}
                                                    </TableCell>
                                                    <TableCell>
                                                        {item.status ===
                                                        'PENDING'
                                                            ? '—'
                                                            : item.retail[key]}
                                                    </TableCell>
                                                    <TableCell
                                                        className={
                                                            difference
                                                                ? 'font-medium text-amber-800 dark:text-amber-300'
                                                                : ''
                                                        }
                                                    >
                                                        {difference == null
                                                            ? '—'
                                                            : difference === 0
                                                              ? '0 · SESUAI'
                                                              : `${difference > 0 ? '+' : ''}${difference} · ${difference > 0 ? 'LEBIH' : 'KURANG'}`}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                                <p className="mt-4 text-sm">
                                    Catatan selisih:{' '}
                                    {item.discrepancy_notes ?? '—'}
                                </p>
                                <details className="mt-4 text-sm">
                                    <summary>
                                        Verifikasi awal dan koreksi (
                                        {item.revisions.length})
                                    </summary>
                                    <RecordedValues
                                        values={item.original_retail}
                                    />
                                    {item.revisions.map((revision) => (
                                        <div
                                            key={revision.revision}
                                            className="mt-4 border-t pt-3"
                                        >
                                            <p>
                                                Revisi #{revision.revision} ·{' '}
                                                {actors[revision.actor_id] ??
                                                    `Pengguna #${revision.actor_id}`}{' '}
                                                ·{' '}
                                                {resultDate(
                                                    revision.created_at,
                                                    timezone,
                                                )}
                                            </p>
                                            <p>Alasan: {revision.reason}</p>
                                            <RecordedValues
                                                values={revision.values}
                                            />
                                        </div>
                                    ))}
                                </details>
                            </div>
                        </div>
                    ) : (
                        <EmptyState
                            title="Belum ada sesi handover"
                            description={
                                proof
                                    ? 'POP sudah final dan menunggu dimasukkan ke sesi handover.'
                                    : 'Finalisasi POP diperlukan sebelum pickup dapat diserahkan.'
                            }
                        />
                    ))}
                {tab === 'activity' && (
                    <div className="space-y-4">
                        {timeline.length === 0 ? (
                            <EmptyState title="Belum ada aktivitas tersimpan" />
                        ) : (
                            timeline.map((event) => (
                                <article
                                    key={`${event.source}-${event.id}`}
                                    className="space-y-2 rounded-xl border bg-card p-4"
                                >
                                    <div className="flex flex-wrap justify-between gap-2">
                                        <h3 className="text-sm font-semibold">
                                            {event.source === 'handover' &&
                                            event.action === 'created'
                                                ? 'Sesi handover dibuat'
                                                : (actionLabels[event.action] ??
                                                  event.action)}
                                        </h3>
                                        <time className="text-xs text-muted-foreground">
                                            {resultDate(event.at, timezone)}
                                        </time>
                                    </div>
                                    <p className="text-sm">
                                        {event.actor_name ??
                                            `Pengguna #${event.actor_id}`}
                                        {event.reason
                                            ? ` · ${event.reason}`
                                            : ''}
                                    </p>
                                    {(event.before || event.after) && (
                                        <details className="text-xs">
                                            <summary>
                                                Nilai yang tercatat
                                            </summary>
                                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                                {(
                                                    [
                                                        [
                                                            'Sebelum',
                                                            event.before,
                                                        ],
                                                        [
                                                            'Sesudah / data tercatat',
                                                            event.after,
                                                        ],
                                                    ] as const
                                                ).map(([label, values]) =>
                                                    values ? (
                                                        <div
                                                            key={String(label)}
                                                        >
                                                            <p className="font-semibold">
                                                                {String(label)}
                                                            </p>
                                                            <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 break-words whitespace-pre-wrap">
                                                                {JSON.stringify(
                                                                    values,
                                                                    null,
                                                                    2,
                                                                )}
                                                            </pre>
                                                        </div>
                                                    ) : null,
                                                )}
                                            </div>
                                        </details>
                                    )}
                                </article>
                            ))
                        )}
                    </div>
                )}
            </section>
            <Dialog
                open={!!preview}
                onOpenChange={(open) => !open && setPreview(null)}
            >
                <DialogContent className="max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>Pratinjau bukti POP</DialogTitle>
                        <DialogDescription>
                            Lampiran hanya tersedia melalui akses
                            terautentikasi.
                        </DialogDescription>
                    </DialogHeader>
                    {preview && (
                        <img
                            src={preview.url}
                            alt={
                                preview.kind === 'signature'
                                    ? 'Tanda tangan customer'
                                    : 'Foto bukti pickup'
                            }
                            className="max-h-[75dvh] w-full bg-white object-contain"
                        />
                    )}
                </DialogContent>
            </Dialog>
        </PageContainer>
    );
}
PickupResultDetail.layout = {
    breadcrumbs: [
        { title: 'Hasil Pickup', href: routes.index() },
        { title: 'Detail operasional', href: '' },
    ],
};

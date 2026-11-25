import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, router, useHttp } from '@inertiajs/react';
import { X, RefreshCw, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Disclosure, DisclosureSummary } from '@/components/ui/disclosure';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import LegacyDetail, {
    ReconciliationPager,
} from '@/components/pickup-reconciliation-detail';
import { DeliveryPreference } from '@/components/pickup-awb-delivery-preference';
import { DocumentDeliveryPanel } from '@/components/document-delivery';
import ReconciliationInvestigation, {
    workspaceError,
} from '@/components/reconciliation-investigation';
import ShipmentDetailSheet from '@/components/jne-shipment-detail-sheet';
import {
    reconciliationCategories,
    reconciliationTime,
    quantityLabels,
} from '@/lib/pickup-reconciliation';
import * as api from '@/routes/reconciliation-workspace';
import * as automation from '@/routes/pickup-automation';
import { index as reportRun } from '@/routes/report-runs';
import type { ReconciliationDetail } from '@/types/pickup-reconciliation';
import type { Workspace } from '@/types/reconciliation-workspace';

const sections = [
    ['overview', 'Status proses'],
    ['categories', 'Kategori'],
    ['discrepancies', 'Selisih'],
    ['sources', 'Bukti sumber'],
    ['documents', 'Dokumen'],
    ['history', 'Riwayat & lock'],
] as const;
export const workspaceLabels: Record<string, string> = {
    OPEN: 'Belum dihitung',
    IN_REVIEW: 'Perlu diperiksa',
    VERIFIED: 'Terverifikasi',
    LOCKED: 'Terkunci',
    WAITING_SOURCE: 'Menunggu sumber',
    PROCESSING_FAILED: 'Pemrosesan gagal',
    LOCKED_REVIEW: 'Terkunci · bukti berubah',
    COMPLETE: 'Lengkap',
    UNKNOWN: 'Belum diketahui',
    INCOMPLETE: 'Belum lengkap',
    PENDING: 'Menunggu',
    FAILED: 'Gagal',
    UNVERIFIED: 'Belum terverifikasi',
    MATCHED: 'Cocok',
    DISCREPANCY: 'Ada selisih',
    NOT_EVALUATED: 'Perlu hitung ulang',
};
const quantity = (value: number | null | undefined) =>
    value == null ? '—' : value.toLocaleString('id-ID');
export function WorkspaceSummary({
    workspace,
}: {
    workspace: Pick<Workspace, 'metrics'>;
}) {
    const exceptions = [
        ['missing', 'AWB kurang'],
        ['excess', 'AWB lebih'],
        ['unmatched', 'Customer belum dikenal'],
        ['ambiguous', 'Atribusi ambigu'],
        ['confirmed_discrepancies', 'Selisih terkonfirmasi'],
    ].filter(([key]) => (workspace.metrics[key] ?? 0) > 0);
    return (
        <div className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    ['expected', 'Target gudang'],
                    ['observed', 'AWB ditemukan'],
                    ['matched', 'Cocok'],
                    ['pending_review', 'Perlu tindakan'],
                ].map(([key, label]) => (
                    <div key={key} className="rounded-md border p-3">
                        <dt className="text-xs text-muted-foreground">
                            {label}
                        </dt>
                        <dd className="mt-1 text-xl font-semibold tabular-nums">
                            {quantity(workspace.metrics[key])}
                        </dd>
                    </div>
                ))}
            </dl>
            {!!exceptions.length && (
                <dl className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    {exceptions.map(([key, label]) => (
                        <div key={key} className="flex gap-1.5">
                            <dt>{label}</dt>
                            <dd className="font-medium tabular-nums">
                                {quantity(workspace.metrics[key])}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}
export function WorkspaceBucketSummary({
    workspace,
}: {
    workspace: Pick<Workspace, 'categories' | 'approval'>;
}) {
    const categories = workspace.approval?.categories ?? workspace.categories;
    return (
        <dl
            aria-label="Jumlah resi per kategori"
            className="grid grid-cols-3 gap-3 rounded-lg border p-3"
        >
            {reconciliationCategories.map(([key]) => {
                const row = categories[key];
                const label = {
                    manual_hybrid: 'Manual',
                    cashless_hybrid: 'Cashless',
                    css_orion: 'CSS/Orion',
                }[key];
                return (
                    <div key={key} className="flex min-w-0 flex-col gap-1">
                        <dt className="text-xs text-muted-foreground">
                            {label}
                        </dt>
                        <dd className="text-sm font-semibold tabular-nums">
                            {quantity(row?.observed ?? row?.confirmed)}/
                            {quantity(row?.expected)}
                        </dd>
                        <dd className="text-xs">
                            {row?.expected == null
                                ? 'Target belum tersedia'
                                : row.status === 'NOT_EVALUATED'
                                  ? 'Perlu hitung ulang'
                                  : row.status === 'UNKNOWN'
                                    ? 'Belum diverifikasi'
                                    : row.observed != null &&
                                        row.observed !== row.confirmed
                                      ? 'Periksa pencocokan'
                                      : (row.shortfall ?? 0) > 0
                                        ? `Kurang ${quantity(row.shortfall)}`
                                        : (row.excess ?? 0) > 0
                                          ? `Lebih ${quantity(row.excess)}`
                                          : 'Cocok'}
                        </dd>
                    </div>
                );
            })}
        </dl>
    );
}
export default function ReconciliationWorkspace({
    taskId: selectedTaskId,
    detail,
    error: initialError,
    timezone,
    enabled,
    close,
    reload,
}: {
    taskId?: number;
    detail: ReconciliationDetail | null;
    error: string;
    timezone: string;
    enabled: boolean;
    close: () => void;
    reload: () => void;
    loadPage: (pages: Record<string, string | number>) => void;
}) {
    const taskId = selectedTaskId ?? detail?.selected_task_id ?? detail?.task.id;
    const [data, setData] = useState<Workspace | null>(null),
        [section, setSection] = useState('overview'),
        [error, setError] = useState(''),
        [notice, setNotice] = useState('');
    const [relatedAwb, setRelatedAwb] = useState<number | null>(null);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const relatedAwbOrigin = useRef<HTMLElement | null>(null);
    const [investigation, setInvestigation] = useState({
            category: '',
            mode: 'included',
        }),
        [reason, setReason] = useState(''),
        [confirmation, setConfirmation] = useState<
            'REOPEN' | 'CLOSE_WITH_EXCEPTION' | null
        >(null);
    const [reasonCode, setReasonCode] = useState('');
    const [legacy, setLegacy] = useState<ReconciliationDetail | null>(null),
        [legacyOpen, setLegacyOpen] = useState(false),
        [legacyError, setLegacyError] = useState('');
    const request = useHttp<Record<string, never>, Workspace>({});
    const legacyRequest = useHttp<Record<string, never>, ReconciliationDetail>(
        {},
    );
    const write = useHttp<
        Record<string, string | number>,
        { revision: number }
    >({});
    const load = useCallback(
        async (pages: Record<string, number> = {}) => {
            if (!taskId) return;
            setError('');
            try {
                const value = await request.get(
                    api.show.url(taskId, { query: pages }),
                );
                if (value) setData(value);
            } catch (failure) {
                setError(workspaceError(failure));
            }
        },
        [taskId],
    );
    useEffect(() => {
        void load();
        return () => request.cancel();
    }, [load]);
    const refresh = async () => {
        await load();
        reload();
    };
    const time = (value: string | null | undefined) =>
        value ? reconciliationTime(value, timezone) : 'Tidak tersedia';
    const find = (category = '', mode = 'suggested') => {
        setInvestigation({ category, mode });
    };
    const openLegacy = async (id: number) => {
        if (!taskId) return;
        setLegacyOpen(true);
        setLegacy(null);
        setLegacyError('');
        try {
            const value = await legacyRequest.get(
                automation.show.url(taskId, {
                    query: { view: 'pickup', member_task: id },
                }),
            );
            if (value) setLegacy(value);
        } catch (failure) {
            setLegacyError(workspaceError(failure));
        }
    };
    const lock = async () => {
        if (!taskId || !data || !confirmation) return;
        write.transform(() => ({
            action: confirmation,
            expected_revision: data.version,
            fingerprint: data.fingerprint,
            review_token: data.review_token,
            reason,
            ...(confirmation === 'CLOSE_WITH_EXCEPTION'
                ? { reason_code: reasonCode }
                : {}),
        }));
        try {
            const result = await write.post(api.lock.url(taskId));
            if (!result) return;
            setConfirmation(null);
            setNotice('Keputusan dan snapshot tercatat.');
            await refresh();
        } catch (failure) {
            setConfirmation(null);
            setError(workspaceError(failure));
        }
    };
    return (
        <div className="flex h-full min-h-0 flex-col bg-card">
            <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
                <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                        Buku pickup · Rekonsiliasi resi
                    </p>
                    <h2
                        id="reconciliation-detail-title"
                        className="text-lg font-semibold"
                    >
                        {data?.header.customer.name ??
                            detail?.task.customer_name_snapshot ??
                            'Memuat customer…'}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        {data?.header.customer.customer_code ?? '—'} ·{' '}
                        {data?.header.business_date ?? '—'} ·{' '}
                        {data?.header.pickup_count ?? '—'} pickup
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-11"
                        aria-label="Segarkan workspace"
                        disabled={request.processing || write.processing}
                        onClick={() => void refresh()}
                    >
                        <RefreshCw />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-11"
                        aria-label="Tutup detail rekonsiliasi"
                        disabled={write.processing}
                        onClick={close}
                    >
                        <X />
                    </Button>
                </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
                {(error || initialError) && (
                    <Alert variant="destructive" className="mb-3">
                        <AlertTitle>Perlu diperiksa</AlertTitle>
                        <AlertDescription>
                            {error || initialError}
                            <Button
                                variant="outline"
                                onClick={() => void load()}
                            >
                                Muat ulang
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}
                {notice && (
                    <p role="status" className="mb-3 text-sm">
                        {notice}
                    </p>
                )}
                {!data && !error && (
                    <div className="flex flex-col gap-3" role="status">
                        <span className="sr-only">Memuat workspace…</span>
                        <Skeleton className="h-16" />
                        <Skeleton className="h-36" />
                        <Skeleton className="h-72" />
                    </div>
                )}
                {data && (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-2">
                                {data.quantity_status && (
                                    <Badge variant="outline">
                                        Jumlah:{' '}
                                        {quantityLabels[data.quantity_status] ??
                                            data.quantity_status}
                                    </Badge>
                                )}
                                <Badge
                                    variant={
                                        data.eligible ? 'secondary' : 'outline'
                                    }
                                >
                                    {data.approval?.mode === 'AUTOMATIC' &&
                                    data.status === 'LOCKED'
                                        ? 'Selesai · terkunci otomatis'
                                        : (workspaceLabels[data.status] ??
                                          data.status)}
                                </Badge>
                                {data.coverage.required_for_lock !== false && (
                                    <Badge variant="outline">
                                        Sumber:{' '}
                                        {workspaceLabels[
                                            data.coverage.status
                                        ] ?? data.coverage.status}
                                    </Badge>
                                )}
                            </div>
                            {!data.approval &&
                                data.capabilities.close_with_explanation && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        {data.closure?.due_at && (
                                            <span
                                                className={
                                                    data.closure.overdue
                                                        ? 'text-sm font-medium text-destructive'
                                                        : 'text-xs text-muted-foreground'
                                                }
                                            >
                                                {data.closure.overdue
                                                    ? 'Lewat tenggat · '
                                                    : 'Tutup sebelum '}
                                                {time(data.closure.due_at)}
                                            </span>
                                        )}
                                        <Button
                                            variant="outline"
                                            className="min-h-11"
                                            disabled={
                                                !data.closure?.ready ||
                                                data.dirty ||
                                                write.processing
                                            }
                                            onClick={() => {
                                                setReason('');
                                                setReasonCode('');
                                                write.clearErrors();
                                                setConfirmation(
                                                    'CLOSE_WITH_EXCEPTION',
                                                );
                                            }}
                                        >
                                            Tutup dengan penjelasan
                                        </Button>
                                    </div>
                                )}
                        </div>
                        {data.approval?.mode === 'EXCEPTION' && (
                            <div
                                className="border-l-2 border-primary pl-3 text-sm"
                                role="status"
                            >
                                <p className="font-medium">
                                    Selesai dengan penjelasan selisih
                                </p>
                                <p>
                                    {data.approval.exception?.reason_label}:{' '}
                                    {data.approval.reason}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Ditutup oleh {data.approval.reviewer.name} ·{' '}
                                    {time(data.approval.locked_at)}
                                </p>
                            </div>
                        )}
                        <WorkspaceBucketSummary workspace={data} />
                        <section
                            aria-label="Resi buku pickup"
                            className="flex min-w-0 flex-col gap-3"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="font-medium">
                                    {investigation.mode === 'unassigned'
                                        ? 'Resi belum terikat di pool'
                                        : investigation.mode === 'candidates'
                                          ? 'Cari resi di buku lain'
                                          : 'Resi dalam bucket'}
                                </h3>
                                {investigation.mode !== 'included' ? (
                                    <Button
                                        variant="outline"
                                        className="min-h-11"
                                        onClick={() => find('', 'included')}
                                    >
                                        Kembali ke bucket
                                    </Button>
                                ) : (
                                    !data.approval &&
                                    data.capabilities.review && (
                                        <Button
                                            className="min-h-11"
                                            onClick={() =>
                                                find('', 'unassigned')
                                            }
                                        >
                                            Tambah resi dari pool
                                        </Button>
                                    )
                                )}
                            </div>
                            {taskId && (
                                <ReconciliationInvestigation
                                    key={`${taskId}-${investigation.category}-${investigation.mode}-${!!data.approval}`}
                                    simple
                                    workspace={data}
                                    taskId={taskId}
                                    timezone={timezone}
                                    refresh={async (count) => {
                                        await refresh();
                                        find('', 'included');
                                        setNotice(
                                            `${count} AWB diperbarui. Rekonsiliasi dihitung ulang otomatis.`,
                                        );
                                    }}
                                    initialCategory={investigation.category}
                                    mode={
                                        data.approval &&
                                        investigation.mode === 'included'
                                            ? 'snapshot'
                                            : investigation.mode
                                    }
                                    changeMode={(mode) => find('', mode)}
                                />
                            )}
                        </section>
                        {data.coverage.required_for_lock !== false &&
                            data.coverage.status !== 'COMPLETE' && (
                                <Alert>
                                    <AlertTitle>
                                        {data.coverage.status === 'FAILED'
                                            ? 'Pemrosesan sumber gagal'
                                            : 'Menunggu kelengkapan sumber'}
                                    </AlertTitle>
                                    <AlertDescription>
                                        {data.coverage.status === 'FAILED'
                                            ? 'Periksa kegagalan report terkait.'
                                            : 'Sistem mengevaluasi ulang saat bukti sumber baru tersedia.'}
                                        <Button
                                            variant="link"
                                            className="h-auto p-0"
                                            onClick={() => {
                                                setSection('sources');
                                                setAdvancedOpen(true);
                                            }}
                                        >
                                            Periksa report dan cakupan
                                        </Button>
                                    </AlertDescription>
                                </Alert>
                            )}
                        {data.post_lock_review && (
                            <Alert variant="destructive">
                                <AlertTitle>
                                    Bukti berubah setelah lock
                                </AlertTitle>
                                <AlertDescription>
                                    Snapshot versi {data.approval?.version}{' '}
                                    dipertahankan. Tinjau bukti terkini sebelum
                                    koreksi.
                                </AlertDescription>
                            </Alert>
                        )}
                        <Disclosure
                            open={advancedOpen}
                            onToggle={(event) =>
                                setAdvancedOpen(event.currentTarget.open)
                            }
                        >
                            <DisclosureSummary>
                                Detail lanjutan &amp; riwayat
                            </DisclosureSummary>
                            <div className="flex flex-col gap-1.5 sm:hidden">
                                <Label htmlFor="workspace-mobile-section">
                                    Bagian workspace
                                </Label>
                                <NativeSelect
                                    id="workspace-mobile-section"
                                    value={section}
                                    onChange={(event) =>
                                        setSection(event.target.value)
                                    }
                                >
                                    {sections.map(([value, label]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </NativeSelect>
                            </div>
                            <ToggleGroup
                                type="single"
                                value={section}
                                onValueChange={(value) =>
                                    value && setSection(value)
                                }
                                variant="outline"
                                aria-label="Bagian workspace"
                                className="hidden flex-wrap justify-start gap-1 sm:flex"
                            >
                                {sections.map(([value, label]) => (
                                    <ToggleGroupItem
                                        key={value}
                                        id={`workspace-section-${value}`}
                                        value={value}
                                        className="min-h-11 min-w-fit flex-1 whitespace-nowrap"
                                    >
                                        {label}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                            <section
                                aria-labelledby={`workspace-section-${section}`}
                                className="min-w-0"
                            >
                                {section === 'overview' && (
                                    <div className="flex flex-col gap-4">
                                        <WorkspaceSummary workspace={data} />
                                        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                                            {[
                                                [
                                                    'Perhitungan terakhir',
                                                    time(
                                                        data.header
                                                            .evaluated_at,
                                                    ),
                                                ],
                                                [
                                                    'Import bukti terakhir',
                                                    time(
                                                        data.header
                                                            .last_import_at,
                                                    ),
                                                ],
                                                [
                                                    'Evaluasi / koreksi terakhir',
                                                    data.header.last_reviewer ??
                                                        'Belum ditinjau',
                                                ],
                                                [
                                                    'Penguncian',
                                                    data.approval
                                                        ? `${data.approval.reviewer.name} · ${time(data.approval.locked_at)}`
                                                        : 'Belum dikunci',
                                                ],
                                            ].map(([label, value]) => (
                                                <div key={label}>
                                                    <dt className="text-muted-foreground">
                                                        {label}
                                                    </dt>
                                                    <dd>{value}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                        <Disclosure>
                                            <DisclosureSummary>
                                                Account dan nama pengirim
                                                terpetakan
                                            </DisclosureSummary>
                                            {data.header.account_mappings
                                                .length ? (
                                                data.header.account_mappings.map(
                                                    (mapping, index) => (
                                                        <p
                                                            key={index}
                                                            className="py-1 text-sm"
                                                        >
                                                            {
                                                                mapping.shipper_name
                                                            }{' '}
                                                            ·{' '}
                                                            {mapping.account_scope ??
                                                                'Tanpa batas account'}
                                                        </p>
                                                    ),
                                                )
                                            ) : (
                                                <p className="p-2 text-sm text-muted-foreground">
                                                    Tidak ada pemetaan account
                                                    khusus yang tersedia.
                                                </p>
                                            )}
                                        </Disclosure>
                                        <Button
                                            variant="outline"
                                            disabled={!enabled}
                                            onClick={() =>
                                                taskId &&
                                                router.post(
                                                    automation.recheck.url(
                                                        taskId,
                                                    ),
                                                    {},
                                                    {
                                                        preserveScroll: true,
                                                        onSuccess: () =>
                                                            setNotice(
                                                                'Validasi masuk antrean. Segarkan setelah worker selesai.',
                                                            ),
                                                    },
                                                )
                                            }
                                        >
                                            Antrekan validasi ulang
                                        </Button>
                                    </div>
                                )}
                                {section === 'categories' && (
                                    <div className="flex flex-col gap-3">
                                        {reconciliationCategories.map(
                                            ([key, label]) => {
                                                const row =
                                                    data.categories[key];
                                                return (
                                                    <Disclosure key={key} open>
                                                        <DisclosureSummary>
                                                            {label} ·{' '}
                                                            {workspaceLabels[
                                                                row?.status
                                                            ] ??
                                                                row?.status ??
                                                                'Belum dihitung'}
                                                        </DisclosureSummary>
                                                        <dl className="grid grid-cols-3 gap-3 p-3 text-sm sm:grid-cols-6">
                                                            {[
                                                                [
                                                                    'POP',
                                                                    row?.pop,
                                                                ],
                                                                [
                                                                    'Gudang',
                                                                    row?.received,
                                                                ],
                                                                [
                                                                    'Ditemukan',
                                                                    row?.observed,
                                                                ],
                                                                [
                                                                    'Cocok',
                                                                    row?.confirmed,
                                                                ],
                                                                [
                                                                    'Kurang',
                                                                    row?.shortfall,
                                                                ],
                                                                [
                                                                    'Lebih',
                                                                    row?.excess,
                                                                ],
                                                            ].map(
                                                                ([
                                                                    name,
                                                                    value,
                                                                ]) => (
                                                                    <div
                                                                        key={String(
                                                                            name,
                                                                        )}
                                                                    >
                                                                        <dt className="text-xs text-muted-foreground">
                                                                            {
                                                                                name
                                                                            }
                                                                        </dt>
                                                                        <dd className="font-medium tabular-nums">
                                                                            {quantity(
                                                                                value as
                                                                                    | number
                                                                                    | null,
                                                                            )}
                                                                        </dd>
                                                                    </div>
                                                                ),
                                                            )}
                                                        </dl>
                                                        <div className="flex flex-col gap-2 px-3 pb-3">
                                                            {data.members.map(
                                                                (member) => (
                                                                    <div
                                                                        key={
                                                                            member.id
                                                                        }
                                                                        className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs"
                                                                    >
                                                                        <span>
                                                                            {
                                                                                member.reference
                                                                            }{' '}
                                                                            ·
                                                                            POP{' '}
                                                                            {member
                                                                                .pop?.[
                                                                                key
                                                                            ] ??
                                                                                '—'}{' '}
                                                                            /
                                                                            gudang{' '}
                                                                            {member
                                                                                .handover?.[
                                                                                key
                                                                            ] ??
                                                                                '—'}
                                                                        </span>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            onClick={() =>
                                                                                void openLegacy(
                                                                                    member.id,
                                                                                )
                                                                            }
                                                                        >
                                                                            Buku
                                                                            &
                                                                            pending
                                                                        </Button>
                                                                    </div>
                                                                ),
                                                            )}
                                                            <Button
                                                                variant="outline"
                                                                onClick={() =>
                                                                    find(
                                                                        key,
                                                                        'included',
                                                                    )
                                                                }
                                                            >
                                                                Lihat AWB
                                                                kategori
                                                            </Button>
                                                        </div>
                                                    </Disclosure>
                                                );
                                            },
                                        )}
                                    </div>
                                )}
                                {section === 'discrepancies' && (
                                    <div className="flex flex-col gap-3">
                                        {data.discrepancies.length ? (
                                            data.discrepancies.map(
                                                (item, index) => (
                                                    <article
                                                        key={index}
                                                        className="flex flex-col gap-2 rounded-md border p-3"
                                                    >
                                                        <div className="flex flex-wrap gap-2">
                                                            <Badge variant="outline">
                                                                {item.type}
                                                            </Badge>
                                                            {item.category && (
                                                                <span className="text-sm">
                                                                    {
                                                                        item.category
                                                                    }
                                                                </span>
                                                            )}
                                                        </div>
                                                        {item.reason && (
                                                            <p className="text-sm">
                                                                {item.reason}
                                                            </p>
                                                        )}
                                                        {item.expected !=
                                                            null && (
                                                            <p className="text-sm">
                                                                Target{' '}
                                                                {item.expected}{' '}
                                                                · cocok{' '}
                                                                {item.observed}{' '}
                                                                · selisih{' '}
                                                                {
                                                                    item.difference
                                                                }
                                                            </p>
                                                        )}
                                                        <p className="text-xs text-muted-foreground">
                                                            {item.next_action}
                                                        </p>
                                                        {!!item.affected_awbs
                                                            ?.length && (
                                                            <div
                                                                className="flex flex-wrap gap-2"
                                                                aria-label="AWB terkait"
                                                            >
                                                                {item.affected_awbs.map(
                                                                    (awb) => (
                                                                        <Button
                                                                            key={
                                                                                awb.id
                                                                            }
                                                                            variant="link"
                                                                            size="sm"
                                                                            onClick={(
                                                                                event,
                                                                            ) => {
                                                                                relatedAwbOrigin.current =
                                                                                    event.currentTarget;
                                                                                setRelatedAwb(
                                                                                    awb.id,
                                                                                );
                                                                            }}
                                                                        >
                                                                            {
                                                                                awb.awb
                                                                            }
                                                                        </Button>
                                                                    ),
                                                                )}
                                                                {item.affected_count !==
                                                                    undefined &&
                                                                    item.affected_count >
                                                                        item
                                                                            .affected_awbs
                                                                            .length && (
                                                                        <span className="text-xs text-muted-foreground">
                                                                            Menampilkan{' '}
                                                                            {
                                                                                item
                                                                                    .affected_awbs
                                                                                    .length
                                                                            }{' '}
                                                                            dari{' '}
                                                                            {
                                                                                item.affected_count
                                                                            }{' '}
                                                                            AWB
                                                                            terkait.
                                                                        </span>
                                                                    )}
                                                            </div>
                                                        )}
                                                        <div className="flex flex-wrap gap-2">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() =>
                                                                    find(
                                                                        item.category,
                                                                    )
                                                                }
                                                            >
                                                                Cari kandidat
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() =>
                                                                    setSection(
                                                                        item.type ===
                                                                            'SOURCE_INCOMPLETE'
                                                                            ? 'sources'
                                                                            : 'categories',
                                                                    )
                                                                }
                                                            >
                                                                Bukti terkait
                                                            </Button>
                                                        </div>
                                                    </article>
                                                ),
                                            )
                                        ) : (
                                            <p className="py-6 text-sm">
                                                Tidak ada selisih pemblokir
                                                berdasarkan bukti terkini.
                                            </p>
                                        )}
                                    </div>
                                )}
                                {section === 'sources' && (
                                    <div className="flex flex-col gap-3">
                                        {data.coverage.members.map((member) => (
                                            <Disclosure key={member.task_id}>
                                                <DisclosureSummary>
                                                    PCK-{member.task_id} ·{' '}
                                                    {member.complete
                                                        ? 'Cakupan terbukti'
                                                        : 'Belum terbukti'}
                                                </DisclosureSummary>
                                                <div className="p-3 text-sm">
                                                    <p>{member.method}</p>
                                                    {member.reasons.map(
                                                        (value) => (
                                                            <p key={value}>
                                                                {value}
                                                            </p>
                                                        ),
                                                    )}
                                                    <p>
                                                        Report:{' '}
                                                        {member.reports.join(
                                                            ', ',
                                                        ) || 'Belum ditetapkan'}
                                                    </p>
                                                </div>
                                            </Disclosure>
                                        ))}
                                        {!data.coverage.requirements.length && (
                                            <p className="text-sm text-muted-foreground">
                                                Kebutuhan report belum
                                                ditetapkan oleh kontrak sumber
                                                terverifikasi. Status tetap
                                                UNKNOWN.
                                            </p>
                                        )}
                                        {data.coverage.requirements.map(
                                            (item, index) => (
                                                <article
                                                    key={index}
                                                    className="flex flex-col gap-2 rounded-md border p-3"
                                                >
                                                    <div className="flex flex-wrap justify-between gap-2">
                                                        <h3 className="text-sm font-medium break-all">
                                                            {item.requirement}
                                                        </h3>
                                                        <Badge variant="outline">
                                                            {item.coverage_verified
                                                                ? 'Cakupan terbukti'
                                                                : item.status}
                                                        </Badge>
                                                    </div>
                                                    <dl className="grid grid-cols-2 gap-2 text-xs">
                                                        {[
                                                            [
                                                                'Tanggal',
                                                                item.date,
                                                            ],
                                                            [
                                                                'Report',
                                                                item.report_id
                                                                    ? `#${item.report_id}`
                                                                    : 'Tidak tersedia',
                                                            ],
                                                            [
                                                                'Import',
                                                                item.import_status ??
                                                                    'Tidak tersedia',
                                                            ],
                                                            [
                                                                'Proyeksi',
                                                                item.projection_status ??
                                                                    'Tidak tersedia',
                                                            ],
                                                            [
                                                                'Percobaan terakhir',
                                                                time(
                                                                    item.last_attempt_at,
                                                                ),
                                                            ],
                                                            [
                                                                'Import sukses terakhir',
                                                                time(
                                                                    item.last_success_at,
                                                                ),
                                                            ],
                                                            [
                                                                'Baris CSV',
                                                                quantity(
                                                                    item.record_count,
                                                                ),
                                                            ],
                                                        ].map(
                                                            ([key, value]) => (
                                                                <div key={key}>
                                                                    <dt className="text-muted-foreground">
                                                                        {key}
                                                                    </dt>
                                                                    <dd>
                                                                        {value}
                                                                    </dd>
                                                                </div>
                                                            ),
                                                        )}
                                                    </dl>
                                                    {item.blocking_reasons.map(
                                                        (reason) => (
                                                            <p
                                                                key={reason}
                                                                className="text-sm text-muted-foreground"
                                                            >
                                                                {reason}
                                                            </p>
                                                        ),
                                                    )}
                                                    <p className="text-xs text-muted-foreground">
                                                        {item.linked_awb_count}{' '}
                                                        AWB dari bucket ini
                                                        tercatat dalam report.
                                                    </p>
                                                    {item.failure_reason && (
                                                        <p className="text-sm text-destructive">
                                                            {
                                                                item.failure_reason
                                                            }
                                                        </p>
                                                    )}
                                                    {item.report_id && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            asChild
                                                        >
                                                            <Link
                                                                href={reportRun.url(
                                                                    {
                                                                        query: {
                                                                            run_id:
                                                                                item.run_id ??
                                                                                item.report_id,
                                                                        },
                                                                    },
                                                                )}
                                                            >
                                                                Lihat tarikan &
                                                                log
                                                            </Link>
                                                        </Button>
                                                    )}
                                                    <Disclosure>
                                                        <DisclosureSummary>
                                                            Checksum bukti
                                                        </DisclosureSummary>
                                                        <p className="p-2 text-xs break-all">
                                                            {item.checksum ??
                                                                'Tidak tersedia'}
                                                        </p>
                                                    </Disclosure>
                                                </article>
                                            ),
                                        )}
                                    </div>
                                )}
                                {section === 'documents' && (
                                    <div className="flex flex-col gap-5">
                                        {taskId && (
                                            <DocumentDeliveryPanel
                                                key={taskId}
                                                taskId={taskId}
                                            />
                                        )}
                                        <section className="flex flex-col gap-3">
                                            <h3 className="font-medium">
                                                Dokumen rekonsiliasi
                                            </h3>
                                            <p className="text-xs text-muted-foreground">
                                                Persetujuan workspace:{' '}
                                                {data.eligible
                                                    ? 'memenuhi syarat'
                                                    : data.blockers.join(' ')}
                                            </p>
                                            {!data.documents.data.length && (
                                                <p className="text-sm">
                                                    Belum ada dokumen.
                                                </p>
                                            )}
                                            {data.documents.data.map(
                                                (document) => (
                                                    <article
                                                        key={document.id}
                                                        className="flex flex-col gap-2 rounded-md border p-3"
                                                    >
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <span className="text-sm font-medium">
                                                                Excel & PDF ·
                                                                versi{' '}
                                                                {
                                                                    document.revision
                                                                }
                                                            </span>
                                                            <Badge variant="outline">
                                                                {
                                                                    document.status
                                                                }
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">
                                                            {time(
                                                                document.created_at,
                                                            )}
                                                        </p>
                                                        {document.last_error && (
                                                            <p className="text-sm text-destructive">
                                                                {
                                                                    document.last_error
                                                                }
                                                            </p>
                                                        )}
                                                        <div className="flex gap-2">
                                                            {(
                                                                [
                                                                    'xlsx',
                                                                    'pdf',
                                                                ] as const
                                                            ).map(
                                                                (extension) =>
                                                                    document[
                                                                        `${extension}_path`
                                                                    ] ? (
                                                                        <Button
                                                                            key={
                                                                                extension
                                                                            }
                                                                            variant="outline"
                                                                            size="sm"
                                                                            asChild
                                                                        >
                                                                            <a
                                                                                href={automation.download.url(
                                                                                    {
                                                                                        task: document.pickup_task_id,
                                                                                        manifest:
                                                                                            document.id,
                                                                                        format: extension,
                                                                                    },
                                                                                )}
                                                                            >
                                                                                Unduh{' '}
                                                                                {extension.toUpperCase()}
                                                                            </a>
                                                                        </Button>
                                                                    ) : (
                                                                        <span
                                                                            key={
                                                                                extension
                                                                            }
                                                                            className="text-xs text-muted-foreground"
                                                                        >
                                                                            {extension.toUpperCase()}{' '}
                                                                            belum
                                                                            tersedia
                                                                        </span>
                                                                    ),
                                                            )}
                                                        </div>
                                                    </article>
                                                ),
                                            )}
                                            <ReconciliationPager
                                                page={data.documents}
                                                change={(document_page) =>
                                                    void load({ document_page })
                                                }
                                            />
                                            <Disclosure>
                                                <DisclosureSummary>
                                                    Aturan dokumen yang sudah
                                                    ada
                                                </DisclosureSummary>
                                                <p className="p-3 text-xs text-muted-foreground">
                                                    Dokumen dibuat setelah
                                                    baseline, atribusi, sumber,
                                                    dan kategori terverifikasi.
                                                    Bukti pasca-lock yang
                                                    bertentangan menahan
                                                    pembuatan dan pengiriman
                                                    lanjutan.
                                                </p>
                                            </Disclosure>
                                        </section>
                                        <section className="flex flex-col gap-3 border-t pt-4">
                                            <h3 className="font-medium">
                                                Pengiriman ke customer
                                            </h3>
                                            <p className="text-sm">
                                                Preferensi:{' '}
                                                {data.delivery.preference
                                                    ?.enabled
                                                    ? 'Aktif'
                                                    : 'Nonaktif'}{' '}
                                                ·{' '}
                                                {data.delivery.preference?.email_recipients?.join(
                                                    ', ',
                                                ) ??
                                                    data.delivery.preference
                                                        ?.recipient ??
                                                    'Tujuan belum diatur'}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                Pengiriman sistem{' '}
                                                {data.delivery.send_enabled
                                                    ? 'diaktifkan'
                                                    : 'dinonaktifkan'}
                                                .
                                            </p>
                                            {data.documents.data
                                                .flatMap(
                                                    (document) =>
                                                        document.deliveries,
                                                )
                                                .map((delivery) => (
                                                    <div
                                                        key={delivery.id}
                                                        className="rounded-md border p-3 text-xs"
                                                    >
                                                        <p>
                                                            {delivery.recipient}{' '}
                                                            · {delivery.status}
                                                        </p>
                                                        <p>
                                                            {time(
                                                                delivery.created_at,
                                                            )}
                                                        </p>
                                                        {delivery.last_error && (
                                                            <p className="text-destructive">
                                                                {
                                                                    delivery.last_error
                                                                }
                                                            </p>
                                                        )}
                                                        {data.capabilities
                                                            .review &&
                                                            taskId &&
                                                            delivery.status ===
                                                                'FAILED' && (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() =>
                                                                        router.post(
                                                                            automation.retryEmail.url(
                                                                                {
                                                                                    task: taskId,
                                                                                    delivery:
                                                                                        delivery.id,
                                                                                },
                                                                            ),
                                                                            {},
                                                                            {
                                                                                preserveScroll: true,
                                                                                onSuccess:
                                                                                    () =>
                                                                                        void refresh(),
                                                                            },
                                                                        )
                                                                    }
                                                                >
                                                                    Coba ulang
                                                                    email ini
                                                                </Button>
                                                            )}
                                                    </div>
                                                ))}
                                            {detail && (
                                                <DeliveryPreference
                                                    detail={detail}
                                                    saved={() => void refresh()}
                                                />
                                            )}
                                        </section>
                                    </div>
                                )}
                                {section === 'history' && (
                                    <div className="flex flex-col gap-4">
                                        <section className="flex flex-col gap-3 rounded-md border p-3">
                                            <h3 className="font-medium">
                                                Penguncian & snapshot
                                            </h3>
                                            {data.approval ? (
                                                <>
                                                    <p className="text-sm">
                                                        Versi{' '}
                                                        {data.approval.version}{' '}
                                                        ·{' '}
                                                        {
                                                            data.approval
                                                                .included_count
                                                        }{' '}
                                                        AWB ·{' '}
                                                        {
                                                            data.approval
                                                                .reviewer.name
                                                        }
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {time(
                                                            data.approval
                                                                .locked_at,
                                                        )}{' '}
                                                        · {data.approval.reason}
                                                    </p>
                                                    <Button
                                                        variant="outline"
                                                        disabled={
                                                            write.processing
                                                        }
                                                        onClick={() =>
                                                            find('', 'snapshot')
                                                        }
                                                    >
                                                        Lihat AWB snapshot
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="text-sm">
                                                        Sistem akan mengunci
                                                        otomatis setelah seluruh
                                                        syarat terpenuhi.
                                                    </p>
                                                    {data.blockers.map(
                                                        (value) => (
                                                            <p
                                                                key={value}
                                                                className="text-xs text-muted-foreground"
                                                            >
                                                                • {value}
                                                            </p>
                                                        ),
                                                    )}
                                                </>
                                            )}
                                            {!data.schema_ready && (
                                                <p className="text-sm text-muted-foreground">
                                                    Snapshot menunggu penerapan
                                                    migrasi.
                                                </p>
                                            )}
                                            {data.approval && (
                                                <>
                                                    <div className="flex flex-col gap-1.5">
                                                        <Label htmlFor="workspace-lock-reason">
                                                            Alasan membuka
                                                            koreksi
                                                        </Label>
                                                        <Input
                                                            id="workspace-lock-reason"
                                                            value={reason}
                                                            maxLength={500}
                                                            onChange={(event) =>
                                                                setReason(
                                                                    event.target
                                                                        .value,
                                                                )
                                                            }
                                                        />
                                                    </div>
                                                    <Button
                                                        variant="outline"
                                                        disabled={
                                                            write.processing ||
                                                            !data.capabilities
                                                                .lock ||
                                                            reason.trim()
                                                                .length < 5
                                                        }
                                                        onClick={() =>
                                                            setConfirmation(
                                                                'REOPEN',
                                                            )
                                                        }
                                                    >
                                                        <LockKeyhole /> Buka
                                                        review resmi
                                                    </Button>
                                                </>
                                            )}
                                        </section>
                                        <h3 className="font-medium">
                                            Riwayat keputusan
                                        </h3>
                                        {data.history.data.map((event) => {
                                            let snapshot: {
                                                event?: string;
                                                status?: string;
                                                reason?: string;
                                                reasons?: string[];
                                                reviewer?: { name: string };
                                            } = {};
                                            try {
                                                snapshot =
                                                    typeof event.snapshot ===
                                                    'string'
                                                        ? JSON.parse(
                                                              event.snapshot,
                                                          )
                                                        : event.snapshot;
                                            } catch {
                                                /* Source audit remains stored on the server. */
                                            }
                                            return (
                                                <article
                                                    key={event.id}
                                                    className="rounded-md border p-3 text-sm"
                                                >
                                                    <div className="flex flex-wrap justify-between gap-2">
                                                        <strong>
                                                            #{event.revision} ·{' '}
                                                            {snapshot.event ??
                                                                snapshot.status ??
                                                                'Evaluasi'}
                                                        </strong>
                                                        <span className="text-xs text-muted-foreground">
                                                            {time(
                                                                event.created_at,
                                                            )}
                                                        </span>
                                                    </div>
                                                    <p>
                                                        {snapshot.reviewer
                                                            ?.name ??
                                                            'Sistem'}{' '}
                                                        ·{' '}
                                                        {snapshot.reason ??
                                                            snapshot.reasons?.join(
                                                                ' ',
                                                            ) ??
                                                            'Perhitungan bukti tersimpan.'}
                                                    </p>
                                                </article>
                                            );
                                        })}
                                        <ReconciliationPager
                                            page={data.history}
                                            change={(history_page) =>
                                                void load({ history_page })
                                            }
                                        />
                                    </div>
                                )}
                            </section>
                        </Disclosure>
                    </div>
                )}
            </div>
            <Dialog
                open={!!confirmation}
                onOpenChange={(open) =>
                    !open && !write.processing && setConfirmation(null)
                }
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {confirmation === 'CLOSE_WITH_EXCEPTION'
                                ? 'Tutup buku dengan penjelasan?'
                                : 'Buka review resmi?'}
                        </DialogTitle>
                        <DialogDescription>
                            {confirmation === 'CLOSE_WITH_EXCEPTION' ? (
                                'Rekonsiliasi diselesaikan dengan jumlah saat ini. Laporan resi dan penjelasan selisih diproses melalui pengiriman customer yang sudah dikonfigurasi.'
                            ) : (
                                <>
                                    Snapshot lama tetap tersedia dalam riwayat.
                                    Setelah koreksi sah, sistem menghitung ulang
                                    dan mengunci otomatis jika seluruh syarat
                                    terpenuhi.
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    {confirmation === 'CLOSE_WITH_EXCEPTION' ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="closure-reason-code">
                                    Alasan selisih
                                </Label>
                                <NativeSelect
                                    id="closure-reason-code"
                                    value={reasonCode}
                                    onChange={(event) =>
                                        setReasonCode(event.target.value)
                                    }
                                    disabled={write.processing}
                                    aria-invalid={!!write.errors.reason_code}
                                >
                                    <option value="">Pilih alasan</option>
                                    <option value="PENDING_GOODS">
                                        Barang pending
                                    </option>
                                    <option value="CUSTOMER_REQUEST">
                                        Permintaan customer
                                    </option>
                                    <option value="WRONG_CODE">
                                        Salah kode
                                    </option>
                                    <option value="OTHER">Lainnya</option>
                                </NativeSelect>
                                {write.errors.reason_code && (
                                    <p
                                        role="alert"
                                        className="text-sm text-destructive"
                                    >
                                        {write.errors.reason_code}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="closure-explanation">
                                    Penjelasan untuk customer
                                </Label>
                                <Textarea
                                    id="closure-explanation"
                                    value={reason}
                                    onChange={(event) =>
                                        setReason(event.target.value)
                                    }
                                    maxLength={500}
                                    rows={3}
                                    disabled={write.processing}
                                    aria-invalid={!!write.errors.reason}
                                    placeholder="Contoh: 1 paket pending atas permintaan customer…"
                                />
                                {write.errors.reason && (
                                    <p
                                        role="alert"
                                        className="text-sm text-destructive"
                                    >
                                        {write.errors.reason}
                                    </p>
                                )}
                            </div>
                            {data && (
                                <p className="text-sm">
                                    Laporan hanya memuat resi yang terkonfirmasi
                                    untuk buku ini. Jumlah POP dan selisih tetap
                                    tercatat.
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm">{reason}</p>
                    )}
                    <Button
                        disabled={
                            write.processing ||
                            (confirmation === 'CLOSE_WITH_EXCEPTION' &&
                                (!reasonCode || reason.trim().length < 5))
                        }
                        onClick={() => void lock()}
                    >
                        {write.processing
                            ? 'Menyimpan…'
                            : confirmation === 'CLOSE_WITH_EXCEPTION'
                              ? 'Tutup & proses laporan'
                              : 'Konfirmasi keputusan'}
                    </Button>
                </DialogContent>
            </Dialog>
            {taskId && (
                <ShipmentDetailSheet
                    id={relatedAwb}
                    origin={relatedAwbOrigin}
                    onClose={() => setRelatedAwb(null)}
                />
            )}
            <Dialog open={legacyOpen} onOpenChange={setLegacyOpen}>
                <DialogContent className="h-[90dvh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Buku pickup & pending</DialogTitle>
                        <DialogDescription>
                            Koreksi dan barang pending melalui alur yang sudah
                            ada.
                        </DialogDescription>
                    </DialogHeader>
                    <LegacyDetail
                        detail={legacy}
                        error={legacyError}
                        timezone={timezone}
                        enabled={enabled}
                        close={() => {
                            setLegacyOpen(false);
                            void refresh();
                        }}
                        reload={() => legacy && void openLegacy(legacy.task.id)}
                        loadPage={async (pages) => {
                            if (!taskId) return;
                            const value = await legacyRequest.get(
                                automation.show.url(taskId, {
                                    query: {
                                        view: 'pickup',
                                        member_task: legacy?.task.id,
                                        ...pages,
                                    },
                                }),
                            );
                            if (value) setLegacy(value);
                        }}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}

import { useEffect, useRef, useState } from 'react';
import { useHttp } from '@inertiajs/react';
import { HttpResponseError } from '@inertiajs/core';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeCheckbox } from '@/components/ui/native-checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Disclosure, DisclosureSummary } from '@/components/ui/disclosure';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { ReconciliationPager } from '@/components/pickup-reconciliation-detail';
import ReconciliationAwbEvidence from '@/components/reconciliation-awb-evidence';
import ShipmentDetailSheet from '@/components/jne-shipment-detail-sheet';
import {
    reconciliationCategories,
    reconciliationTime,
} from '@/lib/pickup-reconciliation';
import * as api from '@/routes/reconciliation-workspace';
import type { ReconciliationPage } from '@/types/pickup-reconciliation';
import type {
    Workspace,
    InvestigationAwb,
    SelectionBody,
    SelectionPreview,
} from '@/types/reconciliation-workspace';
export const categoryLabel = (value?: string | null) =>
    reconciliationCategories.find(([key]) => key === value)?.[1] ??
    'Tidak tersedia';
export function workspaceError(error: unknown): string {
    if (error instanceof HttpResponseError) {
        let data = error.response.data as
            | string
            | {
                  message?: string;
                  errors?: Record<string, string[]>;
              };
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch {
                return 'Server tidak memberikan respons yang dapat dibaca. Muat ulang atau coba lagi.';
            }
        }
        if (!data || typeof data !== 'object')
            return 'Permintaan gagal. Muat ulang atau coba lagi.';
        return (
            Object.values(data.errors ?? {})
                .flat()
                .join(' ') ||
            data.message ||
            'Permintaan gagal.'
        );
    }
    return 'Koneksi bermasalah. Muat ulang sebelum mencoba lagi.';
}
export function FilterField({
    id,
    label,
    value,
    set,
    options,
}: {
    id: string;
    label: string;
    value: string;
    set: (value: string) => void;
    options: [string, string][];
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <NativeSelect
                id={id}
                className="min-h-11"
                value={value}
                onChange={(event) => set(event.target.value)}
            >
                {options.map(([key, text]) => (
                    <option key={key} value={key}>
                        {text}
                    </option>
                ))}
            </NativeSelect>
        </div>
    );
}
const defaults = {
    q: '',
    account: '',
    category: '',
    source: '',
    report: '',
    matching: '',
    date: '',
    mode: 'exceptions',
};
export default function ReconciliationInvestigation({
    workspace,
    taskId,
    timezone,
    refresh,
    initialCategory = '',
    mode = 'exceptions',
    simple = false,
    changeMode,
}: {
    workspace: Workspace;
    taskId: number;
    timezone: string;
    refresh: (count: number) => Promise<void>;
    initialCategory?: string;
    mode?: string;
    simple?: boolean;
    changeMode?: (mode: string) => void;
}) {
    const [filters, setFilters] = useState({
            ...defaults,
            category: initialCategory,
            mode,
        }),
        [applied, setApplied] = useState(filters),
        [page, setPage] = useState(1);
    const [reloadVersion, setReloadVersion] = useState(0);
    const [rows, setRows] =
            useState<ReconciliationPage<InvestigationAwb> | null>(null),
        [selected, setSelected] = useState<Record<number, InvestigationAwb>>(
            {},
        );
    const [target, setTarget] = useState(workspace.members[0]?.id ?? 0),
        [reason, setReason] = useState(''),
        [action, setAction] = useState(
            mode === 'exceptions'
                ? 'CONFIRM'
                : mode === 'included'
                  ? 'REMOVE'
                  : mode === 'candidates'
                    ? 'REASSIGN'
                    : 'ADD',
        );
    const [error, setError] = useState(''),
        [saving, setSaving] = useState(false),
        [notice, setNotice] = useState(''),
        [technical, setTechnical] = useState(false),
        [awbId, setAwbId] = useState<number | null>(null);
    const [evidenceId, setEvidenceId] = useState<number | null>(null);
    const awbOrigin = useRef<HTMLElement | null>(null);
    const [preview, setPreview] = useState<SelectionPreview | null>(null),
        [body, setBody] = useState<SelectionBody | null>(null);
    const reasonRef = useRef<HTMLInputElement>(null);
    const request = useHttp<
        Record<string, never>,
        ReconciliationPage<InvestigationAwb>
    >({});
    const write = useHttp<SelectionBody, SelectionPreview>({} as SelectionBody);
    const updating = write.processing || saving;
    useEffect(() => {
        setRows(null);
        setError('');
        void request
            .get(api.awbs.url(taskId, { query: { ...applied, page } }))
            .then((value) => {
                if (value) setRows(value);
            })
            .catch((failure) => setError(workspaceError(failure)));
        return () => request.cancel();
    }, [taskId, applied, page, reloadVersion]);
    const choose = (row: InvestigationAwb, checked: boolean) =>
        setSelected((previous) => {
            const next = { ...previous };
            if (checked && Object.keys(next).length < 100) next[row.id] = row;
            else if (!checked) delete next[row.id];
            return next;
        });
    const createPreview = async () => {
        if (reason.trim().length < 5) {
            setError('Isi alasan dan referensi bukti, minimal 5 karakter.');
            reasonRef.current?.focus();
            return;
        }
        const member = workspace.members.find((item) => item.id === target);
        if (!member) return;
        const data: SelectionBody = {
            action,
            expected_revision: workspace.version,
            expected_version: member.input_version,
            target_task_id: target,
            reason,
            items: Object.values(selected).map((row) => ({
                id: row.id,
                version: row.version,
            })),
        };
        write.transform(() => data);
        setError('');
        setNotice('');
        try {
            const value = await write.post(api.preview.url(taskId));
            if (value) {
                setBody(data);
                setPreview(value);
            }
        } catch (failure) {
            setError(workspaceError(failure));
        }
    };
    const apply = async () => {
        if (!preview || !body || saving) return;
        setSaving(true);
        write.transform(() => ({
            ...body,
            preview_hash: preview.preview_hash,
        }));
        try {
            await write.post(api.apply.url(taskId));
            setPreview(null);
            setSelected({});
            setNotice(
                'Koreksi dan bukti tersimpan. Jumlah POP/handover tetap.',
            );
            await refresh(body.items.length);
            setApplied({ ...applied });
            setReloadVersion((value) => value + 1);
        } catch (failure) {
            setError(workspaceError(failure));
            setPreview(null);
        } finally {
            setSaving(false);
        }
    };
    const time = (value: string | null) =>
        value ? reconciliationTime(value, timezone) : 'Tidak tersedia';
    const locked = !!workspace.approval || applied.mode === 'snapshot';
    const impacts = preview?.items.reduce<Record<string, number>>(
        (counts, item) => {
            const before = workspace.members.some(
                (member) => member.id === item.before.pickup_task_id,
            );
            const after = workspace.members.some(
                (member) => member.id === item.after.pickup_task_id,
            );
            counts[item.category] =
                (counts[item.category] ?? 0) + Number(after) - Number(before);
            return counts;
        },
        {},
    );
    const actionLabel =
        action === 'REMOVE'
            ? 'Keluarkan'
            : action === 'REASSIGN'
              ? 'Pindahkan'
              : action === 'CONFIRM'
                ? 'Konfirmasi'
                : 'Masukkan';
    const rowAction = (row: InvestigationAwb) =>
        locked ? (
            <span className="text-xs text-muted-foreground">Terkunci</span>
        ) : (
            <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={updating || !workspace.capabilities.review}
                onClick={() => {
                    choose(row, true);
                    requestAnimationFrame(() => reasonRef.current?.focus());
                }}
            >
                {actionLabel}
            </Button>
        );
    const check = (row: InvestigationAwb) => (
        <label className="flex min-h-11 min-w-11 items-center justify-center md:min-h-0 md:min-w-0">
            <NativeCheckbox
                aria-label={`Pilih AWB ${row.awb}`}
                checked={!!selected[row.id]}
                disabled={
                    locked ||
                    !workspace.capabilities.review ||
                    updating ||
                    (!selected[row.id] && Object.keys(selected).length >= 100)
                }
                onChange={(event) => choose(row, event.target.checked)}
            />
        </label>
    );
    return (
        <div className="flex flex-col gap-4">
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {notice && (
                <p role="status" className="text-sm">
                    {notice}
                </p>
            )}
            <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                    event.preventDefault();
                    setApplied({ ...filters });
                    setPage(1);
                    setReloadVersion((value) => value + 1);
                }}
            >
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="workspace-search">
                        Cari resi, pengirim, atau penerima
                    </Label>
                    <div className="flex gap-2">
                        <Input
                            id="workspace-search"
                            className="min-h-11"
                            name="q"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="Nomor resi, nama pengirim, atau penerima…"
                            value={filters.q}
                            onChange={(event) =>
                                setFilters({
                                    ...filters,
                                    q: event.target.value,
                                })
                            }
                        />
                        <Button
                            className="min-h-11"
                            type="submit"
                            disabled={request.processing}
                        >
                            <Search />
                            Cari
                        </Button>
                    </div>
                </div>
                <Disclosure>
                    <DisclosureSummary>Filter lanjutan</DisclosureSummary>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {!simple && (
                            <FilterField
                                label="Daftar"
                                id="workspace-mode"
                                value={filters.mode}
                                set={(mode) => setFilters({ ...filters, mode })}
                                options={[
                                    ['exceptions', 'Perlu tindakan'],
                                    ['suggested', 'Rekomendasi berbukti'],
                                    ['included', 'Resi dalam bucket'],
                                    ['unassigned', 'Resi belum terikat'],
                                    ['candidates', 'Cari lintas buku'],
                                    ['excluded', 'Dikeluarkan'],
                                    ...(workspace.approval
                                        ? [
                                              [
                                                  'snapshot',
                                                  'Snapshot terkunci',
                                              ] as [string, string],
                                          ]
                                        : []),
                                ]}
                            />
                        )}
                        <FilterField
                            label="Kategori"
                            id="workspace-category"
                            value={filters.category}
                            set={(category) =>
                                setFilters({ ...filters, category })
                            }
                            options={[
                                ['', 'Semua kategori'],
                                ...reconciliationCategories.map(
                                    ([a, b]) => [a, b] as [string, string],
                                ),
                            ]}
                        />
                        <FilterField
                            label="Pencocokan"
                            id="workspace-matching"
                            value={filters.matching}
                            set={(matching) =>
                                setFilters({ ...filters, matching })
                            }
                            options={[
                                ['', 'Semua status'],
                                ['MATCHED', 'Cocok'],
                                ['UNMATCHED', 'Belum cocok'],
                                ['AMBIGUOUS', 'Ambigu'],
                                ['CONFLICT', 'Konflik'],
                            ]}
                        />
                    </div>
                    {simple && changeMode && !locked && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                                changeMode(
                                    applied.mode === 'candidates'
                                        ? 'unassigned'
                                        : 'candidates',
                                )
                            }
                        >
                            {applied.mode === 'candidates'
                                ? 'Lihat resi belum terikat'
                                : 'Cari resi di buku lain'}
                        </Button>
                    )}
                    <Disclosure>
                        <DisclosureSummary>
                            Filter sumber dan tanggal
                        </DisclosureSummary>
                        <div className="grid grid-cols-2 gap-3 p-3">
                            <FilterField
                                label="Sumber"
                                id="workspace-source"
                                value={filters.source}
                                set={(source) =>
                                    setFilters({ ...filters, source })
                                }
                                options={[
                                    ['', 'Semua sumber'],
                                    ['apex', 'APEX'],
                                    ['roberto', 'Hybrid PM'],
                                    ['nuralamt', 'Hybrid Puman'],
                                    ['hybrid', 'Gabungan Hybrid'],
                                ]}
                            />
                            {[
                                ['account', 'Account customer'],
                                ['report', 'Nomor report'],
                                ['date', 'Hari retail kandidat'],
                            ].map(([key, label]) => (
                                <div
                                    key={key}
                                    className="flex flex-col gap-1.5"
                                >
                                    <Label htmlFor={`workspace-${key}`}>
                                        {label}
                                    </Label>
                                    <Input
                                        id={`workspace-${key}`}
                                        type={
                                            key === 'date'
                                                ? 'date'
                                                : key === 'report'
                                                  ? 'number'
                                                  : 'text'
                                        }
                                        value={
                                            filters[
                                                key as
                                                    | 'account'
                                                    | 'report'
                                                    | 'date'
                                            ]
                                        }
                                        onChange={(event) =>
                                            setFilters({
                                                ...filters,
                                                [key]: event.target.value,
                                            })
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    </Disclosure>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="submit"
                            variant="outline"
                            disabled={request.processing}
                        >
                            Terapkan filter
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                                setFilters({
                                    ...defaults,
                                    mode,
                                    category: initialCategory,
                                });
                                setApplied({
                                    ...defaults,
                                    mode,
                                    category: initialCategory,
                                });
                                setPage(1);
                            }}
                        >
                            Reset
                        </Button>
                        <label className="ml-auto flex min-h-11 items-center gap-2 text-xs">
                            <NativeCheckbox
                                checked={technical}
                                onChange={(event) =>
                                    setTechnical(event.target.checked)
                                }
                            />
                            Kolom bukti
                        </label>
                    </div>
                </Disclosure>
            </form>
            {applied.mode === 'snapshot' && (
                <p className="text-sm">
                    Selesai · daftar resi tersimpan saat bucket dikunci.
                </p>
            )}
            {!rows && error ? (
                <Button
                    variant="outline"
                    onClick={() => setReloadVersion((value) => value + 1)}
                >
                    Coba muat AWB lagi
                </Button>
            ) : !rows ? (
                <div role="status">
                    <Skeleton className="h-48" />
                    <span className="sr-only">Memuat AWB…</span>
                </div>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p
                            role="status"
                            aria-live="polite"
                            className="text-xs text-muted-foreground"
                        >
                            {rows.total.toLocaleString('id-ID')} AWB
                            {!locked && (
                                <>
                                    {' '}
                                    · {Object.keys(selected).length}/100 dipilih
                                </>
                            )}
                        </p>
                        {!locked && (
                            <label className="flex min-h-11 items-center gap-2 text-sm">
                                <NativeCheckbox
                                    aria-label="Pilih halaman ini"
                                    checked={
                                        !!rows.data.length &&
                                        rows.data.every(
                                            (row) => !!selected[row.id],
                                        )
                                    }
                                    disabled={
                                        updating ||
                                        !workspace.capabilities.review ||
                                        !rows.data.length
                                    }
                                    onChange={(event) => {
                                        const checked = event.target.checked;
                                        setSelected((previous) => {
                                            const next = { ...previous };
                                            for (const row of rows.data) {
                                                if (!checked)
                                                    delete next[row.id];
                                                else if (
                                                    Object.keys(next).length <
                                                    100
                                                )
                                                    next[row.id] = row;
                                            }
                                            return next;
                                        });
                                    }}
                                />
                                Pilih halaman ini ({rows.data.length})
                            </label>
                        )}
                    </div>
                    <div className="hidden overflow-x-auto rounded-md border md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead
                                        className={
                                            locked ? 'hidden' : undefined
                                        }
                                    >
                                        <span className="sr-only">
                                            Pilih resi
                                        </span>
                                    </TableHead>
                                    <TableHead>AWB</TableHead>
                                    <TableHead>Pengirim (report)</TableHead>
                                    <TableHead>
                                        {applied.mode === 'suggested'
                                            ? 'Penerima'
                                            : 'Penerima (A–Z)'}
                                    </TableHead>
                                    <TableHead>Kategori</TableHead>
                                    {(!simple || technical) && (
                                        <>
                                            <TableHead>Pencocokan</TableHead>
                                            <TableHead>Sumber</TableHead>
                                        </>
                                    )}
                                    {simple && (
                                        <TableHead>
                                            {locked ? 'Status' : 'Aksi'}
                                        </TableHead>
                                    )}
                                    {technical && (
                                        <>
                                            <TableHead>Account</TableHead>
                                            <TableHead>
                                                Input / import
                                            </TableHead>
                                            <TableHead>
                                                Review / inklusi
                                            </TableHead>
                                        </>
                                    )}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.data.map((row) => (
                                    <TableRow key={row.id}>
                                        {!locked && (
                                            <TableCell>{check(row)}</TableCell>
                                        )}
                                        <TableCell>
                                            <Button
                                                variant="link"
                                                className="h-auto p-0"
                                                onClick={(event) => {
                                                    awbOrigin.current =
                                                        event.currentTarget;
                                                    setAwbId(row.id);
                                                }}
                                            >
                                                {row.awb}
                                            </Button>
                                        </TableCell>
                                        <TableCell className="min-w-40 text-xs whitespace-normal">
                                            {row.shipper_name ||
                                                'Tidak tersedia'}
                                        </TableCell>
                                        <TableCell className="min-w-40 text-xs whitespace-normal">
                                            {row.consignee_name ||
                                                'Tidak tersedia'}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {categoryLabel(row.category)}
                                        </TableCell>
                                        {(!simple || technical) && (
                                            <>
                                                <TableCell>
                                                    <Badge variant="outline">
                                                        {row.conflict
                                                            ? 'Konflik'
                                                            : row.match_status}
                                                    </Badge>
                                                    {row.recommendation && (
                                                        <p className="text-xs text-muted-foreground">
                                                            {row.recommendation}
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-muted-foreground">
                                                        {
                                                            row.customer_match_method
                                                        }{' '}
                                                        / {row.match_method}
                                                    </p>
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {row.source ??
                                                        'Tidak tersedia'}{' '}
                                                    #{row.report_id ?? '—'}
                                                    <p>
                                                        Baris{' '}
                                                        {row.source_row ?? '—'}{' '}
                                                        · bukti #
                                                        {row.source_id ?? '—'}
                                                    </p>
                                                    <Button
                                                        variant="link"
                                                        className="h-auto p-0 text-xs"
                                                        onClick={() =>
                                                            setEvidenceId(
                                                                row.id,
                                                            )
                                                        }
                                                    >
                                                        Bukti pencocokan
                                                    </Button>
                                                </TableCell>
                                            </>
                                        )}
                                        {simple && (
                                            <TableCell>
                                                {rowAction(row)}
                                                {row.conflict && (
                                                    <p className="text-xs text-destructive">
                                                        Terikat ke buku lain
                                                        atau bukti bertentangan
                                                    </p>
                                                )}
                                                {row.recommendation && (
                                                    <p className="text-xs text-muted-foreground">
                                                        {row.recommendation}
                                                    </p>
                                                )}
                                            </TableCell>
                                        )}
                                        {technical && (
                                            <>
                                                <TableCell>
                                                    {row.customer_account ??
                                                        '—'}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {time(row.entry_at)}
                                                    <p>
                                                        {time(row.imported_at)}
                                                    </p>
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {row.review_status}
                                                    <p>
                                                        {row.included
                                                            ? 'Termasuk'
                                                            : 'Tidak termasuk'}
                                                    </p>
                                                </TableCell>
                                            </>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="flex flex-col gap-2 md:hidden">
                        {rows.data.map((row) => (
                            <article
                                key={row.id}
                                className="flex items-start gap-3 rounded-md border p-3"
                            >
                                {!locked && check(row)}
                                <div className="min-w-0 flex-1">
                                    <Button
                                        variant="link"
                                        className="h-auto min-h-11 max-w-full p-0 break-all md:min-h-0"
                                        onClick={(event) => {
                                            awbOrigin.current =
                                                event.currentTarget;
                                            setAwbId(row.id);
                                        }}
                                    >
                                        {row.awb}
                                    </Button>
                                    <p className="text-xs break-words">
                                        Pengirim:{' '}
                                        {row.shipper_name || 'Tidak tersedia'}
                                    </p>
                                    <p className="text-xs break-words text-muted-foreground">
                                        Penerima:{' '}
                                        {row.consignee_name || 'Tidak tersedia'}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {categoryLabel(row.category)}
                                        {(!simple || technical) && (
                                            <>
                                                {' '}
                                                ·{' '}
                                                {row.source ??
                                                    'Tidak tersedia'}{' '}
                                                #{row.report_id ?? '—'}
                                            </>
                                        )}
                                    </p>
                                    {row.recommendation && (
                                        <p className="text-xs text-muted-foreground">
                                            {row.recommendation}
                                        </p>
                                    )}
                                    {(!simple || technical || row.conflict) && (
                                        <Badge variant="outline">
                                            {row.conflict
                                                ? 'Konflik'
                                                : row.match_status}
                                        </Badge>
                                    )}
                                    {simple && (
                                        <div className="mt-2">
                                            {rowAction(row)}
                                        </div>
                                    )}
                                    {(!simple || technical) && (
                                        <Button
                                            variant="link"
                                            className="mt-1 min-h-11 p-0 text-xs"
                                            onClick={() =>
                                                setEvidenceId(row.id)
                                            }
                                        >
                                            Bukti pencocokan
                                        </Button>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                    {!rows.data.length && (
                        <p
                            role="status"
                            className="py-8 text-center text-sm text-muted-foreground"
                        >
                            {applied.q ||
                            applied.category ||
                            applied.matching ||
                            applied.source ||
                            applied.account ||
                            applied.date ||
                            applied.report
                                ? 'Tidak ada resi sesuai filter.'
                                : applied.mode === 'included' ||
                                    applied.mode === 'snapshot'
                                  ? 'Belum ada resi dalam bucket ini.'
                                  : applied.mode === 'unassigned'
                                    ? 'Tidak ada resi belum terikat pada hari operasional ini.'
                                    : 'Tidak ada resi sesuai filter.'}
                        </p>
                    )}
                    <ReconciliationPager page={rows} change={setPage} />
                </>
            )}
            {!!Object.keys(selected).length && (
                <section
                    className="sticky bottom-0 flex flex-col gap-3 rounded-md border bg-card p-3 shadow-sm"
                    aria-label="Pilihan AWB"
                >
                    <div className="flex justify-between gap-2">
                        <strong className="text-sm">
                            {Object.keys(selected).length} AWB dipilih
                        </strong>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={updating}
                            onClick={() => setSelected({})}
                        >
                            Kosongkan
                        </Button>
                    </div>
                    <Disclosure>
                        <DisclosureSummary>
                            Lihat seluruh pilihan
                        </DisclosureSummary>
                        <ul className="max-h-32 overflow-y-auto p-2 text-xs">
                            {Object.values(selected).map((row) => (
                                <li key={row.id}>
                                    {row.awb} · {categoryLabel(row.category)} ·{' '}
                                    {row.customer?.name ?? 'Belum dipetakan'}
                                </li>
                            ))}
                        </ul>
                    </Disclosure>
                    {simple && (
                        <Disclosure>
                            <DisclosureSummary>Tindakan lain</DisclosureSummary>
                            <FilterField
                                label="Tindakan"
                                id="workspace-action"
                                value={action}
                                set={setAction}
                                options={[
                                    ['ADD', 'Masukkan ke pickup'],
                                    ['REMOVE', 'Keluarkan dari pickup'],
                                    ['REASSIGN', 'Pindahkan ke buku ini'],
                                    ['CONFIRM', 'Konfirmasi atribusi'],
                                ]}
                            />
                        </Disclosure>
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {!simple && (
                            <FilterField
                                label="Tindakan"
                                id="workspace-action"
                                value={action}
                                set={setAction}
                                options={[
                                    ['ADD', 'Masukkan ke pickup'],
                                    ['REMOVE', 'Keluarkan dari pickup'],
                                    ['REASSIGN', 'Pindahkan ke buku ini'],
                                    ['CONFIRM', 'Konfirmasi atribusi'],
                                ]}
                            />
                        )}
                        {(!simple ||
                            (workspace.members.length > 1 &&
                                action !== 'REMOVE')) && (
                            <FilterField
                                label="Buku pickup tujuan"
                                id="workspace-target"
                                value={String(target)}
                                set={(value) => setTarget(Number(value))}
                                options={workspace.members.map((member) => [
                                    String(member.id),
                                    member.reference,
                                ])}
                            />
                        )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="workspace-change-reason">
                            Alasan koreksi
                        </Label>
                        <Input
                            ref={reasonRef}
                            id="workspace-change-reason"
                            name="reason"
                            placeholder="Contoh: kode pengirim salah; penerima sesuai bukti pickup"
                            autoComplete="off"
                            aria-invalid={!!error && reason.trim().length < 5}
                            aria-describedby={
                                error && reason.trim().length < 5
                                    ? 'workspace-reason-error'
                                    : undefined
                            }
                            value={reason}
                            maxLength={500}
                            onChange={(event) => setReason(event.target.value)}
                        />
                        {error && reason.trim().length < 5 && (
                            <p
                                id="workspace-reason-error"
                                role="alert"
                                className="text-xs text-destructive"
                            >
                                Isi alasan dan referensi bukti, minimal 5
                                karakter.
                            </p>
                        )}
                    </div>
                    <Button
                        className="min-h-11"
                        disabled={updating || locked}
                        onClick={() => void createPreview()}
                    >
                        {updating
                            ? 'Memperbarui…'
                            : simple
                              ? `${actionLabel} ${Object.keys(selected).length} AWB`
                              : 'Tinjau pilihan'}
                    </Button>
                </section>
            )}
            <Dialog
                open={!!preview}
                onOpenChange={(open) => !open && !updating && setPreview(null)}
            >
                <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {simple
                                ? `${actionLabel} ${preview?.items.length} AWB${action === 'REMOVE' ? ' ke pool' : ' ke bucket'}?`
                                : `Tinjau koreksi ${preview?.items.length} AWB`}
                        </DialogTitle>
                        <DialogDescription>
                            {simple
                                ? `${workspace.header.customer.name} · ${workspace.header.business_date}`
                                : 'Periksa atribusi dan bukti. Jumlah POP/handover tidak diubah.'}
                        </DialogDescription>
                    </DialogHeader>
                    <p className="text-sm">
                        {body?.action === 'CONFIRM'
                            ? 'Konfirmasi pada'
                            : body?.action === 'ADD' ||
                                body?.action === 'REASSIGN'
                              ? 'Masukkan ke'
                              : 'Keluarkan dari'}{' '}
                        {
                            workspace.members.find(
                                (member) => member.id === body?.target_task_id,
                            )?.reference
                        }{' '}
                        · {body?.reason}
                    </p>
                    <Disclosure
                        open={
                            preview?.items.length === 1 ||
                            preview?.allowed === false
                        }
                    >
                        <DisclosureSummary>
                            {preview?.items.length} resi dipilih
                        </DisclosureSummary>
                        {preview?.items.map((item) => (
                            <article
                                key={item.id}
                                className="rounded-md border p-3 text-sm"
                            >
                                <strong>{item.awb}</strong>
                                {!simple && (
                                    <p>
                                        Customer{' '}
                                        {item.before_customer?.name ??
                                            'Belum dipetakan'}{' '}
                                        (
                                        {item.before_customer?.customer_code ??
                                            '—'}
                                        ) →{' '}
                                        {item.after_customer?.name ??
                                            'Belum dipetakan'}{' '}
                                        (
                                        {item.after_customer?.customer_code ??
                                            '—'}
                                        ) · pickup{' '}
                                        {item.before.pickup_task_id ?? '—'} →{' '}
                                        {item.after.pickup_task_id ?? '—'}
                                    </p>
                                )}
                                {simple && (
                                    <p className="text-xs text-muted-foreground">
                                        {selected[item.id]?.shipper_name ||
                                            'Pengirim tidak tersedia'}{' '}
                                        ·{' '}
                                        {selected[item.id]?.consignee_name ||
                                            'Penerima tidak tersedia'}{' '}
                                        · {categoryLabel(item.category)}
                                    </p>
                                )}
                                {!simple && (
                                    <p className="text-xs text-muted-foreground">
                                        {categoryLabel(item.category)} · report
                                        #{item.evidence.report_id} · bukti #
                                        {item.evidence.source_id} baris{' '}
                                        {item.evidence.source_row}
                                    </p>
                                )}
                                {item.conflicts.map((value) => (
                                    <p key={value} className="text-destructive">
                                        {value}
                                    </p>
                                ))}
                            </article>
                        ))}
                    </Disclosure>
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                        {Object.entries(impacts ?? {}).map(
                            ([category, delta]) => (
                                <div key={category}>
                                    <dt>{categoryLabel(category)}</dt>
                                    <dd>
                                        {simple && (
                                            <>
                                                {workspace.categories[category]
                                                    ?.observed ?? '—'}
                                                /
                                                {workspace.categories[category]
                                                    ?.expected ?? '—'}{' '}
                                                →{' '}
                                                {workspace.categories[category]
                                                    ?.observed == null
                                                    ? '—'
                                                    : workspace.categories[
                                                          category
                                                      ].observed + delta}
                                                /
                                                {workspace.categories[category]
                                                    ?.expected ?? '—'}{' '}
                                                ·{' '}
                                            </>
                                        )}
                                        {delta > 0 ? '+' : ''}
                                        {delta} ikatan AWB
                                    </dd>
                                </div>
                            ),
                        )}
                    </dl>
                    <p className="text-xs text-muted-foreground">
                        {preview?.lock_implications}
                    </p>
                    <Button
                        className="min-h-11"
                        disabled={!preview?.allowed || updating}
                        onClick={() => void apply()}
                    >
                        {updating
                            ? 'Memperbarui…'
                            : simple
                              ? `Konfirmasi ${actionLabel.toLowerCase()}`
                              : 'Konfirmasi koreksi'}
                    </Button>
                </DialogContent>
            </Dialog>
            <ShipmentDetailSheet
                id={awbId}
                origin={awbOrigin}
                onClose={() => setAwbId(null)}
            />
            <ReconciliationAwbEvidence
                id={evidenceId}
                taskId={taskId}
                timezone={timezone}
                close={() => setEvidenceId(null)}
            />
        </div>
    );
}

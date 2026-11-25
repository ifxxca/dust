import { Disclosure, DisclosureSummary } from '@/components/ui/disclosure';
import { useEffect, useRef, useState } from 'react';
import {
    Barcode,
    Camera,
    Check,
    LoaderCircle,
    Plus,
    Save,
    Search,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isBrowserPwa } from './platform';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { prepareCashlessAwb } from '@/lib/cashless-handover';
import { submissionKey } from '@/lib/submission-key';
import * as routes from '@/routes/mobile/cashless-handover';
import type {
    CashlessPage,
    CashlessPickup,
    SelectedCashlessPickup,
} from '../../js/types/cashless-handover';
import { ApiError, request, userFacingError } from './api';
import { readLocal, writeLocal } from './local-store';
import { OperationalFeedback } from './feedback';
import {
    confirmedCashlessHandover,
    cachedCashlessPickup,
    readableCashlessDraft,
    type CashlessDraft,
} from './cashless-handover';
import type { Session } from './types';
import CashlessCameraScanner from './cashless-camera-scanner';
import {
    CashlessScanHistory,
    CashlessScanSummary,
    useCashlessScanProgress,
} from './cashless-scan-progress';
import {
    playScanAccepted,
    playScanDuplicate,
    playScanError,
} from '@/lib/scan-feedback';
import {
    CashlessEntryStatus,
    CashlessSourcePicker,
} from '@/components/cashless-entry-status';

type Workspace = {
    tasks: CashlessPage<CashlessPickup>;
    selected: SelectedCashlessPickup | null;
};
const journal = 'cashless-handover';

export default function CashlessHandoverPanel({
    session,
    online,
    onBusyChange,
    onFocusChange,
    onFailure,
    initialPickupId,
}: {
    session: Session;
    online: boolean;
    onBusyChange: (busy: boolean) => void;
    onFocusChange: (focused: boolean) => void;
    onFailure: (error: unknown) => Promise<void>;
    initialPickupId?: number;
}) {
    const [workspace, setWorkspace] = useState<Workspace | null>(null);
    const [selected, setSelected] = useState<SelectedCashlessPickup | null>(
        null,
    );
    const [draft, setDraft] = useState<CashlessDraft | null>(null);
    const draftRef = useRef<CashlessDraft | null>(null);
    const [q, setQ] = useState('');
    const [search, setSearch] = useState('');
    const [value, setValue] = useState('');
    const [error, setError] = useState('');
    const [awbError, setAwbError] = useState('');
    const [message, setMessage] = useState('');
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    const cameraOpenRef = useRef(false);
    const busyRef = useRef(false);
    const active = useRef(false);
    const epoch = useRef(0);
    const controller = useRef(new AbortController());
    const input = useRef<HTMLInputElement>(null);
    const previousOnline = useRef(online);
    const scanProgress = useCashlessScanProgress(session, selected?.id, online);

    function scanCounts(
        current: CashlessDraft,
        kind?: 'duplicate' | 'invalid',
    ) {
        const counts = current.scanCounts ?? {
            total: current.awbs.length,
            duplicate: 0,
            invalid: 0,
        };
        return {
            total: counts.total + 1,
            duplicate: counts.duplicate + (kind === 'duplicate' ? 1 : 0),
            invalid: counts.invalid + (kind === 'invalid' ? 1 : 0),
        };
    }
    async function rejectedScan(kind: 'duplicate' | 'invalid') {
        const current = draftRef.current;
        if (!current || current.pending) return;
        work(true);
        try {
            await persist({
                ...current,
                scanCounts: scanCounts(current, kind),
            });
        } finally {
            if (active.current) work(false);
        }
    }
    const date = (at: string) =>
        new Intl.DateTimeFormat('id-ID', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: session.timezone,
        }).format(new Date(at));

    function work(next: boolean) {
        busyRef.current = next;
        setBusy(next);
        onBusyChange(next || cameraOpenRef.current);
    }
    function camera(next: boolean) {
        cameraOpenRef.current = next;
        setCameraOpen(next);
        onBusyChange(next || busyRef.current);
        if (!next) requestAnimationFrame(() => input.current?.focus());
    }
    async function persist(next: CashlessDraft) {
        await writeLocal(session, journal, next);
        if (!active.current) return;
        draftRef.current = next;
        setDraft(next);
    }
    async function failure(reason: unknown) {
        if (!active.current) return;
        playScanError();
        const fields =
            reason instanceof ApiError
                ? Object.values(reason.errors).flat()
                : [];
        setError(
            fields.length
                ? fields.slice(0, 5).join(' ')
                : userFacingError(reason),
        );
        if (
            reason instanceof ApiError &&
            [401, 403, 419].includes(reason.status)
        )
            await onFailure(reason);
    }
    async function load(
        query: {
            q?: string;
            page?: number;
            task?: number;
            awb_page?: number;
        } = {},
    ) {
        const requestEpoch = ++epoch.current;
        setLoading(true);
        try {
            const result = await request<Workspace>(
                routes.index({ query }),
                session,
                controller.current.signal,
            );
            if (!active.current || requestEpoch !== epoch.current) return;
            const selectedBook = result.selected;
            const book: CashlessPickup | undefined = selectedBook
                ? {
                      id: selectedBook.id,
                      reference: selectedBook.reference,
                      customer: selectedBook.customer,
                      scheduled_at: selectedBook.scheduled_at,
                      status: selectedBook.status,
                      target: selectedBook.target,
                      saved_count: selectedBook.saved_count,
                      can_record: selectedBook.can_record,
                  }
                : undefined;
            if (result.selected && !draftRef.current) {
                await persist({
                    schema: 1,
                    pickupId: result.selected.id,
                    awbs: [],
                    submissionKey: submissionKey(),
                    pending: false,
                    book,
                });
                if (!active.current || requestEpoch !== epoch.current) return;
            } else if (
                book &&
                draftRef.current?.pickupId === book.id &&
                !busyRef.current &&
                !cameraOpenRef.current
            ) {
                await persist({ ...draftRef.current, book });
                if (!active.current || requestEpoch !== epoch.current) return;
            }
            setWorkspace(result);
            setSelected(result.selected);
        } catch (reason) {
            if (requestEpoch === epoch.current) await failure(reason);
        } finally {
            if (active.current && requestEpoch === epoch.current)
                setLoading(false);
        }
    }
    useEffect(() => {
        active.current = true;
        controller.current = new AbortController();
        void (async () => {
            try {
                const saved = await readLocal<unknown>(session, journal);
                if (!active.current) return;
                if (saved !== null && !readableCashlessDraft(saved))
                    throw new Error(
                        'Draft Cashless belum dapat dibaca. Data perangkat tetap disimpan; hubungi Admin.',
                    );
                draftRef.current = saved;
                setDraft(saved);
                if (saved) setSelected(cachedCashlessPickup(saved));
                setReady(true);
                if (
                    saved &&
                    initialPickupId &&
                    saved.pickupId !== initialPickupId
                ) {
                    setMessage(
                        'Draft buku lain masih tersimpan. Selesaikan draft sebelum membuka buku pada notifikasi.',
                    );
                }
                if (online)
                    await load(
                        saved
                            ? { task: saved.pickupId }
                            : initialPickupId
                              ? { task: initialPickupId }
                              : {},
                    );
            } catch (reason) {
                await failure(reason);
            }
        })();
        return () => {
            active.current = false;
            controller.current.abort();
            onBusyChange(false);
            onFocusChange(false);
        };
    }, [session.token, session.user.id, session.environment]);
    useEffect(() => {
        const reconnected = online && !previousOnline.current;
        previousOnline.current = online;
        if (
            reconnected &&
            ready &&
            !busyRef.current &&
            !cameraOpenRef.current
        ) {
            void load(
                draftRef.current ? { task: draftRef.current.pickupId } : {},
            );
        }
    }, [online, ready]);
    useEffect(() => {
        onFocusChange(selected !== null);
        if (selected) window.scrollTo({ top: 0 });
    }, [selected?.id, onFocusChange]);
    useEffect(() => {
        const leave = (event: Event) => {
            if (
                busyRef.current ||
                cameraOpenRef.current ||
                (value.trim() &&
                    !window.confirm(
                        'Nomor resi belum ditambahkan. Tinggalkan input ini?',
                    ))
            )
                event.preventDefault();
        };
        const back = (event: Event) => {
            if (busyRef.current || cameraOpenRef.current) {
                event.preventDefault();
                return;
            }
            if (selected) {
                event.preventDefault();
                if (
                    value.trim() &&
                    !window.confirm(
                        'Nomor resi belum ditambahkan. Kembali ke daftar buku?',
                    )
                )
                    return;
                setValue('');
                setSelected(null);
                setError('');
            }
        };
        const unload = (event: BeforeUnloadEvent) => {
            if (value.trim() || busyRef.current) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('mobile-cashless-leave', leave);
        window.addEventListener('mobile-back', back);
        window.addEventListener('beforeunload', unload);
        return () => {
            window.removeEventListener('mobile-cashless-leave', leave);
            window.removeEventListener('mobile-back', back);
            window.removeEventListener('beforeunload', unload);
        };
    }, [selected, value]);

    async function choose(book: CashlessPickup) {
        if (busyRef.current) return;
        const previous = draftRef.current;
        if (previous?.pending && previous.pickupId !== book.id) {
            setError(
                'Periksa hasil penyimpanan sebelumnya sebelum mengganti buku.',
            );
            return;
        }
        if (
            previous &&
            previous.pickupId !== book.id &&
            previous.awbs.length &&
            !window.confirm(
                'Ganti buku dan buang daftar scan yang belum dikirim?',
            )
        )
            return;
        work(true);
        setError('');
        setMessage('');
        try {
            if (!previous || previous.pickupId !== book.id)
                await persist({
                    schema: 1,
                    pickupId: book.id,
                    awbs: [],
                    submissionKey: submissionKey(),
                    pending: false,
                    book,
                });
            setValue('');
            await load({ q: search, task: book.id });
        } catch (reason) {
            await failure(reason);
        } finally {
            if (active.current) work(false);
        }
    }
    async function add() {
        if (busyRef.current || !selected || !draft || draft.pending) return;
        const parsed = prepareCashlessAwb(
            value,
            draft.awbs,
            scanProgress.progress?.registered_awbs ??
                selected.awbs.data.map((row) => row.awb),
        );
        if (parsed.error) {
            if (parsed.kind === 'duplicate') playScanDuplicate();
            else playScanError();
            await rejectedScan(
                parsed.kind === 'duplicate' ? 'duplicate' : 'invalid',
            ).catch(failure);
            setAwbError(parsed.error);
            input.current?.focus();
            input.current?.select();
            return;
        }
        work(true);
        setAwbError('');
        setError('');
        setMessage('');
        try {
            await persist({
                ...draft,
                awbs: [...draft.awbs, parsed.awb!],
                scanCounts: scanCounts(draft),
                submissionKey: submissionKey(),
            });
            setValue('');
            playScanAccepted();
            setMessage(
                `${parsed.awb} · Draft tersimpan, belum dikirim ke server.`,
            );
        } catch (reason) {
            await failure(reason);
        } finally {
            if (active.current) {
                work(false);
                requestAnimationFrame(() => input.current?.focus());
            }
        }
    }
    async function addFromCamera(raw: string): Promise<{
        awb?: string;
        error?: string;
        kind?: 'duplicate' | 'invalid';
    }> {
        const current = draftRef.current;
        if (
            !selected?.can_record ||
            !current ||
            current.pending ||
            current.pickupId !== selected.id
        )
            return {
                error: 'Buku pickup tidak dapat menerima resi. Tutup pemindai dan periksa buku.',
            };
        const parsed = prepareCashlessAwb(
            raw,
            current.awbs,
            scanProgress.progress?.registered_awbs ??
                selected.awbs.data.map((row) => row.awb),
        );
        if (parsed.error) {
            await rejectedScan(
                parsed.kind === 'duplicate' ? 'duplicate' : 'invalid',
            );
            return parsed;
        }
        work(true);
        try {
            await persist({
                ...current,
                awbs: [...current.awbs, parsed.awb!],
                scanCounts: scanCounts(current),
                submissionKey: submissionKey(),
            });
            setError('');
            setMessage('');
            return { awb: parsed.awb };
        } finally {
            if (active.current) work(false);
        }
    }
    async function remove(awb: string) {
        if (busyRef.current || !draft || draft.pending) return;
        work(true);
        try {
            await persist({
                ...draft,
                awbs: draft.awbs.filter((item) => item !== awb),
                submissionKey: submissionKey(),
            });
            setError('');
        } catch (reason) {
            await failure(reason);
        } finally {
            if (active.current) work(false);
        }
    }
    async function save(event: React.SubmitEvent) {
        event.preventDefault();
        if (busyRef.current || !draft || !selected || !online) return;
        if (!draft.pending && !draft.source) {
            setError('Pilih server tujuan sebelum menyimpan.');
            document
                .querySelector<HTMLButtonElement>(
                    '#mobile-cashless-source button',
                )
                ?.focus();
            return;
        }
        let next = draft;
        if (!draft.pending && value.trim()) {
            const parsed = prepareCashlessAwb(
                value,
                draft.awbs,
                scanProgress.progress?.registered_awbs ??
                    selected.awbs.data.map((row) => row.awb),
            );
            if (parsed.error) {
                setAwbError(parsed.error);
                if (parsed.kind === 'duplicate') playScanDuplicate();
                else playScanError();
                input.current?.focus();
                return;
            }
            next = {
                ...draft,
                awbs: [...draft.awbs, parsed.awb!],
                scanCounts: scanCounts(draft),
                submissionKey: submissionKey(),
            };
            setAwbError('');
        }
        if (!next.awbs.length) {
            setError('Tambahkan minimal satu resi sebelum menyimpan.');
            input.current?.focus();
            return;
        }
        work(true);
        setError('');
        setMessage('');
        try {
            next = { ...next, pending: true };
            await persist(next);
            setValue('');
            const reply = await request(
                routes.store(selected.id),
                session,
                controller.current.signal,
                {
                    awbs: next.awbs,
                    submission_key: next.submissionKey,
                    ...(next.source ? { source: next.source } : {}),
                },
            );
            if (
                !confirmedCashlessHandover(reply, selected.id, next.awbs.length)
            )
                throw new Error(
                    'Konfirmasi penyimpanan belum sesuai. Draft tetap tersimpan; periksa hasil sebelum melanjutkan.',
                );
            await persist({
                ...next,
                awbs: [],
                pending: false,
                submissionKey: submissionKey(),
            });
            setMessage(
                `${next.awbs.length} resi Cashless tersimpan di server.`,
            );
            await load({ q: search, task: selected.id });
        } catch (reason) {
            if (reason instanceof ApiError && reason.status === 422) {
                try {
                    await persist({ ...next, pending: false });
                } catch {
                    /* Keep the immutable attempt when device storage cannot be updated. */
                }
            }
            await failure(reason);
        } finally {
            if (active.current) work(false);
        }
    }

    const queued = draft?.pickupId === selected?.id ? (draft?.awbs ?? []) : [];
    return (
        <section
            className="cashless-workspace flex min-w-0 flex-col gap-4 pb-4"
            aria-label="Handover Cashless"
        >
            {cameraOpen && selected && (
                <CashlessCameraScanner
                    title={`${selected.customer} · ${selected.reference}`}
                    count={queued.length}
                    onScan={addFromCamera}
                    onClose={() => camera(false)}
                    onDuplicate={() => rejectedScan('duplicate')}
                    summary={
                        <>
                            <CashlessScanSummary
                                progress={scanProgress.progress}
                                draftCount={queued.length}
                                pending={draft?.pending}
                                counts={draft?.scanCounts}
                            />
                            {scanProgress.notice && (
                                <OperationalFeedback
                                    title="Pemrosesan server"
                                    tone={scanProgress.tone}
                                >
                                    {scanProgress.notice}
                                </OperationalFeedback>
                            )}
                            {scanProgress.error && (
                                <p role="status">{scanProgress.error}</p>
                            )}
                        </>
                    }
                />
            )}
            {error && (
                <OperationalFeedback title="Perlu diperiksa" tone="error">
                    {error}
                </OperationalFeedback>
            )}
            {message && (
                <OperationalFeedback title="Status pengiriman" tone="info">
                    {message}
                </OperationalFeedback>
            )}
            {!online && (
                <OperationalFeedback title="Perangkat offline" tone="warning">
                    Data buku terakhir dari perangkat. Scan tetap menjadi draft;
                    sambungkan internet untuk memeriksa status dan mengirim ke
                    server.
                </OperationalFeedback>
            )}
            {ready && draft && !selected && !online && (
                <OperationalFeedback
                    title={`Draft buku #${draft.pickupId}`}
                    tone="warning"
                >
                    {draft.awbs.length} resi tetap tersimpan. Konteks buku belum
                    tersedia pada versi draft ini; sambungkan internet untuk
                    melanjutkan.
                    <Disclosure>
                        <DisclosureSummary className="min-h-12 cursor-pointer content-center">
                            Lihat resi tertunda
                        </DisclosureSummary>
                        <ul>
                            {draft.awbs.map((awb) => (
                                <li key={awb} className="font-mono break-all">
                                    {awb}
                                </li>
                            ))}
                        </ul>
                    </Disclosure>
                </OperationalFeedback>
            )}
            {!ready ? (
                <p role="status" className="text-sm text-muted-foreground">
                    Memuat draft Cashless…
                </p>
            ) : selected ? (
                <>
                    <div className="cashless-book flex flex-col gap-2">
                        <h2 className="text-lg font-semibold">
                            {selected.customer}
                        </h2>
                        <p className="text-xs break-all text-muted-foreground">
                            {selected.reference} · {date(selected.scheduled_at)}
                        </p>
                        <p className="text-sm tabular-nums">
                            Tersimpan <strong>{selected.saved_count}</strong> ·
                            Target POP{' '}
                            <strong>{selected.target ?? 'Belum final'}</strong>
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            className="cashless-change-book h-11"
                            disabled={busy || loading}
                            onClick={() => {
                                if (
                                    value.trim() &&
                                    !window.confirm(
                                        'Nomor resi belum ditambahkan. Ganti buku?',
                                    )
                                )
                                    return;
                                setValue('');
                                setSelected(null);
                            }}
                        >
                            Ganti<span className="sr-only"> buku pickup</span>
                        </Button>
                    </div>
                    {draft?.pending && (
                        <OperationalFeedback
                            title="Hasil penyimpanan belum pasti"
                            tone="warning"
                        >
                            Daftar dikunci sementara. Tekan Periksa & simpan
                            ulang untuk menggunakan kunci yang sama dan mencegah
                            duplikasi.
                        </OperationalFeedback>
                    )}
                    <form
                        onSubmit={save}
                        className="cashless-scan-form flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4"
                        aria-busy={busy}
                    >
                        {selected.can_record || draft?.pending ? (
                            <>
                                <CashlessSourcePicker
                                    id="mobile-cashless-source"
                                    value={draft?.source ?? ''}
                                    disabled={busy || !!draft?.pending}
                                    onChange={(source) => {
                                        if (
                                            !draft ||
                                            busyRef.current ||
                                            draft.pending
                                        )
                                            return;
                                        work(true);
                                        void persist({
                                            ...draft,
                                            source: source as CashlessDraft['source'],
                                            submissionKey: submissionKey(),
                                        })
                                            .catch(failure)
                                            .finally(() => {
                                                if (active.current) work(false);
                                            });
                                    }}
                                />
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor="mobile-cashless-awb">
                                        Scan atau ketik nomor resi
                                    </Label>
                                    <Button
                                        type="button"
                                        className="h-12 w-full"
                                        disabled={
                                            busy ||
                                            !!draft?.pending ||
                                            !selected.can_record
                                        }
                                        onClick={() => {
                                            input.current?.blur();
                                            camera(true);
                                        }}
                                    >
                                        <Camera aria-hidden="true" />
                                        Scan dengan kamera
                                    </Button>
                                    <div className="flex min-w-0 gap-2">
                                        <Input
                                            ref={input}
                                            id="mobile-cashless-awb"
                                            name="awb"
                                            className="h-12 min-w-0 font-mono"
                                            autoComplete="off"
                                            autoCapitalize="characters"
                                            spellCheck={false}
                                            placeholder="Contoh: TG3583843345…"
                                            disabled={busy || !!draft?.pending}
                                            value={value}
                                            aria-invalid={!!awbError}
                                            aria-describedby={
                                                awbError
                                                    ? 'mobile-cashless-awb-error'
                                                    : undefined
                                            }
                                            onChange={(event) =>
                                                setValue(event.target.value)
                                            }
                                            onKeyDown={(event) => {
                                                if (
                                                    event.key === 'Enter' &&
                                                    !event.nativeEvent
                                                        .isComposing
                                                ) {
                                                    event.preventDefault();
                                                    void add();
                                                }
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-12"
                                            disabled={busy || !!draft?.pending}
                                            onClick={() => void add()}
                                        >
                                            <Plus aria-hidden="true" />
                                            Tambah
                                        </Button>
                                    </div>
                                    {awbError && (
                                        <p
                                            id="mobile-cashless-awb-error"
                                            role="alert"
                                            className="text-sm text-destructive"
                                        >
                                            {awbError}
                                        </p>
                                    )}
                                    <p className="cashless-keyboard-hint text-xs text-muted-foreground">
                                        Scanner keyboard/Bluetooth dengan
                                        akhiran Enter.
                                    </p>
                                </div>
                                <CashlessScanSummary
                                    progress={scanProgress.progress}
                                    draftCount={queued.length}
                                    pending={draft?.pending}
                                    counts={draft?.scanCounts}
                                />
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-medium">
                                        Belum dikirim ke server
                                    </h3>
                                    <span
                                        aria-live="polite"
                                        className="text-sm tabular-nums"
                                    >
                                        {queued.length} resi
                                    </span>
                                </div>
                                {queued.length ? (
                                    <ol className="max-h-72 divide-y overflow-y-auto rounded-lg border">
                                        {queued.map((awb) => (
                                            <li
                                                key={awb}
                                                className="flex min-w-0 items-center gap-2 px-3 py-1"
                                            >
                                                <span className="min-w-0 flex-1 font-mono text-sm break-all">
                                                    {awb}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="size-11 shrink-0"
                                                    aria-label={`Keluarkan ${awb}`}
                                                    disabled={
                                                        busy || !!draft?.pending
                                                    }
                                                    onClick={() =>
                                                        void remove(awb)
                                                    }
                                                >
                                                    <X aria-hidden="true" />
                                                </Button>
                                            </li>
                                        ))}
                                    </ol>
                                ) : (
                                    <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                                        Tambahkan resi untuk buku pickup ini.
                                    </p>
                                )}
                                {selected.target !== null &&
                                    selected.saved_count + queued.length >
                                        selected.target && (
                                        <p className="text-sm text-destructive">
                                            Jumlah scan melebihi target POP.
                                            Periksa kembali daftar resi.
                                        </p>
                                    )}
                                <p className="text-xs text-muted-foreground">
                                    {isBrowserPwa
                                        ? 'Draft hanya di tab ini sampai dikirim.'
                                        : 'Daftar scan disimpan sebagai draft perangkat sampai dikirim.'}
                                </p>
                                <Button
                                    type="submit"
                                    className="h-12 w-full"
                                    disabled={busy || !online}
                                >
                                    {busy ? (
                                        <LoaderCircle
                                            aria-hidden="true"
                                            className="animate-spin motion-reduce:animate-none"
                                        />
                                    ) : (
                                        <Save aria-hidden="true" />
                                    )}
                                    {busy
                                        ? 'Menyimpan…'
                                        : draft?.pending
                                          ? 'Periksa & simpan ulang'
                                          : 'Simpan Handover Cashless'}
                                </Button>
                            </>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Pencatatan ditutup. Buku belum dimulai, handover
                                ditutup, atau rekonsiliasi terkunci.
                            </p>
                        )}
                    </form>
                    <CashlessScanHistory {...scanProgress} />
                    {online && (
                        <Button
                            type="button"
                            variant="outline"
                            className="h-11"
                            disabled={
                                busy || loading || cameraOpen || !!value.trim()
                            }
                            onClick={() =>
                                void load({ q: search, task: selected.id })
                            }
                        >
                            Segarkan status proses
                        </Button>
                    )}
                    <CashlessEntryStatus
                        batches={selected.entry_batches ?? []}
                        enabled={selected.entry_enabled}
                    />
                    <Disclosure open={selected.awbs.total > 0}>
                        <DisclosureSummary className="cursor-pointer">
                            Resi tersimpan ({selected.awbs.total})
                        </DisclosureSummary>
                        <ul className="mt-3 max-h-64 divide-y overflow-y-auto">
                            {selected.awbs.data.map((row) => (
                                <li
                                    key={row.id}
                                    className="flex min-w-0 gap-2 py-3"
                                >
                                    <Check
                                        aria-hidden="true"
                                        className="size-4 shrink-0 text-muted-foreground"
                                    />
                                    <span className="min-w-0 font-mono text-sm break-all">
                                        {row.awb}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {selected.awbs.last_page > 1 && (
                            <div className="mt-3 flex items-center justify-between gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={
                                        busy ||
                                        loading ||
                                        selected.awbs.current_page <= 1
                                    }
                                    onClick={() =>
                                        void load({
                                            q: search,
                                            task: selected.id,
                                            awb_page:
                                                selected.awbs.current_page - 1,
                                        })
                                    }
                                >
                                    Sebelumnya
                                </Button>
                                <span className="text-xs">
                                    {selected.awbs.current_page}/
                                    {selected.awbs.last_page}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={
                                        busy ||
                                        loading ||
                                        selected.awbs.current_page >=
                                            selected.awbs.last_page
                                    }
                                    onClick={() =>
                                        void load({
                                            q: search,
                                            task: selected.id,
                                            awb_page:
                                                selected.awbs.current_page + 1,
                                        })
                                    }
                                >
                                    Berikutnya
                                </Button>
                            </div>
                        )}
                    </Disclosure>
                </>
            ) : (
                <>
                    <form
                        className="flex flex-col gap-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            setSearch(q);
                            setError('');
                            void load({ q, page: 1 });
                        }}
                    >
                        <Label htmlFor="mobile-cashless-search">
                            Customer atau buku pickup
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                id="mobile-cashless-search"
                                name="q"
                                className="h-12 min-w-0"
                                maxLength={100}
                                placeholder="Cari buku pickup…"
                                value={q}
                                onChange={(event) => setQ(event.target.value)}
                            />
                            <Button
                                type="submit"
                                variant="outline"
                                className="h-12"
                                disabled={!online || loading}
                            >
                                <Search aria-hidden="true" />
                                Cari
                            </Button>
                        </div>
                    </form>
                    <h2 className="text-base font-semibold">
                        Pilih buku pickup saya
                    </h2>
                    {loading && (
                        <p
                            role="status"
                            className="text-sm text-muted-foreground"
                        >
                            Memuat buku pickup…
                        </p>
                    )}
                    {workspace?.tasks.data.map((book) => (
                        <button
                            key={book.id}
                            type="button"
                            disabled={busy || loading}
                            onClick={() => void choose(book)}
                            className="flex w-full flex-col gap-2 rounded-xl border bg-card p-4 text-left focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <span className="flex items-center gap-2">
                                <Barcode
                                    aria-hidden="true"
                                    className="size-5 shrink-0 text-primary"
                                />
                                <strong className="min-w-0 break-words">
                                    {book.customer}
                                </strong>
                            </span>
                            <span className="text-xs break-all text-muted-foreground">
                                {book.reference}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {date(book.scheduled_at)} · {book.saved_count}{' '}
                                resi tersimpan
                            </span>
                            <span className="text-xs">
                                {book.can_record
                                    ? 'Dapat dicatat'
                                    : 'Pencatatan ditutup'}
                            </span>
                        </button>
                    ))}
                    {workspace?.tasks.data.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            Tidak ada buku pickup sesuai pencarian.
                        </p>
                    )}
                    {workspace && workspace.tasks.last_page > 1 && (
                        <div className="flex items-center justify-between gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                disabled={
                                    loading || workspace.tasks.current_page <= 1
                                }
                                onClick={() =>
                                    void load({
                                        q: search,
                                        page: workspace.tasks.current_page - 1,
                                    })
                                }
                            >
                                Sebelumnya
                            </Button>
                            <span className="text-sm tabular-nums">
                                {workspace.tasks.current_page}/
                                {workspace.tasks.last_page}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={
                                    loading ||
                                    workspace.tasks.current_page >=
                                        workspace.tasks.last_page
                                }
                                onClick={() =>
                                    void load({
                                        q: search,
                                        page: workspace.tasks.current_page + 1,
                                    })
                                }
                            >
                                Berikutnya
                            </Button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

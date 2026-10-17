import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { WorkflowStepper } from './workspace-ui';
import { CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { me } from '@/routes/mobile';
import {
    index,
    candidates,
    show,
    store,
    amend,
    verify,
    close,
} from '@/routes/mobile/handovers';
import { show as lookup } from '@/routes/mobile/submissions';
import { ApiError, request } from './api';
import { readLocal, writeLocal, removeLocal } from './local-store';
import {
    confirmedAmend,
    confirmedHandoverLifecycle,
    readableHandoverAttempt,
    type Handover,
    type HandoverCandidate,
    type HandoverAttempt,
} from './handover';
import type { Session } from './types';
import { OperationalFeedback } from './feedback';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    handoverCategories,
    receivedQuantity,
    differenceLabel,
    verificationErrors,
    type VerificationInput,
} from './handover';
type Page<T> = {
    data: T[];
    meta: { current_page: number; last_page: number };
    capabilities?: { create: boolean; receive: boolean };
};
const handoverStatus = (status: Handover['status']) =>
    ({
        DRAFT: 'DRAFT',
        IN_VERIFICATION: 'Dalam Verifikasi',
        CLOSED: 'Selesai',
    })[status];
const eventLabel = (action: string) =>
    (
        ({
            created: 'Session dibuat',
            membership_changed: 'Daftar pickup diubah',
            item_verified: 'Paket diverifikasi',
            closed: 'Session ditutup',
            reopened: 'Session dibuka kembali',
            verification_corrected: 'Verifikasi dikoreksi',
            pickup_corrected: 'POP dikoreksi',
        }) as Record<string, string>
    )[action] || action;
const journalName = 'handover-operation';
export default function HandoverPanel({
    session,
    online,
    onFailure,
    onBusyChange,
    onTask,
    onFocusChange,
}: {
    session: Session;
    online: boolean;
    onFailure: (error: unknown) => Promise<void>;
    onBusyChange: (busy: boolean) => void;
    onTask: (id: number) => void;
    onFocusChange: (focused: boolean) => void;
}) {
    const [sessions, setSessions] = useState<Handover[]>([]),
        [detail, setDetail] = useState<Handover | null>(null);
    const [choices, setChoices] = useState<HandoverCandidate[]>([]),
        [selected, setSelected] = useState<Record<number, HandoverCandidate>>(
            {},
        );
    const [wizardStep, setWizardStep] = useState(1);
    const [detailTab, setDetailTab] = useState<'packages' | 'activity'>(
        'packages',
    );
    const [justCreated, setJustCreated] = useState(false);
    const [justClosed, setJustClosed] = useState(false);
    const [closeConfirm, setCloseConfirm] = useState(false);
    const [capabilities, setCapabilities] = useState({
        create: false,
        receive: false,
    });
    const [listScope, setListScope] = useState<
        'mine' | 'receiving' | 'history'
    >(session.user.role === 'pickup_staff' ? 'mine' : 'receiving');
    const [conflict, setConflict] = useState(false);
    const [verificationBaseline, setVerificationBaseline] = useState({
        version: 0,
        revision: 0,
    });
    const [verificationDrafts, setVerificationDrafts] = useState<
        Record<
            number,
            { values: VerificationInput; version: number; revision: number }
        >
    >({});
    const [verifyingId, setVerifyingId] = useState<number | null>(null);
    const [verification, setVerification] = useState({
        manual_hybrid: '',
        cashless_hybrid: '',
        css_orion: '',
        discrepancy_notes: '',
    });
    const [recoveryRead, setRecoveryRead] = useState(0);
    const [listError, setListError] = useState('');
    const [candidateSearch, setCandidateSearch] = useState('');
    const [editing, setEditing] = useState(false),
        [creating, setCreating] = useState(false),
        [reason, setReason] = useState('');
    const [attempt, setAttempt] = useState<HandoverAttempt | null>(null),
        [blocked, setBlocked] = useState(false),
        [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false),
        [message, setMessage] = useState(''),
        [errors, setErrors] = useState<Record<string, string[]>>({});
    useEffect(() => {
        onFocusChange(!!detail || creating || editing || verifyingId !== null);
        return () => onFocusChange(false);
    }, [detail, creating, editing, verifyingId, onFocusChange]);
    useEffect(() => {
        const back = (event: Event) => {
            if (closeConfirm) {
                event.preventDefault();
                setCloseConfirm(false);
                return;
            }
            if (busy) {
                event.preventDefault();
                return;
            }
            if (verifyingId !== null) {
                event.preventDefault();
                setVerifyingId(null);
                return;
            }
            if (creating || editing) {
                event.preventDefault();
                if (wizardStep > 1) {
                    setWizardStep((step) => step - 1);
                    return;
                }
                setCreating(false);
                setEditing(false);
                return;
            }
            if (detail) {
                event.preventDefault();
                setDetail(null);
            }
        };
        window.addEventListener('mobile-back', back);
        return () => window.removeEventListener('mobile-back', back);
    }, [
        busy,
        creating,
        editing,
        detail,
        selected,
        wizardStep,
        verifyingId,
        verification,
        attempt,
        closeConfirm,
    ]);
    const [q, setQ] = useState(''),
        [search, setSearch] = useState('');
    const [page, setPage] = useState(1),
        [lastPage, setLastPage] = useState(1),
        [candidatePage, setCandidatePage] = useState(1),
        [candidateLast, setCandidateLast] = useState(1),
        [refresh, setRefresh] = useState(0);
    const active = useRef(false),
        controller = useRef(new AbortController());
    const [listLoading, setListLoading] = useState(true),
        [candidateLoading, setCandidateLoading] = useState(false);
    const history = listScope === 'history';
    function work(value: boolean) {
        active.current = value;
        setBusy(value);
        if (!controller.current.signal.aborted) onBusyChange(value);
    }
    useEffect(() => () => onBusyChange(false), [onBusyChange]);
    useEffect(() => {
        let disposed = false;
        controller.current = new AbortController();
        setReady(false);
        setBlocked(false);
        void readLocal<unknown>(session, journalName)
            .then(async (value) => {
                if (value !== null) {
                    if (!readableHandoverAttempt(value))
                        throw new Error(
                            'Recovery handover belum didukung; data dipertahankan dan mutation diblokir.',
                        );
                    const recovery = { ...value, state: 'UNCERTAIN' as const };
                    await writeLocal(session, journalName, recovery);
                    if (!disposed) setAttempt(recovery);
                }
            })
            .catch((error) => {
                if (!disposed) {
                    setBlocked(true);
                    setMessage(
                        error instanceof Error
                            ? error.message
                            : 'Recovery belum dapat dibaca; tidak dihapus.',
                    );
                }
            })
            .finally(() => {
                if (!disposed) setReady(true);
            });
        return () => {
            disposed = true;
            controller.current.abort();
        };
    }, [session.token, recoveryRead]);
    useEffect(() => {
        const signal = new AbortController();
        let disposed = false;
        setListLoading(true);
        setSessions([]);
        setListError('');
        void request<Page<Handover>>(
            index({
                query: {
                    page,
                    per_page: 20,
                    q,
                    ...(history ? { history: 1 } : { active: 1 }),
                    ...(listScope === 'mine'
                        ? { mine: 1 }
                        : listScope === 'receiving'
                          ? { receiving: 1 }
                          : {}),
                },
            }),
            session,
            signal.signal,
        )
            .then((result) => {
                if (!disposed) {
                    setSessions(result.data);
                    setLastPage(result.meta.last_page);
                    if (result.capabilities)
                        setCapabilities(result.capabilities);
                }
            })
            .catch((error) => {
                if (!disposed) {
                    setListError(
                        error instanceof Error
                            ? error.message
                            : 'Daftar handover belum tersedia.',
                    );
                    void onFailure(error);
                }
            })
            .finally(() => {
                if (!disposed) setListLoading(false);
            });
        return () => {
            disposed = true;
            signal.abort();
        };
    }, [session.token, page, q, listScope, refresh]);
    useEffect(() => {
        if (!creating && !editing) return;
        const signal = new AbortController();
        let disposed = false;
        setCandidateLoading(true);
        setChoices([]);
        void request<Page<HandoverCandidate>>(
            candidates({ query: { page: candidatePage, q: candidateSearch } }),
            session,
            signal.signal,
        )
            .then((result) => {
                if (!disposed) {
                    setChoices(result.data);
                    setCandidateLast(result.meta.last_page);
                }
            })
            .catch((error) => {
                if (!disposed) {
                    setMessage(
                        error instanceof Error
                            ? error.message
                            : 'Kandidat belum tersedia.',
                    );
                    void onFailure(error);
                }
            })
            .finally(() => {
                if (!disposed) setCandidateLoading(false);
            });
        return () => {
            disposed = true;
            signal.abort();
        };
    }, [
        session.token,
        candidatePage,
        candidateSearch,
        creating,
        editing,
        refresh,
    ]);
    async function save(value: HandoverAttempt) {
        await writeLocal(session, journalName, value);
        setAttempt(value);
    }
    async function clear() {
        await removeLocal(session, journalName);
        setAttempt(null);
        setEditing(false);
        setCreating(false);
        setSelected({});
        setVerifyingId(null);
        setRefresh((value) => value + 1);
    }
    async function readDetail(id: number) {
        if (active.current) return;
        work(true);
        setMessage('');
        try {
            const result = await request<{ data: Handover }>(
                show(id),
                session,
                controller.current.signal,
            );
            if (!controller.current.signal.aborted) {
                setDetail(result.data);
                setJustCreated(false);
                setJustClosed(false);
                setErrors({});
                setConflict(false);
                setDetailTab('packages');
                setEditing(false);
                setCreating(false);
            }
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : 'Session belum dapat dibuka.',
            );
            await onFailure(error);
        } finally {
            work(false);
        }
    }
    async function reconcile(value: HandoverAttempt): Promise<Handover | null> {
        if (value.kind === 'create') {
            const committed = await request<{ data: { resource_id: number } }>(
                lookup(value.key, { query: { kind: 'handover' } }),
                session,
                controller.current.signal,
            );
            const result = await request<{ data: Handover }>(
                show(committed.data.resource_id),
                session,
                controller.current.signal,
            );
            if (result.data.created_by !== session.user.id)
                throw new Error(
                    'Creator server tidak cocok; recovery dipertahankan.',
                );
            return result.data;
        }
        const result = await request<{ data: Handover }>(
            show(value.sessionId!),
            session,
            controller.current.signal,
        );
        return (
            value.kind === 'amend'
                ? confirmedAmend(result.data, value, session.user.id)
                : confirmedHandoverLifecycle(
                      result.data,
                      value,
                      session.user.id,
                  )
        )
            ? result.data
            : null;
    }
    async function confirmed(value: Handover, original = attempt) {
        if (controller.current.signal.aborted) return;
        await clear();
        setDetail(value);
        setJustCreated(original?.kind === 'create');
        setJustClosed(original?.kind === 'close');
        setErrors({});
        setConflict(false);
        if (original?.kind === 'verify' && original.verification) {
            setVerificationDrafts((previous) => {
                const next = { ...previous };
                delete next[original.verification!.itemId];
                return next;
            });
        }
        setMessage(
            original?.kind === 'verify'
                ? 'Verifikasi tersimpan. Hasil telah dikonfirmasi server.'
                : original?.kind === 'amend'
                  ? 'Perubahan session tersimpan di server.'
                  : '',
        );
    }
    async function check() {
        if (!attempt || active.current) return;
        work(true);
        setMessage('');
        try {
            const value = await reconcile(attempt);
            if (value) await confirmed(value);
            else
                setMessage(
                    'Audit belum mengonfirmasi request asli. Recovery dipertahankan; tidak ada mutation otomatis.',
                );
        } catch (error) {
            setMessage(
                error instanceof ApiError && error.status === 404
                    ? 'Hasil belum ditemukan. Permintaan mungkin masih diproses; data pemulihan tetap disimpan.'
                    : error instanceof Error
                      ? error.message
                      : 'Hasil belum diketahui.',
            );
            await onFailure(error);
        } finally {
            work(false);
        }
    }
    async function checkCandidates(value: HandoverAttempt) {
        const remaining = new Set(value.taskIds);
        let number = 1;
        do {
            const result = await request<Page<HandoverCandidate>>(
                candidates({ query: { page: number } }),
                session,
                controller.current.signal,
            );
            for (const item of result.data)
                if (remaining.has(item.id)) {
                    if (item.reference !== value.references[item.id])
                        throw new Error(
                            'Referensi task berubah. Tinjau recovery tanpa mengulang request.',
                        );
                    remaining.delete(item.id);
                }
            if (!remaining.size) return;
            if (number >= result.meta.last_page) break;
            number++;
        } while (remaining.size);
        throw new Error(
            'Kandidat berubah atau sudah menjadi anggota session. Periksa hasil request sebelum membuat pilihan baru.',
        );
    }
    async function send(replay = false) {
        if (active.current || !online || !ready || blocked) return;
        if (
            replay &&
            attempt &&
            (attempt.kind === 'verify' || attempt.kind === 'close')
        ) {
            await sendLifecycle(attempt, true);
            return;
        }
        const ids = Object.keys(selected).map(Number);
        if (
            !replay &&
            (ids.length < 1 || ids.length > 100 || (editing && !reason.trim()))
        ) {
            setErrors({
                task_ids: ['Pilih1–100 task.'],
                ...(editing && !reason.trim()
                    ? { reason: ['Alasan wajib.'] }
                    : {}),
            });
            return;
        }
        if (
            replay &&
            !window.confirm(
                'Periksa hasil server lalu kirim ulang daftar dan data yang sama? Perubahan server tidak akan ditimpa.',
            )
        )
            return;
        work(true);
        setMessage('');
        setErrors({});
        let sent: HandoverAttempt | null = null;
        try {
            await request(me(), session, controller.current.signal);
            const value = replay
                ? attempt!
                : {
                      schema: 1 as const,
                      kind: editing ? ('amend' as const) : ('create' as const),
                      state: 'SENDING' as const,
                      key: crypto.randomUUID(),
                      taskIds: ids,
                      references: Object.fromEntries(
                          Object.values(selected).map((item) => [
                              item.id,
                              item.reference,
                          ]),
                      ),
                      ...(editing
                          ? {
                                sessionId: detail!.id,
                                sessionReference: detail!.reference,
                                version: detail!.version,
                                reason: reason.trim(),
                            }
                          : {}),
                      createdAt: new Date().toISOString(),
                  };
            if (replay) {
                try {
                    const found = await reconcile(value);
                    if (found) {
                        await confirmed(found);
                        return;
                    }
                } catch (error) {
                    if (!(error instanceof ApiError && error.status === 404))
                        throw error;
                }
            }
            if (value.kind === 'create') await checkCandidates(value);
            else {
                const latest = (
                    await request<{ data: Handover }>(
                        show(value.sessionId!),
                        session,
                        controller.current.signal,
                    )
                ).data;
                if (
                    latest.reference !== value.sessionReference ||
                    latest.status !== 'DRAFT' ||
                    latest.version !== value.version
                ) {
                    setConflict(true);
                    throw new Error(
                        'Session berubah. Muat ulang dan tinjau daftar; request asli tidak ditimpa.',
                    );
                }
            }
            await save({ ...value, state: 'SENDING' });
            sent = value;
            await request(
                value.kind === 'create' ? store() : amend(value.sessionId!),
                session,
                controller.current.signal,
                value.kind === 'create'
                    ? { submission_key: value.key, task_ids: value.taskIds }
                    : {
                          expected_version: value.version,
                          reason: value.reason,
                          task_ids: value.taskIds,
                      },
            );
            const result = await reconcile(value);
            if (!result)
                throw new Error(
                    'Response diterima tetapi audit belum terverifikasi.',
                );
            await confirmed(result, value);
        } catch (error) {
            if (controller.current.signal.aborted) return;
            if (
                sent &&
                error instanceof ApiError &&
                [409, 422].includes(error.status)
            ) {
                await removeLocal(session, journalName)
                    .then(() => setAttempt(null))
                    .catch(() => setBlocked(true));
                setConflict(error.status === 409);
                setMessage(
                    error.status === 422
                        ? 'Periksa field yang ditandai. Pilihan tetap tersedia.'
                        : 'Session atau pickup berubah. Muat ulang dan tinjau pilihan.',
                );
            } else if (sent) {
                await save({ ...sent, state: 'UNCERTAIN' }).catch(() =>
                    setBlocked(true),
                );
                setMessage(
                    'Hasil pengiriman belum pasti. Periksa hasil handover sebelum mengulang atau mengubah pilihan.',
                );
            } else
                setMessage(
                    error instanceof Error
                        ? error.message
                        : 'Handover belum dapat dikirim.',
                );
            if (error instanceof ApiError)
                setErrors({
                    ...error.errors,
                    ...(Object.keys(error.errors).some((key) =>
                        key.startsWith('task_ids.'),
                    )
                        ? {
                              task_ids: [
                                  'Ada pickup yang tidak tersedia. Tinjau pilihan sebelum mengirim.',
                              ],
                          }
                        : {}),
                });
            await onFailure(error);
        } finally {
            work(false);
        }
    }
    async function sendLifecycle(value: HandoverAttempt, replay = false) {
        if (
            active.current ||
            !online ||
            !ready ||
            blocked ||
            (!replay && attempt)
        )
            return;
        if (
            replay &&
            !window.confirm(
                'Periksa hasil server lalu kirim ulang request asli dengan versi yang sama?',
            )
        )
            return;
        work(true);
        setMessage('');
        setErrors({});
        let sent = false;
        try {
            await request(me(), session, controller.current.signal);
            if (replay) {
                const found = await reconcile(value);
                if (found) {
                    await confirmed(found, value);
                    return;
                }
            }
            const current = (
                await request<{ data: Handover }>(
                    show(value.sessionId!),
                    session,
                    controller.current.signal,
                )
            ).data;
            if (
                current.reference !== value.sessionReference ||
                current.version !== value.version ||
                current.status === 'CLOSED'
            ) {
                setConflict(true);
                throw new Error(
                    'Session berubah. Periksa status server; input dan versi asli tidak diubah otomatis.',
                );
            }
            if (value.kind === 'verify') {
                const item = current.items?.find(
                    (item) => item.id === value.verification?.itemId,
                );
                if (
                    !item ||
                    item.status !== 'PENDING' ||
                    item.pickup_revision !== value.verification?.pickupRevision
                ) {
                    setConflict(true);
                    throw new Error(
                        'Paket atau POP berubah. Muat ulang session dan tinjau input.',
                    );
                }
            } else if (!current.can_close)
                throw new Error(
                    'Session belum dapat ditutup. Periksa semua paket, catatan selisih, dan POP yang perlu review.',
                );
            await save({ ...value, state: 'SENDING' });
            sent = true;
            const body =
                value.kind === 'verify'
                    ? {
                          expected_version: value.version,
                          expected_pickup_revision:
                              value.verification!.pickupRevision,
                          manual_hybrid: value.verification!.manual_hybrid,
                          cashless_hybrid: value.verification!.cashless_hybrid,
                          css_orion: value.verification!.css_orion,
                          discrepancy_notes:
                              value.verification!.discrepancy_notes,
                      }
                    : { expected_version: value.version };
            await request(
                value.kind === 'verify'
                    ? verify({
                          session: value.sessionId!,
                          item: value.verification!.itemId,
                      })
                    : close(value.sessionId!),
                session,
                controller.current.signal,
                body,
            );
            const result = await reconcile(value);
            if (!result)
                throw new Error('Audit hasil belum dapat dikonfirmasi.');
            await confirmed(result, value);
        } catch (error) {
            if (controller.current.signal.aborted) return;
            if (
                sent &&
                error instanceof ApiError &&
                [409, 422].includes(error.status)
            ) {
                await removeLocal(session, journalName)
                    .then(() => setAttempt(null))
                    .catch(() => setBlocked(true));
                setMessage(
                    error.status === 422
                        ? 'Periksa field yang ditandai. Input tetap tersedia.'
                        : 'Session atau POP berubah. Muat ulang dan tinjau; input tetap tersedia.',
                );
                setConflict(error.status === 409);
            } else if (sent) {
                await save({ ...value, state: 'UNCERTAIN' }).catch(() =>
                    setBlocked(true),
                );
                setMessage(
                    `${error instanceof ApiError && [409, 422].includes(error.status) ? error.message : 'Hasil verifikasi/penutupan belum pasti.'} Input asli tetap tersimpan; periksa hasil sebelum mengirim ulang atau mengubah input.`,
                );
            } else
                setMessage(
                    error instanceof Error
                        ? error.message
                        : 'Operasi belum dapat dilakukan.',
                );
            if (error instanceof ApiError) setErrors(error.errors);
            await onFailure(error);
        } finally {
            work(false);
        }
    }
    function lifecycleAttempt(kind: 'verify' | 'close'): HandoverAttempt {
        return {
            schema: 1,
            kind,
            state: 'SENDING',
            key: crypto.randomUUID(),
            taskIds: (detail?.items || []).map((item) => item.task_id),
            references: Object.fromEntries(
                (detail?.items || []).map((item) => [
                    item.task_id,
                    item.reference,
                ]),
            ),
            sessionId: detail!.id,
            sessionReference: detail!.reference,
            version:
                kind === 'verify'
                    ? verificationBaseline.version
                    : detail!.version,
            createdAt: new Date().toISOString(),
            ...(kind === 'verify'
                ? {
                      verification: {
                          itemId: verifyingId!,
                          pickupRevision: verificationBaseline.revision,
                          manual_hybrid: Number(verification.manual_hybrid),
                          cashless_hybrid: Number(verification.cashless_hybrid),
                          css_orion: Number(verification.css_orion),
                          discrepancy_notes:
                              verification.discrepancy_notes.trim() || null,
                      },
                  }
                : {}),
        };
    }
    function editMembers() {
        if (!detail?.can?.edit || attempt || blocked) return;
        setSelected(
            Object.fromEntries(
                (detail.items || []).map((item) => [
                    item.task_id,
                    {
                        id: item.task_id,
                        reference: item.reference,
                        customer_name: item.customer_name,
                        staff_name: item.pickup_staff?.name ?? null,
                        total: item.pickup.total,
                    },
                ]),
            ),
        );
        setReason('');
        setWizardStep(1);
        setEditing(true);
        setCreating(false);
        setCandidatePage(1);
    }
    function toggle(item: HandoverCandidate) {
        setSelected((previous) => {
            const next = { ...previous };
            if (next[item.id]) delete next[item.id];
            else if (Object.keys(next).length < 100) next[item.id] = item;
            return next;
        });
    }
    function openVerification(item: NonNullable<Handover['items']>[number]) {
        if (!detail?.can?.verify || item.status !== 'PENDING' || attempt)
            return;
        const existing = verificationDrafts[item.id];
        setVerifyingId(item.id);
        setVerification(
            existing?.values ?? {
                manual_hybrid: '',
                cashless_hybrid: '',
                css_orion: '',
                discrepancy_notes: '',
            },
        );
        setVerificationBaseline(
            existing
                ? { version: existing.version, revision: existing.revision }
                : { version: detail.version, revision: item.pickup_revision },
        );
        setErrors({});
        setMessage('');
        setConflict(false);
        window.scrollTo({ top: 0 });
    }
    function changeVerification(key: keyof VerificationInput, value: string) {
        const values = { ...verification, [key]: value };
        setVerification(values);
        setVerificationDrafts((previous) => ({
            ...previous,
            [verifyingId!]: { values, ...verificationBaseline },
        }));
        setErrors((previous) => {
            const next = { ...previous };
            delete next[key];
            return next;
        });
    }
    async function refreshVerification() {
        if (!detail || active.current || attempt) return;
        work(true);
        try {
            const latest = (
                await request<{ data: Handover }>(
                    show(detail.id),
                    session,
                    controller.current.signal,
                )
            ).data;
            setDetail(latest);
            const item = latest.items?.find(
                (value) => value.id === verifyingId,
            );
            if (!latest.can?.verify || !item || item.status !== 'PENDING') {
                setVerifyingId(null);
                setMessage(
                    'Status terbaru ditampilkan. Input sebelumnya tetap disimpan selama halaman ini terbuka.',
                );
            } else {
                const baseline = {
                    version: latest.version,
                    revision: item.pickup_revision,
                };
                setVerificationBaseline(baseline);
                setVerificationDrafts((previous) => ({
                    ...previous,
                    [item.id]: { values: verification, ...baseline },
                }));
                setMessage(
                    'POP terbaru ditampilkan. Periksa kembali jumlah dan catatan sebelum menyimpan.',
                );
            }
            setConflict(false);
            setErrors({});
        } catch (error) {
            setMessage(
                'Session belum dapat dimuat ulang. Input tetap tersedia.',
            );
            await onFailure(error);
        } finally {
            work(false);
        }
    }
    function backToList() {
        setDetail(null);
        setJustCreated(false);
        setJustClosed(false);
        setMessage('');
        setErrors({});
        setConflict(false);
    }
    const date = (value: string) =>
        new Date(value).toLocaleString('id-ID', { timeZone: session.timezone });
    const locked = busy || !!attempt || !ready || blocked;
    const selectedItems = Object.values(selected);
    const selectedTotal = selectedItems.reduce(
        (sum, item) => sum + item.total,
        0,
    );
    const verifying = detail?.items?.find((item) => item.id === verifyingId);
    const remaining =
        detail?.items?.filter((item) => item.status === 'PENDING') ?? [];
    const discrepancies =
        detail?.items?.filter((item) => item.status === 'DISCREPANCY').length ??
        0;
    const members: HandoverCandidate[] = editing
        ? (detail?.items ?? []).map((item) => ({
              id: item.task_id,
              reference: item.reference,
              customer_name: item.customer_name,
              staff_name: item.pickup_staff?.name ?? null,
              total: item.pickup.total,
          }))
        : [];
    const visibleChoices = [
        ...new Map(
            [...selectedItems, ...members, ...choices].map((item) => [
                item.id,
                item,
            ]),
        ).values(),
    ].filter(
        (item) =>
            !candidateSearch ||
            `${item.customer_name} ${item.staff_name ?? ''} PCK-${item.id} ${item.reference}`
                .toLowerCase()
                .includes(candidateSearch.toLowerCase()),
    );
    return (
        <section className="handover-workflow space-y-4" aria-busy={busy}>
            <h2 className="text-lg font-semibold">
                {verifying
                    ? 'Verifikasi Pickup'
                    : creating
                      ? 'Buat Handover'
                      : editing
                        ? 'Edit Session'
                        : justCreated
                          ? 'Handover Dibuat'
                          : justClosed
                            ? 'Handover Selesai'
                            : detail
                              ? 'Detail Handover'
                              : 'Handover Pickup'}
            </h2>
            {message && !attempt && (
                <OperationalFeedback
                    title={message}
                    tone={
                        Object.keys(errors).length || conflict
                            ? 'error'
                            : 'info'
                    }
                />
            )}
            {blocked && (
                <OperationalFeedback
                    title="Data pemulihan belum dapat dibaca"
                    tone="warning"
                >
                    <p>
                        Data tetap disimpan. Daftar dan detail server masih
                        dapat dibuka.
                    </p>
                    <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setRecoveryRead((value) => value + 1)}
                    >
                        Coba Baca Ulang Recovery
                    </Button>
                </OperationalFeedback>
            )}
            {!ready && (
                <OperationalFeedback
                    title="Memeriksa data tersimpan…"
                    tone="loading"
                />
            )}
            {attempt && (
                <div className="info-card space-y-3">
                    <OperationalFeedback
                        title={
                            busy
                                ? 'Sedang memeriksa handover…'
                                : 'Menunggu konfirmasi server'
                        }
                        tone={busy ? 'loading' : 'warning'}
                    >
                        {message ||
                            `Data ${attempt.taskIds.length} pickup tetap tersimpan. Periksa hasil sebelum mengirim ulang.`}
                    </OperationalFeedback>
                    <Button
                        className="w-full"
                        disabled={busy || !online}
                        onClick={() => void check()}
                    >
                        Periksa Hasil Handover
                    </Button>
                    <Button
                        className="w-full"
                        variant="outline"
                        disabled={busy || !online || blocked}
                        onClick={() => void send(true)}
                    >
                        Kirim Ulang Request Asli
                    </Button>
                    <details>
                        <summary>Kelola pemulihan</summary>
                        <Button
                            variant="ghost"
                            className="mt-2 text-red-700"
                            disabled={busy}
                            onClick={() => {
                                if (
                                    !window.confirm(
                                        'Buang data pemulihan setelah meninjau hasil server? Session server tidak dibatalkan. Data lokal yang dibuang tidak dapat dipulihkan.',
                                    )
                                )
                                    return;
                                work(true);
                                void clear()
                                    .catch(() =>
                                        setMessage(
                                            'Recovery belum dapat dibuang.',
                                        ),
                                    )
                                    .finally(() => work(false));
                            }}
                        >
                            Buang Recovery Setelah Review
                        </Button>
                    </details>
                </div>
            )}
            {verifying && detail ? (
                <form
                    className="space-y-4"
                    aria-label="Verifikasi Pickup Handover"
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (
                            locked ||
                            !online ||
                            conflict ||
                            !detail.can?.verify
                        )
                            return;
                        const invalid = verificationErrors(
                            verification,
                            verifying.pickup,
                        );
                        setErrors(invalid);
                        if (Object.keys(invalid).length) {
                            setMessage(
                                'Periksa field yang ditandai. Input tetap tersedia.',
                            );
                            return;
                        }
                        void sendLifecycle(lifecycleAttempt('verify'));
                    }}
                >
                    <div className="info-card">
                        <strong>
                            PCK-{verifying.task_id} · {verifying.customer_name}
                        </strong>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Catat jumlah fisik yang diterima. Jumlah lebih dari
                            POP diperbolehkan.
                        </p>
                    </div>
                    <fieldset disabled={locked} className="space-y-3">
                        {handoverCategories.map(([key, label]) => {
                            const received = receivedQuantity(
                                verification[key],
                            );
                            const difference =
                                received === null
                                    ? null
                                    : received - verifying.pickup[key];
                            return (
                                <div
                                    key={key}
                                    className="handover-quantity-row"
                                >
                                    <label
                                        className="font-semibold"
                                        htmlFor={`verify-${key}`}
                                    >
                                        {label}
                                    </label>
                                    <div className="handover-quantity-values">
                                        <span>
                                            POP{' '}
                                            <strong>
                                                {verifying.pickup[key]}
                                            </strong>
                                        </span>
                                        <div>
                                            <label
                                                className="mb-1 block text-sm"
                                                htmlFor={`verify-${key}`}
                                            >
                                                Diterima
                                            </label>
                                            <Input
                                                id={`verify-${key}`}
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={8}
                                                value={verification[key]}
                                                aria-invalid={!!errors[key]}
                                                aria-describedby={
                                                    errors[key]
                                                        ? `error-${key}`
                                                        : undefined
                                                }
                                                onChange={(event) =>
                                                    changeVerification(
                                                        key,
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                            {errors[key] && (
                                                <p
                                                    id={`error-${key}`}
                                                    className="mt-1 text-sm text-red-700"
                                                >
                                                    {errors[key][0]}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <p
                                        className="text-sm font-semibold"
                                        data-difference={
                                            difference === 0
                                                ? 'match'
                                                : difference === null
                                                  ? 'empty'
                                                  : 'different'
                                        }
                                    >
                                        Selisih:{' '}
                                        {difference === null
                                            ? '—'
                                            : differenceLabel(difference)}
                                    </p>
                                </div>
                            );
                        })}
                        <label
                            className="block space-y-2"
                            htmlFor="verify-discrepancy"
                        >
                            <span className="font-medium">Catatan selisih</span>
                            <small className="block text-muted-foreground">
                                Wajib bila salah satu kategori lebih atau
                                kurang.
                            </small>
                            <textarea
                                id="verify-discrepancy"
                                className="min-h-24 w-full rounded-lg border p-3"
                                maxLength={2000}
                                aria-invalid={!!errors.discrepancy_notes}
                                aria-describedby={
                                    errors.discrepancy_notes
                                        ? 'error-discrepancy'
                                        : undefined
                                }
                                value={verification.discrepancy_notes}
                                onChange={(event) =>
                                    changeVerification(
                                        'discrepancy_notes',
                                        event.target.value,
                                    )
                                }
                            />
                            {errors.discrepancy_notes && (
                                <span
                                    id="error-discrepancy"
                                    className="block text-sm text-red-700"
                                >
                                    {errors.discrepancy_notes[0]}
                                </span>
                            )}
                        </label>
                        <Button
                            className="workflow-primary"
                            disabled={!online || locked || conflict}
                        >
                            {busy ? 'Menyimpan…' : 'Simpan Verifikasi'}
                        </Button>
                    </fieldset>
                    {conflict && (
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            disabled={locked || !online}
                            onClick={() => void refreshVerification()}
                        >
                            Muat Ulang &amp; Tinjau POP
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={busy}
                        onClick={() => {
                            setVerifyingId(null);
                            setMessage('');
                            setErrors({});
                        }}
                    >
                        Kembali ke Detail
                    </Button>
                </form>
            ) : detail &&
              !creating &&
              !editing &&
              (justCreated || justClosed) ? (
                <div className="handover-completion space-y-3" role="status">
                    <CheckCircle2 size={36} aria-hidden="true" />
                    <h3 className="text-lg font-semibold">
                        {justCreated
                            ? 'Session berhasil dibuat'
                            : 'Session berhasil ditutup'}
                    </h3>
                    <strong>HO-{detail.id}</strong>
                    <span className="status-pill" data-status={detail.status}>
                        {handoverStatus(detail.status)}
                    </span>
                    <p>
                        {detail.items?.length ?? detail.task_count} pickup ·{' '}
                        {detail.total_packages} paket
                    </p>
                    <p className="text-sm">
                        {justCreated
                            ? 'Terkonfirmasi server. Session DRAFT belum berarti paket telah diterima atau diverifikasi.'
                            : 'Penutupan telah dikonfirmasi server. Catatan selisih tetap tersimpan.'}
                    </p>
                    <Button
                        className="w-full"
                        onClick={() => {
                            setJustCreated(false);
                            setJustClosed(false);
                        }}
                    >
                        Lihat Detail Handover
                    </Button>
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={backToList}
                    >
                        Kembali ke Daftar
                    </Button>
                </div>
            ) : detail && !creating && !editing ? (
                <>
                    <div className="info-card">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong>HO-{detail.id}</strong>
                            <span
                                className="status-pill"
                                data-status={detail.status}
                            >
                                {handoverStatus(detail.status)}
                            </span>
                        </div>
                        <dl className="facts mt-3">
                            <dt>Pembuat</dt>
                            <dd>
                                {detail.creator?.name ??
                                    `Petugas #${detail.created_by}`}
                            </dd>
                            <dt>Dibuat</dt>
                            <dd>
                                {detail.created_at
                                    ? date(detail.created_at)
                                    : '—'}
                            </dd>
                            <dt>Pickup / Paket</dt>
                            <dd>
                                {detail.items?.length ?? detail.task_count}{' '}
                                pickup · {detail.total_packages} paket
                            </dd>
                            <dt>Verifikasi</dt>
                            <dd>
                                {detail.verified_count ?? 0} diperiksa ·{' '}
                                {remaining.length} belum diperiksa
                            </dd>
                            <dt>Selisih</dt>
                            <dd>{discrepancies} pickup</dd>
                        </dl>
                    </div>
                    {(detail.review_count ?? 0) > 0 && (
                        <OperationalFeedback
                            title="POP berubah setelah verifikasi"
                            tone="warning"
                        >
                            Hasil sebelumnya tetap tercatat. Admin perlu
                            memeriksa ulang melalui alur koreksi yang tersedia.
                        </OperationalFeedback>
                    )}
                    {detail.can?.verify && remaining.length > 0 && (
                        <Button
                            className="workflow-primary"
                            disabled={locked || !online}
                            onClick={() => openVerification(remaining[0])}
                        >
                            {detail.verified_count
                                ? 'Lanjutkan Verifikasi'
                                : 'Mulai Verifikasi Pickup'}
                        </Button>
                    )}
                    {detail.status !== 'CLOSED' && detail.can?.receive && (
                        <div className="space-y-2">
                            {detail.can_close ? (
                                <Button
                                    className="workflow-primary"
                                    disabled={locked || !online}
                                    onClick={() => setCloseConfirm(true)}
                                >
                                    Tutup Session Handover
                                </Button>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Session dapat ditutup setelah seluruh pickup
                                    diperiksa, catatan selisih lengkap, dan
                                    tidak ada POP yang perlu diperiksa ulang.
                                </p>
                            )}
                        </div>
                    )}
                    {detail.status !== 'CLOSED' && !detail.can?.receive && (
                        <p className="text-sm text-muted-foreground">
                            Menunggu verifikasi dan penutupan oleh petugas
                            penerima yang berwenang.
                        </p>
                    )}
                    {detail.status === 'CLOSED' && (
                        <p className="text-sm">
                            Session ditutup
                            {detail.closed_at
                                ? ` · ${date(detail.closed_at)}`
                                : ''}
                            . Selisih tetap tercatat.
                        </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {detail.can?.edit && (
                            <Button
                                variant="outline"
                                disabled={locked}
                                onClick={editMembers}
                            >
                                Edit Session
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            disabled={busy || !online}
                            onClick={() => void readDetail(detail.id)}
                        >
                            Refresh Session
                        </Button>
                        <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={backToList}
                        >
                            Daftar Handover
                        </Button>
                    </div>
                    <div className="segmented">
                        <Button
                            variant="ghost"
                            aria-pressed={detailTab === 'packages'}
                            onClick={() => setDetailTab('packages')}
                        >
                            Daftar Pickup
                        </Button>
                        <Button
                            variant="ghost"
                            aria-pressed={detailTab === 'activity'}
                            onClick={() => setDetailTab('activity')}
                        >
                            Aktivitas
                        </Button>
                    </div>
                    {detailTab === 'packages' &&
                        detail.items?.map((item) => (
                            <article
                                key={item.id}
                                className="info-card space-y-3"
                            >
                                <div>
                                    <h3 className="font-semibold">
                                        PCK-{item.task_id} ·{' '}
                                        {item.customer_name}
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        {item.pickup_staff?.name} ·{' '}
                                        {item.pickup.total} paket POP
                                    </p>
                                </div>
                                <p className="text-sm font-semibold">
                                    {item.needs_review
                                        ? 'Perlu Pemeriksaan Ulang'
                                        : item.status === 'PENDING'
                                          ? 'Belum Diverifikasi'
                                          : item.status === 'VERIFIED'
                                            ? 'SESUAI'
                                            : 'SELISIH'}
                                </p>
                                {item.status === 'PENDING' ? (
                                    detail.can?.verify && (
                                        <Button
                                            variant="outline"
                                            className="w-full"
                                            disabled={locked || !online}
                                            onClick={() =>
                                                openVerification(item)
                                            }
                                        >
                                            Verifikasi PCK-{item.task_id}
                                        </Button>
                                    )
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            {handoverCategories.map(
                                                ([key, label]) => (
                                                    <div
                                                        key={key}
                                                        className="handover-result-row"
                                                    >
                                                        <span>{label}</span>
                                                        <span>
                                                            POP{' '}
                                                            {item
                                                                .verified_pickup?.[
                                                                key
                                                            ] ??
                                                                item.pickup[
                                                                    key
                                                                ]}{' '}
                                                            · Diterima{' '}
                                                            {item.retail[key]}
                                                            <strong className="block">
                                                                {differenceLabel(
                                                                    (item.verified_differences ??
                                                                        item.differences)?.[
                                                                        key
                                                                    ] ?? 0,
                                                                )}
                                                            </strong>
                                                        </span>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                        {item.discrepancy_notes && (
                                            <p className="text-sm">
                                                Catatan:{' '}
                                                {item.discrepancy_notes}
                                            </p>
                                        )}
                                        <p className="text-sm text-muted-foreground">
                                            Diverifikasi petugas #
                                            {item.verified_by}
                                            {item.verified_at
                                                ? ` · ${date(item.verified_at)}`
                                                : ''}
                                        </p>
                                        <details className="text-sm">
                                            <summary>
                                                Detail revisi dan audit
                                            </summary>
                                            <p>
                                                POP saat verifikasi: revisi{' '}
                                                {item.verified_pickup_revision ??
                                                    '—'}{' '}
                                                · POP terkini: revisi{' '}
                                                {item.pickup_revision}.
                                            </p>
                                            {item.revisions.map((revision) => (
                                                <p key={revision.revision}>
                                                    Koreksi {revision.revision}:{' '}
                                                    {revision.reason}
                                                </p>
                                            ))}
                                        </details>
                                    </>
                                )}
                                <Button
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() => onTask(item.task_id)}
                                >
                                    Lihat Pickup dan POP
                                </Button>
                            </article>
                        ))}
                    {detailTab === 'activity' && (
                        <ol className="activity-timeline">
                            {detail.events?.map((event) => (
                                <li key={event.session_version}>
                                    <strong>{eventLabel(event.action)}</strong>
                                    <small>
                                        {event.occurred_at
                                            ? date(event.occurred_at)
                                            : '—'}{' '}
                                        · petugas #{event.actor_id}
                                    </small>
                                    {event.reason && <p>{event.reason}</p>}
                                </li>
                            ))}
                        </ol>
                    )}
                    <details className="text-sm text-muted-foreground">
                        <summary>Informasi teknis session</summary>
                        <p>
                            {detail.reference} · versi {detail.version} · status{' '}
                            {detail.status}
                        </p>
                    </details>
                </>
            ) : creating || editing ? (
                <>
                    <WorkflowStepper
                        labels={['Pilih Pickup', 'Review']}
                        step={wizardStep}
                        label="Langkah handover"
                    />
                    {wizardStep === 1 ? (
                        <>
                            <p className="text-sm text-muted-foreground">
                                Pilih pickup dengan POP final yang belum masuk
                                session lain. Pickup lintas petugas tetap
                                diperbolehkan.
                            </p>
                            <Input
                                aria-label="Cari pickup handover"
                                placeholder="Cari customer, PCK, atau petugas"
                                maxLength={100}
                                value={candidateSearch}
                                disabled={busy}
                                onChange={(event) => {
                                    setCandidateSearch(event.target.value);
                                    setCandidatePage(1);
                                }}
                            />
                            <div className="handover-selection-summary">
                                <strong>
                                    {selectedItems.length} Pickup Dipilih
                                </strong>
                                <span>{selectedTotal} Paket</span>
                            </div>
                            {candidateLoading ? (
                                <OperationalFeedback
                                    title="Memuat pickup…"
                                    tone="loading"
                                />
                            ) : visibleChoices.length === 0 ? (
                                <div className="info-card">
                                    <h3 className="font-semibold">
                                        Tidak ada pickup yang siap ditambahkan
                                    </h3>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Coba pencarian lain atau muat ulang.
                                        Hanya POP final yang belum masuk session
                                        lain yang dapat dipilih.
                                    </p>
                                    <Button
                                        variant="outline"
                                        disabled={busy}
                                        onClick={() =>
                                            setRefresh((value) => value + 1)
                                        }
                                    >
                                        Muat Ulang Kandidat
                                    </Button>
                                </div>
                            ) : (
                                visibleChoices.map((item) => (
                                    <label
                                        key={item.id}
                                        className="handover-candidate"
                                        data-selected={!!selected[item.id]}
                                    >
                                        <input
                                            aria-label={`Pilih PCK-${item.id}`}
                                            type="checkbox"
                                            checked={!!selected[item.id]}
                                            disabled={
                                                locked ||
                                                (!selected[item.id] &&
                                                    selectedItems.length >= 100)
                                            }
                                            onChange={() => toggle(item)}
                                        />
                                        <span className="min-w-0">
                                            <strong className="block">
                                                {item.customer_name}
                                            </strong>
                                            <span className="block text-sm">
                                                PCK-{item.id} · {item.total}{' '}
                                                paket
                                            </span>
                                            <small className="block text-muted-foreground">
                                                {item.staff_name ??
                                                    'Petugas belum tersedia'}
                                            </small>
                                        </span>
                                    </label>
                                ))
                            )}
                            <div className="handover-pagination">
                                <Button
                                    variant="outline"
                                    disabled={
                                        busy ||
                                        candidateLoading ||
                                        candidatePage <= 1
                                    }
                                    onClick={() =>
                                        setCandidatePage((value) => value - 1)
                                    }
                                >
                                    Sebelumnya
                                </Button>
                                <span>
                                    {candidatePage}/{candidateLast}
                                </span>
                                <Button
                                    variant="outline"
                                    disabled={
                                        busy ||
                                        candidateLoading ||
                                        candidatePage >= candidateLast
                                    }
                                    onClick={() =>
                                        setCandidatePage((value) => value + 1)
                                    }
                                >
                                    Berikutnya
                                </Button>
                            </div>
                            <Button
                                className="workflow-primary"
                                disabled={
                                    locked ||
                                    selectedItems.length === 0 ||
                                    candidateLoading
                                }
                                onClick={() => {
                                    setWizardStep(2);
                                    setMessage('');
                                    setErrors({});
                                    window.scrollTo({ top: 0 });
                                }}
                            >
                                Review Handover
                            </Button>
                            <Button
                                variant="ghost"
                                disabled={busy}
                                onClick={() => {
                                    setCreating(false);
                                    setEditing(false);
                                }}
                            >
                                Kembali ke Daftar
                            </Button>
                        </>
                    ) : (
                        <>
                            <div className="info-card">
                                <h3 className="font-semibold">
                                    Ringkasan Handover
                                </h3>
                                <dl className="facts mt-3">
                                    <dt>Pembuat</dt>
                                    <dd>{session.user.name}</dd>
                                    <dt>Session</dt>
                                    <dd>
                                        {editing
                                            ? `HO-${detail?.id} · DRAFT`
                                            : 'DRAFT baru'}
                                    </dd>
                                    <dt>Pickup dipilih</dt>
                                    <dd>{selectedItems.length}</dd>
                                    <dt>Total paket</dt>
                                    <dd>{selectedTotal} paket</dd>
                                </dl>
                            </div>
                            {selectedItems.map((item) => (
                                <article
                                    className="info-card flex justify-between gap-3"
                                    key={item.id}
                                >
                                    <span>
                                        <strong>PCK-{item.id}</strong>
                                        <span className="block text-sm">
                                            {item.customer_name}
                                        </span>
                                    </span>
                                    <span>{item.total} paket</span>
                                </article>
                            ))}
                            {editing && (
                                <label className="block space-y-2">
                                    Alasan perubahan
                                    <Input
                                        id="handover-reason"
                                        maxLength={500}
                                        disabled={locked}
                                        aria-invalid={!!errors.reason}
                                        value={reason}
                                        onChange={(event) =>
                                            setReason(event.target.value)
                                        }
                                    />
                                    {errors.reason && (
                                        <span className="text-sm text-red-700">
                                            {errors.reason[0]}
                                        </span>
                                    )}
                                </label>
                            )}
                            <p className="text-sm text-muted-foreground">
                                {editing
                                    ? 'Perubahan mengganti seluruh daftar anggota DRAFT.'
                                    : 'Session akan dibuat sebagai DRAFT. Paket belum dianggap diterima sampai diverifikasi.'}
                            </p>
                            {errors.task_ids && (
                                <p className="text-sm text-red-700">
                                    {errors.task_ids[0]}
                                </p>
                            )}
                            <Button
                                className="workflow-primary"
                                disabled={
                                    locked ||
                                    conflict ||
                                    !online ||
                                    selectedItems.length === 0 ||
                                    (editing && !reason.trim())
                                }
                                onClick={() => void send()}
                            >
                                {busy
                                    ? 'Menyimpan…'
                                    : editing
                                      ? 'Simpan Perubahan Session'
                                      : 'Buat Session Handover'}
                            </Button>
                            <Button
                                className="w-full"
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                    setWizardStep(1);
                                    setMessage('');
                                    setErrors({});
                                }}
                            >
                                Kembali ke Pilih Pickup
                            </Button>
                            {conflict && detail && (
                                <Button
                                    variant="outline"
                                    disabled={busy || !online}
                                    onClick={() => void readDetail(detail.id)}
                                >
                                    Muat Ulang Session
                                </Button>
                            )}
                        </>
                    )}
                </>
            ) : (
                <>
                    <p className="text-sm text-muted-foreground">
                        Kelola serah terima paket fisik.
                    </p>
                    <div
                        className="handover-list-tabs"
                        role="group"
                        aria-label="Daftar handover"
                    >
                        {(
                            [
                                ['mine', 'Session Saya'],
                                ...(capabilities.receive
                                    ? [['receiving', 'Menunggu Verifikasi']]
                                    : []),
                                ['history', 'Riwayat Handover'],
                            ] as [typeof listScope, string][]
                        ).map(([key, label]) => (
                            <Button
                                key={key}
                                variant="ghost"
                                aria-pressed={listScope === key}
                                disabled={busy}
                                onClick={() => {
                                    setListScope(key);
                                    setPage(1);
                                }}
                            >
                                {label}
                            </Button>
                        ))}
                    </div>
                    <form
                        className="flex gap-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            setQ(search.trim());
                            setPage(1);
                        }}
                    >
                        <Input
                            aria-label="Cari handover"
                            placeholder="Referensi HO atau petugas"
                            value={search}
                            maxLength={100}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                        <Button variant="outline" disabled={busy}>
                            Cari Session
                        </Button>
                    </form>
                    {capabilities.create && (
                        <Button
                            className="workflow-primary"
                            disabled={locked}
                            onClick={() => {
                                setWizardStep(1);
                                setCreating(true);
                                setEditing(false);
                                setDetail(null);
                                setCandidatePage(1);
                                setCandidateSearch('');
                                setMessage('');
                                setErrors({});
                            }}
                        >
                            Buat Handover
                        </Button>
                    )}
                    {listLoading && (
                        <OperationalFeedback
                            title="Memuat handover…"
                            tone="loading"
                        />
                    )}
                    {listError && (
                        <OperationalFeedback title={listError} tone="error">
                            Gunakan Refresh Handover setelah koneksi tersedia.
                        </OperationalFeedback>
                    )}
                    {!listLoading && !listError && sessions.length === 0 && (
                        <div className="info-card text-center">
                            <h3 className="font-semibold">
                                {history
                                    ? 'Belum ada riwayat handover'
                                    : listScope === 'receiving'
                                      ? 'Tidak ada session menunggu verifikasi'
                                      : 'Belum ada session Anda'}
                            </h3>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {history
                                    ? 'Session yang selesai akan muncul di sini.'
                                    : listScope === 'receiving'
                                      ? 'Session baru yang perlu diperiksa akan muncul di sini.'
                                      : 'Pilih pickup yang sudah selesai untuk membuat handover.'}
                            </p>
                        </div>
                    )}
                    {sessions.map((value) => (
                        <Button
                            key={value.id}
                            variant="outline"
                            className="handover-card h-auto w-full justify-start whitespace-normal"
                            disabled={busy}
                            onClick={() => void readDetail(value.id)}
                        >
                            <span className="w-full text-left">
                                <span className="flex flex-wrap justify-between gap-2">
                                    <strong>HO-{value.id}</strong>
                                    <span
                                        className="status-pill"
                                        data-status={value.status}
                                    >
                                        {handoverStatus(value.status)}
                                    </span>
                                </span>
                                <span className="mt-2 block">
                                    {value.task_count} pickup ·{' '}
                                    {value.total_packages} paket
                                </span>
                                <small className="mt-1 block text-muted-foreground">
                                    {value.staff_names?.join(', ') ||
                                        value.creator?.name ||
                                        '—'}{' '}
                                    ·{' '}
                                    {value.created_at
                                        ? date(value.created_at)
                                        : '—'}
                                </small>
                                <span className="mt-2 block text-sm">
                                    {value.verified_count ?? 0} diperiksa ·{' '}
                                    {value.pending_count ?? 0} belum diperiksa
                                </span>
                                <span className="task-card-action secondary mt-3">
                                    Lihat Detail
                                </span>
                            </span>
                        </Button>
                    ))}
                    <div className="handover-pagination">
                        <Button
                            variant="outline"
                            disabled={busy || listLoading || page <= 1}
                            onClick={() => setPage((value) => value - 1)}
                        >
                            Session Sebelumnya
                        </Button>
                        <span>
                            {page}/{lastPage}
                        </span>
                        <Button
                            variant="outline"
                            disabled={busy || listLoading || page >= lastPage}
                            onClick={() => setPage((value) => value + 1)}
                        >
                            Session Berikutnya
                        </Button>
                    </div>
                    <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setRefresh((value) => value + 1)}
                    >
                        Refresh Handover
                    </Button>
                </>
            )}
            <Dialog open={closeConfirm} onOpenChange={setCloseConfirm}>
                <DialogContent className="mobile-dialog">
                    <DialogTitle>Tutup Session Handover?</DialogTitle>
                    <DialogDescription>
                        HO-{detail?.id}: {detail?.items?.length} pickup,{' '}
                        {detail?.verified_count} sudah diperiksa,{' '}
                        {discrepancies} selisih. Penutupan menyelesaikan
                        session; hasil dan catatan selisih tetap tercatat.
                        Koreksi mengikuti alur Admin yang tersedia.
                    </DialogDescription>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => setCloseConfirm(false)}
                        >
                            Kembali ke Detail
                        </Button>
                        <Button
                            disabled={locked || !online || !detail?.can_close}
                            onClick={() => {
                                setCloseConfirm(false);
                                void sendLifecycle(lifecycleAttempt('close'));
                            }}
                        >
                            Ya, Tutup Session
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}

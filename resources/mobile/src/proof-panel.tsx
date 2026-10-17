import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Camera,
    CameraErrorCode,
    CameraSource,
    CameraResultType,
} from '@capacitor/camera';
import type { RestoredListenerEvent } from '@capacitor/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { OperationalFeedback } from './feedback';
import { signatureHasInk } from './signature';
import PhotoGallery from './photo-gallery';
import type { LocalEvidence } from './local-store';
import SignaturePad from '@/components/signature-pad';
import { me } from '@/routes/mobile';
import { show, proof } from '@/routes/mobile/tasks';
import { show as lookup } from '@/routes/mobile/submissions';
import { request, ApiError } from './api';
import {
    readLocal,
    writeLocal,
    removeLocal,
    localNames,
    importPhoto,
    persistSignature,
    evidenceBlob,
    cleanupCamera,
    beginCapture,
    captureResult,
    captureFailure,
    finishCapture,
    chooseGallery,
} from './local-store';
import {
    newProofDraft,
    draftPayload,
    sameProofContext,
    readableProofDraft,
    proofWizardStep,
    proofDraftStatus,
    canDiscardProofDraft,
    packageQuantityError,
    type ProofDraft,
} from './proof-draft';
import type { Session, Task, Proof } from './types';

export default function ProofPanel({
    task,
    taskId,
    session,
    online,
    onTask,
    onFailure,
    restored,
    onRestoredConsumed,
    onBusyChange,
    onReviewChange,
    onRecoveredDraft,
    enabled,
    onPendingChange,
}: {
    task: Task | null;
    taskId: number;
    session: Session;
    online: boolean;
    onTask: (task: Task) => void;
    onFailure: (error: unknown) => Promise<void>;
    restored: RestoredListenerEvent | null;
    onRestoredConsumed: () => void;
    onBusyChange: (busy: boolean) => void;
    onReviewChange: (review: boolean) => void;
    onRecoveredDraft: () => void;
    enabled: boolean;
    onPendingChange: (pending: boolean) => void;
}) {
    const [draft, setDraft] = useState<ProofDraft | null>(null);
    const current = useRef<ProofDraft | null>(null);
    const panel = useRef<HTMLElement | null>(null);
    const draftIdentity = draft?.id;
    const draftStep = draft?.step;
    useEffect(() => {
        if (!draftIdentity) return;
        const frame = requestAnimationFrame(() =>
            window.scrollTo({ top: 0, behavior: 'smooth' }),
        );
        return () => cancelAnimationFrame(frame);
    }, [draftIdentity, draftStep, draft?.evidenceStep]);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const savedRef = useRef(false);
    const [busy, setBusy] = useState(false);
    const active = useRef(false);
    const [message, setMessage] = useState('');
    const [signature, setSignature] = useState<string | null>(null);
    const [signatureValid, setSignatureValid] = useState(false);
    const [signatureUnsaved, setSignatureUnsaved] = useState(false);
    const signaturePending = useRef(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>(
        {},
    );
    const initialized = useRef('');
    const galleryBack = useRef<(() => void) | null>(null);
    const galleryBackChange = useCallback((close: (() => void) | null) => {
        galleryBack.current = close;
    }, []);
    const [discard, setDiscard] = useState(false);
    const [submitConfirm, setSubmitConfirm] = useState(false);
    const [localBlocked, setLocalBlocked] = useState(false);
    const [recoveryAttempt, setRecoveryAttempt] = useState(0);
    const queue = useRef<Promise<void>>(Promise.resolve());
    const controller = useRef(new AbortController());
    const name = `pop-${taskId}`;
    useEffect(() => {
        onBusyChange(busy);
        return () => onBusyChange(false);
    }, [busy, onBusyChange]);
    useEffect(() => {
        onPendingChange(
            loading || localBlocked || (!!draft && draft.state !== 'CONFIRMED'),
        );
    }, [loading, localBlocked, draft?.state, onPendingChange]);
    useEffect(() => {
        if (
            loading ||
            localBlocked ||
            draft ||
            !enabled ||
            active.current ||
            initialized.current === name ||
            !task ||
            task.status !== 'ASSIGNED' ||
            !task.can.execute ||
            task.proof ||
            task.assigned_staff?.id !== session.user.id ||
            task.visits?.at(-1)?.outcome !== 'COLLECTED'
        )
            return;
        initialized.current = name;
        void persist(newProofDraft(task)).catch(() => undefined);
    }, [loading, localBlocked, draft, task, enabled, name, session.user.id]);
    async function persist(next: ProofDraft) {
        current.current = next;
        setDraft(next);
        setSaved(false);
        savedRef.current = false;
        const job = writeLocal(session, name, next);
        queue.current = job.catch(() => undefined);
        try {
            await job;
            if (current.current === next) {
                savedRef.current = true;
                setSaved(true);
            }
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : 'Draft belum tersimpan; data sebelumnya tetap tersedia.',
            );
            throw error;
        }
    }
    function edit(patch: Partial<ProofDraft>) {
        setFieldErrors({});
        const value = current.current;
        if (!value || value.state !== 'EDITING' || active.current) return;
        setMessage('');
        void persist({
            ...value,
            ...patch,
            updatedAt: new Date().toISOString(),
        }).catch(() => undefined);
    }
    useEffect(() => {
        onReviewChange(draft?.step === 3);
        return () => onReviewChange(false);
    }, [draft?.step, onReviewChange]);
    useEffect(() => {
        const back = (event: Event) => {
            if (event.defaultPrevented) return;
            if (galleryBack.current) {
                event.preventDefault();
                galleryBack.current();
                return;
            }
            if (active.current) {
                event.preventDefault();
                return;
            }
            const value = current.current;
            if (submitConfirm || discard) {
                event.preventDefault();
                setSubmitConfirm(false);
                setDiscard(false);
                return;
            }
            if (!value || value.state !== 'EDITING' || value.step === 1) return;
            event.preventDefault();
            if (value.step === 3) edit({ step: 2, evidenceStep: 'signature' });
            else if (value.evidenceStep === 'signature')
                edit({ evidenceStep: 'photos' });
            else edit({ step: 1 });
        };
        window.addEventListener('mobile-back', back);
        return () => window.removeEventListener('mobile-back', back);
    }, [submitConfirm, discard]);
    useEffect(() => {
        let disposed = false;
        controller.current = new AbortController();
        setLoading(true);
        setLocalBlocked(false);
        void readLocal<ProofDraft>(session, name)
            .then(async (value) => {
                if (disposed) return;
                if (
                    value !== null &&
                    (!readableProofDraft(value) || value.taskId !== taskId)
                )
                    throw new Error(
                        'Versi draft belum didukung. Data tetap disimpan; hubungi Admin.',
                    );
                if (value?.state === 'SENDING') {
                    value = { ...value, state: 'UNCERTAIN' };
                    await writeLocal(session, name, value);
                }
                if (disposed) return;
                current.current = value;
                setMessage('');
                setDraft(value);
                if (value) onRecoveredDraft();
                setSaved(true);
                savedRef.current = true;
                if (value?.signature) {
                    const blob = await evidenceBlob(session, value.signature);
                    if (!disposed) {
                        const reader = new FileReader();
                        const image = await new Promise<string>(
                            (resolve, reject) => {
                                reader.onload = () =>
                                    typeof reader.result === 'string'
                                        ? resolve(reader.result)
                                        : reject(
                                              new Error(
                                                  'Tanda tangan belum dapat dibaca.',
                                              ),
                                          );
                                reader.onerror = () =>
                                    reject(
                                        new Error(
                                            'Tanda tangan belum dapat dibaca.',
                                        ),
                                    );
                                reader.readAsDataURL(blob);
                            },
                        );
                        const hasInk = await signatureHasInk(image);
                        if (!disposed) {
                            setSignature(image);
                            setSignatureValid(hasInk);
                            if (!hasInk)
                                setMessage(
                                    'Tanda tangan kosong. Gambar ulang sebelum mengirim POP.',
                                );
                        }
                    }
                }
            })
            .catch((error) => {
                if (!disposed) {
                    setLocalBlocked(true);
                    setMessage(
                        error instanceof Error
                            ? error.message
                            : 'Draft belum dapat dibaca.',
                    );
                }
            })
            .finally(() => {
                if (!disposed) setLoading(false);
            });
        return () => {
            disposed = true;
            controller.current.abort();
        };
    }, [session.token, name, recoveryAttempt]);
    async function cleanup(value: ProofDraft) {
        const files = (await localNames(session)).filter((file) =>
            file.startsWith(`evidence-${value.id}-`),
        );
        for (const file of files) await removeLocal(session, file);
        for (const ticketName of (await localNames(session)).filter((file) =>
            file.startsWith('capture-'),
        )) {
            const ticket = await readLocal<{
                draftId: string;
                operationId: string;
                uri?: string;
            }>(session, ticketName);
            if (ticket?.draftId === value.id) {
                if (ticket.uri)
                    await cleanupCamera(session, ticket.uri).catch(
                        () => undefined,
                    );
                await finishCapture(session, ticket.operationId);
            }
        }
        await removeLocal(session, name);
        current.current = null;
        setDraft(null);
        setSignature(null);
        setSignatureValid(false);
    }
    async function completeCapture(uri: string, value: ProofDraft) {
        if (!value.pendingCapture || value.state !== 'EDITING')
            throw new Error('Capture tidak cocok dengan draft editing.');
        const pending = { ...value.pendingCapture, uri };
        await persist({ ...value, pendingCapture: pending });
        const image = await importPhoto(
            session,
            pending.evidenceName,
            uri,
            pending.operationId,
        );
        const fresh = current.current;
        if (!fresh || fresh.id !== value.id || fresh.photos.length >= 4)
            throw new Error('Draft berubah; foto tidak ditempelkan otomatis.');
        await persist({
            ...fresh,
            photos: [...fresh.photos, image],
            pendingCapture: undefined,
            updatedAt: new Date().toISOString(),
        });
        await finishCapture(session, pending.operationId);
        await cleanupCamera(session, uri).catch(() =>
            setMessage(
                'Foto tersimpan terenkripsi; cache kamera belum dapat dibersihkan.',
            ),
        );
    }
    useEffect(() => {
        const value = current.current;
        if (
            loading ||
            !restored ||
            !value?.pendingCapture ||
            !['Camera', 'MobileLocal'].includes(restored.pluginId)
        )
            return;
        if (active.current) return;
        active.current = true;
        setBusy(true);
        void readLocal<{ uri?: string; draftId: string }>(
            session,
            `capture-${value.pendingCapture.operationId}`,
        )
            .then(async (ticket) => {
                if (ticket?.draftId !== value.id || !ticket.uri)
                    throw new Error(
                        'Capture belum tersedia pada akun/draft ini.',
                    );
                await completeCapture(ticket.uri, value);
                onRestoredConsumed();
            })
            .catch(() =>
                setMessage(
                    'Hasil kamera belum tersimpan; draft/capture dipertahankan.',
                ),
            )
            .finally(() => {
                active.current = false;
                setBusy(false);
            });
    }, [restored, loading, draft?.id]);
    async function capture(source: 'camera' | 'gallery') {
        const value = current.current;
        if (
            !value ||
            active.current ||
            value.pendingCapture ||
            value.photos.length >= 4 ||
            value.state !== 'EDITING'
        )
            return;
        active.current = true;
        setBusy(true);
        setMessage('');
        try {
            await queue.current;
            const pendingCapture = {
                operationId: crypto.randomUUID(),
                evidenceName: `evidence-${value.id}-${crypto.randomUUID()}`,
            };
            await persist({ ...value, pendingCapture });
            await beginCapture(
                session,
                pendingCapture.evidenceName,
                taskId,
                value.id,
                pendingCapture.operationId,
                source === 'camera' ? 'getPhoto' : 'chooseFromGallery',
            );
            const result =
                source === 'camera'
                    ? await Camera.getPhoto({
                          quality: 80,
                          width: 1920,
                          height: 1920,
                          source: CameraSource.Camera,
                          resultType: CameraResultType.Uri,
                          saveToGallery: false,
                      }).then((value) => ({ uri: value.path }))
                    : await chooseGallery(session, pendingCapture.operationId);
            if (!result?.uri) throw new Error('Tidak ada foto yang dipilih.');
            await captureResult(
                result.uri,
                source === 'camera' ? 'getPhoto' : 'chooseFromGallery',
                current.current!.pendingCapture!.operationId,
            );
            await completeCapture(result.uri, current.current!);
        } catch (error) {
            const code = (error as { code?: string })?.code;
            if (
                (error instanceof Error &&
                    error.message === 'User cancelled photos app') ||
                [
                    CameraErrorCode.TakePhotoCancelled,
                    CameraErrorCode.ChooseMediaCancelled,
                    CameraErrorCode.CameraPermissionDenied,
                    CameraErrorCode.GalleryPermissionDenied,
                ].some((value) => value === code)
            ) {
                const pending = current.current?.pendingCapture;
                if (pending) {
                    try {
                        await finishCapture(session, pending.operationId);
                        await persist({
                            ...current.current!,
                            pendingCapture: undefined,
                        });
                    } catch (cleanupError) {
                        setMessage(
                            cleanupError instanceof Error
                                ? cleanupError.message
                                : 'Pembatalan foto belum tersimpan. Periksa capture tertunda sebelum melanjutkan.',
                        );
                        return;
                    }
                }
                setMessage(
                    [
                        CameraErrorCode.CameraPermissionDenied,
                        CameraErrorCode.GalleryPermissionDenied,
                    ].some((value) => value === code)
                        ? 'Izinkan akses kamera atau galeri di pengaturan perangkat untuk menambah foto. Foto tetap opsional.'
                        : '',
                );
                return;
            }
            await captureFailure(
                source === 'camera' ? 'getPhoto' : 'chooseFromGallery',
            ).catch(() => undefined);
            setMessage(
                error instanceof Error
                    ? error.message
                    : 'Kamera/galeri dibatalkan atau foto belum tersimpan. Draft tetap tersedia.',
            );
        } finally {
            active.current = false;
            setBusy(false);
        }
    }
    async function deletePhoto(image: LocalEvidence) {
        const value = current.current;
        if (
            !value ||
            value.state !== 'EDITING' ||
            value.pendingCapture ||
            !value.photos.some(
                (photo) =>
                    photo.name === image.name && photo.sha256 === image.sha256,
            ) ||
            active.current
        )
            throw new Error('Draft belum dapat diubah.');
        active.current = true;
        setBusy(true);
        setMessage('');
        try {
            await queue.current;
            await persist({
                ...value,
                photos: value.photos.filter(
                    (photo) => photo.name !== image.name,
                ),
                updatedAt: new Date().toISOString(),
            });
            await removeLocal(session, image.name).catch(() =>
                setMessage(
                    'Foto telah dikeluarkan dari draft; salinan lokal belum dapat dibersihkan.',
                ),
            );
        } finally {
            active.current = false;
            setBusy(false);
        }
    }
    async function changeSignature(value: string | null) {
        const before = current.current;
        if (!before || before.state !== 'EDITING' || active.current) return;
        active.current = true;
        setBusy(true);
        setSignature(value);
        setSignatureValid(false);
        signaturePending.current = true;
        setSignatureUnsaved(true);
        try {
            if (value && !(await signatureHasInk(value)))
                throw new Error(
                    'Tanda tangan kosong. Gambar ulang sebelum mengirim POP.',
                );
            const stored = value
                ? await persistSignature(
                      session,
                      `evidence-${before.id}-${crypto.randomUUID()}`,
                      value,
                  )
                : null;
            await persist({
                ...before,
                signature: stored,
                updatedAt: new Date().toISOString(),
            });
            signaturePending.current = false;
            setSignatureValid(!!value);
            setSignatureUnsaved(false);
            if (before.signature)
                await removeLocal(session, before.signature.name);
        } catch {
            setMessage(
                'Tanda tangan belum tersimpan atau belum berisi goresan. Gambar ulang atau simpan ulang sebelum mengirim.',
            );
            savedRef.current = false;
            setSaved(false);
        } finally {
            active.current = false;
            setBusy(false);
        }
    }
    async function reconcile(value: ProofDraft): Promise<boolean> {
        const committed = await request<{
            data: { resource_id: number; task_id: number };
        }>(
            lookup(value.submissionKey, { query: { kind: 'proof' } }),
            session,
            controller.current.signal,
        );
        const latest = await request<{ data: Task }>(
            show(taskId),
            session,
            controller.current.signal,
        );
        if (
            latest.data.status !== 'PICKED_UP' ||
            latest.data.proof?.id !== committed.data.resource_id ||
            committed.data.task_id !== taskId
        )
            throw new Error(
                'POP belum dapat diverifikasi; bukti lokal dipertahankan.',
            );
        if (controller.current.signal.aborted) return false;
        await persist({ ...value, state: 'CONFIRMED' });
        onTask(latest.data);
        await cleanup(current.current!).catch(() =>
            setMessage(
                'Berhasil diselesaikan. Salinan lokal belum dibersihkan; periksa hasil POP kembali.',
            ),
        );
        return true;
    }
    async function submit() {
        const value = current.current;
        if (
            !value ||
            active.current ||
            !online ||
            !savedRef.current ||
            signaturePending.current ||
            !signatureValid
        )
            return;
        active.current = true;
        setBusy(true);
        setSubmitConfirm(false);
        setMessage('');
        let sending: ProofDraft | null = null;
        try {
            await queue.current;
            if (!signature || !(await signatureHasInk(signature)))
                throw new Error(
                    'Tanda tangan wajib berisi goresan. Kembali ke langkah tanda tangan.',
                );
            await request(me(), session, controller.current.signal);
            const fresh = await request<{ data: Task }>(
                show(taskId),
                session,
                controller.current.signal,
            );
            onTask(fresh.data);
            if (value.state === 'UNCERTAIN' || value.state === 'SENDING') {
                try {
                    if (await reconcile(value)) return;
                } catch (error) {
                    if (!(error instanceof ApiError && error.status === 404))
                        throw error;
                }
                if (
                    !value.attempt ||
                    !sameProofContext(fresh.data, value, session.user.id) ||
                    fresh.data.version !== value.attempt.expected_version
                )
                    throw new Error(
                        'Hasil belum pasti atau tugas berubah. Data tetap disimpan; periksa hasil atau hubungi Admin.',
                    );
            } else {
                if (
                    !sameProofContext(fresh.data, value, session.user.id) ||
                    fresh.data.version !== value.version
                ) {
                    await persist({ ...value, state: 'BLOCKED' });
                    throw new Error(
                        'Tugas atau petugas sudah berubah. Tinjau detail terbaru; draft tetap tersimpan.',
                    );
                }
            }
            const attempt = value.attempt || draftPayload(value);
            sending = { ...value, attempt, state: 'SENDING' };
            await persist(sending);
            const form = new FormData();
            for (const [key, item] of Object.entries(attempt))
                form.append(key, String(item));
            for (const [index, image] of value.photos.entries()) {
                const blob = await evidenceBlob(session, image);
                form.append(
                    `photos[${index}]`,
                    blob,
                    `photo-${index}.${image.mime === 'image/png' ? 'png' : image.mime === 'image/webp' ? 'webp' : 'jpg'}`,
                );
            }
            if (!value.signature)
                throw new Error('Tanda tangan tidak tersedia.');
            form.append(
                'signature',
                await evidenceBlob(session, value.signature),
                'signature.png',
            );
            const result = await request<{ data: Proof }>(
                proof(taskId),
                session,
                controller.current.signal,
                form,
            );
            const canonical = await request<{ data: Task }>(
                show(taskId),
                session,
                controller.current.signal,
            );
            if (
                canonical.data.status !== 'PICKED_UP' ||
                canonical.data.proof?.id !== result.data.id
            )
                throw new Error('Konfirmasi POP belum dapat dibaca.');
            await persist({ ...sending, state: 'CONFIRMED' });
            onTask(canonical.data);
            await cleanup(current.current!).catch(() =>
                setMessage(
                    'Berhasil diselesaikan. Salinan lokal belum dibersihkan; periksa hasil POP kembali.',
                ),
            );
        } catch (error) {
            if (controller.current.signal.aborted) return;
            if (sending && error instanceof ApiError && error.status === 422) {
                setFieldErrors(error.errors);
                await persist({
                    ...sending,
                    state: 'EDITING',
                    attempt: undefined,
                }).catch(() => undefined);
                setMessage(
                    error.message +
                        ' ' +
                        Object.values(error.errors).flat().join(' '),
                );
            } else if (sending) {
                const uncertain = { ...sending, state: 'UNCERTAIN' as const };
                await persist(uncertain).catch(() => undefined);
                setMessage(
                    'Hasil pengiriman belum dapat dipastikan. Data dan bukti tetap tersimpan. Pilih Periksa Hasil POP.',
                );
                await reconcile(uncertain).catch(() => undefined);
            } else {
                if (
                    value.state === 'EDITING' &&
                    error instanceof ApiError &&
                    [403, 404].includes(error.status)
                ) {
                    await persist({ ...value, state: 'BLOCKED' }).catch(
                        () => undefined,
                    );
                }
                setMessage(
                    error instanceof Error
                        ? error.message
                        : 'Finalisasi belum dapat dilakukan.',
                );
            }
            if (error instanceof ApiError && [401, 403].includes(error.status))
                await onFailure(error);
        } finally {
            active.current = false;
            setBusy(false);
        }
    }
    const locked = busy || draft?.state !== 'EDITING';
    const quantitiesValid =
        !!draft &&
        Object.values(draft.quantities).every(
            (value) => !packageQuantityError(value),
        );
    const totalPackages = draft
        ? Object.values(draft.quantities).reduce(
              (sum, value) => sum + Number(value),
              0,
          )
        : 0;
    const validPayload = (() => {
        if (!draft || !signatureValid || !!draft.pendingCapture) return false;
        try {
            draftPayload(draft);
            return true;
        } catch {
            return false;
        }
    })();
    if (draft?.state === 'CONFIRMED' && !message) return null;
    if (
        !loading &&
        !draft &&
        !localBlocked &&
        !message &&
        (!task?.can.execute || task?.visits?.at(-1)?.outcome !== 'COLLECTED')
    )
        return null;
    return (
        <section ref={panel} className="space-y-4 pb-3" aria-label="Draft POP">
            <h3 className="text-lg font-semibold">
                {draft?.step === 3 ? 'Review POP' : 'Bukti Pickup (POP)'}
            </h3>
            {message && !draft && (
                <OperationalFeedback title={message} tone="error" />
            )}
            {localBlocked && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    <p>
                        Draft dan bukti tetap disimpan. Informasi tugas dapat
                        dibaca, tetapi POP menunggu draft dapat dipulihkan.
                        Jangan hapus data aplikasi.
                    </p>
                    <Button
                        variant="outline"
                        className="mt-2"
                        disabled={busy}
                        onClick={() => setRecoveryAttempt((value) => value + 1)}
                    >
                        Coba Baca Ulang Draft
                    </Button>
                </div>
            )}
            {loading ? (
                <OperationalFeedback title="Membaca draft…" tone="loading" />
            ) : !draft ? (
                !localBlocked &&
                task?.can.execute &&
                task.visits?.at(-1)?.outcome === 'COLLECTED' && (
                    <Button
                        className="h-12 w-full text-base"
                        disabled={busy}
                        onClick={() => {
                            setMessage('');
                            void persist(newProofDraft(task)).catch(
                                () => undefined,
                            );
                        }}
                    >
                        Buat Draft POP
                    </Button>
                )
            ) : (
                <>
                    <OperationalFeedback
                        {...proofDraftStatus(draft, saved && !signatureUnsaved)}
                        tone={
                            message
                                ? draft.state === 'UNCERTAIN'
                                    ? 'warning'
                                    : 'error'
                                : proofDraftStatus(
                                      draft,
                                      saved && !signatureUnsaved,
                                  ).tone
                        }
                    >
                        {message ||
                            (draft.state === 'UNCERTAIN'
                                ? 'Data dan bukti tetap tersimpan. Periksa hasil POP sebelum mengirim ulang.'
                                : draft.state === 'SENDING'
                                  ? 'Tunggu sebentar. Jangan tutup aplikasi saat mengirim.'
                                  : draft.state === 'BLOCKED'
                                    ? 'Tugas sudah berubah atau akses tidak tersedia. Periksa detail tugas; draft tetap disimpan.'
                                    : !saved || signatureUnsaved
                                      ? 'Simpan ulang sebelum melanjutkan.'
                                      : undefined)}
                    </OperationalFeedback>
                    {Date.now() - Date.parse(draft.updatedAt) >
                        7 * 86400000 && (
                        <p>
                            Draft belum diubah selama 7 hari. Tinjau pekerjaan;
                            tidak ada penghapusan otomatis.
                        </p>
                    )}
                    {(!task ||
                        !sameProofContext(task, draft, session.user.id)) &&
                        draft.state !== 'CONFIRMED' && (
                            <p role="alert">
                                Tugas berubah, akses tidak tersedia, atau server
                                belum tersedia. Draft tetap tersimpan; periksa
                                detail terbaru sebelum mengirim.
                            </p>
                        )}
                    {draft.state === 'EDITING' ? (
                        <>
                            <ol aria-label="Langkah POP" className="proof-tabs">
                                {[
                                    'Jumlah',
                                    'Foto',
                                    'Tanda tangan',
                                    'Review',
                                ].map((label, index) => (
                                    <li
                                        key={label}
                                        aria-current={
                                            proofWizardStep(draft) === index + 1
                                                ? 'step'
                                                : undefined
                                        }
                                    >
                                        <button
                                            type="button"
                                            disabled={
                                                locked ||
                                                signatureUnsaved ||
                                                (index > 0 &&
                                                    !(
                                                        quantitiesValid &&
                                                        totalPackages > 0
                                                    )) ||
                                                (index === 3 &&
                                                    (!validPayload ||
                                                        !saved)) ||
                                                !!draft.pendingCapture
                                            }
                                            onClick={() =>
                                                edit(
                                                    index === 0
                                                        ? { step: 1 }
                                                        : index === 3
                                                          ? { step: 3 }
                                                          : {
                                                                step: 2,
                                                                evidenceStep:
                                                                    index === 1
                                                                        ? 'photos'
                                                                        : 'signature',
                                                            },
                                                )
                                            }
                                        >
                                            <span>{label}</span>
                                            <small>
                                                {index === 0
                                                    ? 'Wajib'
                                                    : index === 1
                                                      ? draft.photos.length +
                                                        '/4 · opsional'
                                                      : index === 2
                                                        ? signatureValid
                                                            ? 'Sudah diisi'
                                                            : 'Wajib'
                                                        : 'Periksa'}
                                            </small>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                            {draft.step === 1 && (
                                <>
                                    {(
                                        [
                                            [
                                                'manual_hybrid',
                                                'Manual Hybrid Non-Cashless',
                                            ],
                                            [
                                                'cashless_hybrid',
                                                'Cashless Hybrid',
                                            ],
                                            ['css_orion', 'CSS / Orion'],
                                        ] as const
                                    ).map(([key, label]) => (
                                        <QuantityControl
                                            key={key}
                                            name={key}
                                            label={label}
                                            value={draft.quantities[key]}
                                            disabled={locked}
                                            error={
                                                packageQuantityError(
                                                    draft.quantities[key],
                                                ) || fieldErrors[key]?.join(' ')
                                            }
                                            onChange={(value) =>
                                                edit({
                                                    quantities: {
                                                        ...current.current!
                                                            .quantities,
                                                        [key]: value,
                                                    },
                                                })
                                            }
                                            onAdjust={(delta) => {
                                                const quantities =
                                                    current.current!.quantities;
                                                const value = Number(
                                                    quantities[key],
                                                );
                                                if (
                                                    packageQuantityError(
                                                        quantities[key],
                                                    ) ||
                                                    value + delta < 0 ||
                                                    value + delta > 1000000
                                                )
                                                    return;
                                                edit({
                                                    quantities: {
                                                        ...quantities,
                                                        [key]: String(
                                                            value + delta,
                                                        ),
                                                    },
                                                });
                                            }}
                                        />
                                    ))}
                                    <div className="quantity-total">
                                        <span>Total paket</span>
                                        <strong>
                                            {quantitiesValid
                                                ? totalPackages.toLocaleString(
                                                      'id-ID',
                                                  )
                                                : '—'}
                                        </strong>
                                    </div>
                                    <Button
                                        className="workflow-primary"
                                        disabled={
                                            locked ||
                                            !quantitiesValid ||
                                            totalPackages <= 0
                                        }
                                        onClick={() =>
                                            edit({
                                                step: 2,
                                                evidenceStep: 'photos',
                                            })
                                        }
                                    >
                                        Lanjut ke Foto
                                    </Button>
                                </>
                            )}
                            {draft.step === 2 &&
                                draft.evidenceStep !== 'signature' && (
                                    <>
                                        <p>
                                            Foto opsional: {draft.photos.length}
                                            /4 · JPEG/PNG/WebP maksimal 5 MiB.
                                        </p>
                                        <PhotoGallery
                                            onBackChange={galleryBackChange}
                                            session={session}
                                            photos={draft.photos}
                                            disabled={
                                                locked || !!draft.pendingCapture
                                            }
                                            onCapture={capture}
                                            onDelete={deletePhoto}
                                        />
                                        {draft.pendingCapture && (
                                            <>
                                                <Button
                                                    variant="outline"
                                                    disabled={busy}
                                                    onClick={() => {
                                                        active.current = true;
                                                        setBusy(true);
                                                        void readLocal<{
                                                            uri?: string;
                                                        }>(
                                                            session,
                                                            `capture-${draft.pendingCapture!.operationId}`,
                                                        )
                                                            .then(
                                                                async (
                                                                    ticket,
                                                                ) => {
                                                                    if (
                                                                        !ticket?.uri
                                                                    )
                                                                        throw new Error(
                                                                            'Capture belum memiliki hasil.',
                                                                        );
                                                                    await completeCapture(
                                                                        ticket.uri,
                                                                        draft,
                                                                    );
                                                                },
                                                            )
                                                            .catch(() =>
                                                                setMessage(
                                                                    'Capture belum tersedia atau gagal disimpan.',
                                                                ),
                                                            )
                                                            .finally(() => {
                                                                active.current = false;
                                                                setBusy(false);
                                                            });
                                                    }}
                                                >
                                                    Pulihkan Capture
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    disabled={busy}
                                                    onClick={() => {
                                                        if (
                                                            !window.confirm(
                                                                'Batalkan capture tertunda ini? Hasil foto yang belum ditambahkan tidak akan dipakai. Draft lain tetap disimpan.',
                                                            )
                                                        )
                                                            return;
                                                        void finishCapture(
                                                            session,
                                                            draft
                                                                .pendingCapture!
                                                                .operationId,
                                                        )
                                                            .then(() =>
                                                                persist({
                                                                    ...draft,
                                                                    pendingCapture:
                                                                        undefined,
                                                                }),
                                                            )
                                                            .catch(() =>
                                                                setMessage(
                                                                    'Capture belum dapat ditutup.',
                                                                ),
                                                            );
                                                    }}
                                                >
                                                    Batalkan Capture Tertunda
                                                </Button>
                                            </>
                                        )}
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                variant="outline"
                                                disabled={locked}
                                                onClick={() =>
                                                    edit({ step: 1 })
                                                }
                                            >
                                                Kembali ke Jumlah
                                            </Button>
                                            <Button
                                                disabled={
                                                    locked ||
                                                    !!draft.pendingCapture
                                                }
                                                onClick={() =>
                                                    edit({
                                                        evidenceStep:
                                                            'signature',
                                                    })
                                                }
                                            >
                                                Lanjut ke Tanda Tangan
                                            </Button>
                                        </div>
                                    </>
                                )}
                            {draft.step === 2 &&
                                draft.evidenceStep === 'signature' && (
                                    <>
                                        <h4 className="font-semibold">
                                            Tanda tangan penerima (wajib)
                                        </h4>
                                        <p className="text-sm text-muted-foreground">
                                            Minta penerima menandatangani bukti
                                            pickup. Tanda tangan kosong tidak
                                            dapat disubmit.
                                        </p>
                                        <SignaturePad
                                            value={signature}
                                            onChange={(value) =>
                                                void changeSignature(value)
                                            }
                                            disabled={locked}
                                        />
                                        {fieldErrors.signature && (
                                            <p role="alert">
                                                {fieldErrors.signature.join(
                                                    ' ',
                                                )}
                                            </p>
                                        )}
                                        <Label htmlFor="proof-notes">
                                            Catatan pickup (opsional)
                                        </Label>
                                        <Input
                                            id="proof-notes"
                                            maxLength={2000}
                                            value={draft.notes}
                                            disabled={locked}
                                            onChange={(event) =>
                                                edit({
                                                    notes: event.target.value,
                                                })
                                            }
                                        />
                                        <Button
                                            variant="outline"
                                            disabled={locked}
                                            onClick={() =>
                                                edit({ evidenceStep: 'photos' })
                                            }
                                        >
                                            Kembali ke Foto
                                        </Button>
                                        <Button
                                            className="h-12 w-full"
                                            disabled={
                                                locked ||
                                                !draft.signature ||
                                                !signatureValid ||
                                                !saved ||
                                                signatureUnsaved
                                            }
                                            onClick={() => edit({ step: 3 })}
                                        >
                                            Review POP
                                        </Button>
                                    </>
                                )}
                            {draft.step === 3 && (
                                <>
                                    <div className="info-card">
                                        <strong>Ringkasan POP</strong>
                                        <dl className="facts">
                                            <dt>Pickup</dt>
                                            <dd>PCK-{taskId}</dd>
                                            <dt>Customer</dt>
                                            <dd>
                                                {task?.customer.name ||
                                                    'Detail server belum tersedia'}
                                            </dd>
                                            <dt>Manual Hybrid Non-Cashless</dt>
                                            <dd>
                                                {draft.quantities.manual_hybrid}
                                            </dd>
                                            <dt>Cashless Hybrid</dt>
                                            <dd>
                                                {
                                                    draft.quantities
                                                        .cashless_hybrid
                                                }
                                            </dd>
                                            <dt>CSS / Orion</dt>
                                            <dd>
                                                {draft.quantities.css_orion}
                                            </dd>
                                            <dt>Total paket</dt>
                                            <dd>
                                                {Object.values(
                                                    draft.quantities,
                                                ).reduce(
                                                    (sum, value) =>
                                                        sum + Number(value),
                                                    0,
                                                )}
                                            </dd>
                                            <dt>Foto (opsional)</dt>
                                            <dd>{draft.photos.length} foto</dd>
                                            <dt>Tanda tangan (wajib)</dt>
                                            <dd>
                                                {signatureValid
                                                    ? 'Sudah diisi'
                                                    : 'Belum lengkap'}
                                            </dd>
                                            {draft.notes && (
                                                <>
                                                    <dt>Catatan</dt>
                                                    <dd>{draft.notes}</dd>
                                                </>
                                            )}
                                        </dl>
                                        {signature && (
                                            <img
                                                src={signature}
                                                alt="Tanda tangan tersimpan"
                                                className="mt-3 h-32 w-full rounded-lg border bg-white object-contain"
                                            />
                                        )}
                                    </div>
                                    <Button
                                        className="w-full"
                                        variant="outline"
                                        disabled={locked}
                                        onClick={() =>
                                            edit({
                                                step: 2,
                                                evidenceStep: 'signature',
                                            })
                                        }
                                    >
                                        Ubah Bukti
                                    </Button>
                                    <p className="text-sm text-muted-foreground">
                                        Selesaikan pickup untuk mengirim POP dan
                                        bukti di atas. Perubahan setelah dikirim
                                        perlu koreksi melalui Admin.
                                    </p>
                                    <Button
                                        className="h-12 w-full text-base"
                                        disabled={
                                            locked ||
                                            !online ||
                                            !saved ||
                                            signatureUnsaved ||
                                            !validPayload ||
                                            !task
                                        }
                                        onClick={() => {
                                            try {
                                                draftPayload(draft);
                                                setSubmitConfirm(true);
                                            } catch (error) {
                                                setMessage(
                                                    error instanceof Error
                                                        ? error.message
                                                        : 'POP tidak valid.',
                                                );
                                            }
                                        }}
                                    >
                                        {busy
                                            ? 'Mengirim POP…'
                                            : 'Selesaikan Pickup'}
                                    </Button>
                                </>
                            )}
                            {(!saved || signatureUnsaved) && (
                                <Button
                                    disabled={busy}
                                    onClick={() =>
                                        void (
                                            signaturePending.current
                                                ? changeSignature(signature)
                                                : persist(current.current!)
                                        ).catch(() => undefined)
                                    }
                                >
                                    Simpan Ulang Draft
                                </Button>
                            )}
                        </>
                    ) : (
                        <>
                            <p className="text-sm text-muted-foreground">
                                Draft dipertahankan sampai hasil pengiriman
                                dapat dipastikan.
                            </p>
                            <Button
                                disabled={busy || !online}
                                onClick={() => {
                                    active.current = true;
                                    setBusy(true);
                                    void reconcile(draft)
                                        .catch((error) => {
                                            setMessage(
                                                'Hasil belum dapat dipastikan; draft tetap tersedia.',
                                            );
                                            if (
                                                error instanceof ApiError &&
                                                [401, 403].includes(
                                                    error.status,
                                                )
                                            )
                                                void onFailure(error);
                                        })
                                        .finally(() => {
                                            active.current = false;
                                            setBusy(false);
                                        });
                                }}
                            >
                                Periksa Hasil POP
                            </Button>
                            {draft.state === 'UNCERTAIN' && (
                                <Button
                                    disabled={
                                        busy ||
                                        !online ||
                                        !saved ||
                                        signatureUnsaved
                                    }
                                    onClick={() => setSubmitConfirm(true)}
                                >
                                    Tinjau Kirim Ulang POP
                                </Button>
                            )}
                        </>
                    )}
                    {canDiscardProofDraft(draft) && (
                        <details className="border-t pt-3 text-sm">
                            <summary className="flex min-h-11 cursor-pointer items-center text-muted-foreground">
                                Kelola draft
                            </summary>
                            <Button
                                variant="ghost"
                                className="text-red-700 hover:bg-red-50 hover:text-red-800"
                                disabled={busy}
                                onClick={() => setDiscard(true)}
                            >
                                Buang Draft
                            </Button>
                        </details>
                    )}
                    <Dialog
                        open={discard}
                        onOpenChange={(open) => {
                            if (!busy) setDiscard(open);
                        }}
                    >
                        <DialogContent
                            className="mobile-dialog"
                            onEscapeKeyDown={(event) => {
                                if (busy) event.preventDefault();
                            }}
                            onPointerDownOutside={(event) => {
                                if (busy) event.preventDefault();
                            }}
                        >
                            <DialogTitle>Buang draft ini?</DialogTitle>
                            <DialogDescription>
                                Jumlah paket, catatan, foto, dan tanda tangan
                                lokal akan dihapus dan tidak dapat dipulihkan.
                                Data server tidak berubah.
                            </DialogDescription>
                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => setDiscard(false)}
                                >
                                    Pertahankan Draft
                                </Button>
                                <Button
                                    variant="destructive"
                                    disabled={busy}
                                    onClick={() => {
                                        if (
                                            active.current ||
                                            !current.current ||
                                            !canDiscardProofDraft(
                                                current.current,
                                            )
                                        )
                                            return;
                                        active.current = true;
                                        setBusy(true);
                                        initialized.current = name;
                                        void queue.current
                                            .then(() => cleanup(draft))
                                            .then(() => {
                                                setDiscard(false);
                                                setMessage('');
                                            })
                                            .catch(() =>
                                                setMessage(
                                                    'Draft belum dapat dibersihkan.',
                                                ),
                                            )
                                            .finally(() => {
                                                active.current = false;
                                                setBusy(false);
                                            });
                                    }}
                                >
                                    Konfirmasi Buang Draft
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    <Dialog
                        open={submitConfirm}
                        onOpenChange={(open) => {
                            if (!busy) setSubmitConfirm(open);
                        }}
                    >
                        <DialogContent className="mobile-dialog">
                            <DialogTitle>
                                {draft.state === 'UNCERTAIN'
                                    ? 'Kirim ulang POP yang sama?'
                                    : 'Selesaikan pickup ini?'}
                            </DialogTitle>
                            <DialogDescription>
                                {draft.state === 'UNCERTAIN'
                                    ? 'Hasil server akan diperiksa terlebih dahulu. Jika belum tercatat, data dan bukti yang sama digunakan agar POP tidak terduplikasi.'
                                    : `POP PCK-${taskId} akan dikirim beserta jumlah paket dan bukti yang sudah Anda periksa. Koreksi setelah dikirim hanya dapat dilakukan melalui Admin yang berwenang.`}
                            </DialogDescription>
                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => setSubmitConfirm(false)}
                                >
                                    Kembali ke Review
                                </Button>
                                <Button
                                    disabled={
                                        busy ||
                                        !online ||
                                        !saved ||
                                        signatureUnsaved ||
                                        !validPayload
                                    }
                                    onClick={() => void submit()}
                                >
                                    {draft.state === 'UNCERTAIN'
                                        ? 'Kirim Ulang POP yang Sama'
                                        : 'Ya, Selesaikan Pickup'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </>
            )}
        </section>
    );
}

function QuantityControl({
    name,
    label,
    value,
    disabled,
    error,
    onChange,
    onAdjust,
}: {
    name: string;
    label: string;
    value: string;
    disabled: boolean;
    error?: string | null;
    onChange: (value: string) => void;
    onAdjust: (delta: number) => void;
}) {
    return (
        <div className="quantity-row">
            <Label htmlFor={'qty-' + name}>{label}</Label>
            <div className="quantity-controls">
                <Button
                    type="button"
                    variant="outline"
                    aria-label={'Kurangi ' + label}
                    disabled={
                        disabled ||
                        !!packageQuantityError(value) ||
                        Number(value) <= 0
                    }
                    onClick={() => onAdjust(-1)}
                >
                    −
                </Button>
                <Input
                    id={'qty-' + name}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1000000}
                    value={value}
                    disabled={disabled}
                    aria-invalid={!!error}
                    aria-describedby={error ? 'qty-error-' + name : undefined}
                    onChange={(event) => onChange(event.target.value)}
                />
                <Button
                    type="button"
                    variant="outline"
                    aria-label={'Tambah ' + label}
                    disabled={
                        disabled ||
                        !!packageQuantityError(value) ||
                        Number(value) >= 1000000
                    }
                    onClick={() => onAdjust(1)}
                >
                    +
                </Button>
            </div>
            {error && (
                <p
                    id={'qty-error-' + name}
                    role="alert"
                    className="text-sm text-red-700"
                >
                    {error}
                </p>
            )}
        </div>
    );
}

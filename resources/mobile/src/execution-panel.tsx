import { useEffect, useRef, useState } from 'react';
import { MapPin, CalendarDays, PackageCheck, PackageX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { show, takeover, start, visit, retry } from '@/routes/mobile/tasks';
import { request, ApiError } from './api';
import { readLocal, writeLocal, removeLocal } from './local-store';
import { reconcileExecution, type Operation } from './execution';
import type { Session, Task } from './types';
import { OperationalFeedback } from './feedback';

export default function ExecutionPanel({
    task,
    schedule,
    session,
    online,
    onTask,
    onFailure,
    onBusyChange,
    onRecoveryFound,
}: {
    task: Task;
    schedule: string;
    session: Session;
    online: boolean;
    onTask: (task: Task) => void;
    onFailure: (error: unknown) => Promise<void>;
    onBusyChange: (busy: boolean) => void;
    onRecoveryFound: () => void;
}) {
    const [pending, setPending] = useState<Operation | null>(null);
    const [confirm, setConfirm] = useState<Operation['kind'] | null>(null);
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');
    useEffect(() => {
        if (pending) onRecoveryFound();
    }, [pending, onRecoveryFound]);
    const [outcome, setOutcome] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [restoring, setRestoring] = useState(true);
    const [checked, setChecked] = useState(false);
    const [localBlocked, setLocalBlocked] = useState(false);
    const [recoveryAttempt, setRecoveryAttempt] = useState(0);
    const sending = useRef(false);
    const controller = useRef(new AbortController());
    const name = `task-${task.id}-operation`;
    const latest = task.visits?.at(-1);
    useEffect(() => {
        onBusyChange(busy);
        return () => onBusyChange(false);
    }, [busy, onBusyChange]);
    useEffect(() => {
        let disposed = false;
        controller.current = new AbortController();
        setRestoring(true);
        setLocalBlocked(false);
        void readLocal<Operation>(session, name)
            .then(async (saved) => {
                if (disposed) return;
                setMessage('');
                if (saved) {
                    if (
                        saved.schema !== 1 ||
                        saved.taskReference !== task.reference
                    )
                        throw new Error(
                            'Recovery lokal tidak didukung. Data tidak dihapus.',
                        );
                    const uncertain = { ...saved, state: 'UNCERTAIN' as const };
                    await writeLocal(session, name, uncertain);
                    if (!disposed) {
                        setPending(uncertain);
                        setReason(
                            typeof saved.body.reason === 'string'
                                ? saved.body.reason
                                : '',
                        );
                        setNotes(
                            typeof saved.body.notes === 'string'
                                ? saved.body.notes
                                : '',
                        );
                        setOutcome(
                            typeof saved.body.outcome === 'string'
                                ? saved.body.outcome
                                : '',
                        );
                        setMessage(
                            'Hasil permintaan sebelumnya belum dipastikan. Periksa server sebelum melanjutkan.',
                        );
                    }
                }
            })
            .catch((error) => {
                if (!disposed) {
                    setLocalBlocked(true);
                    setMessage(
                        error instanceof Error
                            ? error.message
                            : 'Recovery lokal gagal dibaca.',
                    );
                }
            })
            .finally(() => {
                if (!disposed) setRestoring(false);
            });
        return () => {
            disposed = true;
            controller.current.abort();
        };
    }, [session.token, name, recoveryAttempt]);
    async function authoritative(operation: Operation) {
        const result = await request<{ data: Task }>(
            show(task.id),
            session,
            controller.current.signal,
        );
        const state = reconcileExecution(
            result.data,
            operation,
            session.user.id,
        );
        onTask(result.data);
        if (state === 'confirmed') {
            await removeLocal(session, name);
            setPending(null);
            setChecked(false);
            setMessage(
                {
                    takeover: 'Tugas berhasil diambil alih.',
                    start: 'Kunjungan dimulai. Pilih hasil pickup.',
                    visit: 'Hasil kunjungan tersimpan.',
                    retry: 'Kunjungan ulang diizinkan.',
                }[operation.kind],
            );
        } else {
            setChecked(state === 'unchanged');
            setMessage(
                state === 'unchanged'
                    ? 'Hasil belum dapat dipastikan. Tinjau pengiriman ulang menggunakan data yang sama setelah memeriksa server.'
                    : 'Tugas sudah berubah. Tinjau detail terbaru sebelum melanjutkan. Permintaan sebelumnya tetap disimpan.',
            );
        }
    }
    async function send(operation: Operation) {
        if (sending.current || !online || localBlocked) return;
        if (
            operation.kind === 'visit' &&
            ((operation.body.outcome !== 'COLLECTED' &&
                operation.body.outcome !== 'NO_PACKAGES') ||
                (operation.body.outcome === 'NO_PACKAGES' &&
                    (typeof operation.body.reason !== 'string' ||
                        !operation.body.reason.trim())))
        ) {
            setMessage(
                'Pilih hasil kunjungan dan isi alasan jika tidak ada paket.',
            );
            return;
        }
        sending.current = true;
        setBusy(true);
        setChecked(false);
        setConfirm(null);
        let persisted = false;
        try {
            await writeLocal(session, name, operation);
            persisted = true;
            setPending(operation);
            const route = { takeover, start, visit, retry }[operation.kind](
                task.id,
            );
            await request(
                route,
                session,
                controller.current.signal,
                operation.body,
            );
            await authoritative(operation);
        } catch (error) {
            if (controller.current.signal.aborted) return;
            if (!persisted) {
                setMessage(
                    'Permintaan tidak dikirim karena metadata recovery belum tersimpan. ' +
                        (error instanceof Error ? error.message : ''),
                );
                return;
            }
            if (error instanceof ApiError && error.status === 422) {
                await removeLocal(session, name);
                setPending(null);
                setMessage(
                    error.message +
                        ' ' +
                        Object.values(error.errors).flat().join(' '),
                );
            } else {
                const uncertain = { ...operation, state: 'UNCERTAIN' as const };
                setPending(uncertain);
                await writeLocal(session, name, uncertain).catch(
                    () => undefined,
                );
                setMessage(
                    error instanceof ApiError && error.status === 409
                        ? 'Konflik: task sudah berubah. Periksa state server.'
                        : 'Hasil belum dapat dipastikan. Data recovery dipertahankan; tidak ada pengiriman otomatis.',
                );
                if (
                    error instanceof ApiError &&
                    [401, 403].includes(error.status)
                )
                    await onFailure(error);
                else if (online && !controller.current.signal.aborted)
                    await authoritative(uncertain).catch(() => undefined);
            }
        } finally {
            sending.current = false;
            setBusy(false);
        }
    }
    function prepare(kind: Operation['kind']): Operation {
        return {
            schema: 1,
            taskId: task.id,
            taskReference: task.reference,
            kind,
            version: task.version,
            visitId: latest?.id || 0,
            state: 'SENDING',
            body: {
                expected_version: task.version,
                ...(kind === 'takeover'
                    ? {
                          expected_assigned_staff_id: task.assigned_staff?.id,
                          reason: reason.trim() || null,
                      }
                    : {}),
                ...(kind === 'retry' ? { reason: reason.trim() } : {}),
                ...(kind === 'visit'
                    ? {
                          outcome,
                          reason: reason.trim() || null,
                          notes: notes.trim() || null,
                      }
                    : {}),
            },
        };
    }
    if (
        !restoring &&
        !pending &&
        !localBlocked &&
        (task.proof || latest?.outcome === 'COLLECTED')
    )
        return null;
    if (
        !restoring &&
        !localBlocked &&
        !pending &&
        latest?.outcome === 'COLLECTED'
    )
        return null;
    return (
        <section
            className="space-y-4 pb-4"
            aria-label="Pickup execution"
            data-start={task.can.execute && !task.execution_started_at}
            data-confirmation={!!confirm}
        >
            <h3 className="text-lg font-semibold">
                {task.can.take_over
                    ? 'Ambil Tugas'
                    : latest?.outcome === 'NO_PACKAGES'
                      ? 'Hasil: tidak ada paket'
                      : task.execution_started_at
                        ? 'Catat Hasil Kunjungan'
                        : 'Mulai Pickup'}
            </h3>
            {!pending && task.can.execute && !task.execution_started_at && (
                <div className="pickup-start-context info-card space-y-3">
                    <p className="text-sm text-muted-foreground">
                        PCK-{task.id}
                    </p>
                    <p className="text-lg leading-snug font-semibold">
                        {task.customer.name}
                    </p>
                    <p className="flex items-start gap-2">
                        <MapPin size={18} className="mt-0.5 shrink-0" />
                        <span className="line-clamp-3">
                            {task.pickup_address}
                        </span>
                    </p>
                    <p className="flex items-start gap-2">
                        <CalendarDays size={18} className="mt-0.5 shrink-0" />
                        <span>{schedule}</span>
                    </p>
                </div>
            )}
            {!pending && task.can.execute && !task.execution_started_at && (
                <p className="text-sm text-muted-foreground">
                    Mulai kunjungan saat tiba di lokasi, lalu catat hasil
                    pickup.
                </p>
            )}
            {message && (
                <OperationalFeedback
                    title={message}
                    tone={localBlocked ? 'error' : pending ? 'warning' : 'info'}
                />
            )}
            {restoring && (
                <p className="text-sm">Memeriksa pemulihan pickup…</p>
            )}
            {localBlocked && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    <p>
                        Informasi tugas tetap dapat dibaca. Aksi pickup menunggu
                        recovery lokal terbaca agar permintaan lama tidak
                        terduplikasi. Jangan hapus data aplikasi.
                    </p>
                    <Button
                        variant="outline"
                        className="mt-2"
                        disabled={busy}
                        onClick={() => setRecoveryAttempt((value) => value + 1)}
                    >
                        Coba Baca Ulang Pickup
                    </Button>
                </div>
            )}
            {latest && (
                <p className="text-sm">
                    Kunjungan #{latest.id}:{' '}
                    {latest.outcome || 'Sedang berlangsung'}
                    {latest.reason && ` · ${latest.reason}`}
                </p>
            )}
            {pending && busy ? (
                <OperationalFeedback
                    title="Memeriksa hasil pengiriman…"
                    tone="loading"
                >
                    Tunggu konfirmasi server. Jangan kirim ulang.
                </OperationalFeedback>
            ) : pending ? (
                <div className="space-y-2">
                    <OperationalFeedback
                        title="Menunggu konfirmasi server"
                        tone="warning"
                    >
                        Hasil belum dipastikan. Data Anda tetap tersimpan.
                        Periksa hasil sebelum melanjutkan.
                    </OperationalFeedback>
                    <Button
                        disabled={busy || !online}
                        onClick={() => {
                            setBusy(true);
                            void authoritative(pending)
                                .catch((error) => {
                                    setMessage(
                                        'Server belum dapat diperiksa; recovery tetap tersimpan.',
                                    );
                                    if (
                                        error instanceof ApiError &&
                                        [401, 403].includes(error.status)
                                    )
                                        void onFailure(error);
                                })
                                .finally(() => setBusy(false));
                        }}
                    >
                        Periksa hasil di server
                    </Button>
                    {checked && (
                        <Button
                            disabled={busy || !online}
                            onClick={() => setConfirm(pending.kind)}
                        >
                            Tinjau kirim ulang
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirm('retry')}
                    >
                        Tinjau penyelesaian recovery
                    </Button>
                </div>
            ) : (
                !restoring &&
                !localBlocked && (
                    <>
                        {(task.can.take_over ||
                            task.can.retry ||
                            (task.can.execute &&
                                latest?.outcome === null &&
                                outcome === 'NO_PACKAGES')) && (
                            <>
                                <Label htmlFor="execution-reason">
                                    Alasan{' '}
                                    {task.can.retry || outcome === 'NO_PACKAGES'
                                        ? '(wajib)'
                                        : '(opsional)'}
                                </Label>
                                <Input
                                    id="execution-reason"
                                    value={reason}
                                    maxLength={
                                        task.can.retry || task.can.take_over
                                            ? 500
                                            : 2000
                                    }
                                    onChange={(event) =>
                                        setReason(event.target.value)
                                    }
                                    disabled={busy}
                                />
                            </>
                        )}
                        {task.can.take_over && (
                            <Button
                                disabled={busy || !online}
                                onClick={() => setConfirm('takeover')}
                            >
                                Ambil Tugas
                            </Button>
                        )}
                        {task.can.execute && !task.execution_started_at && (
                            <Button
                                className="workflow-primary"
                                disabled={busy || !online}
                                onClick={() => void send(prepare('start'))}
                            >
                                {busy ? 'Memulai Pickup…' : 'Mulai Pickup'}
                            </Button>
                        )}
                        {task.can.execute &&
                            task.execution_started_at &&
                            latest?.outcome === null && (
                                <>
                                    <div
                                        className="grid gap-2"
                                        role="radiogroup"
                                        aria-label="Pilih hasil kunjungan"
                                        onKeyDown={(event) => {
                                            if (
                                                ![
                                                    'ArrowUp',
                                                    'ArrowDown',
                                                    'ArrowLeft',
                                                    'ArrowRight',
                                                ].includes(event.key) ||
                                                busy
                                            )
                                                return;
                                            event.preventDefault();
                                            const value =
                                                outcome === 'COLLECTED'
                                                    ? 'NO_PACKAGES'
                                                    : 'COLLECTED';
                                            setOutcome(value);
                                            const options =
                                                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                                                    '[role="radio"]',
                                                );
                                            options[
                                                value === 'COLLECTED' ? 0 : 1
                                            ]?.focus();
                                        }}
                                    >
                                        {(
                                            [
                                                [
                                                    'COLLECTED',
                                                    'Paket berhasil diambil',
                                                ],
                                                [
                                                    'NO_PACKAGES',
                                                    'Tidak ada paket',
                                                ],
                                            ] as const
                                        ).map(([value, label]) => (
                                            <Button
                                                key={value}
                                                className="outcome-option h-auto min-h-16 justify-start text-left text-base whitespace-normal"
                                                variant="outline"
                                                role="radio"
                                                aria-checked={outcome === value}
                                                disabled={busy}
                                                onClick={() =>
                                                    setOutcome(value)
                                                }
                                            >
                                                <span
                                                    className="outcome-radio"
                                                    aria-hidden="true"
                                                />
                                                {value === 'COLLECTED' ? (
                                                    <PackageCheck size={23} />
                                                ) : (
                                                    <PackageX size={23} />
                                                )}{' '}
                                                {label}
                                            </Button>
                                        ))}
                                    </div>
                                    <Label
                                        className="sr-only"
                                        htmlFor="visit-outcome"
                                    >
                                        Hasil kunjungan
                                    </Label>
                                    <select
                                        id="visit-outcome"
                                        className="sr-only"
                                        value={outcome}
                                        disabled={busy}
                                        onChange={(event) =>
                                            setOutcome(event.target.value)
                                        }
                                    >
                                        <option value="" disabled>
                                            Pilih hasil kunjungan
                                        </option>
                                        <option value="COLLECTED">
                                            Paket terkumpul
                                        </option>
                                        <option value="NO_PACKAGES">
                                            Tidak ada paket
                                        </option>
                                    </select>
                                    <Label htmlFor="visit-notes">
                                        Catatan kunjungan
                                    </Label>
                                    <Input
                                        id="visit-notes"
                                        value={notes}
                                        disabled={busy}
                                        maxLength={2000}
                                        onChange={(event) =>
                                            setNotes(event.target.value)
                                        }
                                    />
                                    <p className="text-sm text-muted-foreground">
                                        {outcome === 'NO_PACKAGES'
                                            ? 'Tugas akan selesai tanpa paket. Alasan kunjungan tetap tersimpan.'
                                            : 'Simpan hasil kunjungan untuk melanjutkan ke POP.'}
                                    </p>
                                    <Button
                                        className="workflow-primary"
                                        disabled={
                                            busy ||
                                            !online ||
                                            !outcome ||
                                            (outcome === 'NO_PACKAGES' &&
                                                !reason.trim())
                                        }
                                        onClick={() =>
                                            void send(prepare('visit'))
                                        }
                                    >
                                        {busy
                                            ? 'Menyimpan…'
                                            : 'Simpan Hasil Kunjungan'}
                                    </Button>
                                </>
                            )}
                        {task.can.retry && (
                            <Button
                                disabled={busy || !online || !reason.trim()}
                                onClick={() => setConfirm('retry')}
                            >
                                Otorisasi Retry
                            </Button>
                        )}
                        {latest?.outcome === 'NO_PACKAGES' && (
                            <p className="rounded-lg bg-muted p-3 text-sm">
                                Server mencatat tidak ada paket. {latest.reason}{' '}
                                Task selesai tanpa paket. Kunjungan berikutnya
                                dibuat sebagai task baru dari detail.
                            </p>
                        )}
                        {latest?.outcome === 'COLLECTED' && (
                            <p className="text-sm">
                                Paket terkumpul. Pickup belum final sebelum POP
                                berhasil.
                            </p>
                        )}
                    </>
                )
            )}
            {confirm && (
                <div
                    role="dialog"
                    aria-label="Konfirmasi operasi"
                    className="space-y-3 rounded-md border p-4"
                >
                    <p>
                        {pending
                            ? 'Permintaan sebelumnya mungkin masih diproses. Gunakan data yang sama untuk kirim ulang, atau tutup pemulihan setelah meninjau hasil server.'
                            : `${{ start: 'Mulai pickup di lokasi ini', visit: 'Simpan hasil kunjungan', takeover: 'Ambil tugas ini', retry: 'Mulai kunjungan ulang' }[confirm]} untuk PCK-${task.id}?`}
                    </p>
                    {pending ? (
                        <>
                            {checked && (
                                <Button
                                    disabled={busy || !online}
                                    onClick={() =>
                                        void send({
                                            ...pending,
                                            state: 'SENDING',
                                        })
                                    }
                                >
                                    Kirim Ulang Data yang Sama
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                disabled={busy || !online}
                                onClick={() => {
                                    void request<{ data: Task }>(
                                        show(task.id),
                                        session,
                                        controller.current.signal,
                                    )
                                        .then(async ({ data }) => {
                                            onTask(data);
                                            await removeLocal(session, name);
                                            setPending(null);
                                            setConfirm(null);
                                            setMessage(
                                                'Hasil server sudah ditinjau. Pemulihan ditutup.',
                                            );
                                        })
                                        .catch(() =>
                                            setMessage(
                                                'Hasil server belum dapat diperiksa. Data pemulihan tetap disimpan.',
                                            ),
                                        );
                                }}
                            >
                                Saya Sudah Meninjau Hasil Server
                            </Button>
                        </>
                    ) : (
                        <Button
                            disabled={busy || !online}
                            onClick={() => void send(prepare(confirm))}
                        >
                            Konfirmasi Operasi
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirm(null)}
                    >
                        Batal
                    </Button>
                </div>
            )}
            {!online && (
                <p className="text-sm">
                    Operasi bisnis memerlukan koneksi online.
                </p>
            )}
        </section>
    );
}

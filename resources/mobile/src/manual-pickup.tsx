import { Textarea } from '@/components/ui/textarea';
import {
    lazy,
    Suspense,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import type { CustomerSearchResult } from '@/components/customer-picker';
import { OperationalFeedback } from './feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { utcFromLocal } from '@/lib/pickup-time';
import { index as customers } from '@/routes/mobile/customers';
import { store, show } from '@/routes/mobile/tasks';
import { show as submission } from '@/routes/mobile/submissions';
import { ApiError, request } from './api';
import { readLocal, writeLocal, removeLocal } from './local-store';
import type { Session, Task } from './types';

type Customer = { id: number; name: string; pickup_address: string };
type Payload = {
    customer_id: number;
    pickup_address: string;
    scheduled_at: string;
    notes: string;
    previous_task_id: number | null;
    submission_key: string;
};
type Pending = { schema: 1; body: Payload; state: 'SENDING' | 'UNCERTAIN' };
const journal = 'manual-pickup';
const CustomerPicker = lazy(() => import('@/components/customer-picker'));

export function validateManualPending(value: unknown): Pending | null {
    if (value === null) return null;
    const pending = value as Pending;
    const body = pending?.body;
    if (
        !pending ||
        pending.schema !== 1 ||
        !['SENDING', 'UNCERTAIN'].includes(pending.state) ||
        !body ||
        !Number.isSafeInteger(body.customer_id) ||
        body.customer_id < 1 ||
        typeof body.pickup_address !== 'string' ||
        !body.pickup_address.trim() ||
        typeof body.notes !== 'string' ||
        !body.notes.trim() ||
        typeof body.scheduled_at !== 'string' ||
        !Number.isFinite(Date.parse(body.scheduled_at)) ||
        !/(Z|[+-]\d{2}:\d{2})$/.test(body.scheduled_at) ||
        typeof body.submission_key !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            body.submission_key,
        ) ||
        (body.previous_task_id !== null &&
            (!Number.isSafeInteger(body.previous_task_id) ||
                body.previous_task_id < 1)) ||
        Object.keys(body).some(
            (key) =>
                ![
                    'customer_id',
                    'pickup_address',
                    'scheduled_at',
                    'notes',
                    'previous_task_id',
                    'submission_key',
                ].includes(key),
        )
    )
        throw new Error(
            'Journal pickup manual tidak dapat dibaca. Data dipertahankan; hubungi support.',
        );
    return pending;
}

export default function ManualPickup({
    session,
    online,
    source,
    onCreated,
    onClose,
    onBusyChange,
    onFailure,
}: {
    session: Session;
    online: boolean;
    source: Task | null;
    onCreated: (task: Task) => void;
    onClose: () => void;
    onBusyChange: (busy: boolean) => void;
    onFailure: (error: unknown) => Promise<void>;
}) {
    const [customer, setCustomer] = useState<Customer | null>(
        source
            ? { ...source.customer, pickup_address: source.pickup_address }
            : null,
    );
    const [address, setAddress] = useState(source?.pickup_address || '');
    const [scheduled, setScheduled] = useState(''),
        [notes, setNotes] = useState('');
    const [pending, setPending] = useState<Pending | null>(null);
    const [ready, setReady] = useState(false),
        [busy, setBusy] = useState(false);
    const [readAttempt, setReadAttempt] = useState(0);
    const [message, setMessage] = useState('');
    const [retryAllowed, setRetryAllowed] = useState(false);
    const lock = useRef(false);
    const failureHandler = useRef(onFailure);
    const controller = useRef(new AbortController());
    useEffect(() => {
        failureHandler.current = onFailure;
    }, [onFailure]);
    useEffect(() => {
        const abort = new AbortController();
        controller.current = abort;
        const signal = abort.signal;
        void readLocal<Pending>(session, journal)
            .then((saved) => {
                if (signal.aborted) return;
                setPending(validateManualPending(saved));
                setReady(true);
            })
            .catch((error) => {
                if (!signal.aborted)
                    setMessage(
                        error instanceof Error
                            ? error.message
                            : 'Data lokal belum dapat dibaca. Data tidak dihapus.',
                    );
            });
        return () => {
            abort.abort();
            onBusyChange(false);
        };
    }, [session.token, readAttempt]);
    const loadCustomers = useCallback(
        async (query: string, page: number, signal: AbortSignal) => {
            try {
                return await request<CustomerSearchResult>(
                    customers({ query: { q: query, page, active_only: true } }),
                    session,
                    signal,
                );
            } catch (error) {
                if (
                    !signal.aborted &&
                    error instanceof ApiError &&
                    [401, 403, 419].includes(error.status)
                ) {
                    await failureHandler.current(error);
                }
                throw error;
            }
        },
        [session],
    );
    function setWorking(value: boolean) {
        lock.current = value;
        setBusy(value);
        onBusyChange(value);
    }
    async function confirmed(id: number) {
        const result = await request<{ data: Task }>(
            show(id),
            session,
            controller.current.signal,
        );
        if (result.data.id !== id)
            throw new Error('Respons task belum dapat diverifikasi.');
        await removeLocal(session, journal);
        onCreated(result.data);
    }
    async function reconcile() {
        if (!pending || lock.current || !online) return;
        setWorking(true);
        setMessage('');
        try {
            const result = await request<{
                data: { task_id: number; committed: boolean };
            }>(
                submission(pending.body.submission_key, {
                    query: { kind: 'task' },
                }),
                session,
                controller.current.signal,
            );
            if (!result.data.committed)
                throw new Error('Hasil belum terkonfirmasi.');
            await confirmed(result.data.task_id);
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) {
                setRetryAllowed(true);
                setMessage(
                    'Belum ditemukan untuk akun ini. Anda dapat mengirim ulang input dan key yang sama.',
                );
            } else {
                setMessage(
                    'Hasil belum dapat diverifikasi. Journal dipertahankan.',
                );
                await onFailure(error);
            }
        } finally {
            setWorking(false);
        }
    }
    async function send() {
        if (!ready || lock.current || !online || (pending && !retryAllowed))
            return;
        setWorking(true);
        setMessage('');
        let attempt = pending;
        let persisted = false;
        try {
            if (!attempt) {
                if (!customer || !address.trim() || !scheduled || !notes.trim())
                    throw new Error(
                        'Pilih customer, isi alamat, jadwal, dan alasan/catatan.',
                    );
                attempt = {
                    schema: 1,
                    state: 'SENDING',
                    body: {
                        customer_id: customer.id,
                        pickup_address: address.trim(),
                        scheduled_at: utcFromLocal(scheduled, session.timezone),
                        notes: notes.trim(),
                        previous_task_id: source?.id || null,
                        submission_key: crypto.randomUUID(),
                    },
                };
            }
            await writeLocal(session, journal, {
                ...attempt,
                state: 'SENDING',
            });
            persisted = true;
            setPending(attempt);
            setRetryAllowed(false);
            const result = await request<{ data: Task }>(
                store(),
                session,
                controller.current.signal,
                attempt.body,
            );
            await confirmed(result.data.id);
        } catch (error) {
            if (persisted && attempt) {
                const uncertain = { ...attempt, state: 'UNCERTAIN' as const };
                setPending(uncertain);
                await writeLocal(session, journal, uncertain).catch(
                    () => undefined,
                );
                if (
                    error instanceof ApiError &&
                    [409, 422].includes(error.status)
                ) {
                    setMessage(
                        `${error.message} Input tetap disimpan. Periksa hasil di server sebelum mengubah atau membuang input.`,
                    );
                } else
                    setMessage(
                        'Hasil belum pasti. Jangan membuat task lain; periksa hasil dengan key yang sama.',
                    );
                if (
                    error instanceof ApiError &&
                    [401, 403, 419].includes(error.status)
                )
                    await onFailure(error);
            } else
                setMessage(
                    error instanceof Error
                        ? error.message
                        : 'Input belum dapat disimpan; tidak ada request dikirim.',
                );
        } finally {
            setWorking(false);
        }
    }
    useEffect(() => {
        const back = (event: Event) => {
            event.preventDefault();
            if (!lock.current) onClose();
        };
        window.addEventListener('mobile-back', back);
        return () => window.removeEventListener('mobile-back', back);
    }, [onClose]);
    return (
        <section aria-label="Buat Pickup Manual" className="space-y-4">
            {source && (
                <h2 className="text-lg font-semibold">Buat Kunjungan Baru</h2>
            )}
            <p className="text-sm text-muted-foreground">
                {session.user.role === 'pickup_staff'
                    ? 'Pickup ditugaskan kepada Anda.'
                    : 'Pickup akan menunggu penugasan petugas.'}
            </p>
            {source && (
                <p className="text-sm">
                    Task asal PCK-{source.id}; riwayatnya tetap tersimpan.
                </p>
            )}
            {message && (
                <OperationalFeedback
                    title={message}
                    tone={pending ? 'warning' : 'error'}
                />
            )}
            {!ready && (
                <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setReadAttempt((value) => value + 1)}
                >
                    Coba Baca Ulang Data Lokal
                </Button>
            )}
            {pending ? (
                <div className="space-y-3 rounded-xl border p-4">
                    <h3 className="font-semibold">
                        Hasil pembuatan perlu diperiksa
                    </h3>
                    <p className="text-sm">
                        Input tetap tersimpan dan tidak dapat diubah sementara.
                        Tidak ada pengiriman otomatis setelah restart.
                    </p>
                    <p className="text-sm">
                        {pending.body.pickup_address}
                        <br />
                        {new Date(pending.body.scheduled_at).toLocaleString(
                            'id-ID',
                            { timeZone: session.timezone },
                        )}
                        <br />
                        {pending.body.notes}
                    </p>
                    <Button
                        className="w-full"
                        disabled={busy || !online}
                        onClick={() => void reconcile()}
                    >
                        Periksa hasil di server
                    </Button>
                    {retryAllowed && (
                        <Button
                            className="w-full"
                            disabled={busy || !online}
                            onClick={() => void send()}
                        >
                            Kirim Ulang Input yang Sama
                        </Button>
                    )}
                    {retryAllowed && (
                        <Button
                            variant="outline"
                            className="w-full"
                            disabled={busy}
                            onClick={() => {
                                if (
                                    !window.confirm(
                                        'Hasil belum ditemukan. Buang input lokal? Jika request lama masih berjalan, task mungkin tetap dibuat. Periksa daftar sebelum membuat task lain.',
                                    )
                                )
                                    return;
                                setWorking(true);
                                void removeLocal(session, journal)
                                    .then(() => {
                                        setPending(null);
                                        setRetryAllowed(false);
                                        setMessage(
                                            'Input lokal dibuang secara eksplisit. Periksa daftar sebelum membuat task baru.',
                                        );
                                    })
                                    .catch(() =>
                                        setMessage(
                                            'Input belum dapat dibuang. Data dipertahankan.',
                                        ),
                                    )
                                    .finally(() => setWorking(false));
                            }}
                        >
                            Buang Input Lokal
                        </Button>
                    )}
                </div>
            ) : (
                <form
                    className="space-y-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void send();
                    }}
                >
                    <fieldset className="space-y-4" disabled={!ready || busy}>
                        <div className="flex flex-col gap-2">
                            <Label
                                htmlFor={
                                    !source ? 'manual-customer' : undefined
                                }
                            >
                                Customer
                            </Label>
                            {source ? (
                                <p className="font-semibold">
                                    {customer?.name}
                                </p>
                            ) : (
                                <Suspense
                                    fallback={
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled
                                        >
                                            Memuat pemilih customer…
                                        </Button>
                                    }
                                >
                                    <CustomerPicker
                                        triggerId="manual-customer"
                                        selected={customer}
                                        disabled={!online || !ready || busy}
                                        minSearchLength={2}
                                        loadCustomers={loadCustomers}
                                        onSelect={(selected) => {
                                            if (!selected) return;
                                            setCustomer(selected);
                                            setAddress(selected.pickup_address);
                                        }}
                                    />
                                </Suspense>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="manual-address">
                                Alamat Pickup
                            </Label>
                            <Textarea
                                id="manual-address"
                                className="min-h-24 w-full rounded-md border p-3"
                                maxLength={2000}
                                required
                                value={address}
                                onChange={(event) =>
                                    setAddress(event.target.value)
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="manual-schedule">
                                Jadwal · {session.timezone}
                            </Label>
                            <Input
                                id="manual-schedule"
                                type="datetime-local"
                                required
                                value={scheduled}
                                onChange={(event) =>
                                    setScheduled(event.target.value)
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="manual-notes">
                                Alasan / Catatan (wajib)
                            </Label>
                            <Textarea
                                id="manual-notes"
                                className="min-h-20 w-full rounded-md border p-3"
                                maxLength={2000}
                                required
                                value={notes}
                                onChange={(event) =>
                                    setNotes(event.target.value)
                                }
                            />
                        </div>
                        <Button
                            className="w-full"
                            disabled={
                                !online || !customer || busy || !notes.trim()
                            }
                        >
                            {busy ? 'Membuat…' : 'Buat Pickup'}
                        </Button>
                    </fieldset>
                </form>
            )}
            {!online && (
                <p role="status">
                    Offline. Pembuatan task hanya dapat dilakukan saat online.
                </p>
            )}
            <Button
                className="w-full"
                variant="outline"
                disabled={busy}
                onClick={onClose}
            >
                Kembali ke Tugas
            </Button>
        </section>
    );
}

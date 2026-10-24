import { Head, Link, router, useHttp } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import {
    Check,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/page-container';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { EmptyState, StatusBadge } from '@/components/operational-ui';
import SignaturePad from '@/components/signature-pad';
import PickupCashlessAwbs from '@/components/pickup-cashless-awbs';
import { type Visit } from '@/components/pickup-execution';
import { type Proof } from '@/components/pickup-proof';
import { operations } from '@/routes';
import * as api from '@/routes/api/tasks';
import { submissionKey } from '@/lib/submission-key';

type Task = {
    id: number;
    reference: string;
    customer: { name: string };
    pickup_address: string;
    scheduled_at: string;
    status: string;
    version: number;
    execution_started_at?: string | null;
    can: { execute?: boolean };
    visits?: Visit[];
    proof?: Proof | null;
};
const steps = ['Hasil Kunjungan', 'Jumlah Paket', 'Bukti Pickup', 'Review'];
const categories = [
    ['manual_hybrid', 'Manual Hybrid (Non-Cashless)'],
    ['cashless_hybrid', 'Cashless Hybrid'],
    ['css_orion', 'CSS / Orion'],
] as const;
function PhotoPreview({
    file,
    onRemove,
}: {
    file: File;
    onRemove?: () => void;
}) {
    const [url, setUrl] = useState('');
    useEffect(() => {
        const preview = URL.createObjectURL(file);
        setUrl(preview);
        return () => URL.revokeObjectURL(preview);
    }, [file]);
    return (
        <figure className="min-w-0 space-y-2">
            <img
                src={url || undefined}
                alt={`Foto bukti: ${file.name}`}
                className="h-32 w-full rounded-lg border object-cover"
            />
            <figcaption className="truncate text-xs text-muted-foreground">
                {file.name}
            </figcaption>
            {onRemove && (
                <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={onRemove}
                >
                    <Trash2 className="size-3" />
                    Hapus Foto
                </Button>
            )}
        </figure>
    );
}
function failureMessage(error: unknown): string {
    if (typeof error === 'object' && error && 'response' in error) {
        const response = error.response as {
            data?: string | { message?: string };
            status?: number;
        };
        try {
            const data =
                typeof response.data === 'string'
                    ? (JSON.parse(response.data) as { message?: string })
                    : response.data;
            if (data?.message) return data.message;
        } catch {
            /* Fall through to the operational message. */
        }
    }
    return 'Hasil permintaan belum pasti. Muat ulang status sebelum mencoba kembali.';
}
export default function PickupWizard({
    taskId,
    timezone,
}: {
    taskId: number;
    timezone: string;
}) {
    const [task, setTask] = useState<Task | null>(null);
    const [step, setStep] = useState(0);
    const [furthest, setFurthest] = useState(0);
    const [error, setError] = useState('');
    const [needsRefresh, setNeedsRefresh] = useState(false);
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [signature, setSignature] = useState<string | null>(null);
    const [key] = useState(submissionKey);
    const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
    const inFlight = useRef(false);
    const completed = useRef(false);
    const mounted = useRef(true);
    const initialLoad = useRef(true);
    const loader = useHttp<Record<string, never>, { data: Task }>({});
    const start = useHttp({ expected_version: 0 });
    const visit = useHttp({
        expected_version: 0,
        outcome: 'COLLECTED',
        reason: '',
        notes: '',
    });
    const proof = useHttp({
        expected_version: 0,
        submission_key: key,
        manual_hybrid: '0',
        cashless_hybrid: '0',
        css_orion: '0',
        notes: '',
        photos: [] as File[],
        signature: null as File | null,
    });
    const latest = task?.execution_started_at ? task.visits?.at(-1) : undefined;
    const collected = latest?.outcome === 'COLLECTED';
    const unsuccessful = latest?.outcome === 'NO_PACKAGES';
    const dirty =
        proof.isDirty ||
        signature !== null ||
        (visit.isDirty && !latest?.outcome);
    const total = categories.reduce(
        (sum, [key]) => sum + (Number(proof.data[key]) || 0),
        0,
    );
    const format = (date: string) =>
        new Date(date).toLocaleString('id-ID', {
            timeZone: timezone,
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    const refresh = async (): Promise<Task | null> => {
        setError('');
        try {
            const response = await loader.get(api.show.url(taskId));
            if (!response) return null;
            if (!mounted.current) return null;
            setTask(response.data);
            setNeedsRefresh(false);
            if (response.data.proof || response.data.status === 'PICKED_UP') {
                completed.current = true;
                router.visit(operations({ screen: 'detail', task: taskId }), {
                    replace: true,
                });
                return response.data;
            }
            if (!response.data.can.execute) {
                setError(
                    'Tugas sudah berubah atau bukan lagi tanggung jawab Anda. Kembali ke detail pickup.',
                );
                setNeedsRefresh(true);
            }
            if (
                initialLoad.current &&
                response.data.execution_started_at &&
                response.data.visits?.at(-1)?.outcome === 'COLLECTED'
            ) {
                setStep(1);
                setFurthest(1);
            }
            initialLoad.current = false;
            return response.data;
        } catch (error) {
            if (mounted.current) {
                setError(failureMessage(error));
                setNeedsRefresh(true);
            }
            return null;
        }
    };
    useEffect(() => {
        mounted.current = true;
        void refresh();
        return () => {
            mounted.current = false;
            loader.cancel();
        };
    }, [taskId]);
    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if ((dirty || busy) && !completed.current) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', beforeUnload);
        const off = router.on('before', () => {
            if (completed.current) return;
            if (busy) {
                toast.info('Tunggu proses penyimpanan selesai.');
                return false;
            }
            if (dirty)
                return window.confirm(
                    'Input jumlah paket dan bukti belum difinalisasi. Tinggalkan wizard? Hasil kunjungan yang tersimpan tetap ada.',
                );
        });
        return () => {
            window.removeEventListener('beforeunload', beforeUnload);
            off();
        };
    }, [dirty, busy]);
    useEffect(() => {
        if (!proof.hasErrors) return;
        const keys = Object.keys(proof.errors);
        if (
            keys.some((key) =>
                categories.some(([category]) => key === category),
            )
        )
            setStep(1);
        else if (
            keys.some(
                (key) =>
                    key.startsWith('photos') ||
                    key === 'signature' ||
                    key === 'notes',
            )
        )
            setStep(2);
    }, [proof.errors, proof.hasErrors]);
    const advance = (next: number) => {
        setError('');
        setStep(next);
        setFurthest((value) => Math.max(value, next));
    };
    const validateQuantities = (): boolean => {
        const errors: Record<string, string> = {};
        categories.forEach(([key]) => {
            if (
                !/^\d+$/.test(proof.data[key]) ||
                Number(proof.data[key]) > 1000000
            )
                errors[key] = 'Masukkan bilangan bulat 0–1.000.000.';
        });
        if (total <= 0)
            errors.manual_hybrid =
                'Total harus lebih dari nol. Kunjungan tanpa paket tidak menggunakan POP berhasil.';
        setLocalErrors(errors);
        return Object.keys(errors).length === 0;
    };
    const validateEvidence = (): boolean => {
        const errors: Record<string, string> = {};
        if (!signature)
            errors.signature = 'Tanda tangan customer/sender wajib.';
        if (proof.data.notes.length > 2000)
            errors.notes = 'Catatan maksimal 2.000 karakter.';
        if (
            proof.data.photos.length > 4 ||
            proof.data.photos.some(
                (file) =>
                    file.size > 5 * 1024 * 1024 ||
                    !['image/jpeg', 'image/png', 'image/webp'].includes(
                        file.type,
                    ),
            )
        )
            errors.photos =
                'Maksimal empat foto JPG/PNG/WebP, masing-masing maksimal 5 MB.';
        setLocalErrors(errors);
        return Object.keys(errors).length === 0;
    };
    const saveVisit = async () => {
        if (!task || inFlight.current || needsRefresh || !task.can.execute)
            return;
        if (collected) {
            advance(1);
            return;
        }
        if (unsuccessful) return;
        if (visit.data.outcome === 'NO_PACKAGES' && !visit.data.reason.trim()) {
            visit.setError('reason', 'Alasan wajib ketika tidak ada paket.');
            return;
        }
        inFlight.current = true;
        setBusy(true);
        setError('');
        try {
            let current = task;
            if (!current.execution_started_at) {
                start.transform(() => ({ expected_version: current.version }));
                const result = await start.post(api.start.url(taskId));
                if (!result) {
                    setError('Kunjungan belum dimulai. Periksa input.');
                    return;
                }
                const fresh = await refresh();
                if (!fresh || !fresh.can.execute) return;
                current = fresh;
            }
            if (current.visits?.at(-1)?.outcome) {
                setTask(current);
                if (current.visits.at(-1)?.outcome === 'COLLECTED') advance(1);
                return;
            }
            visit.transform((data) => ({
                ...data,
                expected_version: current.version,
            }));
            const result = await visit.post(api.visit.url(taskId));
            if (!result) {
                setError('Hasil belum tersimpan. Periksa alasan dan catatan.');
                return;
            }
            const fresh = await refresh();
            if (fresh?.visits?.at(-1)?.outcome === 'COLLECTED') {
                toast.success('Hasil kunjungan tersimpan');
                advance(1);
            } else if (fresh) {
                toast.success('Kunjungan tanpa paket tersimpan');
            }
        } catch (error) {
            setError(failureMessage(error));
            setNeedsRefresh(true);
        } finally {
            inFlight.current = false;
            setBusy(false);
        }
    };
    const finalize = async () => {
        if (
            !task ||
            inFlight.current ||
            needsRefresh ||
            !task.can.execute ||
            !collected
        )
            return;
        if (!validateQuantities()) {
            setConfirming(false);
            setStep(1);
            return;
        }
        if (!validateEvidence() || !signature) {
            setConfirming(false);
            setStep(2);
            return;
        }
        inFlight.current = true;
        setBusy(true);
        setError('');
        try {
            const blob = await (await fetch(signature)).blob();
            proof.transform((data) => ({
                ...data,
                manual_hybrid: Number(data.manual_hybrid),
                cashless_hybrid: Number(data.cashless_hybrid),
                css_orion: Number(data.css_orion),
                expected_version: task.version,
                signature: new File([blob], 'signature.png', {
                    type: 'image/png',
                }),
            }));
            const result = await proof.post(api.proof.url(taskId));
            if (!result) {
                setConfirming(false);
                setError('Bukti belum final. Periksa field yang ditandai.');
                return;
            }
            completed.current = true;
            toast.success('Pickup berhasil difinalisasi');
            router.visit(operations({ screen: 'detail', task: taskId }));
        } catch (error) {
            setConfirming(false);
            setError(failureMessage(error));
            setNeedsRefresh(true);
        } finally {
            inFlight.current = false;
            setBusy(false);
        }
    };
    return (
        <PageContainer variant="form" className="space-y-5">
            <Head title="Eksekusi Pickup" />
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold tracking-wide text-primary">
                        EKSEKUSI PICKUP
                    </p>
                    <h1 className="mt-1 text-2xl font-bold">
                        {task?.customer.name ?? 'Pickup'}
                    </h1>
                </div>
                <Button asChild variant="outline" disabled={busy}>
                    <Link href={operations({ screen: 'detail', task: taskId })}>
                        Kembali ke Detail
                    </Link>
                </Button>
            </div>
            {loader.processing && !task && <EmptyState loading />}
            {error && (
                <div
                    role="alert"
                    className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
                >
                    <p>{error}</p>
                    {needsRefresh && (
                        <Button
                            variant="outline"
                            disabled={busy || loader.processing}
                            onClick={() => void refresh()}
                        >
                            <RefreshCw className="size-4" />
                            Muat Ulang Status
                        </Button>
                    )}
                </div>
            )}
            {task && (
                <>
                    <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                            <span className="font-mono text-xs break-all">
                                {task.reference}
                            </span>
                            <StatusBadge
                                status={
                                    task.execution_started_at &&
                                    !latest?.outcome
                                        ? 'IN_PROGRESS'
                                        : task.status
                                }
                            />
                        </div>
                        <p className="break-words">{task.pickup_address}</p>
                        <p className="text-muted-foreground">
                            {format(task.scheduled_at)} · {timezone}
                        </p>
                    </div>
                    {task.can.execute && !task.proof && (
                        <>
                            <nav
                                aria-label="Langkah pickup"
                                className="hidden grid-cols-4 gap-2 sm:grid"
                            >
                                {steps.map((label, index) => (
                                    <button
                                        type="button"
                                        key={label}
                                        aria-current={
                                            step === index ? 'step' : undefined
                                        }
                                        disabled={
                                            busy ||
                                            index > furthest ||
                                            (index > 0 && !collected)
                                        }
                                        onClick={() => {
                                            if (
                                                index > 1 &&
                                                !validateQuantities()
                                            ) {
                                                setStep(1);
                                                return;
                                            }
                                            if (
                                                index > 2 &&
                                                !validateEvidence()
                                            ) {
                                                setStep(2);
                                                return;
                                            }
                                            setStep(index);
                                        }}
                                        className={`flex items-center gap-2 rounded-lg border p-3 text-left text-xs disabled:opacity-40 ${step === index ? 'border-primary bg-primary/5 text-primary' : 'bg-card'}`}
                                    >
                                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                                            {index < step ? (
                                                <Check className="size-3" />
                                            ) : (
                                                index + 1
                                            )}
                                        </span>
                                        {label}
                                    </button>
                                ))}
                            </nav>
                            <div className="sm:hidden">
                                <p className="mb-2 text-sm font-medium">
                                    Langkah {step + 1} dari 4 · {steps[step]}
                                </p>
                                <div className="flex gap-1">
                                    {steps.map((label, index) => (
                                        <span
                                            key={label}
                                            className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-primary' : 'bg-muted'}`}
                                        />
                                    ))}
                                </div>
                            </div>
                            <section className="space-y-5 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
                                <h2 className="text-lg font-semibold">
                                    {steps[step]}
                                </h2>
                                {step === 0 &&
                                    (latest?.outcome ? (
                                        <div className="space-y-3">
                                            <StatusBadge
                                                status={latest.outcome}
                                            />
                                            <p>{latest.reason}</p>
                                            {latest.notes && (
                                                <p>{latest.notes}</p>
                                            )}
                                            <p className="text-sm text-muted-foreground">
                                                Hasil kunjungan ini sudah
                                                tersimpan dan tidak diubah
                                                melalui wizard.
                                            </p>
                                            {unsuccessful && (
                                                <>
                                                    <p className="text-sm">
                                                        Tidak ada POP berhasil
                                                        untuk kunjungan tanpa
                                                        paket. Task selesai;
                                                        kunjungan berikutnya
                                                        dibuat sebagai task baru
                                                        dari detail.
                                                    </p>
                                                    <Button asChild>
                                                        <Link
                                                            href={operations({
                                                                screen: 'detail',
                                                                task: taskId,
                                                            })}
                                                        >
                                                            Lihat Hasil
                                                            Kunjungan
                                                        </Link>
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <form
                                            id="visit-step"
                                            className="space-y-4"
                                            onSubmit={(event) => {
                                                event.preventDefault();
                                                void saveVisit();
                                            }}
                                        >
                                            <div className="space-y-2">
                                                <Label htmlFor="wizard-outcome">
                                                    Hasil Kunjungan
                                                </Label>
                                                <Select
                                                    value={visit.data.outcome}
                                                    onValueChange={(value) => {
                                                        visit.setData(
                                                            'outcome',
                                                            value,
                                                        );
                                                        visit.clearErrors();
                                                    }}
                                                    disabled={busy}
                                                >
                                                    <SelectTrigger
                                                        id="wizard-outcome"
                                                        className="w-full data-[size=default]:h-11"
                                                    >
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="COLLECTED">
                                                            Paket berhasil
                                                            diambil
                                                        </SelectItem>
                                                        <SelectItem value="NO_PACKAGES">
                                                            Tidak berhasil /
                                                            tidak ada paket
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="wizard-reason">
                                                    Alasan{' '}
                                                    {visit.data.outcome ===
                                                    'NO_PACKAGES'
                                                        ? '(wajib)'
                                                        : '(opsional)'}
                                                </Label>
                                                <textarea
                                                    id="wizard-reason"
                                                    maxLength={2000}
                                                    required={
                                                        visit.data.outcome ===
                                                        'NO_PACKAGES'
                                                    }
                                                    disabled={busy}
                                                    value={visit.data.reason}
                                                    onChange={(event) =>
                                                        visit.setData(
                                                            'reason',
                                                            event.target.value,
                                                        )
                                                    }
                                                    className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
                                                />
                                                {visit.errors.reason && (
                                                    <p className="text-sm text-destructive">
                                                        {visit.errors.reason}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="wizard-visit-notes">
                                                    Catatan Kunjungan
                                                </Label>
                                                <textarea
                                                    id="wizard-visit-notes"
                                                    maxLength={2000}
                                                    disabled={busy}
                                                    value={visit.data.notes}
                                                    onChange={(event) =>
                                                        visit.setData(
                                                            'notes',
                                                            event.target.value,
                                                        )
                                                    }
                                                    className="min-h-20 w-full rounded-md border bg-background p-3 text-sm"
                                                />
                                                {visit.errors.notes && (
                                                    <p className="text-sm text-destructive">
                                                        {visit.errors.notes}
                                                    </p>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Menyimpan hasil akan memulai
                                                kunjungan jika belum dimulai.
                                                Task tidak bisa diambil alih
                                                setelah eksekusi dimulai.
                                            </p>
                                        </form>
                                    ))}
                                {step === 1 && (
                                    <>
                                        <PickupCashlessAwbs
                                            taskId={taskId}
                                            timezone={timezone}
                                        />
                                        <p className="text-sm text-muted-foreground">
                                            Catat paket yang diambil per
                                            kategori. Perpindahan langkah belum
                                            memfinalisasi POP.
                                        </p>
                                        {categories.map(([key, label]) => (
                                            <div
                                                key={key}
                                                className="space-y-2"
                                            >
                                                <Label
                                                    htmlFor={`wizard-${key}`}
                                                >
                                                    {label}
                                                </Label>
                                                <Input
                                                    id={`wizard-${key}`}
                                                    className="h-11"
                                                    type="number"
                                                    inputMode="numeric"
                                                    min={0}
                                                    max={1000000}
                                                    step={1}
                                                    disabled={busy}
                                                    value={proof.data[key]}
                                                    onChange={(event) => {
                                                        const value =
                                                            event.target.value;
                                                        proof.setData(
                                                            key,
                                                            /^\d+$/.test(value)
                                                                ? value.replace(
                                                                      /^0+(?=\d)/,
                                                                      '',
                                                                  )
                                                                : value,
                                                        );
                                                        proof.clearErrors(key);
                                                        setLocalErrors(
                                                            (previous) => {
                                                                const next = {
                                                                    ...previous,
                                                                };
                                                                delete next[
                                                                    key
                                                                ];
                                                                return next;
                                                            },
                                                        );
                                                    }}
                                                />
                                                {(localErrors[key] ||
                                                    proof.errors[key]) && (
                                                    <p className="text-sm text-destructive">
                                                        {localErrors[key] ||
                                                            proof.errors[key]}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                        <p className="rounded-lg bg-primary/5 p-4 font-semibold">
                                            Total Paket{' '}
                                            <span className="float-right text-xl tabular-nums">
                                                {total}
                                            </span>
                                        </p>
                                    </>
                                )}
                                {step === 2 && (
                                    <>
                                        <div className="space-y-2">
                                            <Label htmlFor="wizard-proof-notes">
                                                Catatan Pickup (opsional)
                                            </Label>
                                            <textarea
                                                id="wizard-proof-notes"
                                                maxLength={2000}
                                                disabled={busy}
                                                value={proof.data.notes}
                                                onChange={(event) =>
                                                    proof.setData(
                                                        'notes',
                                                        event.target.value,
                                                    )
                                                }
                                                className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="wizard-photos">
                                                Foto Bukti (opsional, maksimal
                                                4)
                                            </Label>
                                            <Input
                                                id="wizard-photos"
                                                type="file"
                                                multiple
                                                accept="image/jpeg,image/png,image/webp"
                                                disabled={busy}
                                                onChange={(event) => {
                                                    const files = Array.from(
                                                        event.target.files ??
                                                            [],
                                                    );
                                                    if (files.length) {
                                                        proof.setData(
                                                            'photos',
                                                            [
                                                                ...proof.data
                                                                    .photos,
                                                                ...files,
                                                            ],
                                                        );
                                                        proof.clearErrors(
                                                            'photos',
                                                        );
                                                    }
                                                    event.target.value = '';
                                                }}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                JPG, PNG, atau WebP · maksimal 5
                                                MB per foto.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            {proof.data.photos.map(
                                                (file, index) => (
                                                    <PhotoPreview
                                                        file={file}
                                                        key={`${file.name}-${index}`}
                                                        onRemove={() =>
                                                            proof.setData(
                                                                'photos',
                                                                proof.data.photos.filter(
                                                                    (
                                                                        _,
                                                                        position,
                                                                    ) =>
                                                                        position !==
                                                                        index,
                                                                ),
                                                            )
                                                        }
                                                    />
                                                ),
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <Label>
                                                Tanda Tangan Customer/Sender
                                            </Label>
                                            <SignaturePad
                                                value={signature}
                                                onChange={setSignature}
                                                disabled={busy}
                                            />
                                        </div>
                                        {Object.entries({
                                            ...localErrors,
                                            ...proof.errors,
                                        })
                                            .filter(
                                                ([key]) =>
                                                    key === 'notes' ||
                                                    key === 'signature' ||
                                                    key.startsWith('photos'),
                                            )
                                            .map(([key, value]) => (
                                                <p
                                                    className="text-sm text-destructive"
                                                    key={key}
                                                >
                                                    {value}
                                                </p>
                                            ))}
                                    </>
                                )}
                                {step === 3 && (
                                    <>
                                        <div className="rounded-lg bg-muted/50 p-4 text-sm">
                                            <p className="font-semibold">
                                                {task.customer.name}
                                            </p>
                                            <p className="mt-1 break-words">
                                                {task.pickup_address}
                                            </p>
                                            <p className="mt-1 text-muted-foreground">
                                                Hasil kunjungan: paket berhasil
                                                diambil
                                            </p>
                                        </div>
                                        <dl className="space-y-3">
                                            {categories.map(([key, label]) => (
                                                <div
                                                    key={key}
                                                    className="flex justify-between gap-3 text-sm"
                                                >
                                                    <dt>{label}</dt>
                                                    <dd className="font-semibold tabular-nums">
                                                        {proof.data[key]}
                                                    </dd>
                                                </div>
                                            ))}
                                            <div className="flex justify-between border-t pt-3 font-semibold">
                                                <dt>Total Paket</dt>
                                                <dd>{total}</dd>
                                            </div>
                                        </dl>
                                        {proof.data.notes && (
                                            <p className="text-sm break-words">
                                                Catatan: {proof.data.notes}
                                            </p>
                                        )}
                                        <div className="grid grid-cols-2 gap-3">
                                            {proof.data.photos.map(
                                                (file, index) => (
                                                    <PhotoPreview
                                                        key={`${file.name}-${index}`}
                                                        file={file}
                                                    />
                                                ),
                                            )}
                                        </div>
                                        {!proof.data.photos.length && (
                                            <p className="text-sm text-muted-foreground">
                                                Tidak ada foto dilampirkan.
                                            </p>
                                        )}
                                        <figure className="space-y-2">
                                            <figcaption className="text-sm font-medium">
                                                Tanda Tangan Customer/Sender
                                            </figcaption>
                                            {signature && (
                                                <img
                                                    src={signature}
                                                    alt="Preview tanda tangan customer"
                                                    className="h-32 w-full rounded-lg border bg-white object-contain"
                                                />
                                            )}
                                        </figure>
                                        <p className="text-xs text-muted-foreground">
                                            Periksa bersama customer sebelum
                                            finalisasi. Status pengiriman
                                            receipt ditampilkan terpisah setelah
                                            pickup final.
                                        </p>
                                    </>
                                )}
                            </section>
                            {!unsuccessful && (
                                <div className="flex justify-between gap-3">
                                    <Button
                                        variant="outline"
                                        className="h-11"
                                        disabled={step === 0 || busy}
                                        onClick={() => {
                                            setError('');
                                            setStep(step - 1);
                                        }}
                                    >
                                        <ChevronLeft className="size-4" />
                                        Kembali
                                    </Button>
                                    {step === 0 ? (
                                        <Button
                                            className="h-11"
                                            type={
                                                collected ? 'button' : 'submit'
                                            }
                                            form={
                                                collected
                                                    ? undefined
                                                    : 'visit-step'
                                            }
                                            disabled={busy || needsRefresh}
                                            onClick={
                                                collected
                                                    ? () => advance(1)
                                                    : undefined
                                            }
                                        >
                                            {busy
                                                ? 'Menyimpan…'
                                                : visit.data.outcome ===
                                                        'NO_PACKAGES' &&
                                                    !collected
                                                  ? 'Simpan Hasil Kunjungan'
                                                  : collected
                                                    ? 'Selanjutnya'
                                                    : 'Simpan dan Lanjutkan'}
                                        </Button>
                                    ) : step < 3 ? (
                                        <Button
                                            className="h-11"
                                            disabled={busy || needsRefresh}
                                            onClick={() => {
                                                if (
                                                    step === 1
                                                        ? validateQuantities()
                                                        : validateEvidence()
                                                )
                                                    advance(step + 1);
                                            }}
                                        >
                                            Selanjutnya
                                            <ChevronRight className="size-4" />
                                        </Button>
                                    ) : (
                                        <Button
                                            className="h-11"
                                            disabled={busy || needsRefresh}
                                            onClick={() => {
                                                if (!validateQuantities()) {
                                                    setStep(1);
                                                    return;
                                                }
                                                if (!validateEvidence()) {
                                                    setStep(2);
                                                    return;
                                                }
                                                setConfirming(true);
                                            }}
                                        >
                                            Finalisasi Pickup
                                        </Button>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
            <Dialog
                open={confirming}
                onOpenChange={(value) => {
                    if (!busy) setConfirming(value);
                }}
            >
                <DialogContent
                    onEscapeKeyDown={(event) => {
                        if (busy) event.preventDefault();
                    }}
                    onPointerDownOutside={(event) => {
                        if (busy) event.preventDefault();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Finalisasi Pickup?</DialogTitle>
                        <DialogDescription>
                            Pastikan {total} paket dan seluruh bukti benar.
                            Perubahan setelah finalisasi mengikuti mekanisme
                            koreksi yang diizinkan.
                        </DialogDescription>
                    </DialogHeader>
                    <Button
                        disabled={busy}
                        className="h-11"
                        onClick={() => void finalize()}
                    >
                        {busy ? 'Memfinalisasi…' : 'Konfirmasi Finalisasi'}
                    </Button>
                </DialogContent>
            </Dialog>
        </PageContainer>
    );
}

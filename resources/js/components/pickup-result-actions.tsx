import { router, useHttp, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { categories } from '@/components/pickup-result-ui';
import * as tasks from '@/routes/api/tasks';
import * as handovers from '@/routes/api/handovers';
import { show } from '@/routes/pickup-results';
import type { HandoverSession } from '@/types/handover';
import type { ResultTask, ResultCapabilities } from '@/types/pickup-result';

type Operation = keyof ResultCapabilities;
const labels: Record<Operation, string> = {
    correct_pop: 'Koreksi POP',
    verify: 'Verifikasi Handover',
    correct_verification: 'Koreksi Verifikasi',
    close: 'Tutup Handover',
    reopen: 'Reopen Handover',
};
type Baseline = {
    taskVersion: number;
    sessionVersion: number;
    revision: number;
    quantities: Record<string, number>;
    current: Record<string, string | number>;
    reference: string;
    total: number;
    verified: number;
    pending: number;
    review: number;
    discrepancy: number;
};
export default function PickupResultActions({
    task,
    session,
    capabilities,
    initialOperation,
}: {
    task: ResultTask;
    session: HandoverSession | null;
    capabilities: ResultCapabilities;
    initialOperation?: Operation;
}) {
    const [operation, setOperation] = useState<Operation | null>(null);
    const [baseline, setBaseline] = useState<Baseline | null>(null);
    const [reviewing, setReviewing] = useState(false);
    const [error, setError] = useState('');
    const submitting = useRef(false);
    const form = useHttp<Record<string, string | number>>({});
    const item = session?.items?.find((entry) => entry.task_id === task.id);
    const query = new URL(usePage().url, 'http://local').searchParams;
    query.delete('operation');
    const refresh = () =>
        router.visit(show(task.id, { query: Object.fromEntries(query) }), {
            preserveState: true,
            preserveScroll: true,
            fresh: true,
        });
    const snapshot = (): Baseline => ({
        taskVersion: task.version,
        sessionVersion: session?.version ?? 0,
        revision: task.proof?.revision ?? 0,
        quantities: Object.fromEntries(
            categories.map(([key]) => [key, task.proof?.[key] ?? 0]),
        ),
        current:
            operation === 'correct_pop'
                ? Object.fromEntries(
                      (
                          [
                              'customer_name',
                              'pickup_address',
                              'contact',
                              'notes',
                          ] as const
                      ).map((key) => [key, task.proof?.[key] ?? '']),
                  )
                : Object.fromEntries(
                      categories.map(([key]) => [
                          key,
                          item?.retail[key] ?? 'Belum diperiksa',
                      ]),
                  ),
        reference: session?.reference ?? task.reference,
        total: session?.items?.length ?? 0,
        verified: session?.verified_count ?? 0,
        pending:
            session?.items?.filter((entry) => entry.status === 'PENDING')
                .length ?? 0,
        review: session?.review_count ?? 0,
        discrepancy:
            session?.items?.filter((entry) => entry.status === 'DISCREPANCY')
                .length ?? 0,
    });
    function open(next: Operation) {
        const frozen = snapshot();
        const current: Record<string, string | number> = {};
        if (next === 'correct_pop' && task.proof) {
            for (const key of [
                'customer_name',
                'pickup_address',
                'contact',
                'notes',
            ] as const)
                current[key] = task.proof[key] ?? '';
        }
        if (['correct_pop', 'verify', 'correct_verification'].includes(next)) {
            for (const [key] of categories)
                current[key] =
                    next === 'verify'
                        ? ''
                        : next === 'correct_pop'
                          ? (task.proof?.[key] ?? 0)
                          : (item?.retail[key] ?? 0);
        }
        if (next === 'verify' || next === 'correct_verification')
            current.discrepancy_notes = item?.discrepancy_notes ?? '';
        const original =
            next === 'correct_pop'
                ? { ...current }
                : Object.fromEntries(
                      categories.map(([key]) => [
                          key,
                          item?.retail[key] ?? 'Belum diperiksa',
                      ]),
                  );
        setBaseline({ ...frozen, current: original });
        form.setData({
            ...current,
            reason: '',
            expected_version:
                next === 'correct_pop' ? task.version : (session?.version ?? 0),
            expected_pickup_revision: task.proof?.revision ?? 0,
        });
        form.clearErrors();
        setOperation(next);
        setReviewing(false);
        setError('');
    }
    const initialOpened = useRef(false);
    useEffect(() => {
        if (
            !initialOpened.current &&
            initialOperation &&
            capabilities[initialOperation]
        ) {
            initialOpened.current = true;
            open(initialOperation);
        }
    }, [initialOperation, capabilities, open]);
    const hasQuantities =
        operation !== null &&
        ['correct_pop', 'verify', 'correct_verification'].includes(operation);
    const receiving =
        operation === 'verify' || operation === 'correct_verification';
    const stale =
        !!baseline &&
        (operation === 'correct_pop'
            ? baseline.taskVersion !== task.version
            : baseline.sessionVersion !== session?.version ||
              baseline.revision !== (task.proof?.revision ?? 0));
    const actualComplete = categories.every(
        ([key]) =>
            /^\d+$/.test(String(form.data[key])) &&
            Number(form.data[key]) <= 1000000,
    );
    const discrepancy =
        receiving &&
        actualComplete &&
        categories.some(
            ([key]) => Number(form.data[key]) !== baseline?.quantities[key],
        );
    const actions = (Object.keys(labels) as Operation[]).filter(
        (key) => capabilities[key],
    );
    function submit() {
        if (!operation || !baseline || submitting.current || stale) return;
        if (hasQuantities && !actualComplete) {
            setError('Isi seluruh kategori dengan bilangan bulat 0–1.000.000.');
            return;
        }
        if (discrepancy && !String(form.data.discrepancy_notes ?? '').trim()) {
            form.setError(
                'discrepancy_notes',
                'Catatan wajib ketika ada selisih.',
            );
            return;
        }
        if (!reviewing) {
            setReviewing(true);
            return;
        }
        const url =
            operation === 'correct_pop'
                ? tasks.correct.url(task.id)
                : session && item && operation === 'verify'
                  ? handovers.verify.url({ session: session.id, item: item.id })
                  : session && item && operation === 'correct_verification'
                    ? handovers.correct.url({
                          session: session.id,
                          item: item.id,
                      })
                    : session && operation === 'close'
                      ? handovers.close.url(session.id)
                      : session && operation === 'reopen'
                        ? handovers.reopen.url(session.id)
                        : null;
        if (!url) return;
        submitting.current = true;
        setError('');
        form.transform((data) => {
            const payload = { ...data };
            if (hasQuantities)
                for (const [key] of categories)
                    payload[key] = Number(data[key]);
            return payload;
        });
        void form
            .post(url)
            .then((response) => {
                if (!response) {
                    setReviewing(false);
                    setError(
                        'Perubahan belum tersimpan. Periksa isian yang ditandai.',
                    );
                    return;
                }
                toast.success(`${labels[operation]} berhasil disimpan`);
                setOperation(null);
                refresh();
            })
            .catch((failure: unknown) => {
                const status = (failure as { response?: { status?: number } })
                    .response?.status;
                setError(
                    status === 409
                        ? 'Data berubah atau prasyarat belum terpenuhi. Muat ulang lalu tinjau data terbaru sebelum mengirim kembali.'
                        : 'Hasil permintaan belum dapat dipastikan. Muat ulang untuk memeriksa status sebelum mencoba kembali.',
                );
                setReviewing(false);
            })
            .finally(() => {
                submitting.current = false;
            });
    }
    return (
        <>
            <div className="flex flex-wrap gap-2">
                {capabilities.verify && (
                    <Button onClick={() => open('verify')}>
                        {labels.verify}
                    </Button>
                )}
                {actions.some((key) => key !== 'verify') && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                <MoreHorizontal className="size-4" />
                                Tindakan Admin
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {actions
                                .filter((key) => key !== 'verify')
                                .map((key) => (
                                    <DropdownMenuItem
                                        key={key}
                                        onSelect={() => open(key)}
                                    >
                                        {labels[key]}
                                    </DropdownMenuItem>
                                ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>
            <Dialog
                open={operation !== null}
                onOpenChange={(value) => {
                    if (!value && !form.processing) setOperation(null);
                }}
            >
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {operation ? labels[operation] : ''}
                            {reviewing ? ' · Konfirmasi' : ''}
                        </DialogTitle>
                        <DialogDescription>
                            {operation === 'correct_pop'
                                ? `Koreksi POP revisi #${baseline?.revision}. POP asli tetap tersimpan; verifikasi yang terdampak memerlukan tinjau ulang.`
                                : operation === 'verify'
                                  ? 'Catat jumlah fisik per kategori. Penyimpanan tidak menutup sesi.'
                                  : operation === 'correct_verification'
                                    ? 'Hasil awal tetap tersimpan. Koreksi menggunakan POP terkini dan dicatat sebagai revisi.'
                                    : operation === 'close'
                                      ? 'Semua pickup wajib diperiksa atas revisi POP terkini dan seluruh selisih wajib memiliki catatan. Penutupan tetap menyimpan selisih.'
                                      : 'Buka kembali sesi tertutup untuk pemeriksaan atau koreksi dengan alasan yang tercatat.'}
                        </DialogDescription>
                    </DialogHeader>
                    {baseline && (
                        <form
                            className="space-y-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                submit();
                            }}
                        >
                            {operation === 'close' && (
                                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                                    <p className="font-semibold">
                                        {baseline.reference}
                                    </p>
                                    <p>
                                        Total pickup: {baseline.total} ·
                                        Terverifikasi: {baseline.verified}
                                    </p>
                                    <p>
                                        Belum diperiksa: {baseline.pending} ·
                                        Perlu tinjau ulang: {baseline.review} ·
                                        Ada selisih: {baseline.discrepancy}
                                    </p>
                                </div>
                            )}
                            {hasQuantities && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                                        <span>Kategori</span>
                                        <span>
                                            {receiving
                                                ? 'POP terkini'
                                                : 'Saat ini'}
                                        </span>
                                        <span>
                                            {receiving
                                                ? 'Aktual diterima'
                                                : 'Usulan'}
                                        </span>
                                        <span>Selisih</span>
                                    </div>
                                    {categories.map(([key, label]) => {
                                        const difference =
                                            Number(form.data[key]) -
                                            baseline.quantities[key];
                                        return (
                                            <div
                                                key={key}
                                                className="space-y-1"
                                            >
                                                <div className="grid grid-cols-4 items-center gap-2 text-sm">
                                                    <Label
                                                        htmlFor={`result-${key}`}
                                                    >
                                                        {label}
                                                    </Label>
                                                    <span>
                                                        {
                                                            baseline.quantities[
                                                                key
                                                            ]
                                                        }
                                                    </span>
                                                    <Input
                                                        id={`result-${key}`}
                                                        type="number"
                                                        min={0}
                                                        max={1000000}
                                                        required
                                                        readOnly={reviewing}
                                                        value={
                                                            form.data[key] ?? ''
                                                        }
                                                        onChange={(event) => {
                                                            form.setData(
                                                                key,
                                                                event.target
                                                                    .value,
                                                            );
                                                            form.clearErrors(
                                                                key,
                                                            );
                                                        }}
                                                    />
                                                    <span
                                                        className={
                                                            difference
                                                                ? 'text-amber-800 dark:text-amber-300'
                                                                : ''
                                                        }
                                                    >
                                                        {form.data[key] === ''
                                                            ? '—'
                                                            : `${difference > 0 ? '+' : ''}${difference} ${difference === 0 ? 'SESUAI' : difference > 0 ? 'LEBIH' : 'KURANG'}`}
                                                    </span>
                                                </div>
                                                {form.errors[key] && (
                                                    <p className="text-xs text-destructive">
                                                        {form.errors[key]}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {operation === 'correct_pop' &&
                                (
                                    [
                                        'customer_name',
                                        'pickup_address',
                                        'contact',
                                        'notes',
                                    ] as const
                                ).map((key) => (
                                    <div key={key} className="space-y-1">
                                        <Label htmlFor={`result-${key}`}>
                                            {
                                                {
                                                    customer_name: 'Customer',
                                                    pickup_address:
                                                        'Alamat pickup',
                                                    contact: 'Kontak',
                                                    notes: 'Catatan',
                                                }[key]
                                            }
                                        </Label>
                                        <Input
                                            id={`result-${key}`}
                                            required={key !== 'notes'}
                                            readOnly={reviewing}
                                            value={form.data[key] ?? ''}
                                            onChange={(event) =>
                                                form.setData(
                                                    key,
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        {reviewing && (
                                            <p className="text-xs text-muted-foreground">
                                                Sebelumnya:{' '}
                                                {baseline.current[key] || '—'}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            {receiving && (
                                <div className="space-y-1">
                                    <Label htmlFor="result-discrepancy">
                                        Catatan selisih{' '}
                                        {discrepancy ? '(wajib)' : ''}
                                    </Label>
                                    <textarea
                                        id="result-discrepancy"
                                        maxLength={2000}
                                        required={discrepancy}
                                        readOnly={reviewing}
                                        className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
                                        value={
                                            form.data.discrepancy_notes ?? ''
                                        }
                                        onChange={(event) =>
                                            form.setData(
                                                'discrepancy_notes',
                                                event.target.value,
                                            )
                                        }
                                    />
                                    {operation === 'correct_verification' && (
                                        <p className="text-xs text-muted-foreground">
                                            Verifikasi sebelumnya:{' '}
                                            {categories
                                                .map(
                                                    ([key, label]) =>
                                                        `${label}: ${baseline.current[key]}`,
                                                )
                                                .join(' · ')}
                                        </p>
                                    )}
                                </div>
                            )}
                            {operation !== 'verify' &&
                                operation !== 'close' && (
                                    <div className="space-y-1">
                                        <Label htmlFor="result-reason">
                                            Alasan (wajib)
                                        </Label>
                                        <textarea
                                            id="result-reason"
                                            required
                                            maxLength={500}
                                            readOnly={reviewing}
                                            className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
                                            value={form.data.reason ?? ''}
                                            onChange={(event) =>
                                                form.setData(
                                                    'reason',
                                                    event.target.value,
                                                )
                                            }
                                        />
                                    </div>
                                )}
                            {Object.entries(form.errors).map(
                                ([key, message]) => (
                                    <p
                                        role="alert"
                                        key={key}
                                        className="text-sm text-destructive"
                                    >
                                        {message}
                                    </p>
                                ),
                            )}
                            {error && (
                                <p
                                    role="alert"
                                    className="text-sm text-destructive"
                                >
                                    {error}
                                </p>
                            )}
                            {stale && (
                                <p
                                    role="alert"
                                    className="text-sm text-amber-800 dark:text-amber-300"
                                >
                                    Versi data berubah. Tinjau baseline terbaru;
                                    input Anda tetap tersimpan.
                                </p>
                            )}
                            {(error || stale) && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={form.processing}
                                    onClick={() => {
                                        if (!stale) {
                                            refresh();
                                            return;
                                        }
                                        const latest = snapshot();
                                        setBaseline(latest);
                                        form.setData({
                                            ...form.data,
                                            expected_version:
                                                operation === 'correct_pop'
                                                    ? task.version
                                                    : (session?.version ?? 0),
                                            expected_pickup_revision:
                                                task.proof?.revision ?? 0,
                                        });
                                        setReviewing(false);
                                        setError('');
                                    }}
                                >
                                    {' '}
                                    {stale
                                        ? 'Gunakan baseline terbaru & tinjau ulang'
                                        : 'Muat ulang data'}{' '}
                                </Button>
                            )}
                            {reviewing && (
                                <p className="rounded-md bg-muted p-3 text-sm">
                                    Periksa nilai dan alasan di atas. Konfirmasi
                                    akan menjalankan tindakan pada server dan
                                    mencatat riwayat.
                                </p>
                            )}
                            <div className="flex justify-end gap-2">
                                {reviewing && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={form.processing}
                                        onClick={() => setReviewing(false)}
                                    >
                                        Ubah isian
                                    </Button>
                                )}
                                <Button
                                    disabled={
                                        form.processing ||
                                        stale ||
                                        (operation !== null &&
                                            !capabilities[operation])
                                    }
                                >
                                    {form.processing
                                        ? 'Menyimpan…'
                                        : reviewing
                                          ? 'Konfirmasi & Simpan'
                                          : 'Tinjau Perubahan'}
                                </Button>
                            </div>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

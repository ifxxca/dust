import {
    Head,
    Link,
    router,
    setLayoutProps,
    useForm,
    useHttp,
    usePoll,
} from '@inertiajs/react';
import { HttpResponseError } from '@inertiajs/core';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import PageContainer from '@/components/page-container';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Disclosure, DisclosureSummary } from '@/components/ui/disclosure';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { jneTimestamp } from '@/lib/jne-monitoring';
import {
    index,
    recover as recoverBatch,
    retryBook,
} from '@/routes/cashless-monitoring';
import { operations } from '@/routes';

const states = {
    registered: 'Belum diantrekan',
    queued: 'Dalam antrean',
    processing: 'Sedang diproses',
    approval: 'Menunggu approval HO',
    success: 'Berhasil',
    failed: 'Gagal',
    attention: 'Perlu diperiksa',
} as const;
type Row = {
    id: number;
    awb: string;
    task_id: number;
    reference: string;
    customer: string;
    staff: string | null;
    state: keyof typeof states;
    source: string | null;
    ho_number: string | null;
    previous_ho: string | null;
    batch_id: number | null;
    batch_status: string | null;
    item_status: string | null;
    attempted_awb: string | null;
    message: string | null;
    batch_message: string | null;
    scanned_at: string;
    attempted_at: string | null;
    approved_at: string | null;
    recovery_actions?: ('inspect' | 'finalize' | 'retry')[];
    can_retry_book?: boolean;
};
type Filters = {
    q: string;
    date_from: string;
    date_to: string;
    source: string;
    state: string;
    per_page: number;
};
type Props = {
    timezone: string;
    filters: Filters;
    monitor: {
        updated_at: string;
        rows: {
            data: Row[];
            total: number;
            from: number | null;
            to: number | null;
            current_page: number;
            last_page: number;
        };
    };
};
const server = (source: string | null) =>
    source === 'roberto'
        ? 'PM'
        : source === 'nuralamt'
          ? 'Puman'
          : 'Belum ditentukan';
function Status({ row }: { row: Row }) {
    return (
        <Badge
            variant={
                row.state === 'success'
                    ? 'success'
                    : row.state === 'failed'
                      ? 'destructive'
                      : row.state === 'attention'
                        ? 'warning'
                        : 'secondary'
            }
        >
            {row.item_status === 'PREVIOUSLY_ENTERED' &&
            row.attempted_awb === row.awb
                ? 'Sudah pernah diinput'
                : states[row.state]}
        </Badge>
    );
}
function explanation(row: Row): string {
    if (row.item_status === 'CONFIRMED')
        return `Resi dikonfirmasi Approved=Y dari report Hybrid pada HO ${row.previous_ho}. Tidak ada scan atau approval ulang.`;
    if (row.batch_status === 'INSPECTING')
        return 'Worker memeriksa isi dan status HO. Tidak ada scan, pembuatan HO, atau approval.';
    switch (row.state) {
        case 'success':
            return 'Resi diterima oleh Hybrid dan HO sudah disetujui.';
        case 'registered':
            return 'Resi tersimpan dari pickup, belum ada batch pemrosesan.';
        case 'approval':
            return 'Input belum dinyatakan selesai; approval HO belum terkonfirmasi.';
        case 'queued':
            return row.batch_status === 'WAITING_ACCOUNT'
                ? 'Menunggu pengaturan akun Hybrid petugas.'
                : row.batch_status === 'WAITING_SOURCE'
                  ? 'Menunggu penentuan server tujuan.'
                  : 'Menunggu worker mengambil batch.';
        case 'processing':
            return 'Worker sedang mengerjakan batch. Segarkan untuk melihat hasil terbaru.';
        case 'failed':
            return 'Pemrosesan gagal. Periksa respons worker dan resi pada buku pickup.';
        default:
            return row.item_status === 'PREVIOUSLY_ENTERED' &&
                row.attempted_awb === row.awb
                ? 'Hybrid melaporkan resi sudah pernah diinput. Ini belum membuktikan keberhasilan pada HO batch ini.'
                : 'Bukti pemrosesan belum dapat memastikan keberhasilan resi terkini. Periksa respons dan nomor HO.';
    }
}
export default function CashlessMonitoring({
    monitor,
    filters,
    timezone,
}: Props) {
    const form = useForm(filters);
    const opener = useRef<HTMLButtonElement | null>(null);
    const [selected, setSelected] = useState<number | null>(null);
    const detail = monitor.rows.data.find((row) => row.id === selected);
    const [recoveryAction, setRecoveryAction] = useState<
        'finalize' | 'book' | null
    >(null);
    const [reason, setReason] = useState('');
    const [recoveryError, setRecoveryError] = useState('');
    const [notice, setNotice] = useState('');
    const reasonInput = useRef<HTMLInputElement>(null);
    const pendingRecovery = useRef<{ signature: string; key: string } | null>(
        null,
    );
    const watchingUntil = useRef(0);
    const recovery = useHttp<
        Record<string, string>,
        { batch_id: number; status: string; message: string }
    >({});
    usePoll(10000, {
        only: ['monitor'],
        onBefore: () =>
            !recovery.processing &&
            (Date.now() < watchingUntil.current ||
                (!!detail &&
                    [
                        'INSPECTING',
                        'VERIFYING',
                        'CONFIRMING',
                        'QUEUED',
                        'CLAIMED',
                        'ENTERING',
                        'APPROVING',
                    ].includes(detail.batch_status ?? ''))),
    });
    const recover = async (action: 'inspect' | 'finalize' | 'book') => {
        if (
            !detail ||
            (action !== 'book' && !detail.batch_id) ||
            recovery.processing
        )
            return;
        const explanation =
            action === 'inspect'
                ? `Periksa HO ${detail.ho_number} tanpa mengulang input.`
                : reason.trim();
        if (explanation.length < 5) {
            setRecoveryError('Isi alasan pemulihan, minimal 5 karakter.');
            reasonInput.current?.focus();
            return;
        }
        const signature = JSON.stringify([
            action === 'book' ? detail.task_id : detail.batch_id,
            detail.batch_status,
            action,
            explanation,
        ]);
        if (pendingRecovery.current?.signature !== signature)
            pendingRecovery.current = { signature, key: crypto.randomUUID() };
        recovery.transform(() => ({
            reason: explanation,
            submission_key: pendingRecovery.current!.key,
            ...(action === 'book'
                ? {}
                : { action, expected_status: detail.batch_status! }),
        }));
        setRecoveryError('');
        setNotice('');
        try {
            const result = await recovery.post(
                action === 'book'
                    ? retryBook.url(detail.task_id)
                    : recoverBatch.url(detail.batch_id!),
            );
            setNotice(result.message);
            setRecoveryAction(null);
            watchingUntil.current = Date.now() + 300_000;
            router.reload({ only: ['monitor'] });
        } catch (error) {
            let message =
                'Pemulihan belum dapat diantrekan. Periksa koneksi lalu coba lagi.';
            if (error instanceof HttpResponseError) {
                try {
                    const data =
                        typeof error.response.data === 'string'
                            ? JSON.parse(error.response.data)
                            : error.response.data;
                    message =
                        Object.values(data.errors ?? {})
                            .flat()
                            .join(' ') ||
                        data.message ||
                        message;
                } catch {
                    /* Respons non-JSON memakai pesan pemulihan umum. */
                }
            }
            setRecoveryError(message);
        }
    };
    const navigate = (page = 1, perPage = form.data.per_page) => {
        setSelected(null);
        form.transform((data) => ({ ...data, page, per_page: perPage }));
        form.get(index.url(), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            only: ['monitor', 'filters'],
            onError: (errors) => {
                const first = Object.keys(errors)[0];
                document
                    .getElementById(
                        first === 'q' ? 'cashless-search' : `cashless-${first}`,
                    )
                    ?.focus();
            },
        });
    };
    setLayoutProps({
        breadcrumbs: [{ title: 'Monitoring Cashless', href: index.url() }],
    });
    return (
        <PageContainer className="flex flex-col gap-4 space-y-0">
            <Head title="Monitoring Cashless" />
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Monitoring Cashless
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Hasil input resi cashless dari pickup ke Hybrid.
                    </p>
                </div>
                <Button
                    variant="outline"
                    disabled={form.processing}
                    onClick={() => router.reload({ only: ['monitor'] })}
                >
                    <RefreshCw aria-hidden="true" />
                    Segarkan
                </Button>
            </header>
            {notice && (
                <p role="status" className="text-sm">
                    {notice}
                </p>
            )}
            {recoveryError && !recoveryAction && (
                <Alert variant="destructive">
                    <AlertDescription>{recoveryError}</AlertDescription>
                </Alert>
            )}
            <form
                aria-label="Filter monitoring cashless"
                onSubmit={(event) => {
                    event.preventDefault();
                    navigate();
                }}
                className="flex flex-wrap items-end gap-3"
            >
                <div className="flex min-w-48 flex-1 flex-col gap-1.5">
                    <Label htmlFor="cashless-search">
                        Cari resi atau pickup
                    </Label>
                    <Input
                        id="cashless-search"
                        name="q"
                        placeholder="AWB, customer, petugas, atau nomor HO…"
                        autoComplete="off"
                        value={form.data.q}
                        onChange={(event) =>
                            form.setData('q', event.target.value)
                        }
                        maxLength={100}
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cashless-state">Status input</Label>
                    <NativeSelect
                        id="cashless-state"
                        value={form.data.state}
                        onChange={(event) =>
                            form.setData('state', event.target.value)
                        }
                    >
                        <option value="">Semua status</option>
                        {Object.entries(states).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cashless-source">Server</Label>
                    <NativeSelect
                        id="cashless-source"
                        value={form.data.source}
                        onChange={(event) =>
                            form.setData('source', event.target.value)
                        }
                    >
                        <option value="">Semua server</option>
                        <option value="roberto">PM</option>
                        <option value="nuralamt">Puman</option>
                    </NativeSelect>
                </div>
                {(['date_from', 'date_to'] as const).map((key, index) => (
                    <div key={key} className="flex min-w-36 flex-col gap-1.5">
                        <Label htmlFor={`cashless-${key}`}>
                            {index === 0 ? 'Scan mulai' : 'Scan sampai'}
                        </Label>
                        <Input
                            id={`cashless-${key}`}
                            name={key}
                            type="date"
                            value={form.data[key]}
                            aria-invalid={!!form.errors[key]}
                            aria-describedby={
                                form.errors[key] ? `error-${key}` : undefined
                            }
                            onChange={(event) =>
                                form.setData(key, event.target.value)
                            }
                        />
                        {form.errors[key] && (
                            <p
                                id={`error-${key}`}
                                role="alert"
                                className="text-xs text-destructive"
                            >
                                {form.errors[key]}
                            </p>
                        )}
                    </div>
                ))}
                <Button type="submit" disabled={form.processing}>
                    <Search aria-hidden="true" />
                    {form.processing ? 'Memuat…' : 'Terapkan'}
                </Button>
            </form>
            <div
                className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"
                aria-live="polite"
            >
                <p>
                    {monitor.rows.total.toLocaleString('id-ID')} resi sesuai
                    filter
                </p>
                <p>
                    Terakhir diperbarui:{' '}
                    {jneTimestamp(monitor.updated_at, timezone)}
                </p>
            </div>
            <div
                aria-busy={form.processing}
                className="hidden overflow-hidden rounded-lg border bg-card md:block"
            >
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>AWB</TableHead>
                            <TableHead>Customer / buku pickup</TableHead>
                            <TableHead>Petugas</TableHead>
                            <TableHead>Server / HO</TableHead>
                            <TableHead>Status input</TableHead>
                            <TableHead>Waktu scan</TableHead>
                            <TableHead>Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {monitor.rows.data.map((row) => (
                            <TableRow key={row.id}>
                                <TableCell>
                                    <Button
                                        variant="link"
                                        className="px-0"
                                        onClick={(event) => {
                                            opener.current =
                                                event.currentTarget;
                                            setSelected(row.id);
                                        }}
                                    >
                                        {row.awb}
                                    </Button>
                                </TableCell>
                                <TableCell className="max-w-56 whitespace-normal">
                                    <p>{row.customer}</p>
                                    <Link
                                        href={operations.url({
                                            screen: 'detail',
                                            task: row.task_id,
                                        })}
                                        className="text-xs text-primary underline underline-offset-4"
                                    >
                                        {row.reference}
                                    </Link>
                                </TableCell>
                                <TableCell className="max-w-36 whitespace-normal">
                                    {row.staff ?? 'Belum ditugaskan'}
                                </TableCell>
                                <TableCell>
                                    <p>{server(row.source)}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {(row.item_status === 'CONFIRMED'
                                            ? row.previous_ho
                                            : row.ho_number) ?? '—'}
                                    </p>
                                </TableCell>
                                <TableCell>
                                    <Status row={row} />
                                </TableCell>
                                <TableCell className="text-xs">
                                    {jneTimestamp(row.scanned_at, timezone)}
                                </TableCell>
                                <TableCell>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(event) => {
                                            opener.current =
                                                event.currentTarget;
                                            setSelected(row.id);
                                        }}
                                        aria-label={`Lihat hasil ${row.awb}`}
                                    >
                                        Detail
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
            <div className="flex flex-col divide-y rounded-lg border bg-card md:hidden">
                {monitor.rows.data.map((row) => (
                    <article
                        key={row.id}
                        className="flex min-w-0 flex-col gap-2 p-4"
                    >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <h2 className="min-w-0 font-medium break-all">
                                {row.awb}
                            </h2>
                            <Status row={row} />
                        </div>
                        <p className="text-sm">{row.customer}</p>
                        <p className="text-xs text-muted-foreground">
                            {row.reference} · {row.staff ?? 'Belum ditugaskan'}
                        </p>
                        <p className="text-xs">
                            {server(row.source)} · HO{' '}
                            {(row.item_status === 'CONFIRMED'
                                ? row.previous_ho
                                : row.ho_number) ?? '—'}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                                {jneTimestamp(row.scanned_at, timezone)}
                            </p>
                            <Button
                                className="min-h-11"
                                size="sm"
                                variant="outline"
                                onClick={(event) => {
                                    opener.current = event.currentTarget;
                                    setSelected(row.id);
                                }}
                                aria-label={`Lihat hasil ${row.awb}`}
                            >
                                Detail
                            </Button>
                        </div>
                    </article>
                ))}
            </div>
            {monitor.rows.total === 0 && (
                <p
                    role="status"
                    className="rounded-lg border p-8 text-center text-sm text-muted-foreground"
                >
                    Tidak ada resi cashless sesuai filter. Ubah periode scan
                    atau pencarian.
                </p>
            )}
            <footer className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                    Menampilkan {monitor.rows.from ?? 0}–{monitor.rows.to ?? 0}{' '}
                    dari {monitor.rows.total.toLocaleString('id-ID')} resi
                </p>
                <div className="flex items-center gap-2">
                    <NativeSelect
                        aria-label="Resi per halaman"
                        wrapperClassName="w-40"
                        value={form.data.per_page}
                        onChange={(event) => {
                            const value = Number(event.target.value);
                            form.setData('per_page', value);
                            navigate(1, value);
                        }}
                    >
                        {[10, 25, 50].map((value) => (
                            <option key={value} value={value}>
                                {value} per halaman
                            </option>
                        ))}
                    </NativeSelect>
                    <Button
                        aria-label="Halaman sebelumnya"
                        variant="outline"
                        size="icon"
                        disabled={
                            monitor.rows.current_page <= 1 || form.processing
                        }
                        onClick={() => navigate(monitor.rows.current_page - 1)}
                    >
                        <ChevronLeft aria-hidden="true" />
                    </Button>
                    <span className="text-sm whitespace-nowrap tabular-nums">
                        {monitor.rows.current_page} / {monitor.rows.last_page}
                    </span>
                    <Button
                        aria-label="Halaman berikutnya"
                        variant="outline"
                        size="icon"
                        disabled={
                            monitor.rows.current_page >=
                                monitor.rows.last_page || form.processing
                        }
                        onClick={() => navigate(monitor.rows.current_page + 1)}
                    >
                        <ChevronRight aria-hidden="true" />
                    </Button>
                </div>
            </footer>
            <Sheet
                open={!!detail}
                onOpenChange={(open) => {
                    if (!open) setSelected(null);
                }}
            >
                <SheetContent
                    className="w-full overflow-y-auto sm:max-w-lg"
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        opener.current?.focus();
                    }}
                >
                    <SheetHeader>
                        <SheetTitle className="break-all">
                            {detail?.awb}
                        </SheetTitle>
                        <SheetDescription>
                            Hasil percobaan terakhir untuk resi dari pickup.
                        </SheetDescription>
                    </SheetHeader>
                    {detail && (
                        <div className="flex flex-col gap-5 px-4 pb-6">
                            <Status row={detail} />
                            <p className="text-sm">{explanation(detail)}</p>
                            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
                                {[
                                    ['Customer', detail.customer],
                                    ['Buku pickup', detail.reference],
                                    ['Petugas', detail.staff],
                                    ['Server', server(detail.source)],
                                    [
                                        'Batch',
                                        detail.batch_id
                                            ? `#${detail.batch_id}`
                                            : null,
                                    ],
                                    ['HO percobaan', detail.ho_number],
                                    [
                                        'Resi pada percobaan',
                                        detail.attempted_awb,
                                    ],
                                    [
                                        detail.item_status === 'CONFIRMED'
                                            ? 'HO terkonfirmasi'
                                            : 'HO sebelumnya',
                                        detail.previous_ho,
                                    ],
                                    [
                                        'Waktu scan',
                                        jneTimestamp(
                                            detail.scanned_at,
                                            timezone,
                                        ),
                                    ],
                                    [
                                        'Percobaan terakhir',
                                        jneTimestamp(
                                            detail.attempted_at,
                                            timezone,
                                        ),
                                    ],
                                    [
                                        'Approval HO',
                                        detail.item_status === 'CONFIRMED'
                                            ? 'Approved=Y dari report Hybrid'
                                            : jneTimestamp(
                                                  detail.approved_at,
                                                  timezone,
                                              ),
                                    ],
                                ].map(([label, value]) => (
                                    <div key={label} className="contents">
                                        <dt className="text-muted-foreground">
                                            {label}
                                        </dt>
                                        <dd className="min-w-0 break-words">
                                            {value ?? '—'}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                            <section className="flex flex-col gap-2">
                                <h3 className="text-sm font-medium">
                                    Respons pemrosesan
                                </h3>
                                <p className="text-sm break-words">
                                    {detail.message ??
                                        'Belum ada respons per resi.'}
                                </p>
                                {detail.batch_message && (
                                    <p className="text-sm break-words text-destructive">
                                        {detail.batch_message}
                                    </p>
                                )}
                            </section>
                            {(!!detail.recovery_actions?.length ||
                                detail.can_retry_book) && (
                                <section
                                    aria-label="Pemulihan cashless buku pickup"
                                    className="flex flex-col gap-3 border-t pt-4"
                                >
                                    <h3 className="text-sm font-medium">
                                        Pemulihan cashless
                                    </h3>
                                    {notice && (
                                        <p role="status" className="text-sm">
                                            {notice}
                                        </p>
                                    )}
                                    {recoveryError && !recoveryAction && (
                                        <Alert variant="destructive">
                                            <AlertDescription>
                                                {recoveryError}
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                    {detail.recovery_actions?.includes(
                                        'inspect',
                                    ) && (
                                        <Button
                                            variant="outline"
                                            className="min-h-11"
                                            disabled={recovery.processing}
                                            onClick={() =>
                                                void recover('inspect')
                                            }
                                        >
                                            Periksa hasil HO
                                        </Button>
                                    )}
                                    {detail.recovery_actions?.includes(
                                        'finalize',
                                    ) && (
                                        <Button
                                            className="min-h-11"
                                            variant="outline"
                                            disabled={recovery.processing}
                                            onClick={() => {
                                                setRecoveryError('');
                                                setReason('');
                                                setRecoveryAction('finalize');
                                            }}
                                        >
                                            Selesaikan HO asal
                                        </Button>
                                    )}
                                    {detail.can_retry_book && (
                                        <Button
                                            className="h-auto min-h-11 whitespace-normal"
                                            disabled={recovery.processing}
                                            onClick={() => {
                                                setRecoveryError('');
                                                setReason(
                                                    `Pemulihan cashless buku ${detail.reference}`,
                                                );
                                                setRecoveryAction('book');
                                            }}
                                        >
                                            Proses ulang cashless buku ini
                                        </Button>
                                    )}
                                </section>
                            )}
                            <Disclosure>
                                <DisclosureSummary>
                                    Status teknis
                                </DisclosureSummary>
                                <dl className="grid grid-cols-2 gap-2 p-3 text-xs">
                                    <dt>Resi</dt>
                                    <dd>{detail.item_status ?? '—'}</dd>
                                    <dt>Batch</dt>
                                    <dd>{detail.batch_status ?? '—'}</dd>
                                </dl>
                            </Disclosure>
                            <Button asChild variant="outline">
                                <Link
                                    href={operations.url({
                                        screen: 'detail',
                                        task: detail.task_id,
                                    })}
                                >
                                    Buka buku pickup
                                </Link>
                            </Button>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
            <Dialog
                open={!!recoveryAction}
                onOpenChange={(open) =>
                    !open && !recovery.processing && setRecoveryAction(null)
                }
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {recoveryAction === 'book'
                                ? 'Proses ulang cashless satu buku?'
                                : 'Selesaikan HO asal?'}
                        </DialogTitle>
                        <DialogDescription>
                            {recoveryAction === 'book'
                                ? `Buku ${detail?.reference ?? ''}: resi gagal yang aman dan resi yang belum pernah dikirim dikumpulkan dalam satu batch baru. Resi berhasil, sedang diproses, atau hasilnya belum pasti dilewati. Worker membuat HO baru.`
                                : `Worker memeriksa ulang isi ${detail?.ho_number ?? 'HO asal'} lalu melakukan approval. Tidak ada scan ulang.`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="cashless-recovery-reason">
                            Alasan pemulihan
                        </Label>
                        <Input
                            ref={reasonInput}
                            id="cashless-recovery-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={500}
                            aria-invalid={!!recoveryError}
                            aria-describedby={
                                recoveryError
                                    ? 'cashless-recovery-error'
                                    : undefined
                            }
                        />
                        {recoveryError && (
                            <p
                                role="alert"
                                id="cashless-recovery-error"
                                className="text-sm text-destructive"
                            >
                                {recoveryError}
                            </p>
                        )}
                    </div>
                    <Button
                        className="min-h-11"
                        disabled={recovery.processing}
                        onClick={() =>
                            recoveryAction && void recover(recoveryAction)
                        }
                    >
                        {recovery.processing
                            ? 'Mengantrekan…'
                            : recoveryAction === 'book'
                              ? 'Proses ulang buku ini'
                              : 'Antrekan penyelesaian HO'}
                    </Button>
                </DialogContent>
            </Dialog>
        </PageContainer>
    );
}

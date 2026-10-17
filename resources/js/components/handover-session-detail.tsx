import {
    Table,
    TableHeader,
    TableBody,
    TableFooter,
    TableRow,
    TableHead,
    TableCell,
} from '@/components/ui/table';
import { Link, router, useHttp, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    AlertTriangle,
    ArrowLeft,
    CalendarDays,
    Check,
    ChevronRight,
    ClipboardCheck,
    MapPin,
    Package,
    Phone,
    RefreshCw,
    UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, StatusBadge } from '@/components/operational-ui';
import OperationalChange, {
    RecordedValues,
} from '@/components/operational-change';
import { handover, operations } from '@/routes';
import * as api from '@/routes/api/handovers';
import { type HandoverItem, type HandoverSession } from '@/types/handover';

const categories = [
    ['manual_hybrid', 'Manual Hybrid Non-Cashless'],
    ['cashless_hybrid', 'Cashless Hybrid'],
    ['css_orion', 'CSS / Orion'],
] as const;
const direction = (value: number) =>
    value === 0
        ? '0 · SESUAI'
        : value > 0
          ? `+${value} · LEBIH`
          : `${value} · KURANG`;
type VerificationDraft = {
    manual_hybrid: string;
    cashless_hybrid: string;
    css_orion: string;
    discrepancy_notes: string;
};
const emptyDraft: VerificationDraft = {
    manual_hybrid: '',
    cashless_hybrid: '',
    css_orion: '',
    discrepancy_notes: '',
};

function ItemStatus({ item }: { item: HandoverItem }) {
    return item.needs_review || item.status === 'PENDING' ? (
        <Badge
            variant="outline"
            className="border-amber-200 bg-amber-50 font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
        >
            {item.needs_review ? 'Perlu Pemeriksaan Ulang' : 'Perlu Verifikasi'}
        </Badge>
    ) : item.status === 'VERIFIED' ? (
        <Badge
            variant="outline"
            className="border-emerald-200 bg-emerald-50 font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
            Terverifikasi
        </Badge>
    ) : (
        <StatusBadge status={item.status} />
    );
}

function VerificationForm({
    session,
    item,
    draft,
    onDraft,
    onBusy,
    onSaved,
    disabled,
}: {
    session: HandoverSession;
    item: HandoverItem;
    draft?: VerificationDraft;
    onDraft: (value: VerificationDraft) => void;
    onBusy: (value: boolean) => void;
    onSaved: (value: HandoverSession) => void;
    disabled: boolean;
}) {
    const form = useHttp<
        VerificationDraft & {
            expected_version: number;
            expected_pickup_revision: number;
        },
        { data: HandoverSession }
    >({
        ...emptyDraft,
        ...draft,
        expected_version: session.version,
        expected_pickup_revision: item.pickup_revision,
    });
    const [error, setError] = useState('');
    const submitting = useRef(false);
    const complete = categories.every(
        ([key]) =>
            /^\d+$/.test(form.data[key]) && Number(form.data[key]) <= 1000000,
    );
    const discrepancy =
        complete &&
        categories.some(([key]) => Number(form.data[key]) !== item.pickup[key]);
    const total = categories.reduce(
        (sum, [key]) => sum + (Number(form.data[key]) || 0),
        0,
    );
    const change = (key: keyof VerificationDraft, value: string) => {
        form.setData(key, value);
        form.clearErrors(key);
        setError('');
        const {
            expected_version: _version,
            expected_pickup_revision: _revision,
            ...values
        } = form.data;
        onDraft({ ...values, [key]: value });
    };
    return (
        <form
            className="space-y-4"
            onSubmit={(event) => {
                event.preventDefault();
                if (submitting.current || disabled) return;
                if (!complete) {
                    setError(
                        'Masukkan bilangan bulat 0–1.000.000 pada seluruh kategori.',
                    );
                    return;
                }
                if (discrepancy && !form.data.discrepancy_notes.trim()) {
                    form.setError(
                        'discrepancy_notes',
                        'Catatan wajib ketika ada selisih pada kategori mana pun.',
                    );
                    return;
                }
                submitting.current = true;
                onBusy(true);
                setError('');
                form.transform((data) => ({
                    ...data,
                    expected_version: form.data.expected_version,
                    expected_pickup_revision:
                        form.data.expected_pickup_revision,
                    manual_hybrid: Number(data.manual_hybrid),
                    cashless_hybrid: Number(data.cashless_hybrid),
                    css_orion: Number(data.css_orion),
                }));
                void form
                    .post(
                        api.verify.url({ session: session.id, item: item.id }),
                    )
                    .then((result) => {
                        if (!result) {
                            setError(
                                'Hasil belum tersimpan. Periksa field yang ditandai.',
                            );
                            submitting.current = false;
                            return;
                        }
                        toast.success('Verifikasi berhasil disimpan');
                        onSaved(result.data);
                    })
                    .catch(() => {
                        submitting.current = false;
                        setError(
                            'Verifikasi belum berhasil atau session sudah berubah. Muat ulang sebelum mencoba kembali.',
                        );
                    })
                    .finally(() => onBusy(false));
            }}
        >
            <div className="overflow-x-auto rounded-lg border">
                <Table className="w-full table-fixed text-left text-xs sm:text-sm">
                    <TableHeader className="bg-muted/50 text-xs text-muted-foreground">
                        <TableRow>
                            <TableHead className="w-[38%] p-2 whitespace-normal sm:p-3">
                                Kategori
                            </TableHead>
                            <TableHead className="w-[17%] p-2 text-center whitespace-normal">
                                Jumlah POP
                            </TableHead>
                            <TableHead className="w-[28%] p-2 whitespace-normal">
                                Jumlah Diterima
                            </TableHead>
                            <TableHead className="w-[17%] p-2 text-center whitespace-normal">
                                Selisih
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {categories.map(([key, label]) => (
                            <TableRow key={key} className="border-t">
                                <TableCell className="p-2 break-words whitespace-normal sm:p-3">
                                    {label}
                                </TableCell>
                                <TableCell className="p-2 text-center whitespace-normal tabular-nums">
                                    {item.pickup[key]}
                                </TableCell>
                                <TableCell className="p-2 whitespace-normal">
                                    <Input
                                        aria-label={`${label} — fisik diterima`}
                                        id={`retail-${key}`}
                                        className="h-11 w-full min-w-0 px-2"
                                        required
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        max={1000000}
                                        step={1}
                                        value={form.data[key]}
                                        disabled={disabled || form.processing}
                                        onChange={(event) => {
                                            const value = event.target.value;
                                            change(
                                                key,
                                                /^\d+$/.test(value)
                                                    ? value.replace(
                                                          /^0+(?=\d)/,
                                                          '',
                                                      )
                                                    : value,
                                            );
                                        }}
                                    />
                                    {form.errors[key] && (
                                        <p className="mt-1 text-xs text-destructive">
                                            {form.errors[key]}
                                        </p>
                                    )}
                                </TableCell>
                                <TableCell
                                    className={
                                        'whitespace-normal ' +
                                        `p-2 text-center tabular-nums ${form.data[key] !== '' && Number(form.data[key]) !== item.pickup[key] ? 'font-semibold text-rose-600 dark:text-rose-300' : 'text-muted-foreground'}`
                                    }
                                >
                                    {form.data[key] === ''
                                        ? '—'
                                        : direction(
                                              Number(form.data[key]) -
                                                  item.pickup[key],
                                          )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter className="border-t bg-primary/5 font-semibold">
                        <TableRow>
                            <TableCell className="p-3 whitespace-normal">
                                Total
                            </TableCell>
                            <TableCell className="p-2 text-center whitespace-normal">
                                {item.pickup.total}
                            </TableCell>
                            <TableCell className="p-2 whitespace-normal">
                                {complete ? total : '—'}
                            </TableCell>
                            <TableCell className="p-2 text-center whitespace-normal">
                                {complete
                                    ? total - (item.pickup.total ?? 0)
                                    : '—'}
                            </TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </div>
            {complete && (
                <p
                    role="status"
                    className={`text-xs ${discrepancy ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}
                >
                    {discrepancy
                        ? 'Ada selisih per kategori. Catatan wajib diisi.'
                        : 'Seluruh kategori sesuai dengan POP.'}
                </p>
            )}
            <div className="space-y-2">
                <Label htmlFor="verification-notes">
                    Catatan Verifikasi {discrepancy ? '(wajib)' : '(opsional)'}
                </Label>
                <textarea
                    id="verification-notes"
                    maxLength={2000}
                    required={discrepancy}
                    disabled={disabled || form.processing}
                    className="min-h-24 w-full rounded-lg border bg-background p-3 text-sm"
                    placeholder={
                        discrepancy
                            ? 'Jelaskan selisih hasil hitung fisik paket…'
                            : 'Catatan hasil penerimaan paket…'
                    }
                    value={form.data.discrepancy_notes}
                    onChange={(event) =>
                        change('discrepancy_notes', event.target.value)
                    }
                />
                <p className="text-right text-xs text-muted-foreground">
                    {form.data.discrepancy_notes.length}/2000
                </p>
                {form.errors.discrepancy_notes && (
                    <p role="alert" className="text-sm text-destructive">
                        {form.errors.discrepancy_notes}
                    </p>
                )}
            </div>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                    Hitung fisik secara independen. Input belum tersimpan sampai
                    verifikasi dikirim.
                </p>
                <Button
                    className="h-11 w-full sm:w-auto"
                    disabled={disabled || form.processing || !complete}
                >
                    <Check className="size-4" />
                    {form.processing
                        ? 'Menyimpan…'
                        : discrepancy
                          ? 'Simpan Discrepancy'
                          : 'Tandai Terverifikasi'}
                </Button>
            </div>
        </form>
    );
}

export default function HandoverSessionDetail({
    session,
    timezone,
    history,
    isAdmin,
    loading,
    onRefresh,
    onClose,
    onAmend,
    onUpdated,
}: {
    session: HandoverSession;
    timezone: string;
    history: boolean;
    isAdmin: boolean;
    loading: boolean;
    onRefresh: () => void;
    onClose: () => void;
    onAmend: () => void;
    onUpdated: (session: HandoverSession) => void;
}) {
    const items = session.items ?? [];
    const initialItem = Number(
        new URL(usePage().url, 'http://localhost').searchParams.get('item'),
    );
    const [selectedId, setSelectedId] = useState<number | null>(
        initialItem > 0 ? initialItem : null,
    );
    const [drafts, setDrafts] = useState<Record<number, VerificationDraft>>({});
    const [busy, setBusy] = useState(false);
    const selected = items.find((item) => item.id === selectedId) ?? items[0];
    const dirty = items.some(
        (item) =>
            item.status === 'PENDING' &&
            Object.values(drafts[item.id] ?? {}).some((value) => value !== ''),
    );
    useEffect(() => {
        const unload = (event: BeforeUnloadEvent) => {
            if (dirty || busy) {
                event.preventDefault();
                event.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', unload);
        const off = router.on('before', () => {
            if (busy) {
                toast.info('Tunggu penyimpanan verifikasi selesai.');
                return false;
            }
            if (dirty)
                return window.confirm(
                    'Input verifikasi belum tersimpan. Tinggalkan session?',
                );
        });
        return () => {
            window.removeEventListener('beforeunload', unload);
            off();
        };
    }, [dirty, busy]);
    const format = (value: string) =>
        new Date(value).toLocaleString('id-ID', {
            timeZone: timezone,
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    const total = items.reduce(
        (sum, item) => sum + (item.pickup.total ?? 0),
        0,
    );
    const verified = items.filter(
        (item) => item.status !== 'PENDING' && !item.needs_review,
    ).length;
    const discrepancies = items.filter(
        (item) => item.status === 'DISCREPANCY',
    ).length;
    return (
        <div className="space-y-5" aria-busy={loading}>
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                            Handover Session HO-
                            {String(session.id).padStart(4, '0')}
                        </h1>
                        <StatusBadge status={session.status} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {format(session.created_at)} ·{' '}
                        {session.staff_names?.join(', ') ||
                            'Petugas tidak tersedia'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        className="h-11"
                        disabled={busy || loading}
                        onClick={onRefresh}
                    >
                        <RefreshCw
                            className={`size-4 ${loading ? 'animate-spin' : ''}`}
                        />
                        Muat Ulang
                    </Button>
                    {session.can?.receive && session.status !== 'CLOSED' && (
                        <Button
                            className="h-11"
                            variant={session.can_close ? 'default' : 'outline'}
                            disabled={!session.can_close || busy || loading}
                            onClick={onClose}
                        >
                            Tutup Session
                        </Button>
                    )}
                </div>
            </header>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {[
                    {
                        label: 'Jumlah Task',
                        value: items.length,
                        icon: Package,
                        color: 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-300',
                    },
                    {
                        label: 'Jumlah Paket (POP)',
                        value: total,
                        icon: CalendarDays,
                        color: 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-300',
                    },
                    {
                        label: 'Verifikasi',
                        value: `${verified} / ${items.length}`,
                        icon: ClipboardCheck,
                        color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300',
                    },
                    {
                        label: 'Discrepancy',
                        value: discrepancies,
                        icon: AlertTriangle,
                        color: 'text-rose-600 bg-rose-50 dark:bg-rose-950 dark:text-rose-300',
                    },
                    {
                        label: 'Dibuat Oleh',
                        value:
                            session.creator?.name ?? 'Pengguna tidak tersedia',
                        icon: UserRound,
                        color: 'text-muted-foreground bg-muted',
                    },
                ].map((card, index) => (
                    <div
                        key={card.label}
                        className={`flex min-w-0 items-center gap-3 rounded-xl border bg-card p-4 shadow-sm ${index === 4 ? 'col-span-2 lg:col-span-1' : ''}`}
                    >
                        <span
                            className={`hidden size-11 shrink-0 items-center justify-center rounded-xl sm:flex ${card.color}`}
                        >
                            <card.icon className="size-6" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">
                                {card.label}
                            </p>
                            <p
                                className={`mt-2 font-bold break-words ${index === 4 ? 'text-sm' : 'text-2xl tabular-nums'} ${index === 3 && discrepancies ? 'text-rose-600 dark:text-rose-300' : ''}`}
                            >
                                {card.value}
                            </p>
                            {index === 4 && (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    {format(session.created_at)}
                                </p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(280px,1fr)_minmax(0,1.85fr)]">
                <section
                    aria-label="Daftar pickup task dalam session"
                    className="min-w-0 space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
                >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold">
                                Daftar Pickup Task
                            </h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Pilih task untuk memeriksa hasil penerimaan
                                paket.
                            </p>
                        </div>
                        {session.can?.edit && (
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={busy || loading}
                                onClick={onAmend}
                            >
                                Ubah Anggota
                            </Button>
                        )}
                    </div>
                    {items.length === 0 ? (
                        <EmptyState
                            title="Session belum memiliki task"
                            description="Kelola anggota session sebelum verifikasi."
                        />
                    ) : (
                        <div className="space-y-2">
                            {items.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    disabled={busy || loading}
                                    aria-pressed={selected?.id === item.id}
                                    aria-controls="handover-verification-panel"
                                    className={`w-full rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${selected?.id === item.id ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'hover:border-primary/40 hover:bg-muted/30'}`}
                                    onClick={() => setSelectedId(item.id)}
                                >
                                    <div className="flex items-start gap-3">
                                        <span className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 sm:flex dark:bg-blue-950 dark:text-blue-300">
                                            <UserRound className="size-5" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p
                                                    className="font-semibold"
                                                    title={item.reference}
                                                >
                                                    PCK-
                                                    {String(
                                                        item.task_id,
                                                    ).padStart(4, '0')}
                                                </p>
                                                <ItemStatus item={item} />
                                            </div>
                                            <p className="mt-1 text-sm break-words">
                                                {item.customer_name}
                                            </p>
                                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <CalendarDays className="size-3" />
                                                    {item.picked_up_at
                                                        ? format(
                                                              item.picked_up_at,
                                                          )
                                                        : 'Waktu pickup tidak tersedia'}
                                                </span>
                                                <span>
                                                    {item.pickup.total ?? 0}{' '}
                                                    paket (POP)
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </section>
                <section
                    id="handover-verification-panel"
                    aria-label="Verifikasi task terpilih"
                    className="min-w-0 space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
                >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold">
                                Verifikasi Paket
                            </h2>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                Periksa jumlah paket fisik per kategori dan
                                masukkan hasil penerimaan.
                            </p>
                        </div>
                        {selected && <ItemStatus item={selected} />}
                    </div>
                    {selected && (
                        <>
                            <div className="flex flex-wrap items-start gap-3 rounded-lg border p-4">
                                <UserRound className="size-5 shrink-0 text-primary" />
                                <div className="min-w-0 flex-1">
                                    <p
                                        className="font-semibold"
                                        title={selected.reference}
                                    >
                                        PCK-
                                        {String(selected.task_id).padStart(
                                            4,
                                            '0',
                                        )}
                                    </p>
                                    <p className="mt-1 text-sm break-words">
                                        {selected.customer_name}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                                        {selected.picked_up_at && (
                                            <span className="flex items-center gap-1">
                                                <CalendarDays className="size-3.5" />
                                                {format(selected.picked_up_at)}
                                            </span>
                                        )}
                                        {selected.pickup_address && (
                                            <span className="flex min-w-0 items-start gap-1">
                                                <MapPin className="size-3.5 shrink-0" />
                                                <span className="break-words">
                                                    {selected.pickup_address}
                                                </span>
                                            </span>
                                        )}
                                        {selected.contact && (
                                            <span className="flex items-center gap-1 break-all">
                                                <Phone className="size-3.5 shrink-0" />
                                                {selected.contact}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    asChild
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy}
                                >
                                    <Link
                                        href={operations({
                                            screen: 'detail',
                                            task: selected.task_id,
                                        })}
                                    >
                                        Lihat Detail Task
                                    </Link>
                                </Button>
                            </div>
                            {selected.status === 'PENDING' &&
                            session.can?.verify &&
                            session.status !== 'CLOSED' ? (
                                <VerificationForm
                                    key={`${session.id}-${selected.id}-${session.version}`}
                                    session={session}
                                    item={selected}
                                    draft={drafts[selected.id]}
                                    disabled={loading}
                                    onDraft={(value) =>
                                        setDrafts((current) => ({
                                            ...current,
                                            [selected.id]: value,
                                        }))
                                    }
                                    onBusy={setBusy}
                                    onSaved={(value) => {
                                        setDrafts((current) => {
                                            const next = { ...current };
                                            delete next[selected.id];
                                            return next;
                                        });
                                        onUpdated(value);
                                    }}
                                />
                            ) : (
                                <>
                                    <div className="overflow-x-auto rounded-lg border">
                                        <Table className="w-full table-fixed text-left text-xs sm:text-sm">
                                            <TableHeader className="bg-muted/50 text-muted-foreground">
                                                <TableRow>
                                                    <TableHead className="w-[38%] p-3 whitespace-normal">
                                                        Kategori
                                                    </TableHead>
                                                    <TableHead className="w-[17%] p-2 text-center whitespace-normal">
                                                        Jumlah POP
                                                    </TableHead>
                                                    <TableHead className="w-[28%] p-2 whitespace-normal">
                                                        Jumlah Diterima
                                                    </TableHead>
                                                    <TableHead className="w-[17%] p-2 text-center whitespace-normal">
                                                        Selisih
                                                    </TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {categories.map(
                                                    ([key, label]) => (
                                                        <TableRow
                                                            key={key}
                                                            className="border-t"
                                                        >
                                                            <TableCell className="p-2 break-words whitespace-normal sm:p-3">
                                                                {label}
                                                            </TableCell>
                                                            <TableCell className="p-2 text-center whitespace-normal">
                                                                {
                                                                    selected
                                                                        .pickup[
                                                                        key
                                                                    ]
                                                                }
                                                            </TableCell>
                                                            <TableCell className="p-2 whitespace-normal">
                                                                <Input
                                                                    aria-label={`${label} — hasil tersimpan`}
                                                                    readOnly
                                                                    className="h-11 min-w-0 bg-muted/30"
                                                                    value={
                                                                        selected.status ===
                                                                        'PENDING'
                                                                            ? '—'
                                                                            : selected
                                                                                  .retail[
                                                                                  key
                                                                              ]
                                                                    }
                                                                />
                                                            </TableCell>
                                                            <TableCell
                                                                className={
                                                                    'whitespace-normal ' +
                                                                    `p-2 text-center ${selected.differences?.[key] ? 'font-semibold text-rose-600 dark:text-rose-300' : 'text-muted-foreground'}`
                                                                }
                                                            >
                                                                {selected.differences
                                                                    ? direction(
                                                                          selected
                                                                              .differences[
                                                                              key
                                                                          ],
                                                                      )
                                                                    : '—'}
                                                            </TableCell>
                                                        </TableRow>
                                                    ),
                                                )}
                                            </TableBody>
                                            <TableFooter className="border-t bg-primary/5 font-semibold">
                                                <TableRow>
                                                    <TableCell className="p-3 whitespace-normal">
                                                        Total
                                                    </TableCell>
                                                    <TableCell className="p-2 text-center whitespace-normal">
                                                        {selected.pickup.total}
                                                    </TableCell>
                                                    <TableCell className="p-2 whitespace-normal">
                                                        {selected.retail
                                                            .total ?? '—'}
                                                    </TableCell>
                                                    <TableCell className="p-2 text-center whitespace-normal">
                                                        {selected.retail
                                                            .total === null
                                                            ? '—'
                                                            : selected.retail
                                                                  .total -
                                                              (selected.pickup
                                                                  .total ?? 0)}
                                                    </TableCell>
                                                </TableRow>
                                            </TableFooter>
                                        </Table>
                                    </div>
                                    {selected.discrepancy_notes && (
                                        <div className="space-y-2">
                                            <Label>Catatan Verifikasi</Label>
                                            <p className="rounded-lg border bg-muted/30 p-3 text-sm break-words">
                                                {selected.discrepancy_notes}
                                            </p>
                                        </div>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        Hasil pemeriksaan tersimpan
                                        {selected.verified_at
                                            ? ` pada ${format(selected.verified_at)}`
                                            : ''}
                                        . Perubahan menggunakan koreksi resmi
                                        oleh Admin.
                                    </p>
                                    {selected.needs_review && (
                                        <p
                                            role="alert"
                                            className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                        >
                                            POP dikoreksi setelah pemeriksaan.
                                            Admin perlu memeriksa ulang dan
                                            mencatat koreksi verifikasi.
                                        </p>
                                    )}
                                    {isAdmin &&
                                        session.status === 'IN_VERIFICATION' &&
                                        selected.status !== 'PENDING' && (
                                            <OperationalChange
                                                key={`${selected.id}-${session.version}`}
                                                title="Koreksi Verifikasi"
                                                description="Nilai awal tetap tersimpan. Catat alasan koreksi; selisih fisik tidak otomatis selesai."
                                                url={api.correct.url({
                                                    session: session.id,
                                                    item: selected.id,
                                                })}
                                                version={session.version}
                                                values={{
                                                    manual_hybrid:
                                                        selected.retail
                                                            .manual_hybrid,
                                                    cashless_hybrid:
                                                        selected.retail
                                                            .cashless_hybrid,
                                                    css_orion:
                                                        selected.retail
                                                            .css_orion,
                                                    discrepancy_notes:
                                                        selected.discrepancy_notes ??
                                                        '',
                                                }}
                                                labels={{
                                                    manual_hybrid:
                                                        'Manual Hybrid (Non-Cashless)',
                                                    cashless_hybrid:
                                                        'Cashless Hybrid',
                                                    css_orion: 'CSS / Orion',
                                                    discrepancy_notes:
                                                        'Catatan Selisih',
                                                }}
                                                onSaved={onRefresh}
                                            />
                                        )}
                                </>
                            )}
                            {selected.revisions.length > 0 && (
                                <details className="rounded-lg border p-3 text-xs">
                                    <summary className="cursor-pointer font-medium">
                                        Riwayat Koreksi Verifikasi (
                                        {selected.revisions.length})
                                    </summary>
                                    <div className="mt-3">
                                        <p>Nilai awal:</p>
                                        <RecordedValues
                                            values={selected.original_retail}
                                        />
                                    </div>
                                    {selected.revisions.map((revision) => (
                                        <div
                                            key={revision.revision}
                                            className="mt-4 border-t pt-3"
                                        >
                                            <p>
                                                Versi {revision.revision} ·
                                                pengguna #{revision.actor_id} ·{' '}
                                                {format(revision.created_at)}
                                            </p>
                                            <p className="mt-1 break-words">
                                                {revision.reason}
                                            </p>
                                            <RecordedValues
                                                values={revision.values}
                                            />
                                        </div>
                                    ))}
                                </details>
                            )}
                        </>
                    )}
                </section>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Button asChild variant="ghost" disabled={busy}>
                    <Link
                        href={handover(
                            {},
                            { query: history ? { history: 1 } : {} },
                        )}
                    >
                        <ArrowLeft className="size-4" />
                        Kembali ke Daftar Session
                    </Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                    Menutup session tidak menyelesaikan discrepancy.
                </p>
                {session.status === 'CLOSED' && isAdmin && (
                    <OperationalChange
                        title="Buka Kembali Session"
                        description="Riwayat penutupan dan hasil pemeriksaan tetap tersimpan. Alasan wajib diisi."
                        url={api.reopen.url(session.id)}
                        version={session.version}
                        onSaved={onRefresh}
                    />
                )}
            </div>
            <details className="rounded-xl border bg-card p-4 text-sm">
                <summary className="cursor-pointer font-semibold">
                    Jejak Session ({session.events?.length ?? 0})
                </summary>
                <div className="mt-4 space-y-3 border-l pl-4">
                    {session.events?.map((event, index) => (
                        <div key={index}>
                            <p className="font-medium">
                                {(
                                    {
                                        created: 'Session dibuat',
                                        item_verified: 'Paket diperiksa',
                                        closed: 'Session ditutup',
                                        reopened: 'Session dibuka kembali',
                                        membership_changed:
                                            'Anggota session diubah',
                                        pickup_corrected: 'POP dikoreksi',
                                        verification_corrected:
                                            'Verifikasi dikoreksi',
                                    } as Record<string, string>
                                )[event.action] ?? event.action}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Pengguna #{event.actor_id} ·{' '}
                                {format(event.occurred_at)}
                                {event.reason && ` · ${event.reason}`}
                            </p>
                        </div>
                    ))}
                </div>
            </details>
        </div>
    );
}

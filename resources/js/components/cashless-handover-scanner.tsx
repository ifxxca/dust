import { router, useForm } from '@inertiajs/react';
import {
    Barcode,
    Check,
    LoaderCircle,
    LockKeyhole,
    Plus,
    Save,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { prepareCashlessAwb } from '@/lib/cashless-handover';
import { jneTimestamp } from '@/lib/jne-monitoring';
import { submissionKey } from '@/lib/submission-key';
import * as routes from '@/routes/cashless-handover';
import type { SelectedCashlessPickup } from '@/types/cashless-handover';
import {
    CashlessEntryStatus,
    CashlessSourcePicker,
} from '@/components/cashless-entry-status';

export default function CashlessHandoverScanner({
    pickup,
    timezone,
    onPage,
}: {
    pickup: SelectedCashlessPickup;
    timezone: string;
    onPage: (page: number) => void;
}) {
    const [value, setValue] = useState('');
    const [entryError, setEntryError] = useState('');
    const input = useRef<HTMLInputElement>(null);
    const key = useRef<string | null>(null);
    const form = useForm({
        awbs: [] as string[],
        submission_key: '',
        source: '',
    });
    const dirty = value.trim() !== '' || form.data.awbs.length > 0;

    useEffect(() => {
        if (!dirty) return;
        const unload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', unload);
        const remove = router.on('before', (event) => {
            if (
                event.detail.visit.method === 'get' &&
                !window.confirm(
                    'Ada resi yang belum disimpan. Tinggalkan daftar ini?',
                )
            )
                return false;
        });
        return () => {
            window.removeEventListener('beforeunload', unload);
            remove();
        };
    }, [dirty]);

    function add() {
        const result = prepareCashlessAwb(
            value,
            form.data.awbs,
            pickup.awbs.data.map((row) => row.awb),
        );
        if (result.error) {
            setEntryError(result.error);
            input.current?.focus();
            input.current?.select();
            return;
        }
        form.setData('awbs', [...form.data.awbs, result.awb!]);
        form.clearErrors();
        key.current = null;
        setValue('');
        setEntryError('');
        input.current?.focus();
    }

    function save(event: React.SubmitEvent) {
        event.preventDefault();
        if (form.processing) return;
        if (!form.data.source) {
            form.setError('source', 'Pilih server tujuan sebelum menyimpan.');
            document
                .querySelector<HTMLButtonElement>('#cashless-source button')
                ?.focus();
            return;
        }
        let awbs = form.data.awbs;
        if (value.trim()) {
            const result = prepareCashlessAwb(
                value,
                awbs,
                pickup.awbs.data.map((row) => row.awb),
            );
            if (result.error) {
                setEntryError(result.error);
                input.current?.focus();
                return;
            }
            awbs = [...awbs, result.awb!];
            form.setData('awbs', awbs);
            setValue('');
            key.current = null;
        }
        if (awbs.length === 0) {
            setEntryError('Tambahkan minimal satu resi sebelum menyimpan.');
            input.current?.focus();
            return;
        }
        key.current ??= submissionKey();
        const payload = {
            awbs,
            submission_key: key.current,
            source: form.data.source,
        };
        form.transform(() => payload);
        form.post(routes.store.url(pickup.id), {
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                key.current = null;
                setEntryError('');
                toast.success(
                    `${awbs.length} resi Cashless berhasil disimpan.`,
                );
                input.current?.focus();
            },
            onError: () => input.current?.focus(),
        });
    }

    const errors = Object.entries(form.errors).filter(
        ([field]) =>
            field === 'awbs' ||
            field.startsWith('awbs.') ||
            field === 'submission_key' ||
            field === 'source',
    );
    const total = pickup.saved_count + form.data.awbs.length;
    return (
        <section
            className="flex min-w-0 flex-col rounded-xl border bg-card"
            aria-labelledby="scan-heading"
        >
            <div className="flex flex-col gap-2 border-b p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="scan-heading" className="text-lg font-semibold">
                        {pickup.customer}
                    </h2>
                    <Badge
                        variant={pickup.can_record ? 'secondary' : 'outline'}
                    >
                        {pickup.can_record
                            ? 'Dapat dicatat'
                            : 'Pencatatan ditutup'}
                    </Badge>
                </div>
                <p className="text-sm break-all text-muted-foreground">
                    {pickup.reference} ·{' '}
                    {jneTimestamp(pickup.scheduled_at, timezone)}
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
                    <span>
                        Tersimpan <strong>{pickup.saved_count}</strong> resi
                    </span>
                    <span>
                        Target POP{' '}
                        <strong>{pickup.target ?? 'Belum final'}</strong>
                    </span>
                    {form.data.awbs.length > 0 && (
                        <span>
                            Setelah disimpan <strong>{total}</strong>
                        </span>
                    )}
                </div>
            </div>
            {pickup.can_record ? (
                <form
                    onSubmit={save}
                    className="flex min-w-0 flex-col gap-4 p-4"
                    aria-busy={form.processing}
                >
                    <CashlessSourcePicker
                        id="cashless-source"
                        value={form.data.source}
                        disabled={form.processing}
                        onChange={(source) => {
                            form.setData('source', source);
                            key.current = null;
                            form.clearErrors('source');
                        }}
                    />
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="cashless-awb">
                            Scan atau ketik nomor resi
                        </Label>
                        <div className="flex gap-2">
                            <div className="relative min-w-0 flex-1">
                                <Barcode
                                    aria-hidden="true"
                                    className="pointer-events-none absolute top-3.5 left-3 size-5 text-muted-foreground"
                                />
                                <Input
                                    ref={input}
                                    id="cashless-awb"
                                    name="awb"
                                    autoComplete="off"
                                    autoCapitalize="characters"
                                    spellCheck={false}
                                    className="h-12 pl-10 font-mono"
                                    placeholder="Contoh: TG3583843345…"
                                    value={value}
                                    disabled={form.processing}
                                    aria-invalid={!!entryError}
                                    aria-describedby="cashless-awb-help cashless-awb-error"
                                    onChange={(event) => {
                                        setValue(event.target.value);
                                        setEntryError('');
                                    }}
                                    onKeyDown={(event) => {
                                        if (
                                            event.key === 'Enter' &&
                                            !event.nativeEvent.isComposing
                                        ) {
                                            event.preventDefault();
                                            add();
                                        }
                                    }}
                                />
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                className="h-12"
                                disabled={form.processing}
                                onClick={add}
                            >
                                <Plus aria-hidden="true" />
                                Tambah
                            </Button>
                        </div>
                        <p
                            id="cashless-awb-help"
                            className="text-xs text-muted-foreground"
                        >
                            Scanner barcode dengan akhiran Enter langsung
                            menambah ke daftar.
                        </p>
                        <div id="cashless-awb-error" aria-live="polite">
                            <InputError message={entryError} />
                        </div>
                    </div>
                    <div aria-live="polite" className="flex flex-col gap-1">
                        {errors.map(([field, message]) => (
                            <InputError key={field} message={message} />
                        ))}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-medium">Belum disimpan</h3>
                        <Badge variant="outline">
                            {form.data.awbs.length} resi
                        </Badge>
                    </div>
                    {form.data.awbs.length === 0 ? (
                        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                            Resi yang ditambahkan akan tampil di sini.
                        </div>
                    ) : (
                        <ol className="max-h-80 divide-y overflow-y-auto rounded-lg border">
                            {form.data.awbs.map((awb, index) => (
                                <li
                                    key={awb}
                                    className="flex items-center gap-3 px-3 py-1"
                                >
                                    <span className="w-7 text-xs text-muted-foreground tabular-nums">
                                        {index + 1}
                                    </span>
                                    <span className="min-w-0 flex-1 font-mono text-sm break-all">
                                        {awb}
                                    </span>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="size-11 shrink-0"
                                        disabled={form.processing}
                                        aria-label={`Keluarkan ${awb} dari daftar`}
                                        onClick={() => {
                                            form.setData(
                                                'awbs',
                                                form.data.awbs.filter(
                                                    (item) => item !== awb,
                                                ),
                                            );
                                            form.clearErrors();
                                            key.current = null;
                                        }}
                                    >
                                        <X aria-hidden="true" />
                                    </Button>
                                </li>
                            ))}
                        </ol>
                    )}
                    {pickup.target !== null && total > pickup.target && (
                        <p role="status" className="text-sm text-destructive">
                            Jumlah scan melebihi target POP sebanyak{' '}
                            {total - pickup.target} resi. Periksa daftar sebelum
                            menyimpan.
                        </p>
                    )}
                    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-card py-3">
                        <span className="text-sm text-muted-foreground">
                            Data tersimpan setelah menekan Simpan.
                        </span>
                        <Button
                            type="submit"
                            className="h-11 w-full sm:w-auto"
                            disabled={form.processing}
                        >
                            {form.processing ? (
                                <LoaderCircle
                                    aria-hidden="true"
                                    className="animate-spin motion-reduce:animate-none"
                                />
                            ) : (
                                <Save aria-hidden="true" />
                            )}
                            {form.processing
                                ? 'Menyimpan…'
                                : 'Simpan Handover Cashless'}
                        </Button>
                    </div>
                </form>
            ) : (
                <div className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
                    <LockKeyhole
                        aria-hidden="true"
                        className="size-5 shrink-0"
                    />
                    <p>
                        Buku belum dimulai, handover sudah ditutup, atau
                        rekonsiliasi sudah terkunci. Pilih buku yang masih dapat
                        dicatat.
                    </p>
                </div>
            )}
            {!!pickup.entry_batches?.length && (
                <Button
                    type="button"
                    variant="outline"
                    className="m-4 h-11"
                    disabled={form.processing || dirty}
                    onClick={() => onPage(pickup.awbs.current_page)}
                >
                    Segarkan status proses
                </Button>
            )}
            <CashlessEntryStatus
                batches={pickup.entry_batches ?? []}
                enabled={pickup.entry_enabled}
            />
            <details className="border-t p-4" open={pickup.awbs.total > 0}>
                <summary className="cursor-pointer text-sm font-medium">
                    Resi tersimpan ({pickup.awbs.total})
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                    {pickup.awbs.data.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Belum ada resi tersimpan.
                        </p>
                    ) : (
                        <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
                            {pickup.awbs.data.map((row) => (
                                <li
                                    key={row.id}
                                    className="flex min-w-0 items-center gap-2 px-3 py-3 text-sm"
                                >
                                    <Check
                                        aria-hidden="true"
                                        className="size-4 shrink-0 text-muted-foreground"
                                    />
                                    <span className="min-w-0 flex-1 font-mono break-all">
                                        {row.awb}
                                    </span>
                                    <time
                                        className="hidden text-xs text-muted-foreground sm:block"
                                        dateTime={row.created_at}
                                    >
                                        {jneTimestamp(row.created_at, timezone)}
                                    </time>
                                </li>
                            ))}
                        </ul>
                    )}
                    {pickup.awbs.last_page > 1 && (
                        <div className="flex items-center justify-between gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                disabled={
                                    pickup.awbs.current_page <= 1 ||
                                    form.processing
                                }
                                onClick={() =>
                                    onPage(pickup.awbs.current_page - 1)
                                }
                            >
                                Sebelumnya
                            </Button>
                            <span className="text-xs text-muted-foreground">
                                {pickup.awbs.current_page} /{' '}
                                {pickup.awbs.last_page}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={
                                    pickup.awbs.current_page >=
                                        pickup.awbs.last_page || form.processing
                                }
                                onClick={() =>
                                    onPage(pickup.awbs.current_page + 1)
                                }
                            >
                                Berikutnya
                            </Button>
                        </div>
                    )}
                </div>
            </details>
        </section>
    );
}

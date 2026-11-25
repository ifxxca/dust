import { useId, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Camera, LoaderCircle, Pencil } from 'lucide-react';
import { prepareCashlessAwb } from '@/lib/cashless-handover';
import type { CashlessCorrection } from '@/types/cashless-handover';

import type { CashlessResult } from '@/types/cashless-handover';
export type { CashlessResult } from '@/types/cashless-handover';
const labels: Record<string, string> = {
    PREVIOUSLY_ENTERED: 'Sudah pernah diproses',
    ORION_REJECTED: 'Ditolak: sudah dientry di Orion',
    NOT_FOUND: 'Resi tidak ditemukan',
    NEEDS_DATA: 'Data perlu dilengkapi',
    INVALID: 'Nomor resi tidak valid',
    UNKNOWN: 'Hasil perlu diperiksa',
    PENDING: 'Belum diproses',
    IN_FLIGHT: 'Menunggu respons',
    CANCELLED: 'Percobaan dibatalkan',
};

type ResultItem = CashlessResult['items']['data'][number];
type CorrectionHandler = (
    item: ResultItem,
    data: CashlessCorrection,
) => Promise<number>;
type CameraHandler = (
    onScan: (raw: string) => Promise<{ awb?: string; error?: string }>,
) => void;

function CorrectableResult({
    item,
    busy,
    onCorrect,
    onOpenBatch,
    onCamera,
}: {
    item: ResultItem;
    busy: boolean;
    onCorrect?: CorrectionHandler;
    onOpenBatch?: (id: number) => void;
    onCamera?: CameraHandler;
}) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [nextId, setNextId] = useState<number | null>(null);
    const inputId = useId();
    const input = useRef<HTMLInputElement>(null);
    const pending = useRef<{ awb: string; key: string } | null>(null);
    const nextBatch = item.replacement_batch_id ?? nextId;
    const validate = (raw: string) => {
        const result = prepareCashlessAwb(raw, [], [item.awb]);
        if (result.awb && result.awb.length > 16)
            return { error: 'Nomor resi cashless maksimal 16 karakter.' };
        return result;
    };
    return (
        <li className="flex min-w-0 flex-col gap-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm break-all">{item.awb}</span>
                <Badge variant="secondary">
                    {labels[item.status] ?? item.status}
                </Badge>
            </div>
            {item.message && (
                <p className="text-sm break-words text-muted-foreground">
                    {item.message}
                </p>
            )}
            {nextBatch ? (
                <div
                    className="flex flex-wrap items-center gap-2"
                    role="status"
                >
                    <span className="text-sm text-muted-foreground">
                        Pengganti tercatat.
                    </span>
                    {onOpenBatch && (
                        <Button
                            variant="outline"
                            className="min-h-11"
                            onClick={() => onOpenBatch(nextBatch)}
                        >
                            Lihat batch #{nextBatch}
                        </Button>
                    )}
                </div>
            ) : (
                item.can_correct &&
                onCorrect && (
                    <>
                        {!editing ? (
                            <Button
                                variant="outline"
                                className="min-h-11 w-fit"
                                disabled={busy}
                                onClick={() => setEditing(true)}
                            >
                                <Pencil aria-hidden="true" />
                                Ganti resi
                            </Button>
                        ) : (
                            <form
                                className="flex min-w-0 flex-col gap-3"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (saving) return;
                                    const result = validate(value);
                                    if (!result.awb || result.error) {
                                        setError(
                                            result.error ??
                                                'Isi resi pengganti.',
                                        );
                                        input.current?.focus();
                                        return;
                                    }
                                    if (pending.current?.awb !== result.awb)
                                        pending.current = {
                                            awb: result.awb,
                                            key: crypto.randomUUID(),
                                        };
                                    setSaving(true);
                                    setError('');
                                    void onCorrect(item, {
                                        awb: result.awb,
                                        submission_key: pending.current.key,
                                        expected_version: item.version!,
                                    })
                                        .then((id) => {
                                            setNextId(id);
                                            setEditing(false);
                                        })
                                        .catch((failure: unknown) => {
                                            setError(
                                                failure instanceof Error
                                                    ? failure.message
                                                    : 'Koreksi belum tersimpan. Coba lagi.',
                                            );
                                            requestAnimationFrame(() =>
                                                input.current?.focus(),
                                            );
                                        })
                                        .finally(() => setSaving(false));
                                }}
                            >
                                <div className="flex flex-col gap-2">
                                    <Label htmlFor={inputId}>
                                        Resi pengganti
                                    </Label>
                                    <Input
                                        ref={input}
                                        id={inputId}
                                        name="awb"
                                        value={value}
                                        maxLength={16}
                                        autoComplete="off"
                                        spellCheck={false}
                                        disabled={saving}
                                        aria-invalid={!!error}
                                        aria-describedby={`${inputId}-help ${inputId}-error`}
                                        onChange={(event) => {
                                            setValue(event.target.value);
                                            setError('');
                                        }}
                                        placeholder="Scan atau ketik resi cashless…"
                                    />
                                    <p
                                        id={`${inputId}-help`}
                                        className="text-sm text-muted-foreground"
                                    >
                                        Hanya pengganti yang diproses. Jumlah
                                        paket pada POP tetap.
                                    </p>
                                    <p
                                        id={`${inputId}-error`}
                                        role="alert"
                                        className="text-sm text-destructive"
                                    >
                                        {error}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {onCamera && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="min-h-11"
                                            disabled={saving}
                                            onClick={() =>
                                                onCamera(async (raw) => {
                                                    const result =
                                                        validate(raw);
                                                    if (result.awb) {
                                                        setValue(result.awb);
                                                        setError('');
                                                    } else
                                                        setError(
                                                            result.error ??
                                                                'Resi tidak valid.',
                                                        );
                                                    return result;
                                                })
                                            }
                                        >
                                            <Camera aria-hidden="true" />
                                            Scan kamera
                                        </Button>
                                    )}
                                    <Button
                                        type="submit"
                                        className="min-h-11"
                                        disabled={saving || busy}
                                    >
                                        {saving && (
                                            <LoaderCircle
                                                className="animate-spin motion-reduce:animate-none"
                                                aria-hidden="true"
                                            />
                                        )}
                                        Simpan & proses pengganti
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="min-h-11"
                                        disabled={saving}
                                        onClick={() => {
                                            setEditing(false);
                                            setValue('');
                                            setError('');
                                        }}
                                    >
                                        Batal
                                    </Button>
                                </div>
                            </form>
                        )}
                    </>
                )
            )}
        </li>
    );
}

export default function CashlessResultView({
    result,
    busy = false,
    onPage,
    onCorrect,
    onOpenBatch,
    onCamera,
}: {
    result: CashlessResult;
    busy?: boolean;
    onPage: (page: number) => void;
    onCorrect?: CorrectionHandler;
    onOpenBatch?: (id: number) => void;
    onCamera?: CameraHandler;
}) {
    return (
        <section
            className="flex flex-col gap-4"
            aria-label="Hasil pemrosesan cashless"
        >
            <div className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold">
                    Hasil Cashless · Batch #{result.id}
                </h1>
                <p className="text-sm break-words">
                    {result.customer} · {result.reference}
                </p>
                <p className="text-sm text-muted-foreground">
                    {result.accepted} dari {result.total} resi berhasil ·{' '}
                    {result.server}
                    {result.ho_number ? ` · ${result.ho_number}` : ''}
                </p>
            </div>
            {result.message && (
                <p
                    role="status"
                    className="rounded-lg border p-3 text-sm break-words"
                >
                    {result.message}
                </p>
            )}
            <h2 className="text-sm font-medium">
                Resi dengan pengecualian ({result.items.total})
            </h2>
            {!result.items.data.length && (
                <p className="text-sm text-muted-foreground">
                    Tidak ada resi dengan pengecualian.
                </p>
            )}
            <ul className="divide-y rounded-lg border">
                {result.items.data.map((item) => (
                    <CorrectableResult
                        key={item.id}
                        item={item}
                        busy={busy}
                        onCorrect={onCorrect}
                        onOpenBatch={onOpenBatch}
                        onCamera={onCamera}
                    />
                ))}
            </ul>
            {result.items.last_page > 1 && (
                <div className="flex items-center justify-between gap-2">
                    <Button
                        variant="outline"
                        disabled={busy || result.items.current_page <= 1}
                        onClick={() => onPage(result.items.current_page - 1)}
                    >
                        Sebelumnya
                    </Button>
                    <span className="text-xs">
                        {result.items.current_page} / {result.items.last_page}
                    </span>
                    <Button
                        variant="outline"
                        disabled={
                            busy ||
                            result.items.current_page >= result.items.last_page
                        }
                        onClick={() => onPage(result.items.current_page + 1)}
                    >
                        Berikutnya
                    </Button>
                </div>
            )}
        </section>
    );
}

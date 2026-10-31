import { useEffect, useRef, useState } from 'react';
import { Barcode, Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    playScanError,
    playScanSuccess,
    primeScanAudio,
} from '@/lib/scan-feedback';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';

export default function CashlessProofInput({
    awbs,
    savedAwbs = [],
    disabled,
    error,
    onAdd,
    onRemove,
    onCamera,
}: {
    awbs: string[];
    savedAwbs?: string[];
    disabled: boolean;
    error?: string;
    onAdd: (raw: string) => Promise<{ awb?: string; error?: string }>;
    onRemove: (awb: string) => void;
    onCamera?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const adding = useRef(false);
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!open) return;
        const back = (event: Event) => {
            event.preventDefault();
            if (busy || value.trim()) {
                setNotice(
                    'Tambahkan resi yang masih diketik atau kosongkan input sebelum menutup.',
                );
                return;
            }
            setOpen(false);
        };
        window.addEventListener('mobile-back', back, true);
        return () => window.removeEventListener('mobile-back', back, true);
    }, [open, busy, value]);
    async function add() {
        if (adding.current || disabled || !value.trim()) return;
        adding.current = true;
        setBusy(true);
        try {
            const result = await onAdd(value);
            if (result.error) playScanError();
            else if (result.awb) playScanSuccess();
            setNotice(result.error ?? `${result.awb} ditambahkan.`);
            if (!result.error) setValue('');
        } catch {
            setNotice(
                'Resi belum tersimpan di draft. Periksa penyimpanan dan coba lagi.',
            );
        } finally {
            adding.current = false;
            setBusy(false);
            input.current?.focus();
        }
    }
    return (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Cashless Hybrid</span>
                <strong
                    className="text-lg tabular-nums"
                    aria-label={`${awbs.length} resi cashless`}
                >
                    {awbs.length}
                </strong>
            </div>
            <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                    primeScanAudio();
                    setOpen(true);
                }}
            >
                <Barcode />
                Scan / catat resi
            </Button>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <Dialog
                open={open}
                onOpenChange={(next) => {
                    if (!next && value.trim()) {
                        setNotice(
                            'Tambahkan resi yang masih diketik atau kosongkan input sebelum menutup.',
                        );
                        return;
                    }
                    if (!busy) setOpen(next);
                }}
            >
                <DialogContent
                    className="mobile-dialog flex max-h-[90dvh] min-w-0 flex-col"
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        input.current?.focus();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Resi Cashless · {awbs.length}</DialogTitle>
                        <DialogDescription>
                            Jumlah dihitung dari resi unik. Diproses di Puman
                            setelah POP disimpan.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex min-w-0 shrink-0 flex-col gap-2">
                        <Label htmlFor="pop-cashless-awb">
                            Scan atau ketik nomor resi cashless
                        </Label>
                        <div className="flex min-w-0 gap-2">
                            <Input
                                ref={input}
                                id="pop-cashless-awb"
                                className="min-w-0 flex-1"
                                value={value}
                                disabled={disabled || busy}
                                autoComplete="off"
                                spellCheck={false}
                                onChange={(event) =>
                                    setValue(event.target.value)
                                }
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        void add();
                                    }
                                }}
                            />
                            <Button
                                type="button"
                                disabled={disabled || busy || !value.trim()}
                                onClick={() => void add()}
                            >
                                Tambah
                            </Button>
                        </div>
                        {onCamera && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={disabled || busy || !!value.trim()}
                                onClick={() => {
                                    setOpen(false);
                                    onCamera();
                                }}
                            >
                                <Camera />
                                Scan dengan kamera
                            </Button>
                        )}
                        {notice && (
                            <p role="status" className="text-sm break-words">
                                {notice}
                            </p>
                        )}
                    </div>
                    <ul
                        className="max-h-72 min-h-0 divide-y overflow-y-auto"
                        aria-label="Daftar resi cashless"
                    >
                        {awbs.map((awb) => (
                            <li
                                key={awb}
                                className="flex items-center justify-between gap-2 py-2"
                            >
                                <span className="min-w-0 font-mono text-sm break-all">
                                    {awb}
                                </span>
                                {!savedAwbs.includes(awb) && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={`Hapus ${awb}`}
                                        disabled={disabled || busy}
                                        onClick={() => onRemove(awb)}
                                    >
                                        <X />
                                    </Button>
                                )}
                            </li>
                        ))}
                    </ul>
                    <Button
                        type="button"
                        disabled={busy || !!value.trim()}
                        onClick={() => setOpen(false)}
                    >
                        Selesai mencatat
                    </Button>
                </DialogContent>
            </Dialog>
        </div>
    );
}

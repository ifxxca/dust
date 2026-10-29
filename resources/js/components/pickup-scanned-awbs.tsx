import { useEffect, useState } from 'react';
import { Barcode, CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { quick } from '@/routes/pickup-results';
import { cashlessScanStatus } from '@/lib/cashless-scan-status';
import type { ScannedCashlessEntry } from '@/types/cashless-handover';

type ScanResult = {
    task: { id: number; reference: string; customer_name_snapshot: string };
    awbs: {
        data: {
            id: number;
            awb: string;
            created_at: string;
            entry: ScannedCashlessEntry | null;
        }[];
        current_page: number;
        last_page: number;
        total: number;
    };
    timezone: string;
};

export default function PickupScannedAwbs({ id }: { id: number }) {
    const [page, setPage] = useState(1);
    const [attempt, setAttempt] = useState(0);
    const [result, setResult] = useState<ScanResult | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    useEffect(() => {
        setPage(1);
        setResult(null);
        setNotice('');
    }, [id]);
    useEffect(() => {
        const controller = new AbortController();
        setResult(null);
        setError('');
        void fetch(
            quick.url(id, { query: { view: 'cashless', awb_page: page } }),
            {
                signal: controller.signal,
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            },
        )
            .then(async (response) => {
                if (!response.ok || response.redirected)
                    throw new Error(
                        'Daftar resi belum dapat dibuka. Periksa akses dan coba lagi.',
                    );
                return response.json() as Promise<ScanResult>;
            })
            .then((data) => {
                if (!controller.signal.aborted) setResult(data);
            })
            .catch((failure: unknown) => {
                if (!controller.signal.aborted)
                    setError(
                        failure instanceof Error
                            ? failure.message
                            : 'Daftar resi belum dapat dibuka.',
                    );
            });
        return () => controller.abort();
    }, [id, page, attempt]);
    return (
        <section
            className="flex min-w-0 flex-col gap-4"
            aria-label="Resi scan cashless"
        >
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                    Resi Cashless yang dipindai
                </h3>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!result && !error}
                    onClick={() => setAttempt((value) => value + 1)}
                >
                    <RefreshCw aria-hidden="true" />
                    Segarkan
                </Button>
            </div>
            {error ? (
                <div role="alert" className="flex flex-col gap-3">
                    <p>{error}</p>
                    <Button
                        variant="outline"
                        onClick={() => setAttempt((value) => value + 1)}
                    >
                        Coba lagi
                    </Button>
                </div>
            ) : !result ? (
                <Skeleton
                    className="h-52 w-full"
                    aria-label="Memuat resi scan"
                />
            ) : (
                <>
                    <div className="flex items-center gap-2 text-sm">
                        <Barcode aria-hidden="true" size={18} />
                        <span>
                            {result.awbs.total.toLocaleString('id-ID')} resi
                            tercatat
                        </span>
                    </div>
                    {result.awbs.data.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            Belum ada resi scan pada pickup ini.
                        </p>
                    ) : (
                        <ol
                            className="flex min-h-0 flex-col divide-y overflow-y-auto"
                            aria-label="Resi hasil scan"
                        >
                            {result.awbs.data.map((item) => {
                                const status = cashlessScanStatus(item.entry);
                                return (
                                    <li
                                        key={item.id}
                                        className="flex min-w-0 items-center gap-3 py-2"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="font-mono text-sm break-all">
                                                {item.awb}
                                            </p>
                                            <div className="my-1 flex flex-wrap items-center gap-2">
                                                <Badge
                                                    variant={status.variant}
                                                    aria-label={`Status ${item.awb}`}
                                                >
                                                    {status.complete && (
                                                        <CheckCircle2 aria-hidden="true" />
                                                    )}
                                                    {status.label}
                                                </Badge>
                                                {item.entry && (
                                                    <span className="text-xs text-muted-foreground">
                                                        Batch #
                                                        {item.entry.batch_id}
                                                        {item.entry.ho_number
                                                            ? ` · ${item.entry.ho_number}`
                                                            : ''}
                                                    </span>
                                                )}
                                            </div>
                                            {status.detail && (
                                                <p className="mb-1 text-xs break-words text-muted-foreground">
                                                    {status.detail}
                                                </p>
                                            )}
                                            <time
                                                className="text-xs text-muted-foreground"
                                                dateTime={item.created_at}
                                            >
                                                {new Intl.DateTimeFormat(
                                                    'id-ID',
                                                    {
                                                        timeZone:
                                                            result.timezone,
                                                        dateStyle: 'medium',
                                                        timeStyle: 'short',
                                                    },
                                                ).format(
                                                    new Date(item.created_at),
                                                )}
                                            </time>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Salin ${item.awb}`}
                                            onClick={() => {
                                                if (!navigator.clipboard) {
                                                    setNotice(
                                                        'Salin belum tersedia di browser ini. Pilih nomor resi untuk menyalin.',
                                                    );
                                                    return;
                                                }
                                                void navigator.clipboard
                                                    .writeText(item.awb)
                                                    .then(() =>
                                                        setNotice(
                                                            `${item.awb} disalin.`,
                                                        ),
                                                    )
                                                    .catch(() =>
                                                        setNotice(
                                                            'Salin belum tersedia di browser ini. Pilih nomor resi untuk menyalin.',
                                                        ),
                                                    );
                                            }}
                                        >
                                            <Copy aria-hidden="true" />
                                        </Button>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                    <p role="status" className="text-xs text-muted-foreground">
                        {notice}
                    </p>
                    {result.awbs.last_page > 1 && (
                        <div className="flex items-center justify-between gap-3">
                            <Button
                                variant="outline"
                                disabled={page === 1}
                                onClick={() => setPage((value) => value - 1)}
                            >
                                Sebelumnya
                            </Button>
                            <span className="text-sm">
                                {page} / {result.awbs.last_page}
                            </span>
                            <Button
                                variant="outline"
                                disabled={page === result.awbs.last_page}
                                onClick={() => setPage((value) => value + 1)}
                            >
                                Berikutnya
                            </Button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

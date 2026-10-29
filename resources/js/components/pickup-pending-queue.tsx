import { useHttp } from '@inertiajs/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { ReconciliationPager } from '@/components/pickup-reconciliation-detail';
import { reconciliationCategories } from '@/lib/pickup-reconciliation';
import type {
    PendingItem,
    ReconciliationPage,
} from '@/types/pickup-reconciliation';
import * as routes from '@/routes/pickup-automation';

export default function PickupPendingQueue({
    count,
    select,
}: {
    count: number;
    select: (id: number) => void;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [error, setError] = useState('');
    const [rows, setRows] = useState<ReconciliationPage<PendingItem> | null>(
        null,
    );
    const request = useHttp<
        Record<string, never>,
        ReconciliationPage<PendingItem>
    >({});
    const load = async (page = 1) => {
        setError('');
        try {
            setRows(
                await request.get(routes.pending.url({ query: { q, page } })),
            );
        } catch {
            setError('Daftar pending belum dapat dimuat. Coba lagi.');
        }
    };
    return (
        <>
            <Button
                variant="outline"
                onClick={() => {
                    setOpen(true);
                    void load();
                }}
            >
                Pending ({count})
            </Button>
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent className="w-full sm:max-w-xl">
                    <SheetHeader>
                        <SheetTitle>Barang pending</SheetTitle>
                        <SheetDescription>
                            Paket dari pickup asal yang belum selesai diproses.
                            Pilih pickup asal untuk konfirmasi dan mengikat resi
                            hasil proses.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6">
                        <form
                            className="flex gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void load();
                            }}
                        >
                            <Input
                                aria-label="Cari barang pending"
                                placeholder="Customer, kode pickup, atau nomor order"
                                value={q}
                                onChange={(event) => setQ(event.target.value)}
                            />
                            <Button
                                variant="outline"
                                disabled={request.processing}
                            >
                                Cari
                            </Button>
                        </form>
                        {error && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {error}
                            </p>
                        )}
                        {request.processing && (
                            <p
                                role="status"
                                className="text-xs text-muted-foreground"
                            >
                                Memuat pending…
                            </p>
                        )}
                        {rows?.data.map((item) => (
                            <article
                                key={item.id}
                                className="flex flex-col gap-2 border-b py-3 text-xs"
                            >
                                <p className="font-medium">
                                    {item.pickup?.customer_name_snapshot} ·{' '}
                                    {item.label}
                                </p>
                                <p className="text-muted-foreground">
                                    {item.pickup?.reference} ·{' '}
                                    {
                                        reconciliationCategories.find(
                                            ([key]) => key === item.category,
                                        )?.[1]
                                    }
                                </p>
                                <p>{item.reason}</p>
                                <div className="flex items-center justify-between gap-2">
                                    <span>
                                        {item.status === 'READY'
                                            ? 'Siap diproses'
                                            : 'Menunggu konfirmasi'}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setOpen(false);
                                            select(item.pickup_task_id);
                                        }}
                                    >
                                        Buka pickup asal
                                    </Button>
                                </div>
                            </article>
                        ))}
                        {rows?.total === 0 && (
                            <p className="text-sm text-muted-foreground">
                                Tidak ada barang pending sesuai pencarian.
                            </p>
                        )}
                        {rows && (
                            <ReconciliationPager
                                page={rows}
                                change={(page) => void load(page)}
                            />
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}

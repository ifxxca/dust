import { Head, router, setLayoutProps } from '@inertiajs/react';
import { Barcode, Check, Search } from 'lucide-react';
import { useState } from 'react';
import PageContainer from '@/components/page-container';
import CashlessHandoverScanner from '@/components/cashless-handover-scanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { jneTimestamp } from '@/lib/jne-monitoring';
import * as routes from '@/routes/cashless-handover';
import type {
    CashlessPage,
    CashlessPickup,
    SelectedCashlessPickup,
} from '@/types/cashless-handover';

export default function CashlessHandover({
    tasks,
    selected,
    filters,
    timezone,
}: {
    tasks: CashlessPage<CashlessPickup>;
    selected: SelectedCashlessPickup | null;
    filters: { q: string; date: string };
    timezone: string;
}) {
    const [q, setQ] = useState(filters.q);
    const [date, setDate] = useState(filters.date);
    const [busy, setBusy] = useState(false);
    const [showBooks, setShowBooks] = useState(!selected);
    setLayoutProps({
        breadcrumbs: [{ title: 'Handover Cashless', href: routes.index() }],
    });
    function visit(query: {
        task?: number;
        page?: number;
        awb_page?: number;
        q?: string;
        date?: string;
    }) {
        router.get(
            routes.index.url(),
            {
                ...filters,
                ...(selected ? { task: selected.id } : {}),
                ...query,
            },
            {
                preserveScroll: true,
                onStart: () => setBusy(true),
                onFinish: () => setBusy(false),
            },
        );
    }
    return (
        <PageContainer className="py-4">
            <Head title="Handover Cashless" />
            <div className="flex items-center gap-3">
                <Barcode aria-hidden="true" className="size-6 text-primary" />
                <h1 className="text-2xl font-semibold">Handover Cashless</h1>
            </div>
            <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                <section
                    className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4"
                    aria-labelledby="choose-pickup"
                >
                    <div className="flex items-center justify-between gap-2">
                        <h2 id="choose-pickup" className="font-semibold">
                            Pilih buku pickup
                        </h2>
                        {selected && (
                            <Button
                                type="button"
                                variant="outline"
                                className="h-11 xl:hidden"
                                aria-expanded={showBooks}
                                aria-controls="cashless-book-options"
                                onClick={() => setShowBooks(!showBooks)}
                            >
                                {showBooks ? 'Tutup daftar' : 'Ganti buku'}
                            </Button>
                        )}
                    </div>
                    <div
                        id="cashless-book-options"
                        className={
                            showBooks
                                ? 'flex flex-col gap-4'
                                : 'hidden flex-col gap-4 xl:flex'
                        }
                    >
                        <form
                            className="flex flex-col gap-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                visit({ q, date, page: 1 });
                            }}
                        >
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="cashless-pickup-search">
                                    Customer atau kode pickup
                                </Label>
                                <Input
                                    id="cashless-pickup-search"
                                    name="q"
                                    maxLength={100}
                                    autoComplete="off"
                                    placeholder="Cari buku pickup…"
                                    value={q}
                                    onChange={(event) =>
                                        setQ(event.target.value)
                                    }
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="cashless-pickup-date">
                                    Tanggal operasional
                                </Label>
                                <Input
                                    id="cashless-pickup-date"
                                    name="date"
                                    type="date"
                                    value={date}
                                    onChange={(event) =>
                                        setDate(event.target.value)
                                    }
                                />
                            </div>
                            <Button
                                type="submit"
                                variant="outline"
                                className="h-11"
                                disabled={busy}
                            >
                                <Search aria-hidden="true" />
                                {busy ? 'Mencari…' : 'Cari buku pickup'}
                            </Button>
                        </form>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                                Buku pickup saya
                            </span>
                            <Badge variant="secondary">{tasks.total}</Badge>
                        </div>
                        <div
                            className="flex max-h-[540px] flex-col gap-2 overflow-y-auto"
                            aria-busy={busy}
                        >
                            {tasks.data.length === 0 ? (
                                <p className="py-7 text-center text-sm text-muted-foreground">
                                    Tidak ada buku pickup sesuai pencarian.
                                </p>
                            ) : (
                                tasks.data.map((task) => (
                                    <button
                                        key={task.id}
                                        type="button"
                                        disabled={busy}
                                        aria-pressed={selected?.id === task.id}
                                        onClick={() =>
                                            visit({
                                                task: task.id,
                                                awb_page: 1,
                                            })
                                        }
                                        className={`flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === task.id ? 'border-primary bg-accent' : 'border-border'}`}
                                    >
                                        <span className="flex w-full min-w-0 items-center justify-between gap-2">
                                            <span className="min-w-0 truncate text-sm font-medium">
                                                {task.customer}
                                            </span>
                                            {selected?.id === task.id && (
                                                <Check
                                                    aria-hidden="true"
                                                    className="size-4 shrink-0 text-primary"
                                                />
                                            )}
                                        </span>
                                        <span className="text-xs break-all text-muted-foreground">
                                            {task.reference}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {jneTimestamp(
                                                task.scheduled_at,
                                                timezone,
                                            )}
                                        </span>
                                        <span className="flex flex-wrap gap-2 text-xs">
                                            <span>
                                                {task.saved_count} resi
                                                tersimpan
                                            </span>
                                            <span>·</span>
                                            <span>
                                                {task.can_record
                                                    ? 'Dapat dicatat'
                                                    : 'Pencatatan ditutup'}
                                            </span>
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                        {tasks.last_page > 1 && (
                            <div className="flex items-center justify-between gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={busy || tasks.current_page <= 1}
                                    onClick={() =>
                                        visit({ page: tasks.current_page - 1 })
                                    }
                                >
                                    Sebelumnya
                                </Button>
                                <span className="text-xs tabular-nums">
                                    {tasks.current_page} / {tasks.last_page}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={
                                        busy ||
                                        tasks.current_page >= tasks.last_page
                                    }
                                    onClick={() =>
                                        visit({ page: tasks.current_page + 1 })
                                    }
                                >
                                    Berikutnya
                                </Button>
                            </div>
                        )}
                    </div>
                </section>
                {selected ? (
                    <CashlessHandoverScanner
                        key={selected.id}
                        pickup={selected}
                        timezone={timezone}
                        onPage={(awb_page) => visit({ awb_page })}
                    />
                ) : (
                    <section className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center">
                        <Barcode
                            aria-hidden="true"
                            className="size-9 text-muted-foreground"
                        />
                        <h2 className="font-semibold">
                            Pilih buku pickup untuk mulai scan
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Daftar menampilkan buku pickup yang ditugaskan
                            kepada Anda.
                        </p>
                    </section>
                )}
            </div>
        </PageContainer>
    );
}

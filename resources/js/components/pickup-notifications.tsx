import { router, useHttp } from '@inertiajs/react';
import { Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import {
    newPickupNotifications,
    notificationKey,
    type PickupNotification,
} from '@/lib/pickup-notifications';
import { operations } from '@/routes';
import { show as cashlessResult } from '@/routes/cashless-results';
import { index, update } from '@/routes/api/pickup-notifications';

type Feed = {
    data: PickupNotification[];
    meta: { unread_count: number; current_page: number; last_page: number };
};

export function PickupNotifications() {
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [feed, setFeed] = useState<Feed | null>(null);
    const [error, setError] = useState('');
    const [stopped, setStopped] = useState(false);
    const seen = useRef<Set<number | string> | null>(null);
    const active = useRef(true);
    const list = useHttp<Record<string, never>, Feed>({});
    const read = useHttp<{
        event_ids?: number[];
        cashless_alert_ids?: number[];
    }>({});
    const target = (item: PickupNotification) =>
        item.type === 'cashless_entry_attention'
            ? cashlessResult.url(item.batch_id!)
            : operations.url({ screen: 'detail', task: item.task_id });

    useEffect(() => {
        active.current = true;
        return () => {
            active.current = false;
            read.cancel();
            toast.dismiss('pickup-activity');
        };
        // Requests must not outlive the authenticated account's header.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (stopped) return;
        let cancelled = false;
        let busy = false;
        const refresh = async () => {
            if (busy || document.visibilityState === 'hidden') return;
            busy = true;
            const timeout = window.setTimeout(() => {
                if (cancelled) return;
                list.cancel();
                setError(
                    'Pembaruan notifikasi melewati batas waktu. Periksa koneksi lalu coba lagi.',
                );
            }, 30_000);
            try {
                const response = await list.get(index.url({ query: { page } }));
                if (cancelled || !response) return;
                setFeed(response);
                setError('');
                if (page === 1) {
                    const added = newPickupNotifications(
                        seen.current,
                        response.data,
                    );
                    seen.current ??= new Set();
                    for (const item of response.data)
                        seen.current.add(notificationKey(item));
                    if (added.length > 0) {
                        const newest = added[0];
                        toast.info(
                            added.length === 1
                                ? newest.title
                                : `${added.length} aktivitas pickup baru`,
                            {
                                id: 'pickup-activity',
                                description: `${newest.staff_name ?? 'Petugas'} · ${newest.customer_name} · ${newest.reference}`,
                                action: {
                                    label: 'Lihat detail',
                                    onClick: () => router.visit(target(newest)),
                                },
                            },
                        );
                    }
                }
            } catch (failure: unknown) {
                if (cancelled) return;
                const status = (failure as { response?: { status?: number } })
                    ?.response?.status;
                if ([401, 403, 419].includes(status ?? 0)) {
                    toast.dismiss('pickup-activity');
                    setFeed(null);
                    setStopped(true);
                    setError(
                        'Sesi atau akses berubah. Muat ulang halaman dan login kembali.',
                    );
                } else {
                    setError(
                        'Notifikasi belum dapat diperbarui. Periksa koneksi lalu coba lagi.',
                    );
                }
            } finally {
                window.clearTimeout(timeout);
                busy = false;
            }
        };
        void refresh();
        const timer = window.setInterval(() => void refresh(), 10_000);
        document.addEventListener('visibilitychange', refresh);
        window.addEventListener('online', refresh);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', refresh);
            window.removeEventListener('online', refresh);
            list.cancel();
        };
        // Page/revision owns this request; visibility recovery shares its in-flight guard.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, revision, stopped]);

    const markRead = async (items: PickupNotification[]) => {
        const unread = items.filter((item) => !item.read);
        const eventIds = unread
            .filter((item) => item.type === 'pickup_finalized')
            .map((item) => item.id);
        const cashlessIds = unread
            .filter((item) => item.type === 'cashless_entry_attention')
            .map((item) => item.id);
        if (unread.length === 0) return;
        read.transform(() => ({
            ...(eventIds.length ? { event_ids: eventIds } : {}),
            ...(cashlessIds.length ? { cashless_alert_ids: cashlessIds } : {}),
        }));
        try {
            await read.patch(update.url());
            if (active.current) setRevision((value) => value + 1);
        } catch {
            if (active.current)
                toast.error(
                    'Status dibaca belum tersimpan. Silakan coba lagi.',
                );
        }
    };
    const unread = feed?.meta.unread_count ?? 0;
    return (
        <Sheet
            open={open}
            onOpenChange={(value) => {
                setOpen(value);
                if (value) setRevision((current) => current + 1);
            }}
        >
            <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    aria-label={`Notifikasi pickup${unread > 0 ? `, ${unread} belum dibaca` : ''}${error ? ', pembaruan terganggu' : ''}`}
                >
                    <Bell className="size-5" />
                    {(unread > 0 || error) && (
                        <span
                            className="absolute -top-1 -right-1 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
                            aria-hidden="true"
                        >
                            {error ? '!' : unread > 99 ? '99+' : unread}
                        </span>
                    )}
                </Button>
            </SheetTrigger>
            <SheetContent className="flex w-full flex-col sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>Notifikasi operasional</SheetTitle>
                    <SheetDescription>
                        Aktivitas pickup dan masalah pemrosesan cashless.
                    </SheetDescription>
                </SheetHeader>
                <div className="flex items-center justify-between gap-2 border-y px-4 py-2">
                    <span
                        className="text-sm text-muted-foreground"
                        aria-live="polite"
                    >
                        {unread} belum dibaca
                    </span>
                    <Button
                        size="sm"
                        variant="ghost"
                        disabled={list.processing || stopped}
                        onClick={() => setRevision((value) => value + 1)}
                        aria-label="Perbarui notifikasi"
                    >
                        <RefreshCw className="size-4" />
                    </Button>
                </div>
                {error && (
                    <p role="alert" className="px-4 text-sm text-destructive">
                        {error}
                    </p>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto px-4">
                    {!feed && !error && (
                        <p className="py-6 text-sm text-muted-foreground">
                            Memuat aktivitas pickup…
                        </p>
                    )}
                    {feed?.data.length === 0 && !error && (
                        <p className="py-6 text-sm text-muted-foreground">
                            Belum ada aktivitas pickup.
                        </p>
                    )}
                    {feed?.data.map((item) => (
                        <button
                            key={notificationKey(item)}
                            type="button"
                            disabled={read.processing || stopped}
                            className={`mb-2 w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${!item.read ? 'border-primary/30 bg-primary/5' : ''}`}
                            onClick={async () => {
                                await markRead([item]);
                                if (!active.current) return;
                                setOpen(false);
                                router.visit(target(item));
                            }}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold">
                                    {item.title}
                                </span>
                                {!item.read && (
                                    <span
                                        className="size-2 shrink-0 rounded-full bg-primary"
                                        aria-label="Belum dibaca"
                                    />
                                )}
                            </div>
                            <p className="mt-1 text-sm">{item.customer_name}</p>
                            {item.message && (
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {item.message}
                                </p>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">
                                {item.staff_name ?? 'Petugas'} ·{' '}
                                {item.reference}
                            </p>
                            <time
                                className="mt-1 block text-xs text-muted-foreground"
                                dateTime={item.occurred_at}
                            >
                                {new Date(item.occurred_at).toLocaleString(
                                    'id-ID',
                                )}
                            </time>
                        </button>
                    ))}
                </div>
                {feed && (
                    <div className="space-y-2 border-t p-4">
                        <Button
                            variant="outline"
                            className="w-full"
                            disabled={
                                read.processing ||
                                stopped ||
                                !feed.data.some((item) => !item.read)
                            }
                            onClick={() => void markRead(feed.data)}
                        >
                            <CheckCheck className="size-4" />
                            Tandai halaman ini dibaca
                        </Button>
                        <div className="flex items-center justify-between gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={page <= 1 || list.processing}
                                onClick={() => setPage((value) => value - 1)}
                            >
                                Sebelumnya
                            </Button>
                            <span className="text-xs text-muted-foreground">
                                {page} / {feed.meta.last_page}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={
                                    page >= feed.meta.last_page ||
                                    list.processing
                                }
                                onClick={() => setPage((value) => value + 1)}
                            >
                                Berikutnya
                            </Button>
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

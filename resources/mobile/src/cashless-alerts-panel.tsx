import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Bell,
    Check,
    ChevronRight,
    CircleAlert,
    RefreshCw,
} from 'lucide-react';
import type { PickupNotification } from '@/lib/pickup-notifications';
import { index, update } from '@/routes/mobile/notifications';
import { request, userFacingError } from './api';
import type { AssignmentLink } from './push';
import type { Session } from './types';

type Feed = {
    data: PickupNotification[];
    meta: { last_page: number; unread_count: number };
};

export default function CashlessAlertsPanel({
    session,
    online,
    onOpen,
}: {
    session: Session;
    online: boolean;
    onOpen: (link: AssignmentLink) => void;
}) {
    const [feed, setFeed] = useState<Feed | null>(null);
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [unreadOnly, setUnreadOnly] = useState(true);
    const [reading, setReading] = useState<number | null>(null);
    const actions = useRef(new AbortController());
    useEffect(() => {
        actions.current = new AbortController();
        return () => actions.current.abort();
    }, [session.token]);
    useEffect(() => {
        const controller = new AbortController();
        if (!online) return;
        setBusy(true);
        void request<Feed>(
            index({ query: { page, unread_only: unreadOnly ? 1 : 0 } }),
            session,
            controller.signal,
        )
            .then((data) => {
                if (!controller.signal.aborted) {
                    setFeed(data);
                    setError('');
                }
            })
            .catch((failure) => {
                if (!controller.signal.aborted)
                    setError(userFacingError(failure));
            })
            .finally(() => {
                if (!controller.signal.aborted) setBusy(false);
            });
        return () => controller.abort();
    }, [session.token, page, revision, online, unreadOnly]);

    async function markRead(item: PickupNotification) {
        if (reading !== null) return;
        setReading(item.id);
        try {
            await request(update(), session, actions.current.signal, {
                cashless_alert_ids: [item.id],
            });
            if (actions.current.signal.aborted) return;
            setFeed(
                (previous) =>
                    previous && {
                        ...previous,
                        data: previous.data.map((entry) =>
                            entry.id === item.id
                                ? { ...entry, read: true }
                                : entry,
                        ),
                        meta: {
                            ...previous.meta,
                            unread_count: Math.max(
                                0,
                                previous.meta.unread_count - 1,
                            ),
                        },
                    },
            );
            setError('');
            setRevision((value) => value + 1);
        } catch (failure) {
            if (!actions.current.signal.aborted)
                setError(userFacingError(failure));
        } finally {
            if (!actions.current.signal.aborted) setReading(null);
        }
    }

    return (
        <section
            className="flex flex-col gap-3"
            aria-label="Notifikasi cashless"
        >
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-medium">Pemrosesan cashless</h3>
                    <p
                        className="text-xs text-muted-foreground"
                        aria-live="polite"
                    >
                        {feed
                            ? `${feed.meta.unread_count} belum dibaca`
                            : 'Memuat notifikasi…'}
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || !online}
                    onClick={() => setRevision((value) => value + 1)}
                >
                    <RefreshCw aria-hidden="true" />
                    Segarkan
                </Button>
            </div>
            <div className="flex gap-2" aria-label="Filter notifikasi">
                {[true, false].map((value) => (
                    <Button
                        key={String(value)}
                        variant={unreadOnly === value ? 'secondary' : 'ghost'}
                        size="sm"
                        aria-pressed={unreadOnly === value}
                        onClick={() => {
                            setUnreadOnly(value);
                            setPage(1);
                            setFeed(null);
                        }}
                    >
                        {value ? 'Belum dibaca' : 'Semua'}
                    </Button>
                ))}
            </div>
            {!online && (
                <p role="status" className="text-sm text-muted-foreground">
                    Hubungkan internet untuk melihat notifikasi tersimpan.
                </p>
            )}
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            {busy && !feed && (
                <div role="status" aria-label="Memuat notifikasi">
                    <Skeleton className="h-20 w-full" />
                </div>
            )}
            {feed?.data.length === 0 && (
                <div className="notification-empty" role="status">
                    <Bell size={24} aria-hidden="true" />
                    <p>
                        {unreadOnly
                            ? 'Semua notifikasi sudah dibaca'
                            : 'Belum ada notifikasi cashless'}
                    </p>
                </div>
            )}
            <ul
                className="flex flex-col gap-3"
                aria-label="Daftar notifikasi cashless"
            >
                {feed?.data
                    .filter((item) => !unreadOnly || !item.read)
                    .map((item) => (
                        <li
                            key={item.id}
                            className="notification-card"
                            data-unread={!item.read}
                        >
                            <button
                                type="button"
                                className="notification-open"
                                onClick={() => {
                                    if (!item.batch_id) return;
                                    onOpen({
                                        taskId: item.task_id,
                                        batchId: item.batch_id,
                                        recipientId: session.user.id,
                                        eventId: item.id,
                                    });
                                }}
                            >
                                <CircleAlert
                                    className="notification-icon"
                                    size={20}
                                    aria-hidden="true"
                                />
                                <span className="notification-content">
                                    <span className="notification-title">
                                        {item.title}
                                        {!item.read && (
                                            <span
                                                className="notification-dot"
                                                aria-label="Belum dibaca"
                                            />
                                        )}
                                    </span>
                                    <span className="notification-customer">
                                        {item.customer_name}
                                    </span>
                                    <span className="notification-message">
                                        {item.message}
                                    </span>
                                    <time
                                        className="notification-time"
                                        dateTime={item.occurred_at}
                                    >
                                        {new Intl.DateTimeFormat('id-ID', {
                                            timeZone: session.timezone,
                                            day: 'numeric',
                                            month: 'short',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        }).format(
                                            new Date(item.occurred_at),
                                        )}{' '}
                                        · PCK-{item.task_id} · Batch #
                                        {item.batch_id}
                                    </time>
                                    <span className="notification-link">
                                        Lihat detail{' '}
                                        <ChevronRight
                                            size={16}
                                            aria-hidden="true"
                                        />
                                    </span>
                                </span>
                            </button>
                            {!item.read && (
                                <div className="notification-actions">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={!online || reading !== null}
                                        onClick={() => void markRead(item)}
                                    >
                                        <Check aria-hidden="true" />
                                        {reading === item.id
                                            ? 'Menyimpan…'
                                            : 'Tandai dibaca'}
                                    </Button>
                                </div>
                            )}
                        </li>
                    ))}
            </ul>
            {feed && feed.meta.last_page > 1 && (
                <div className="flex items-center justify-between gap-2">
                    <Button
                        variant="outline"
                        disabled={busy || !online || page === 1}
                        onClick={() => setPage((value) => value - 1)}
                    >
                        Sebelumnya
                    </Button>
                    <span className="text-xs">
                        {page} / {feed.meta.last_page}
                    </span>
                    <Button
                        variant="outline"
                        disabled={
                            busy || !online || page >= feed.meta.last_page
                        }
                        onClick={() => setPage((value) => value + 1)}
                    >
                        Berikutnya
                    </Button>
                </div>
            )}
        </section>
    );
}

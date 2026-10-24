import { useEffect, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { quick } from '@/routes/pickup-results';

class QuickDetailError extends Error {}
export function useQuickPickupDetail<T extends { result: { id: number } }>(
    id: number | null,
    view: 'pickup' | 'processing',
) {
    const [attempt, setAttempt] = useState(0);
    const [loaded, setLoaded] = useState<{
        id: number;
        data?: T;
        error?: string;
    } | null>(null);
    useEffect(() => {
        if (id === null) return;
        const controller = new AbortController();
        const load = async () => {
            try {
                const response = await fetch(
                    quick.url(id, { query: { view } }),
                    {
                        signal: controller.signal,
                        credentials: 'same-origin',
                        cache: 'no-store',
                        headers: { Accept: 'application/json' },
                    },
                );
                if (!response.ok)
                    throw new QuickDetailError(
                        response.status === 401 || response.status === 403
                            ? 'Akses ditolak atau sesi berakhir. Muat ulang halaman untuk masuk kembali.'
                            : response.status === 404
                              ? 'Pickup tidak ditemukan atau tidak dapat diakses.'
                              : 'Detail belum dapat dimuat. Coba kembali.',
                    );
                const data: T = await response.json();
                if (data.result?.id !== id)
                    throw new QuickDetailError(
                        'Respons detail tidak tersedia. Muat ulang halaman.',
                    );
                if (!controller.signal.aborted) setLoaded({ id, data });
            } catch (error) {
                if (!controller.signal.aborted)
                    setLoaded({
                        id,
                        error:
                            error instanceof QuickDetailError
                                ? error.message
                                : 'Koneksi terputus. Periksa jaringan lalu coba kembali.',
                    });
            }
        };
        void load();
        return () => controller.abort();
    }, [id, view, attempt]);
    return {
        data: loaded?.id === id ? loaded.data : undefined,
        error: loaded?.id === id ? loaded.error : undefined,
        retry: () => {
            setLoaded(null);
            setAttempt((value) => value + 1);
        },
    };
}
export function MonitoringDrawerState({
    error,
    retry,
}: {
    error?: string;
    retry: () => void;
}) {
    return error ? (
        <div
            role="alert"
            className="space-y-3 rounded-lg border bg-muted/30 p-4"
        >
            <p className="text-sm">{error}</p>
            <Button size="sm" variant="outline" onClick={retry}>
                Coba lagi
            </Button>
        </div>
    ) : (
        <div role="status" className="space-y-3 py-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Memuat detail pickup…
            </p>
            {[1, 2, 3].map((key) => (
                <div
                    key={key}
                    className="h-16 animate-pulse rounded-md bg-muted"
                />
            ))}
        </div>
    );
}
export function MonitoringDetailSheet({
    open,
    close,
    origin,
    searchId,
    children,
}: {
    open: boolean;
    close: () => void;
    origin: RefObject<HTMLElement | null>;
    searchId: string;
    children: ReactNode;
}) {
    return (
        <Sheet
            open={open}
            onOpenChange={(value) => {
                if (!value) close();
            }}
        >
            <SheetContent
                overlayClassName="bg-black/25"
                className="w-full gap-0 data-[state=closed]:duration-150 data-[state=open]:duration-150 sm:max-w-[540px]"
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    const element = origin.current?.isConnected
                        ? origin.current
                        : document.getElementById(searchId);
                    element?.focus({ preventScroll: true });
                }}
            >
                {children}
            </SheetContent>
        </Sheet>
    );
}

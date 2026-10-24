import { Link } from '@inertiajs/react';
import {
    CalendarClock,
    ChevronDown,
    CircleAlert,
    Clock3,
    History,
    LoaderCircle,
    RefreshCw,
    Settings2,
    ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { jneTimestamp } from '@/lib/jne-monitoring';
import * as monitoring from '@/routes/jne-monitoring';
import * as runs from '@/routes/report-runs';

export type TrackingRefresh = {
    active_count: number;
    profile: {
        id: number;
        enabled: boolean;
        interval_minutes: number;
        lookback_days: number;
        next_run_at: string | null;
        last_run_at: string | null;
        last_error: string | null;
    } | null;
};

export default function JneTrackingRefreshCard({
    data,
    timezone,
    processing,
    error,
    onRefresh,
}: {
    data: TrackingRefresh;
    timezone: string;
    processing: boolean;
    error?: string;
    onRefresh: () => void;
}) {
    const profile = data.profile;
    return (
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                    <div className="flex items-center gap-4">
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <RefreshCw aria-hidden="true" className="size-6" />
                        </span>
                        <div>
                            <h2 className="text-sm font-semibold">
                                Pembaruan resi aktif
                            </h2>
                            <p className="mt-1 flex items-baseline gap-2">
                                <span className="text-3xl font-semibold tracking-tight tabular-nums">
                                    {data.active_count.toLocaleString('id-ID')}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                    resi belum delivered/cancel
                                </span>
                            </p>
                        </div>
                    </div>
                    <dl className="grid grid-cols-3 gap-3 sm:flex sm:flex-wrap sm:gap-x-8">
                        <div>
                            <dt className="mb-2 text-xs text-muted-foreground">
                                Jadwal otomatis
                            </dt>
                            <dd>
                                <Badge
                                    variant={
                                        profile?.enabled
                                            ? 'secondary'
                                            : 'outline'
                                    }
                                >
                                    {profile?.enabled
                                        ? 'Aktif'
                                        : profile
                                          ? 'Nonaktif'
                                          : 'Belum diatur'}
                                </Badge>
                            </dd>
                        </div>
                        <div>
                            <dt className="mb-2 text-xs text-muted-foreground">
                                Interval
                            </dt>
                            <dd className="flex items-center gap-1.5 text-sm font-medium">
                                <Clock3
                                    aria-hidden="true"
                                    className="size-4 text-muted-foreground"
                                />
                                {profile
                                    ? `${profile.interval_minutes} menit`
                                    : '—'}
                            </dd>
                        </div>
                        <div>
                            <dt className="mb-2 text-xs text-muted-foreground">
                                Berikutnya
                            </dt>
                            <dd className="flex items-center gap-1.5 text-sm font-medium">
                                <CalendarClock
                                    aria-hidden="true"
                                    className="size-4 shrink-0 text-muted-foreground"
                                />
                                {profile?.enabled && profile.next_run_at
                                    ? jneTimestamp(
                                          profile.next_run_at,
                                          timezone,
                                      )
                                    : profile
                                      ? 'Saat diminta'
                                      : 'Atur jadwal dahulu'}
                            </dd>
                        </div>
                    </dl>
                    {profile ? (
                        <Button
                            className="min-h-11 shrink-0"
                            disabled={processing}
                            onClick={onRefresh}
                        >
                            {processing ? (
                                <LoaderCircle
                                    aria-hidden="true"
                                    data-icon="inline-start"
                                    className="animate-spin motion-reduce:animate-none"
                                />
                            ) : (
                                <RefreshCw
                                    aria-hidden="true"
                                    data-icon="inline-start"
                                />
                            )}
                            {processing
                                ? 'Mengantrekan…'
                                : 'Perbarui resi aktif sekarang'}
                        </Button>
                    ) : (
                        <Button className="min-h-11 shrink-0" asChild>
                            <Link href={monitoring.profiles.url()}>
                                <Settings2
                                    aria-hidden="true"
                                    data-icon="inline-start"
                                />
                                Atur jadwal pembaruan
                            </Link>
                        </Button>
                    )}
                </div>
                {(profile?.last_error || error) && (
                    <p
                        role="alert"
                        className="mt-4 flex items-start gap-2 text-sm text-destructive"
                    >
                        <CircleAlert
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0"
                        />
                        {error || profile?.last_error}
                    </p>
                )}
            </CardContent>
            <Collapsible className="group border-t bg-muted/20">
                <div className="flex flex-wrap items-center justify-between gap-x-3 px-4 sm:px-5">
                    <CollapsibleTrigger className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <ShieldCheck
                            aria-hidden="true"
                            className="size-4 text-muted-foreground"
                        />
                        {profile
                            ? `Entry ${profile.lookback_days} hari terakhir`
                            : 'Cakupan pembaruan'}
                        <ChevronDown
                            aria-hidden="true"
                            className="size-3 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                        />
                    </CollapsibleTrigger>
                    <div className="flex flex-wrap gap-1">
                        <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-11 min-w-11"
                            asChild
                        >
                            <Link href={monitoring.profiles.url()}>
                                <Settings2
                                    aria-hidden="true"
                                    data-icon="inline-start"
                                />
                                <span className="sr-only sm:not-sr-only">
                                    Aturan & jadwal penarikan
                                </span>
                            </Link>
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-11 min-w-11"
                            asChild
                        >
                            <Link href={runs.index.url()}>
                                <History
                                    aria-hidden="true"
                                    data-icon="inline-start"
                                />
                                <span className="sr-only sm:not-sr-only">
                                    Lihat proses penarikan
                                </span>
                            </Link>
                        </Button>
                    </div>
                </div>
                <CollapsibleContent className="px-4 pb-4 text-sm leading-6 text-muted-foreground sm:px-5">
                    Resi dari report customer dan Hybrid dikirim sebagai satu
                    daftar AWB ke APEX.{' '}
                    {profile
                        ? `Batas usia entry ${profile.lookback_days} hari; `
                        : ''}
                    resi tanpa tanggal entry tetap ikut. Delivered/cancel
                    berhenti diperbarui dan tetap tersimpan di monitoring.
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}

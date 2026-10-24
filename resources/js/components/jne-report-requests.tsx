import { Link } from '@inertiajs/react';
import {
    ChevronDown,
    CircleAlert,
    Download,
    FileDown,
    Inbox,
    Layers3,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { reportStage } from '@/lib/jne-report-flow';
import { jneTimestamp } from '@/lib/jne-monitoring';
import * as reports from '@/routes/jne-reports';

export type ReportJobView = {
    id: number;
    customer_account: string;
    date_from: string;
    date_thru: string;
    status: string;
    import_status: string;
    projection_status: string;
    started_at: string | null;
    completed_at: string | null;
    imported_awb_count: number;
    error_message: string | null;
    import_error: string | null;
    projection_error: string | null;
    lease_expired: boolean;
};
export type RequestGroupView = {
    created_at: string;
    id: number;
    customer_account: string;
    date_from: string;
    date_thru: string;
    job_ids: number[];
    ready_count: number;
    stored_count: number;
    issue_count: number;
    total: number;
};
export const reportDate = (value: string) =>
    new Intl.DateTimeFormat('id-ID', {
        timeZone: 'UTC',
        dateStyle: 'medium',
    }).format(new Date(`${value}T00:00:00Z`));

export default function JneReportRequests({
    jobs,
    requests,
    timezone,
}: {
    jobs: ReportJobView[];
    requests: {
        data: RequestGroupView[];
        current_page: number;
        last_page: number;
        total: number;
    };
    timezone: string;
}) {
    return (
        <section aria-labelledby="request-history-title" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2
                    id="request-history-title"
                    className="text-base font-semibold"
                >
                    Riwayat permintaan
                </h2>
                <span className="text-xs text-muted-foreground">
                    {requests.total.toLocaleString('id-ID')} permintaan ·
                    pembaruan 5 detik
                </span>
            </div>
            {requests.data.length === 0 && (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-4 py-10 text-center">
                    <Inbox
                        aria-hidden="true"
                        className="size-8 text-muted-foreground"
                    />
                    <p className="font-medium">
                        Belum ada permintaan report JNE.
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Isi account dan tanggal untuk memulai penarikan.
                    </p>
                </div>
            )}
            {requests.data.map((request) => (
                <Collapsible
                    key={request.id}
                    defaultOpen={
                        request.issue_count > 0 ||
                        request.ready_count < request.total
                    }
                    className="group overflow-hidden rounded-xl border bg-card"
                >
                    <div className="space-y-4 p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                                    <FileDown
                                        aria-hidden="true"
                                        className="size-5 text-muted-foreground"
                                    />
                                </span>
                                <div>
                                    <h3 className="font-semibold break-all">
                                        {request.customer_account}
                                    </h3>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {reportDate(request.date_from)} –{' '}
                                        {reportDate(request.date_thru)}
                                    </p>
                                </div>
                            </div>
                            <Badge
                                variant={
                                    request.issue_count
                                        ? 'destructive'
                                        : 'outline'
                                }
                            >
                                {request.issue_count
                                    ? `${request.issue_count} report perlu tindakan`
                                    : request.ready_count === request.total
                                      ? 'Siap dimonitor'
                                      : 'Sedang diproses'}
                            </Badge>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                            <div className="space-y-2">
                                <div className="flex flex-wrap justify-between gap-2 text-xs">
                                    <span className="font-medium">
                                        {request.ready_count}/{request.total}{' '}
                                        report siap dimonitor
                                    </span>
                                    <span className="text-muted-foreground">
                                        {request.stored_count}/{request.total}{' '}
                                        CSV tersimpan
                                    </span>
                                </div>
                                <div
                                    role="progressbar"
                                    aria-label={`Report siap dimonitor untuk permintaan ${request.id}`}
                                    aria-valuemin={0}
                                    aria-valuemax={request.total}
                                    aria-valuenow={request.ready_count}
                                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                                >
                                    <div
                                        className="h-full rounded-full bg-primary"
                                        style={{
                                            width: `${request.total ? (request.ready_count / request.total) * 100 : 0}%`,
                                        }}
                                    />
                                </div>
                            </div>
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" className="min-h-11">
                                    <Layers3
                                        aria-hidden="true"
                                        data-icon="inline-start"
                                    />
                                    {request.total} bagian report
                                    <ChevronDown
                                        aria-hidden="true"
                                        data-icon="inline-end"
                                        className="transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                                    />
                                </Button>
                            </CollapsibleTrigger>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Diminta {jneTimestamp(request.created_at, timezone)}
                        </p>
                    </div>
                    <CollapsibleContent className="border-t">
                        {request.job_ids
                            .map((id) => jobs.find((job) => job.id === id))
                            .filter((job): job is ReportJobView => !!job)
                            .sort((a, b) =>
                                a.date_from.localeCompare(b.date_from),
                            )
                            .map((job) => {
                                const stage = reportStage(job);
                                return (
                                    <article
                                        key={job.id}
                                        aria-label={`Report #${job.id}`}
                                        className="grid gap-4 border-b p-4 last:border-b-0 sm:grid-cols-[1fr_1fr_auto] sm:items-start sm:p-5"
                                    >
                                        <div>
                                            <Link
                                                className="text-sm font-semibold underline-offset-4 hover:underline"
                                                href={reports.awbs.url(job.id)}
                                            >
                                                Report #{job.id}
                                            </Link>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {reportDate(job.date_from)} –{' '}
                                                {reportDate(job.date_thru)}
                                            </p>
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                Mulai:{' '}
                                                {jneTimestamp(
                                                    job.started_at,
                                                    timezone,
                                                )}
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <Badge
                                                variant={
                                                    stage.issue
                                                        ? 'destructive'
                                                        : 'outline'
                                                }
                                                className="max-w-full whitespace-normal"
                                            >
                                                {stage.issue && (
                                                    <CircleAlert aria-hidden="true" />
                                                )}
                                                {stage.label}
                                            </Badge>
                                            {job.import_status ===
                                                'IMPORTED' && (
                                                <p className="text-xs text-muted-foreground">
                                                    {job.imported_awb_count.toLocaleString(
                                                        'id-ID',
                                                    )}{' '}
                                                    AWB diimpor
                                                </p>
                                            )}
                                            <p className="text-xs text-muted-foreground">
                                                CSV:{' '}
                                                {jneTimestamp(
                                                    job.completed_at,
                                                    timezone,
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="min-h-11"
                                                asChild
                                            >
                                                <Link
                                                    href={reports.awbs.url(
                                                        job.id,
                                                    )}
                                                >
                                                    {stage.issue
                                                        ? 'Periksa & pulihkan'
                                                        : 'Lihat detail'}
                                                </Link>
                                            </Button>
                                            {job.status === 'COMPLETED' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="min-h-11"
                                                    asChild
                                                >
                                                    <a
                                                        href={reports.download.url(
                                                            job.id,
                                                        )}
                                                    >
                                                        <Download
                                                            aria-hidden="true"
                                                            data-icon="inline-start"
                                                        />
                                                        Unduh CSV
                                                    </a>
                                                </Button>
                                            )}
                                        </div>
                                        {(job.error_message ||
                                            job.import_error ||
                                            job.projection_error) && (
                                            <p className="text-sm break-words text-destructive sm:col-span-3">
                                                {job.error_message ||
                                                    job.import_error ||
                                                    job.projection_error}
                                            </p>
                                        )}
                                    </article>
                                );
                            })}
                    </CollapsibleContent>
                </Collapsible>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                    Halaman {requests.current_page} dari {requests.last_page}
                </p>
                <div className="flex gap-2">
                    {[-1, 1].map((offset) => {
                        const target = requests.current_page + offset;
                        const label =
                            offset === -1 ? 'Sebelumnya' : 'Berikutnya';
                        const disabled =
                            target < 1 || target > requests.last_page;
                        return (
                            <Button
                                key={offset}
                                size="sm"
                                variant="outline"
                                className="min-h-11"
                                disabled={disabled}
                                asChild={!disabled}
                            >
                                {disabled ? (
                                    label
                                ) : (
                                    <Link
                                        href={reports.index.url({
                                            query: { page: target },
                                        })}
                                    >
                                        {label}
                                    </Link>
                                )}
                            </Button>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

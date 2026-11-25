import {
    Check,
    CircleAlert,
    CircleCheck,
    Clock3,
    Download,
    LoaderCircle,
    Minus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { JneRun } from '@/components/jne-run-list';
import { Button } from '@/components/ui/button';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { jneTimestamp } from '@/lib/jne-monitoring';
import { reportLabel, sourceLabel, runStatusLabel } from '@/lib/scraping';

type State = {
    status: string;
    report_type?: string;
    workflow_stage?: string;
    reviewed_at?: string | null;
    sources?: { status: string; cycle_attempt?: number }[];
};

function waitingForSources(run: State): boolean {
    return (
        run.status === 'COLLECTING_SOURCES' &&
        !!run.sources?.length &&
        run.sources.every((source) => source.status === 'QUEUED')
    );
}

export function JneRunState({ run }: { run: State }) {
    const recovering =
        run.status === 'COLLECTING_SOURCES' &&
        run.sources?.some(
            (source) =>
                source.status === 'RETRY_WAIT' ||
                (['RUNNING', 'WAITING_REPORT', 'DOWNLOADING'].includes(
                    source.status,
                ) &&
                    (source.cycle_attempt ?? 0) > 1),
        );
    const attention =
        run.workflow_stage === 'ATTENTION' ||
        ['FAILED', 'NEEDS_ATTENTION'].includes(run.status);
    const ready = run.workflow_stage === 'READY';
    const label = attention
        ? run.reviewed_at
            ? 'Kegagalan ditinjau'
            : 'Perlu diperiksa'
        : ready
          ? 'Siap dimonitor'
          : recovering
            ? 'Pemulihan otomatis'
            : waitingForSources(run)
              ? 'Menunggu giliran'
              : run.status === 'COMPLETED'
                ? run.workflow_stage === 'PROCESSING'
                    ? 'Memproses CSV APEX'
                    : 'CSV tersimpan'
                : runStatusLabel(run.status, run.report_type);
    const Icon = attention
        ? CircleAlert
        : ready
          ? CircleCheck
          : run.status === 'QUEUED' || waitingForSources(run)
            ? Clock3
            : run.status === 'NO_DATA'
              ? Minus
              : run.status === 'COMPLETED' || run.status === 'DOWNLOADING'
                ? Download
                : LoaderCircle;
    return (
        <Badge
            variant="outline"
            className={`max-w-full text-left whitespace-normal ${attention ? 'border-destructive/30 bg-destructive/5 text-destructive' : ready ? 'border-emerald-600/20 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : ''}`}
        >
            <Icon aria-hidden="true" />
            {label}
        </Badge>
    );
}

export function JneHybridSources({
    sources,
    timezone,
}: {
    sources: JneRun['sources'];
    timezone: string;
}) {
    return (
        <section
            aria-label="Report sumber Hybrid"
            className="flex min-w-0 flex-col gap-3"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">
                    Report sumber ({sources.length})
                </h3>
                <span className="text-xs text-muted-foreground">
                    {
                        sources.filter(
                            (source) => source.status === 'SOURCE_SAVED',
                        ).length
                    }{' '}
                    tersimpan
                </span>
            </div>
            <ul className="divide-y rounded-lg border">
                {sources.map((source) => (
                    <li
                        key={source.id}
                        className="flex min-w-0 flex-col gap-2 p-3 text-sm"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium">
                                {sourceLabel(source.source)} ·{' '}
                                {reportLabel(source.report_type)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                Percobaan{' '}
                                {source.cycle_attempt ??
                                    source.attempt_count ??
                                    0}
                                /{source.max_attempts ?? 2}
                            </span>
                        </div>
                        <p>
                            {source.status === 'RETRY_WAIT'
                                ? 'Pemulihan otomatis'
                                : runStatusLabel(
                                      source.status,
                                      source.report_type,
                                  )}
                            {source.status === 'SOURCE_SAVED'
                                ? ` · ${source.awb_count ?? 0} AWB tersimpan`
                                : ''}
                        </p>
                        {source.status === 'RETRY_WAIT' &&
                            source.retry_available_at && (
                                <p className="text-xs text-muted-foreground">
                                    Retry berikutnya:{' '}
                                    {jneTimestamp(
                                        source.retry_available_at,
                                        timezone,
                                    )}{' '}
                                    · menunggu giliran worker
                                </p>
                            )}
                        {['FAILED', 'NEEDS_ATTENTION'].includes(
                            source.status,
                        ) &&
                            source.error_message && (
                                <p className="text-sm break-words text-destructive">
                                    {source.error_message}
                                </p>
                            )}
                        {!!source.events?.length && (
                            <Collapsible>
                                <CollapsibleTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="min-h-11"
                                    >
                                        Riwayat percobaan #{source.id}
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="flex flex-col gap-2 pt-2">
                                    {source.error_stage && (
                                        <p className="text-xs text-muted-foreground">
                                            Tahap: {source.error_stage} ·
                                            Penyebab:{' '}
                                            {source.root_cause ??
                                                'UNCLASSIFIED'}
                                        </p>
                                    )}
                                    <ol className="flex flex-col gap-2">
                                        {source.events.map((event) => (
                                            <li
                                                key={event.id}
                                                className="text-xs break-words text-muted-foreground"
                                            >
                                                <time>
                                                    {jneTimestamp(
                                                        event.created_at,
                                                        timezone,
                                                    )}
                                                </time>{' '}
                                                ·{' '}
                                                {event.message ||
                                                    runStatusLabel(
                                                        event.status,
                                                        source.report_type,
                                                    )}
                                            </li>
                                        ))}
                                    </ol>
                                </CollapsibleContent>
                            </Collapsible>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function JneRunProgress({ run }: { run: State }) {
    const attention =
        run.workflow_stage === 'ATTENTION' ||
        ['FAILED', 'NEEDS_ATTENTION'].includes(run.status);
    const step = attention
        ? -1
        : run.workflow_stage === 'READY'
          ? 4
          : run.status === 'COMPLETED'
            ? 3
            : run.status === 'DOWNLOADING'
              ? 2
              : ['QUEUED', 'NO_DATA'].includes(run.status) ||
                  waitingForSources(run)
                ? 0
                : 1;
    return (
        <ol aria-label="Tahapan penarikan" className="grid grid-cols-4 gap-2">
            {['Antrean', 'Penarikan', 'CSV APEX', 'Monitoring'].map(
                (label, index) => (
                    <li key={label} className="flex min-w-0 flex-col gap-2">
                        <div
                            className={`h-1 rounded-full ${index < step ? 'bg-primary' : 'bg-muted'}`}
                        />
                        <span
                            className={`flex items-center gap-1 text-xs ${index < step ? 'font-medium' : 'text-muted-foreground'}`}
                        >
                            {index < step && (
                                <Check
                                    aria-hidden="true"
                                    className="size-3 shrink-0"
                                />
                            )}
                            {label}
                        </span>
                    </li>
                ),
            )}
        </ol>
    );
}

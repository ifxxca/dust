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
import { runStatusLabel } from '@/lib/scraping';

type State = {
    status: string;
    report_type?: string;
    workflow_stage?: string;
    reviewed_at?: string | null;
};

export function JneRunState({ run }: { run: State }) {
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
          : run.status === 'COMPLETED'
            ? run.workflow_stage === 'PROCESSING'
                ? 'Memproses CSV APEX'
                : 'CSV tersimpan'
            : runStatusLabel(run.status, run.report_type);
    const Icon = attention
        ? CircleAlert
        : ready
          ? CircleCheck
          : run.status === 'QUEUED'
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
              : ['QUEUED', 'NO_DATA'].includes(run.status)
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

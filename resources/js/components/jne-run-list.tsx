import { CalendarDays, ChevronRight, FileDown, ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { JneRunState } from '@/components/jne-run-state';
import { jneTimestamp } from '@/lib/jne-monitoring';
import { reportLabel, sourceLabel } from '@/lib/scraping';

export type RunEvent = {
    id: number;
    status: string;
    message: string | null;
    worker_id: string | null;
    created_at: string;
};
export type JneRun = {
    id: number;
    source: string;
    report_type: string;
    customer_account: string;
    national_account?: string;
    status: string;
    worker_id: string | null;
    attempt_count: number;
    row_count: number | null;
    source_row_count: number | null;
    awb_count: number | null;
    file_size: number | null;
    file_checksum: string | null;
    date_from: string;
    date_thru: string;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    reviewed_at: string | null;
    error_message: string | null;
    import_error: string | null;
    projection_error: string | null;
    review_note: string | null;
    events: RunEvent[];
    workflow_stage: string;
    sources: {
        id: number;
        source: string;
        report_type: string;
        status: string;
        source_row_count: number | null;
        awb_count: number | null;
        error_message: string | null;
    }[];
};

export default function JneRunList({
    runs,
    timezone,
    onDetail,
}: {
    runs: JneRun[];
    timezone: string;
    onDetail: (run: JneRun) => void;
}) {
    if (!runs.length)
        return (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
                <ListFilter
                    aria-hidden="true"
                    className="size-8 text-muted-foreground"
                />
                <p className="font-medium">Belum ada run yang cocok</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                    Ubah filter atau mulai penarikan dari konfigurasi tersimpan.
                </p>
            </div>
        );
    const account = (run: JneRun) =>
        run.report_type === 'unresolved'
            ? 'Semua account'
            : run.customer_account;
    return (
        <>
            <ul aria-label="Riwayat run mobile" className="space-y-3 lg:hidden">
                {runs.map((run) => (
                    <li
                        key={run.id}
                        className="space-y-4 rounded-xl border p-4"
                    >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <p className="text-sm font-semibold">
                                    Run #{run.id} ·{' '}
                                    {sourceLabel(
                                        run.source,
                                        run.customer_account,
                                    )}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {reportLabel(run.report_type)}
                                </p>
                            </div>
                            <JneRunState run={run} />
                        </div>
                        <div className="flex items-start justify-between gap-3 rounded-lg bg-muted/30 p-3">
                            <div>
                                <p className="text-xs text-muted-foreground">
                                    Account / periode
                                </p>
                                <p className="mt-1 text-sm font-medium break-all">
                                    {account(run)}
                                    {run.report_type === 'apex' && (
                                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                                            National Acc/Cust:{' '}
                                            {run.national_account === 'Y'
                                                ? 'YES'
                                                : 'NO'}
                                        </span>
                                    )}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {run.date_from}
                                    {run.date_from !== run.date_thru
                                        ? ` – ${run.date_thru}`
                                        : ''}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground">
                                    Hasil
                                </p>
                                <p className="mt-1 text-lg font-semibold tabular-nums">
                                    {run.row_count?.toLocaleString('id-ID') ??
                                        '—'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    baris CSV
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                <CalendarDays
                                    aria-hidden="true"
                                    className="size-3"
                                />
                                {jneTimestamp(run.created_at, timezone)}
                            </p>
                            <Button
                                variant="outline"
                                className="min-h-11"
                                onClick={() => onDetail(run)}
                            >
                                Detail & log
                                <ChevronRight
                                    aria-hidden="true"
                                    data-icon="inline-end"
                                />
                            </Button>
                        </div>
                    </li>
                ))}
            </ul>
            <div className="hidden lg:block">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {[
                                'Run / sumber',
                                'Account / periode',
                                'Progres',
                                'Hasil CSV',
                                'Dibuat / selesai',
                                '',
                            ].map((label, index) => (
                                <TableHead key={label || index}>
                                    {label}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {runs.map((run) => (
                            <TableRow key={run.id}>
                                <TableCell className="align-top">
                                    <p className="text-sm font-semibold">
                                        #{run.id} ·{' '}
                                        {sourceLabel(
                                            run.source,
                                            run.customer_account,
                                        )}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {reportLabel(run.report_type)}
                                    </p>
                                </TableCell>
                                <TableCell className="align-top">
                                    <p className="max-w-48 text-sm break-words whitespace-normal">
                                        {account(run)}
                                        {run.report_type === 'apex' && (
                                            <span className="mt-1 block text-xs text-muted-foreground">
                                                National:{' '}
                                                {run.national_account === 'Y'
                                                    ? 'YES'
                                                    : 'NO'}
                                            </span>
                                        )}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {run.date_from}
                                        {run.date_from !== run.date_thru
                                            ? ` – ${run.date_thru}`
                                            : ''}
                                    </p>
                                </TableCell>
                                <TableCell className="max-w-48 align-top">
                                    <JneRunState run={run} />
                                    {run.status === 'NO_DATA' &&
                                        run.report_type === 'unresolved' && (
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Tidak ada AWB yang memenuhi
                                                batas usia dan interval
                                                pembaruan pada siklus ini.
                                            </p>
                                        )}
                                    {run.reviewed_at && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Sudah diperiksa
                                        </p>
                                    )}
                                </TableCell>
                                <TableCell className="align-top">
                                    <p className="flex items-center gap-1.5 text-sm">
                                        <FileDown
                                            aria-hidden="true"
                                            className="size-3.5 text-muted-foreground"
                                        />
                                        {run.row_count === null
                                            ? '—'
                                            : `${run.row_count.toLocaleString('id-ID')} baris`}
                                    </p>
                                    {run.file_size !== null && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {(run.file_size / 1024).toFixed(1)}{' '}
                                            KB
                                        </p>
                                    )}
                                </TableCell>
                                <TableCell className="align-top text-xs tabular-nums">
                                    <p>
                                        {jneTimestamp(run.created_at, timezone)}
                                    </p>
                                    <p className="mt-1 text-muted-foreground">
                                        {run.completed_at
                                            ? jneTimestamp(
                                                  run.completed_at,
                                                  timezone,
                                              )
                                            : 'Belum selesai'}
                                    </p>
                                </TableCell>
                                <TableCell className="align-top">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="min-h-11"
                                        onClick={() => onDetail(run)}
                                    >
                                        Detail & log
                                        <ChevronRight
                                            aria-hidden="true"
                                            data-icon="inline-end"
                                        />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </>
    );
}

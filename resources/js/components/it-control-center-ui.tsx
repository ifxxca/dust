import { useState, type ReactNode } from 'react';
import {
    Activity,
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    ChevronDown,
    Circle,
    CircleAlert,
    FileText,
    TriangleAlert,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

const dates = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Jakarta',
});
export const monitorTime = (value: string | null) =>
    value ? dates.format(new Date(value)) : 'Belum terukur';
export const monitorNumber = (value: number | null | undefined) =>
    value === null || value === undefined
        ? 'UNKNOWN'
        : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(
              value,
          );
export const monitorDuration = (value: number | null) =>
    value === null
        ? 'Belum terukur'
        : value >= 1000
          ? `${monitorNumber(value / 1000)} s`
          : `${monitorNumber(value)} ms`;

export function Evidence({
    children,
    label = 'Bukti & detail',
}: {
    children: ReactNode;
    label?: string;
}) {
    return (
        <Collapsible>
            <CollapsibleTrigger asChild>
                <Button variant="ghost" className="min-h-11 px-0 text-xs">
                    <FileText aria-hidden="true" />
                    {label}
                    <ChevronDown aria-hidden="true" />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="max-w-xs text-xs whitespace-normal text-muted-foreground">
                {children}
            </CollapsibleContent>
        </Collapsible>
    );
}

export function MonitorState({ value }: { value: string }) {
    const success = ['HEALTHY', 'SUCCESS', 'PROCESSED'].includes(value);
    const warning = ['DEGRADED', 'PAUSED', 'ATTENTION'].includes(value);
    const failure = [
        'FAILED',
        'UNHEALTHY',
        'NEEDS_ATTENTION',
        'FAILED_ATTEMPT',
    ].includes(value);
    const active = ['BUSY', 'RUNNING'].includes(value);
    const Icon = success
        ? CheckCircle2
        : failure
          ? CircleAlert
          : warning
            ? TriangleAlert
            : active
              ? Activity
              : Circle;
    return (
        <Badge
            variant={
                success
                    ? 'success'
                    : warning
                      ? 'warning'
                      : failure
                        ? 'destructive'
                        : active
                          ? 'default'
                          : 'secondary'
            }
        >
            <Icon aria-hidden="true" />
            {value}
        </Badge>
    );
}

export function DataGrid({
    title,
    headers,
    rows,
    note,
    icon: Icon,
    toolbar,
    mobileRows,
}: {
    title: string;
    headers: string[];
    rows: ReactNode[][];
    note?: string;
    icon?: LucideIcon;
    toolbar?: ReactNode;
    mobileRows?: ReactNode[];
}) {
    const [page, setPage] = useState(1);
    const current = Math.min(page, Math.max(1, Math.ceil(rows.length / 20)));
    return (
        <section
            className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-xs"
            aria-label={title}
        >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                    {Icon && (
                        <Icon
                            aria-hidden="true"
                            className="mt-0.5 size-5 shrink-0 text-primary"
                        />
                    )}
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold">{title}</h2>
                        {note && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {note}
                            </p>
                        )}
                    </div>
                </div>
                {toolbar}
            </div>
            <div
                tabIndex={0}
                role="region"
                aria-label={`Tabel ${title}, geser untuk kolom lainnya`}
                className={cn(
                    'overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    mobileRows && 'hidden md:block',
                )}
            >
                <Table>
                    <TableHeader className="bg-muted/40">
                        <TableRow>
                            {headers.map((header) => (
                                <TableHead
                                    key={header}
                                    scope="col"
                                    className="px-4 text-xs"
                                >
                                    {header}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={headers.length}>
                                    Tidak ada catatan dalam sampel ini.
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows
                                .slice((current - 1) * 20, current * 20)
                                .map((row, index) => (
                                    <TableRow key={index}>
                                        {row.map((cell, column) => (
                                            <TableCell
                                                key={column}
                                                className="max-w-96 px-4 py-2.5 align-top whitespace-normal"
                                            >
                                                {cell}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                        )}
                    </TableBody>
                </Table>
            </div>
            {mobileRows && (
                <ul
                    className="divide-y md:hidden"
                    aria-label={`Daftar ${title}`}
                >
                    {mobileRows.map((row, index) => (
                        <li key={index} className="p-4">
                            {row}
                        </li>
                    ))}
                </ul>
            )}
            {rows.length > 20 && (
                <div className="flex items-center justify-between gap-3 border-t p-3">
                    <p className="text-xs text-muted-foreground">
                        {rows.length} catatan · halaman {current}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            className="min-h-11 min-w-11"
                            variant="outline"
                            size="icon"
                            aria-label={`${title} sebelumnya`}
                            disabled={current === 1}
                            onClick={() => setPage(current - 1)}
                        >
                            <ArrowLeft aria-hidden="true" />
                        </Button>
                        <Button
                            className="min-h-11 min-w-11"
                            variant="outline"
                            size="icon"
                            aria-label={`${title} berikutnya`}
                            disabled={current * 20 >= rows.length}
                            onClick={() => setPage(current + 1)}
                        >
                            <ArrowRight aria-hidden="true" />
                        </Button>
                    </div>
                </div>
            )}
        </section>
    );
}

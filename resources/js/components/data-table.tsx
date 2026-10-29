import { Fragment, useMemo, useState, type ReactNode } from 'react';
import {
    columnVisibilityFeature,
    createColumnHelper,
    tableFeatures,
    useTable,
    type ColumnVisibilityState,
} from '@tanstack/react-table';
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

const features = tableFeatures({ columnVisibilityFeature });
export type DataTableColumn<T> = {
    id: string;
    header: ReactNode;
    cell: (row: T) => ReactNode;
    className?: string | ((row: T) => string);
    headerClassName?: string;
    hideable?: boolean;
};
export type DataTablePageMeta = {
    current_page?: number;
    last_page?: number;
    total?: number;
    from?: number | null;
    to?: number | null;
    per_page?: number;
};
export type DataTablePaginationProps = {
    meta?: DataTablePageMeta;
    page: number;
    perPage?: number;
    onPage: (page: number) => void;
    onPerPage?: (size: number) => void;
    loading?: boolean;
    error?: string;
    itemLabel?: string;
};

export function DataTablePagination({
    meta,
    page,
    perPage = 20,
    onPage,
    onPerPage,
    loading = false,
    error = '',
    itemLabel = 'data',
}: DataTablePaginationProps) {
    const last = meta?.last_page ?? 1;
    const disabled = loading || !!error;
    const summary = loading
        ? `Memuat ${itemLabel}…`
        : error
          ? 'Data belum tersedia'
          : meta?.total === undefined
            ? ''
            : meta.from != null && meta.to != null
              ? `${meta.from}–${meta.to} dari ${meta.total} ${itemLabel}`
              : `${meta.total} ${itemLabel}`;
    return (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:px-5">
            <p role="status" className="text-xs text-muted-foreground">
                {summary}
            </p>
            <div className="flex flex-wrap items-center gap-3">
                {onPerPage && (
                    <Select
                        value={String(perPage)}
                        onValueChange={(value) => onPerPage(Number(value))}
                        disabled={disabled}
                    >
                        <SelectTrigger
                            className="w-36"
                            aria-label={`Jumlah ${itemLabel} per halaman`}
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {[10, 20, 50].map((size) => (
                                <SelectItem key={size} value={String(size)}>
                                    {size} per halaman
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                <nav
                    aria-label={`Halaman ${itemLabel}`}
                    className="flex items-center gap-1"
                >
                    <span className="mr-2 text-xs text-muted-foreground">
                        Halaman {page} dari {last}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="hidden size-8 sm:inline-flex"
                        aria-label="Halaman pertama"
                        disabled={disabled || page <= 1}
                        onClick={() => onPage(1)}
                    >
                        <ChevronsLeft className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        aria-label="Halaman sebelumnya"
                        disabled={disabled || page <= 1}
                        onClick={() => onPage(page - 1)}
                    >
                        <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        aria-label="Halaman berikutnya"
                        disabled={disabled || page >= last}
                        onClick={() => onPage(page + 1)}
                    >
                        <ChevronRight className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="hidden size-8 sm:inline-flex"
                        aria-label="Halaman terakhir"
                        disabled={disabled || page >= last}
                        onClick={() => onPage(last)}
                    >
                        <ChevronsRight className="size-4" />
                    </Button>
                </nav>
            </div>
        </footer>
    );
}

export default function DataTable<T extends object>({
    data,
    columns,
    getRowId,
    title,
    loading = false,
    error = '',
    emptyTitle = 'Tidak ada data',
    emptyDescription = '',
    emptyAction,
    initialHiddenColumns = [],
    pagination,
    className,
    tableClassName,
    bordered = true,
    toolbar,
    expandedRow,
    renderExpandedRow,
}: {
    data: T[];
    columns: DataTableColumn<T>[];
    getRowId: (row: T) => string;
    title?: ReactNode;
    loading?: boolean;
    error?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyAction?: ReactNode;
    initialHiddenColumns?: string[];
    pagination?: DataTablePaginationProps;
    className?: string;
    tableClassName?: string;
    bordered?: boolean;
    toolbar?: ReactNode;
    expandedRow?: string | null;
    renderExpandedRow?: (row: T) => ReactNode;
}) {
    const [columnVisibility, setColumnVisibility] =
        useState<ColumnVisibilityState>(() =>
            Object.fromEntries(initialHiddenColumns.map((id) => [id, false])),
        );
    const definitions = useMemo(() => {
        const helper = createColumnHelper<typeof features, T>();
        return columns.map((column) =>
            helper.display({
                id: column.id,
                header: () => column.header,
                cell: ({ row }) => column.cell(row.original),
                enableHiding: column.hideable !== false,
            }),
        );
    }, [columns]);
    const table = useTable({
        features,
        data,
        columns: definitions,
        getRowId,
        state: { columnVisibility },
        onColumnVisibilityChange: setColumnVisibility,
    });
    const byId = new Map(columns.map((column) => [column.id, column]));
    const hideable = table
        .getAllColumns()
        .filter((column) => column.getCanHide());
    return (
        <section
            className={cn(
                'min-w-0',
                bordered &&
                    'overflow-hidden rounded-xl border bg-card shadow-sm',
                className,
            )}
            aria-label={typeof title === 'string' ? title : 'Tabel data'}
            aria-busy={loading}
        >
            {(title || hideable.length > 0) && (
                <div className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
                    <div className="min-w-0 text-sm font-semibold">{title}</div>
                    <div className="flex shrink-0 items-center gap-2">
                        {hideable.length > 0 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        aria-label="Atur kolom tabel"
                                    >
                                        <Settings2 className="mr-1 size-4" />
                                        Kolom
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuLabel>
                                        Tampilkan kolom
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {hideable.map((column) => (
                                        <DropdownMenuCheckboxItem
                                            key={column.id}
                                            checked={column.getIsVisible()}
                                            onCheckedChange={(value) =>
                                                column.toggleVisibility(!!value)
                                            }
                                        >
                                            {byId.get(column.id)?.header ??
                                                column.id}
                                        </DropdownMenuCheckboxItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        {toolbar}
                    </div>
                </div>
            )}
            <Table className={tableClassName}>
                <TableHeader className="bg-muted/40">
                    {table.getHeaderGroups().map((group) => (
                        <TableRow key={group.id}>
                            {group.headers.map((header) => (
                                <TableHead
                                    key={header.id}
                                    className={cn(
                                        'h-11 px-4 text-xs text-muted-foreground',
                                        byId.get(header.column.id)
                                            ?.headerClassName,
                                    )}
                                >
                                    {header.isPlaceholder ? null : (
                                        <table.FlexRender header={header} />
                                    )}
                                </TableHead>
                            ))}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {loading ? (
                        Array.from({ length: 5 }, (_, index) => (
                            <TableRow key={index}>
                                {table.getVisibleLeafColumns().map((column) => (
                                    <TableCell
                                        key={column.id}
                                        className="px-4 py-5"
                                    >
                                        <Skeleton className="h-5 w-full min-w-16" />
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : error ? (
                        <TableRow>
                            <TableCell
                                colSpan={table.getVisibleLeafColumns().length}
                                className="h-40 text-center whitespace-normal text-muted-foreground"
                            >
                                Daftar belum dapat dimuat. Gunakan Muat Ulang
                                untuk mencoba kembali.
                            </TableCell>
                        </TableRow>
                    ) : table.getRowModel().rows.length ? (
                        table.getRowModel().rows.map((row) => (
                            <Fragment key={row.id}>
                                <TableRow
                                    data-state={
                                        expandedRow === row.id
                                            ? 'selected'
                                            : undefined
                                    }
                                >
                                    {row.getVisibleCells().map((cell) => {
                                        const column = byId.get(cell.column.id);
                                        return (
                                            <TableCell
                                                key={cell.id}
                                                className={cn(
                                                    'px-4 py-4 align-top whitespace-normal',
                                                    typeof column?.className ===
                                                        'function'
                                                        ? column.className(
                                                              row.original,
                                                          )
                                                        : column?.className,
                                                )}
                                            >
                                                <table.FlexRender cell={cell} />
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                                {expandedRow === row.id &&
                                    renderExpandedRow && (
                                        <TableRow className="hover:bg-transparent">
                                            <TableCell
                                                colSpan={
                                                    table.getVisibleLeafColumns()
                                                        .length
                                                }
                                                className="p-4 whitespace-normal"
                                            >
                                                {renderExpandedRow(
                                                    row.original,
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )}
                            </Fragment>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell
                                colSpan={table.getVisibleLeafColumns().length}
                                className="h-48 whitespace-normal"
                            >
                                <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-8 text-center">
                                    <p className="font-medium">{emptyTitle}</p>
                                    {emptyDescription && (
                                        <p className="text-sm text-muted-foreground">
                                            {emptyDescription}
                                        </p>
                                    )}
                                    {emptyAction}
                                </div>
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            {pagination && (
                <DataTablePagination
                    {...pagination}
                    loading={loading || pagination.loading}
                    error={error || pagination.error}
                />
            )}
        </section>
    );
}

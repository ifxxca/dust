import { Link } from '@inertiajs/react';
import { Clock3, Copy, MoreHorizontal, PanelRightOpen } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { toast } from 'sonner';
import DataTable, {
    DataTablePagination,
    type DataTableColumn,
} from '@/components/data-table';
import ShipmentStatusBadge from '@/components/jne-shipment-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { jneTimestamp } from '@/lib/jne-monitoring';
import * as monitoring from '@/routes/jne-monitoring';
import { show as pickupDetail } from '@/routes/pickup-results';
import type { JnePage, JneShipment } from '@/types/jne';

export async function copyJneAwb(awb: string) {
    try {
        await navigator.clipboard.writeText(awb);
        toast.success('AWB disalin.');
    } catch {
        toast.error(
            'AWB belum dapat disalin. Pilih nomor AWB untuk menyalinnya secara manual.',
        );
    }
}

function ShipmentActions({
    shipment,
    onDetail,
}: {
    shipment: JneShipment;
    onDetail: (id: number, origin: HTMLElement | null) => void;
}) {
    const trigger = useRef<HTMLButtonElement>(null);
    const openingDetail = useRef(false);
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    ref={trigger}
                    variant="ghost"
                    size="icon"
                    aria-label={`Tindakan AWB ${shipment.awb}`}
                    className="min-h-11 min-w-11"
                >
                    <MoreHorizontal />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                onCloseAutoFocus={(event) => {
                    if (openingDetail.current) {
                        event.preventDefault();
                        openingDetail.current = false;
                    }
                }}
            >
                <DropdownMenuItem
                    onSelect={() => {
                        openingDetail.current = true;
                        onDetail(shipment.id, trigger.current);
                    }}
                >
                    <PanelRightOpen />
                    Lihat detail cepat
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href={monitoring.show.url(shipment.id)}>
                        Buka halaman AWB
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => void copyJneAwb(shipment.awb)}
                >
                    <Copy />
                    Salin AWB
                </DropdownMenuItem>
                {shipment.pickup_task_id && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link
                                href={pickupDetail.url(shipment.pickup_task_id)}
                            >
                                Buka pickup {shipment.pickup_reference}
                            </Link>
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default function ShipmentDataTable({
    shipments,
    timezone,
    loading,
    error,
    onPage,
    onDetail,
    onReset,
    filtered,
    bordered = true,
}: {
    shipments: JnePage<JneShipment>;
    timezone: string;
    loading: boolean;
    error: string;
    onPage: (page: number) => void;
    onDetail: (id: number, origin: HTMLElement | null) => void;
    onReset: () => void;
    filtered: boolean;
    bordered?: boolean;
}) {
    const columns = useMemo<DataTableColumn<JneShipment>[]>(
        () => [
            {
                id: 'awb',
                header: 'AWB',
                hideable: false,
                className: 'min-w-48',
                cell: (row) => (
                    <div className="flex items-center gap-1">
                        <Link
                            href={monitoring.show.url(row.id)}
                            className="font-mono text-sm font-medium whitespace-nowrap underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                        >
                            {row.awb}
                        </Link>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-7 shrink-0 text-muted-foreground"
                                    aria-label={`Salin AWB ${row.awb}`}
                                    onClick={() => void copyJneAwb(row.awb)}
                                >
                                    <Copy className="size-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Salin AWB</TooltipContent>
                        </Tooltip>
                    </div>
                ),
            },
            {
                id: 'customer',
                header: 'Customer / Pengirim',
                className: 'min-w-52 max-w-80',
                cell: (row) => (
                    <div className="flex flex-col gap-0.5 break-words">
                        <p className="text-sm font-medium">
                            {row.customer_name
                                ? `${row.customer_code || '—'} · ${row.customer_name}`
                                : 'Customer belum dipetakan'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Pengirim JNE: {row.shipper_name || '—'}
                        </p>
                        {['AMBIGUOUS', 'CONFLICT', 'CANDIDATE'].includes(
                            row.customer_match_status || '',
                        ) && (
                            <Badge variant="outline">
                                {row.customer_match_status === 'CANDIDATE'
                                    ? 'Kandidat customer'
                                    : 'Customer perlu pemeriksaan'}
                            </Badge>
                        )}
                    </div>
                ),
            },
            {
                id: 'status',
                header: 'Status Pengiriman',
                className: 'min-w-40',
                cell: (row) => (
                    <ShipmentStatusBadge status={row.tracking_status} />
                ),
            },
            {
                id: 'recipient',
                header: 'Penerima',
                className: 'min-w-40 max-w-60 break-words',
                cell: (row) => row.consignee_name || '—',
            },
            {
                id: 'observed',
                header: 'Terakhir Diamati',
                className: 'min-w-44 whitespace-nowrap text-sm tabular-nums',
                cell: (row) => (
                    <span>{jneTimestamp(row.observed_at, timezone)}</span>
                ),
            },
            {
                id: 'actions',
                header: <span className="sr-only">Tindakan</span>,
                hideable: false,
                className: 'w-12',
                cell: (row) => (
                    <ShipmentActions shipment={row} onDetail={onDetail} />
                ),
            },
        ],
        [timezone, onDetail],
    );
    return (
        <TooltipProvider>
            {!loading && !error && shipments.data.length > 0 && (
                <div className="space-y-3 p-4 md:hidden">
                    <ul
                        aria-label="Daftar pengiriman mobile"
                        className="space-y-3"
                    >
                        {shipments.data.map((shipment) => (
                            <li
                                key={shipment.id}
                                className="space-y-3 rounded-xl border bg-card p-4"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 space-y-2">
                                        <Link
                                            href={monitoring.show.url(
                                                shipment.id,
                                            )}
                                            className="font-mono text-sm font-semibold break-all underline-offset-4 hover:underline"
                                        >
                                            {shipment.awb}
                                        </Link>
                                        <div>
                                            <ShipmentStatusBadge
                                                status={
                                                    shipment.tracking_status
                                                }
                                            />
                                        </div>
                                    </div>
                                    <ShipmentActions
                                        shipment={shipment}
                                        onDetail={onDetail}
                                    />
                                </div>
                                <div>
                                    <p className="text-sm font-medium break-words">
                                        {shipment.customer_name
                                            ? `${shipment.customer_code || '—'} · ${shipment.customer_name}`
                                            : 'Customer belum dipetakan'}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Pengirim JNE:{' '}
                                        {shipment.shipper_name || '—'}
                                    </p>
                                </div>
                                <dl className="grid grid-cols-2 gap-3 border-t pt-3 text-xs">
                                    <div>
                                        <dt className="text-muted-foreground">
                                            Penerima
                                        </dt>
                                        <dd className="mt-1 text-sm break-words">
                                            {shipment.consignee_name || '—'}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="flex items-center gap-1 text-muted-foreground">
                                            <Clock3
                                                aria-hidden="true"
                                                className="size-3"
                                            />
                                            Diamati
                                        </dt>
                                        <dd className="mt-1 leading-5">
                                            {jneTimestamp(
                                                shipment.observed_at,
                                                timezone,
                                            )}
                                        </dd>
                                    </div>
                                </dl>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        className="min-h-11 flex-1"
                                        onClick={(event) =>
                                            onDetail(
                                                shipment.id,
                                                event.currentTarget,
                                            )
                                        }
                                    >
                                        <PanelRightOpen
                                            aria-hidden="true"
                                            data-icon="inline-start"
                                        />
                                        Detail pengiriman
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        className="min-h-11 min-w-11"
                                        aria-label={`Salin AWB ${shipment.awb}`}
                                        onClick={() =>
                                            void copyJneAwb(shipment.awb)
                                        }
                                    >
                                        <Copy
                                            aria-hidden="true"
                                            data-icon="inline-start"
                                        />
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                    <DataTablePagination
                        meta={shipments}
                        page={shipments.current_page}
                        perPage={50}
                        onPage={onPage}
                        loading={loading}
                        error={error}
                        itemLabel="AWB"
                    />
                </div>
            )}
            <div
                className={
                    !loading && !error && shipments.data.length > 0
                        ? 'hidden md:block'
                        : ''
                }
            >
                <DataTable
                    data={shipments.data}
                    columns={columns}
                    getRowId={(row) => String(row.id)}
                    title={
                        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span>Daftar AWB</span>
                            <span className="text-xs font-normal text-muted-foreground">
                                Urutan: observasi terbaru
                            </span>
                        </span>
                    }
                    loading={loading}
                    error={error}
                    className="min-w-0"
                    bordered={bordered}
                    tableClassName="min-w-full [&_tbody_td]:py-2.5 [&_tbody_td]:align-middle"
                    emptyTitle={
                        filtered
                            ? 'Tidak ada AWB yang sesuai'
                            : 'Belum ada pengiriman JNE'
                    }
                    emptyDescription={
                        filtered
                            ? 'Ubah atau reset filter untuk melihat pengiriman lainnya.'
                            : 'Tarik dan proses report JNE agar pengiriman muncul di sini.'
                    }
                    emptyAction={
                        filtered ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onReset}
                            >
                                Reset filter
                            </Button>
                        ) : null
                    }
                    pagination={{
                        meta: shipments,
                        page: shipments.current_page,
                        perPage: 50,
                        onPage,
                        loading,
                        error,
                        itemLabel: 'AWB',
                    }}
                />
            </div>
        </TooltipProvider>
    );
}

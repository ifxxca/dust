import { Head, Link, router, useHttp, usePage } from '@inertiajs/react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
    ArrowLeft,
    FileDown,
    LoaderCircle,
    LogOut,
    Package,
    Search,
    CheckCircle2,
    Truck,
} from 'lucide-react';
import CustomerPicker from '@/components/customer-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import {
    Table,
    TableHeader,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
} from '@/components/ui/table';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import * as portal from '@/routes/portal';
import { logout, dashboard } from '@/routes';
import type {
    PortalCustomer,
    PortalProps,
    PortalPagination,
    PortalShipment,
    PortalPickupDetail,
    PortalShipmentDetail,
    PortalPickup,
    PortalSummary,
} from '@/types/customer-portal';

export const portalDate = (value: string | null) =>
    value
        ? new Intl.DateTimeFormat('id-ID', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Asia/Jakarta',
          }).format(
              new Date(
                  /[Z+]|-\d\d:\d\d$/.test(value)
                      ? value
                      : `${value.replace(' ', 'T')}Z`,
              ),
          )
        : '—';
const categories: Record<string, string> = {
    manual_hybrid: 'Manual',
    cashless_hybrid: 'Cashless',
    css_orion: 'CSS / Orion',
};
const statuses: Record<string, string> = {
    DELIVERED: 'Terkirim',
    IN_TRANSIT: 'Dalam proses',
    EXCEPTION: 'Bermasalah',
    CANCELLED: 'Dibatalkan',
    RETURNED: 'Dikembalikan',
    UNKNOWN: 'Belum diketahui',
};
const titles = {
    dashboard: 'Dashboard',
    monitoring: 'Monitoring Kiriman',
    history: 'History Pickup',
};

function ShipmentStatus({ status }: { status: string }) {
    return (
        <Badge
            variant={
                status === 'DELIVERED'
                    ? 'success'
                    : status === 'EXCEPTION' || status === 'RETURNED'
                      ? 'warning'
                      : 'outline'
            }
        >
            {statuses[status] ?? statuses.UNKNOWN}
        </Badge>
    );
}

function PickupRows({
    rows,
    onPickup,
    groupCategories = false,
}: {
    rows: PortalPickup[];
    onPickup: (id: number) => void;
    groupCategories?: boolean;
}) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Buku / Tanggal pickup</TableHead>
                    <TableHead className="hidden md:table-cell">
                        Petugas
                    </TableHead>
                    <TableHead className="text-right">Paket / Resi</TableHead>
                    <TableHead className="hidden sm:table-cell">
                        Progres
                    </TableHead>
                    <TableHead>
                        <span className="sr-only">Aksi</span>
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.length === 0 && (
                    <TableRow>
                        <TableCell
                            colSpan={5}
                            className="h-28 text-center text-muted-foreground"
                        >
                            Belum ada pickup pada periode ini.
                        </TableCell>
                    </TableRow>
                )}
                {rows.map((row) => (
                    <TableRow key={row.id}>
                        <TableCell className="whitespace-normal">
                            <Button
                                variant="link"
                                className="h-auto min-h-11 max-w-60 justify-start p-0 text-left break-all whitespace-normal"
                                onClick={() => onPickup(row.id)}
                            >
                                {row.reference}
                            </Button>
                            <p className="text-sm text-muted-foreground">
                                {portalDate(row.picked_up_at)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Manual{' '}
                                {row.manual + (groupCategories ? row.orion : 0)}{' '}
                                · Cashless {row.cashless}
                                {!groupCategories && (
                                    <> · CSS/Orion {row.orion}</>
                                )}
                            </p>
                            <p className="mt-1 text-xs sm:hidden">
                                {row.reconciliation_status === 'Selesai'
                                    ? 'Pencocokan selesai'
                                    : 'Pencocokan diproses'}
                            </p>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                            {row.staff ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {row.total} paket
                            <p className="text-xs text-muted-foreground">
                                {row.awb_count} resi
                            </p>
                            {row.awb_count !== row.total && (
                                <p className="text-xs text-muted-foreground">
                                    {row.awb_count < row.total
                                        ? `Kurang ${row.total - row.awb_count}`
                                        : `Lebih ${row.awb_count - row.total}`}{' '}
                                    resi
                                </p>
                            )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                            <Badge
                                variant={
                                    row.reconciliation_status === 'Selesai'
                                        ? 'success'
                                        : row.handover_status === 'DISCREPANCY'
                                          ? 'warning'
                                          : 'outline'
                                }
                            >
                                {row.reconciliation_status === 'Selesai'
                                    ? 'Pencocokan selesai'
                                    : 'Pencocokan diproses'}
                            </Badge>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {row.handover_status === 'PENDING'
                                    ? 'Menunggu handover'
                                    : row.handover_status === 'DISCREPANCY'
                                      ? 'Ada selisih'
                                      : 'Sudah diterima'}
                            </p>
                        </TableCell>
                        <TableCell>
                            <Button
                                variant="outline"
                                aria-label={`Lihat pickup ${row.reference}`}
                                onClick={() => onPickup(row.id)}
                            >
                                Lihat
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function PortalDashboard({
    summary,
    filters,
    selection,
    onPickup,
}: {
    summary: PortalSummary;
    filters: PortalProps['filters'];
    selection: { customer_id?: number };
    onPickup: (id: number) => void;
}) {
    const deliveredPercent =
        summary.total > 0
            ? Math.round((summary.delivered / summary.total) * 100)
            : 0;
    return (
        <>
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: 'Total AWB', value: summary.total, status: '' },
                    {
                        label: 'Dalam proses',
                        value: summary.active,
                        status: 'IN_TRANSIT',
                    },
                    {
                        label: 'Terkirim',
                        value: summary.delivered,
                        status: 'DELIVERED',
                    },
                ].map((metric) => (
                    <Card key={metric.label}>
                        <CardHeader className="px-3 sm:px-6">
                            <CardTitle className="text-sm">
                                {metric.label}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="px-3 sm:px-6">
                            <Link
                                className="inline-flex min-h-11 items-center text-3xl font-semibold tabular-nums underline-offset-4 hover:underline"
                                href={portal.monitoring({
                                    query: {
                                        ...selection,
                                        ...filters,
                                        status: metric.status,
                                    },
                                })}
                            >
                                {new Intl.NumberFormat('id-ID').format(
                                    metric.value,
                                )}
                            </Link>
                        </CardContent>
                    </Card>
                ))}
            </div>
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Status kiriman</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-3 text-sm">
                            <span>
                                {summary.delivered} dari {summary.total} resi
                                terkirim
                            </span>
                            <strong className="tabular-nums">
                                {deliveredPercent}%
                            </strong>
                        </div>
                        <progress
                            aria-label="Persentase kiriman terkirim"
                            className="h-2 w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
                            max={100}
                            value={deliveredPercent}
                        />
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {summary.by_status
                                .filter((row) => row.status !== 'EXCEPTION')
                                .map((row) => (
                                    <Link
                                        key={row.status}
                                        className="flex min-h-11 items-center justify-between gap-2 rounded-md px-2 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                                        href={portal.monitoring({
                                            query: {
                                                ...selection,
                                                ...filters,
                                                status: row.status,
                                            },
                                        })}
                                    >
                                        <span>
                                            {statuses[row.status] ??
                                                statuses.UNKNOWN}
                                        </span>
                                        <strong className="tabular-nums">
                                            {row.total}
                                        </strong>
                                    </Link>
                                ))}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Jenis kiriman</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        <dl className="flex flex-col gap-4 text-sm">
                            <div className="flex items-center justify-between gap-3">
                                <dt className="font-medium">Manual</dt>
                                <dd className="font-semibold tabular-nums">
                                    {summary.groups.manual} resi
                                </dd>
                            </div>
                            {summary.groups.cod > 0 && (
                                <>
                                    <div className="flex items-center justify-between gap-3 pl-4 text-muted-foreground">
                                        <dt>Non-COD</dt>
                                        <dd className="tabular-nums">
                                            {summary.groups.non_cod} resi
                                        </dd>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 pl-4 text-muted-foreground">
                                        <dt>COD</dt>
                                        <dd className="tabular-nums">
                                            {summary.groups.cod} resi
                                        </dd>
                                    </div>
                                    {summary.groups.cod_unknown > 0 && (
                                        <p className="pl-4 text-xs text-muted-foreground">
                                            Status COD belum tersedia untuk{' '}
                                            {summary.groups.cod_unknown} resi
                                            manual.
                                        </p>
                                    )}
                                </>
                            )}
                            <div className="flex items-center justify-between gap-3 border-t pt-4">
                                <dt className="font-medium">Cashless</dt>
                                <dd className="font-semibold tabular-nums">
                                    {summary.groups.cashless} resi
                                </dd>
                            </div>
                        </dl>
                    </CardContent>
                </Card>
            </div>
            <section className="min-w-0 overflow-hidden rounded-lg border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                    <div>
                        <h2 className="font-semibold">Pickup terbaru</h2>
                        <p className="text-sm text-muted-foreground">
                            {summary.pickups} pickup pada periode ini
                        </p>
                    </div>
                    <Button variant="outline" asChild>
                        <Link
                            href={portal.history({
                                query: {
                                    ...selection,
                                    date_from: filters.date_from,
                                    date_to: filters.date_to,
                                },
                            })}
                        >
                            Semua pickup
                        </Link>
                    </Button>
                </div>
                <PickupRows
                    rows={summary.recent_pickups}
                    onPickup={onPickup}
                    groupCategories
                />
            </section>
            <p className="text-xs text-muted-foreground">
                Data JNE terakhir: {portalDate(summary.updated_at)} WIB
            </p>
        </>
    );
}

export function PortalShipmentInformation({
    shipment,
    onHistoryPage,
}: {
    shipment: PortalShipmentDetail;
    onHistoryPage: (page: number) => void;
}) {
    return (
        <>
            <div className="flex flex-col gap-2 rounded-lg border p-4">
                <ShipmentStatus status={shipment.status} />
                <p className="text-sm break-words">
                    {shipment.status_text || 'Rincian status belum tersedia.'}
                </p>
                <p className="text-xs text-muted-foreground">
                    Report terakhir: {portalDate(shipment.observed_at)} WIB
                </p>
            </div>
            <section className="flex flex-col gap-3">
                <h3 className="font-semibold">Informasi kiriman</h3>
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                    {[
                        ['Pengirim', shipment.shipper],
                        ['Penerima', shipment.consignee],
                        ['Alamat penerima', shipment.address],
                        ['Kecamatan', shipment.district],
                        ['Tujuan', shipment.destination],
                        ['Layanan', shipment.service],
                        [
                            'Kategori',
                            categories[shipment.category ?? ''] ??
                                'Belum diketahui',
                        ],
                        [
                            'Berat',
                            shipment.weight_grams === null
                                ? null
                                : `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(shipment.weight_grams / 1000)} kg`,
                        ],
                        [
                            'Jumlah koli',
                            shipment.quantity === null
                                ? null
                                : String(shipment.quantity),
                        ],
                        ['Tanggal pickup', portalDate(shipment.picked_up_at)],
                        ['Waktu status JNE', portalDate(shipment.status_at)],
                        ...(shipment.delivered_at
                            ? [
                                  [
                                      'Waktu diterima',
                                      portalDate(shipment.delivered_at),
                                  ],
                              ]
                            : []),
                    ].map(([label, value]) => (
                        <div key={label}>
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="mt-1 break-words whitespace-pre-line">
                                {value || 'Belum tersedia'}
                            </dd>
                        </div>
                    ))}
                </dl>
            </section>
            <section className="flex flex-col gap-3 border-t pt-4">
                <h3 className="font-semibold">Riwayat status kiriman</h3>
                <p className="text-xs text-muted-foreground">
                    Berdasarkan report JNE yang tersimpan, terbaru di atas.
                    Status berulang diringkas; waktu report bukan waktu scan
                    paket.
                </p>
                {shipment.history.total === 0 ? (
                    <p className="rounded-md border p-4 text-sm text-muted-foreground">
                        Riwayat perubahan belum tersedia. Status terakhir tetap
                        ditampilkan di atas.
                    </p>
                ) : (
                    <>
                        <ol className="flex flex-col gap-4">
                            {shipment.history.data.map((event, index) => (
                                <li key={index} className="flex gap-3">
                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                                        {event.status === 'DELIVERED' ? (
                                            <CheckCircle2
                                                aria-hidden="true"
                                                className="size-4"
                                            />
                                        ) : (
                                            <Truck
                                                aria-hidden="true"
                                                className="size-4"
                                            />
                                        )}
                                    </div>
                                    <div className="flex min-w-0 flex-1 flex-col gap-1 border-b pb-4">
                                        <ShipmentStatus status={event.status} />
                                        <p className="text-sm break-words">
                                            {event.description ||
                                                'Rincian status belum tersedia'}
                                        </p>
                                        {event.pod && (
                                            <p className="text-sm break-words">
                                                {event.pod}
                                            </p>
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                            {event.status_at
                                                ? `Waktu status: ${portalDate(event.status_at)}`
                                                : `Tercatat di report: ${portalDate(event.observed_at)}`}{' '}
                                            WIB
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                        {shipment.history.last_page > 1 && (
                            <PageLinks
                                page={shipment.history}
                                onPage={onHistoryPage}
                            />
                        )}
                    </>
                )}
            </section>
        </>
    );
}

export function PortalFrame({
    customer,
    children,
    section,
    period,
}: {
    customer: PortalCustomer | null;
    children: ReactNode;
    section?: keyof typeof titles;
    period?: { date_from: string; date_to: string };
}) {
    const { auth } = usePage().props;
    const customerQuery = {
        ...period,
        ...(customer ? { customer_id: customer.id } : {}),
    };
    return (
        <div className="min-h-svh bg-background text-foreground">
            <a
                href="#portal-main"
                className="sr-only focus:not-sr-only focus:p-3"
            >
                Ke konten utama
            </a>
            <header className="border-b bg-card">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <Package
                            aria-hidden="true"
                            className="size-6 shrink-0 text-primary"
                        />
                        <div className="min-w-0">
                            <p className="font-semibold">Retail Pickup</p>
                            <p className="truncate text-sm text-muted-foreground">
                                {customer?.name ?? 'Portal Customer'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {auth.user.role === 'admin_supervisor' && (
                            <Button variant="outline" asChild>
                                <Link href={dashboard()}>
                                    <ArrowLeft aria-hidden="true" />{' '}
                                    <span className="hidden sm:inline">
                                        Kembali ke admin
                                    </span>
                                </Link>
                            </Button>
                        )}
                        <Button variant="ghost" asChild>
                            <Link href={logout()} method="post" as="button">
                                <LogOut aria-hidden="true" />
                                Keluar
                            </Link>
                        </Button>
                    </div>
                </div>
                <nav
                    aria-label="Menu customer"
                    className="mx-auto grid max-w-7xl grid-cols-3 gap-1 px-4 pb-2 sm:flex md:px-6"
                >
                    {(Object.keys(titles) as (keyof typeof titles)[]).map(
                        (key) => (
                            <Button
                                key={key}
                                className="h-auto min-h-11 px-2 text-center whitespace-normal sm:px-4"
                                variant={
                                    key === section ? 'secondary' : 'ghost'
                                }
                                asChild
                            >
                                <Link
                                    aria-current={
                                        key === section ? 'page' : undefined
                                    }
                                    href={portal[key]({ query: customerQuery })}
                                >
                                    {titles[key]}
                                </Link>
                            </Button>
                        ),
                    )}
                </nav>
            </header>
            <main
                id="portal-main"
                className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 md:px-6"
            >
                {children}
            </main>
        </div>
    );
}

function PageLinks<T>({
    page,
    onPage,
}: {
    page: PortalPagination<T>;
    onPage: (page: number) => void;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-sm">
            <span>
                {new Intl.NumberFormat('id-ID').format(page.total)} data ·
                Halaman {page.current_page} dari {page.last_page}
            </span>
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    disabled={page.current_page <= 1}
                    onClick={() => onPage(page.current_page - 1)}
                >
                    Sebelumnya
                </Button>
                <Button
                    variant="outline"
                    disabled={page.current_page >= page.last_page}
                    onClick={() => onPage(page.current_page + 1)}
                >
                    Berikutnya
                </Button>
            </div>
        </div>
    );
}

function ShipmentRows({
    rows,
    onShipment,
}: {
    rows: PortalShipment[];
    onShipment: (id: number) => void;
}) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Resi / Penerima</TableHead>
                    <TableHead className="hidden md:table-cell">
                        Pengirim
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                        Tanggal pickup (WIB)
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">
                        <span className="sr-only">Detail</span>
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.length === 0 && (
                    <TableRow>
                        <TableCell
                            colSpan={5}
                            className="h-28 text-center text-muted-foreground"
                        >
                            Tidak ada resi sesuai filter.
                        </TableCell>
                    </TableRow>
                )}
                {rows.map((row) => (
                    <TableRow key={row.id}>
                        <TableCell>
                            <Button
                                variant="link"
                                className="h-auto max-w-64 justify-start p-0 text-left break-all whitespace-normal"
                                onClick={() => onShipment(row.id)}
                            >
                                {row.awb}
                            </Button>
                            <p className="max-w-64 truncate text-sm text-muted-foreground">
                                {row.consignee_name ??
                                    'Penerima belum tersedia'}
                            </p>
                            <span className="text-xs text-muted-foreground">
                                {categories[row.category ?? ''] ??
                                    'Kategori belum diketahui'}
                            </span>
                        </TableCell>
                        <TableCell className="hidden max-w-56 truncate md:table-cell">
                            {row.shipper_name ?? '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                            {portalDate(row.picked_up_at)}
                        </TableCell>
                        <TableCell>
                            <Badge
                                variant={
                                    row.tracking_status === 'DELIVERED'
                                        ? 'success'
                                        : row.tracking_status === 'EXCEPTION'
                                          ? 'warning'
                                          : 'outline'
                                }
                            >
                                {statuses[row.tracking_status] ??
                                    'Belum diketahui'}
                            </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                            <Button
                                variant="outline"
                                aria-label={`Detail resi ${row.awb}`}
                                onClick={() => onShipment(row.id)}
                            >
                                Detail resi
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

export default function CustomerPortal(props: PortalProps) {
    const { customer, section, filters, isAdmin, summary, shipments, pickups } =
        props;
    const [values, setValues] = useState(filters);
    const [busy, setBusy] = useState(false);
    const [detail, setDetail] = useState<'pickup' | 'shipment' | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pickup, setPickup] = useState<PortalPickupDetail | null>(null);
    const [shipment, setShipment] = useState<PortalShipmentDetail | null>(null);
    const http = useHttp({});
    const requestVersion = useRef(0);
    const shipmentId = useRef<number | null>(null);
    const { errors } = usePage().props;
    const selection = customer ? { customer_id: customer.id } : {};
    const navigate = (extra: Record<string, string | number> = {}) =>
        router.get(
            portal[section].url(),
            { ...values, ...selection, ...extra },
            {
                onStart: () => setBusy(true),
                onFinish: () => setBusy(false),
                onError: () => document.getElementById('portal-from')?.focus(),
            },
        );
    async function openPickup(id: number, page = 1) {
        const version = ++requestVersion.current;
        http.cancel();
        setDetail('pickup');
        setLoading(true);
        setError('');
        setPickup(null);
        try {
            const data = (await http.get(
                portal.pickup.url(id, { query: { ...selection, page } }),
            )) as PortalPickupDetail;
            if (version === requestVersion.current) {
                setPickup(data);
            }
        } catch {
            if (version === requestVersion.current) {
                setError(
                    'Detail pickup belum dapat dimuat. Tutup lalu coba kembali.',
                );
            }
        } finally {
            if (version === requestVersion.current) {
                setLoading(false);
            }
        }
    }
    async function openShipment(id: number, page = 1) {
        shipmentId.current = id;
        const version = ++requestVersion.current;
        http.cancel();
        setDetail('shipment');
        setLoading(true);
        setError('');
        setShipment(null);
        try {
            const data = (await http.get(
                portal.shipment.url(id, { query: { ...selection, page } }),
            )) as PortalShipmentDetail;
            if (version === requestVersion.current) {
                setShipment(data);
            }
        } catch {
            if (version === requestVersion.current) {
                setError(
                    'Detail resi belum dapat dimuat. Tutup lalu coba kembali.',
                );
            }
        } finally {
            if (version === requestVersion.current) {
                setLoading(false);
            }
        }
    }
    function submit(event: FormEvent) {
        event.preventDefault();
        navigate({ page: 1 });
    }
    return (
        <PortalFrame customer={customer} section={section} period={filters}>
            <Head title={titles[section]} />
            {Object.keys(errors).length > 0 && (
                <Alert variant="destructive">
                    <AlertDescription>
                        {Object.values(errors).join(' ')}
                    </AlertDescription>
                </Alert>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">
                    {titles[section]}
                </h1>
                {isAdmin && (
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="w-64">
                            <CustomerPicker
                                selected={customer}
                                onSelect={(row) =>
                                    router.get(
                                        portal[section].url(),
                                        row
                                            ? {
                                                  ...filters,
                                                  customer_id: row.id,
                                              }
                                            : {},
                                    )
                                }
                                placeholder="Pilih customer…"
                            />
                        </div>
                        <Button variant="outline" asChild>
                            <Link href={portal.accounts({ query: selection })}>
                                Akses customer
                            </Link>
                        </Button>
                    </div>
                )}
            </div>
            {!customer ? (
                <Alert>
                    <AlertDescription>
                        Pilih customer untuk melihat pickup dan kirimannya.
                    </AlertDescription>
                </Alert>
            ) : (
                <>
                    <form
                        onSubmit={submit}
                        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3"
                    >
                        <div className="flex min-w-0 flex-[1_1_140px] flex-col gap-1 sm:flex-none">
                            <Label htmlFor="portal-from">Pickup mulai</Label>
                            <Input
                                id="portal-from"
                                className="w-full min-w-0"
                                name="date_from"
                                type="date"
                                required
                                value={values.date_from}
                                onChange={(e) =>
                                    setValues({
                                        ...values,
                                        date_from: e.target.value,
                                    })
                                }
                            />
                        </div>
                        <div className="flex min-w-0 flex-[1_1_140px] flex-col gap-1 sm:flex-none">
                            <Label htmlFor="portal-to">Sampai</Label>
                            <Input
                                id="portal-to"
                                className="w-full min-w-0"
                                name="date_to"
                                type="date"
                                required
                                min={values.date_from}
                                value={values.date_to}
                                onChange={(e) =>
                                    setValues({
                                        ...values,
                                        date_to: e.target.value,
                                    })
                                }
                            />
                        </div>
                        {section !== 'dashboard' && (
                            <div className="flex min-w-44 flex-1 flex-col gap-1">
                                <Label htmlFor="portal-search">
                                    {section === 'history'
                                        ? 'Buku pickup'
                                        : 'Resi, pengirim, penerima'}
                                </Label>
                                <Input
                                    id="portal-search"
                                    name="q"
                                    autoComplete="off"
                                    placeholder="Cari…"
                                    value={values.q}
                                    onChange={(e) =>
                                        setValues({
                                            ...values,
                                            q: e.target.value,
                                        })
                                    }
                                />
                            </div>
                        )}
                        {section === 'monitoring' && (
                            <>
                                <div className="flex flex-col gap-1">
                                    <Label htmlFor="portal-status">
                                        Status
                                    </Label>
                                    <NativeSelect
                                        id="portal-status"
                                        value={values.status}
                                        onChange={(e) =>
                                            setValues({
                                                ...values,
                                                status: e.target.value,
                                            })
                                        }
                                    >
                                        <option value="">Semua status</option>
                                        {Object.entries(statuses).map(
                                            ([key, label]) => (
                                                <option key={key} value={key}>
                                                    {label}
                                                </option>
                                            ),
                                        )}
                                    </NativeSelect>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label htmlFor="portal-category">
                                        Kategori
                                    </Label>
                                    <NativeSelect
                                        id="portal-category"
                                        value={values.category}
                                        onChange={(e) =>
                                            setValues({
                                                ...values,
                                                category: e.target.value,
                                            })
                                        }
                                    >
                                        <option value="">Semua kategori</option>
                                        {Object.entries(categories).map(
                                            ([key, label]) => (
                                                <option key={key} value={key}>
                                                    {label}
                                                </option>
                                            ),
                                        )}
                                    </NativeSelect>
                                </div>
                            </>
                        )}
                        <Button type="submit" disabled={busy}>
                            {busy ? (
                                <LoaderCircle
                                    className="animate-spin"
                                    aria-hidden="true"
                                />
                            ) : (
                                <Search aria-hidden="true" />
                            )}
                            Terapkan
                        </Button>
                    </form>
                    {section === 'dashboard' && summary && (
                        <PortalDashboard
                            summary={summary}
                            filters={filters}
                            selection={selection}
                            onPickup={openPickup}
                        />
                    )}
                    {shipments && (
                        <section className="min-w-0 overflow-hidden rounded-lg border bg-card">
                            <ShipmentRows
                                rows={shipments.data}
                                onShipment={openShipment}
                            />
                            <PageLinks
                                page={shipments}
                                onPage={(page) => navigate({ page })}
                            />
                        </section>
                    )}
                    {pickups && (
                        <section className="min-w-0 overflow-hidden rounded-lg border bg-card">
                            <PickupRows
                                rows={pickups.data}
                                onPickup={openPickup}
                            />
                            <PageLinks
                                page={pickups}
                                onPage={(page) => navigate({ page })}
                            />
                        </section>
                    )}
                </>
            )}
            <Sheet
                open={detail !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        requestVersion.current++;
                        setDetail(null);
                        http.cancel();
                    }
                }}
            >
                <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
                    <SheetHeader>
                        <SheetTitle>
                            {detail === 'pickup'
                                ? 'Detail Pickup'
                                : 'Detail Resi'}
                        </SheetTitle>
                        <SheetDescription>
                            {detail === 'pickup'
                                ? (pickup?.pickup.reference ??
                                  'Bukti pickup dan daftar resi')
                                : (shipment?.awb ?? 'Informasi kiriman')}
                        </SheetDescription>
                    </SheetHeader>
                    <div className="flex flex-col gap-4 p-4">
                        {loading && (
                            <div role="status" aria-label="Memuat detail">
                                <Skeleton className="h-24 w-full" />
                            </div>
                        )}
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        {!loading && detail === 'shipment' && shipment && (
                            <>
                                <PortalShipmentInformation
                                    shipment={shipment}
                                    onHistoryPage={(page) =>
                                        openShipment(shipmentId.current!, page)
                                    }
                                />
                                {shipment.pickup && (
                                    <Button
                                        variant="outline"
                                        onClick={() =>
                                            openPickup(shipment.pickup!.id)
                                        }
                                    >
                                        Buka buku pickup
                                    </Button>
                                )}
                            </>
                        )}
                        {!loading && detail === 'pickup' && pickup && (
                            <>
                                <ol
                                    aria-label="Progres pickup"
                                    className="grid grid-cols-1 gap-3 rounded-lg border p-4 text-sm sm:grid-cols-3"
                                >
                                    {[
                                        [
                                            'Pickup selesai',
                                            portalDate(
                                                pickup.pickup.picked_up_at,
                                            ),
                                        ],
                                        [
                                            pickup.pickup.handover_status ===
                                            'PENDING'
                                                ? 'Menunggu penerimaan'
                                                : pickup.pickup
                                                        .handover_status ===
                                                    'DISCREPANCY'
                                                  ? 'Penerimaan ada selisih'
                                                  : 'Diterima gudang',
                                            `${pickup.pickup.total} paket pada POP`,
                                        ],
                                        [
                                            pickup.pickup
                                                .reconciliation_status ===
                                            'Selesai'
                                                ? 'Pencocokan selesai'
                                                : 'Pencocokan diproses',
                                            `${pickup.pickup.awb_count} resi tersedia`,
                                        ],
                                    ].map(([label, value]) => (
                                        <li
                                            key={label}
                                            className="flex flex-col gap-1"
                                        >
                                            <strong>{label}</strong>
                                            <span className="text-xs text-muted-foreground">
                                                {value}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <p>Petugas: {pickup.pickup.staff ?? '—'}</p>
                                    <p>
                                        {portalDate(pickup.pickup.picked_up_at)}
                                    </p>
                                    <p>
                                        {pickup.pickup.total} paket ·{' '}
                                        {pickup.pickup.awb_count} resi
                                    </p>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Manual {pickup.pickup.manual} · Cashless{' '}
                                    {pickup.pickup.cashless} · CSS / Orion{' '}
                                    {pickup.pickup.orion}
                                </p>
                                {pickup.notes && (
                                    <p className="text-sm whitespace-pre-line">
                                        {pickup.notes}
                                    </p>
                                )}
                                <h3 className="font-semibold">
                                    Bukti pickup & dokumen
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {pickup.attachments.map((a) => (
                                        <Button
                                            key={a.id}
                                            variant="outline"
                                            asChild
                                        >
                                            <a
                                                href={portal.attachment.url(
                                                    a.id,
                                                    {
                                                        query: selection,
                                                    },
                                                )}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                {a.kind === 'signature'
                                                    ? 'Tanda tangan'
                                                    : 'Foto pickup'}
                                            </a>
                                        </Button>
                                    ))}
                                    {pickup.manifests.map((m) =>
                                        ['pdf', 'xlsx'].map((format) => (
                                            <Button
                                                key={`${m.id}-${format}`}
                                                variant="outline"
                                                asChild
                                            >
                                                <a
                                                    href={portal.download.url(
                                                        {
                                                            manifest: m.id,
                                                            format,
                                                        },
                                                        { query: selection },
                                                    )}
                                                >
                                                    <FileDown aria-hidden="true" />
                                                    {format.toUpperCase()} v
                                                    {m.revision}
                                                </a>
                                            </Button>
                                        )),
                                    )}
                                    {pickup.manifests.length === 0 && (
                                        <p className="text-sm text-muted-foreground">
                                            Rekap PDF/Excel belum tersedia.
                                        </p>
                                    )}
                                </div>
                                <h3 className="font-semibold">
                                    Daftar resi ({pickup.shipments.total})
                                </h3>
                                <section className="overflow-hidden rounded-md border">
                                    <ShipmentRows
                                        rows={pickup.shipments.data}
                                        onShipment={openShipment}
                                    />
                                    <PageLinks
                                        page={pickup.shipments}
                                        onPage={(page) =>
                                            openPickup(pickup.pickup.id, page)
                                        }
                                    />
                                </section>
                            </>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </PortalFrame>
    );
}

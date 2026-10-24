import { Head, Link, router, useForm } from '@inertiajs/react';
import { useState } from 'react';
import {
    ArrowUpRight,
    CheckCheck,
    ChevronLeft,
    ChevronRight,
    CircleHelp,
    Layers3,
    MapPin,
    Package,
    RefreshCw,
    Scale,
    Truck,
    Users,
    Wallet,
    Undo2,
    XCircle,
} from 'lucide-react';
import CustomerPicker from '@/components/customer-picker';
import JneWorkspaceMetrics from '@/components/jne-workspace-metrics';
import {
    CustomerServerSummary,
    CustomerComparison,
    CustomerPendingAges,
    jneServerLabels,
} from '@/components/jne-customer-overview';
import PageContainer from '@/components/page-container';
import JneShipmentStatus from '@/components/jne-shipment-status';
import {
    CustomerDailyChart,
    CustomerRanking,
    dashboardMoney as money,
    dashboardNumber as number,
} from '@/components/jne-customer-charts';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import * as routes from '@/routes/jne-monitoring';
import * as aliases from '@/routes/jne-shipper-aliases';
import {
    jneTimestamp,
    matchLabels,
    trackingLabels,
} from '@/lib/jne-monitoring';
import type {
    CustomerDashboardFilters,
    CustomerDashboardProps,
} from '@/types/jne-customer-dashboard';

export default function JneCustomerDashboard({
    filters,
    selectedCustomer,
    timezone,
    summary,
    daily,
    destinations,
    services,
    statuses,
    shipments,
    servers,
    ages,
    comparison,
    selectedDestination,
}: CustomerDashboardProps) {
    const form = useForm(filters);
    const [customer, setCustomer] = useState(selectedCustomer);
    const [networkError, setNetworkError] = useState(false);
    const visit = (patch: Partial<CustomerDashboardFilters> = {}) =>
        router.get(
            routes.customerDashboard.url(),
            { ...filters, ...patch },
            { preserveScroll: true, preserveState: false },
        );
    const knownAmount = summary.amount_known === summary.shipments;
    return (
        <PageContainer className="flex flex-col gap-4 space-y-0 py-4">
            <Head title="Dashboard customer" />
            <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-col gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Dashboard customer
                    </h1>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                        {selectedCustomer
                            ? `${selectedCustomer.customer_code ? `${selectedCustomer.customer_code} · ` : ''}${selectedCustomer.name}`
                            : 'Seluruh customer dan resi yang belum terpetakan'}{' '}
                        · volume, tujuan, layanan, dan amount dari report APEX.
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Snapshot terakhir:{' '}
                        {summary.last_observed_at
                            ? jneTimestamp(summary.last_observed_at, timezone)
                            : 'Belum tersedia'}{' '}
                        · WIB
                    </p>
                </div>
                <Button
                    variant="outline"
                    className="min-h-11 shrink-0"
                    disabled={form.processing}
                    onClick={() => router.reload()}
                >
                    <RefreshCw aria-hidden="true" />
                    Segarkan data
                </Button>
            </header>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Pilih customer dan periode
                    </CardTitle>
                    <CardDescription>
                        Periode mengikuti tanggal kirim, bukan tanggal penarikan
                        report.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form
                        className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-6"
                        onSubmit={(event) => {
                            event.preventDefault();
                            setNetworkError(false);
                            form.get(routes.customerDashboard.url(), {
                                preserveState: false,
                                preserveScroll: true,
                                onNetworkError: () => {
                                    setNetworkError(true);
                                    return false;
                                },
                            });
                        }}
                    >
                        <div className="flex min-w-0 flex-col gap-2 xl:col-span-2">
                            <Label htmlFor="dashboard-customer">Customer</Label>
                            <CustomerPicker
                                selected={customer}
                                allowClear
                                triggerId="dashboard-customer"
                                onSelect={(value) => {
                                    setCustomer(
                                        value
                                            ? {
                                                  id: value.id,
                                                  name: value.name,
                                                  customer_code:
                                                      value.customer_code ??
                                                      null,
                                              }
                                            : null,
                                    );
                                    form.setData(
                                        'customer_id',
                                        value?.id ?? null,
                                    );
                                    form.setData('mapping', 'all');
                                }}
                            />
                            <p className="text-xs text-destructive">
                                {form.errors.customer_id}
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="dashboard-from">Tanggal awal</Label>
                            <Input
                                id="dashboard-from"
                                type="date"
                                className="min-h-11"
                                required
                                value={form.data.date_from}
                                onChange={(event) =>
                                    form.setData(
                                        'date_from',
                                        event.target.value,
                                    )
                                }
                                aria-invalid={!!form.errors.date_from}
                            />
                            <p className="text-xs text-destructive">
                                {form.errors.date_from}
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="dashboard-thru">
                                Tanggal akhir
                            </Label>
                            <Input
                                id="dashboard-thru"
                                type="date"
                                className="min-h-11"
                                required
                                min={form.data.date_from}
                                value={form.data.date_thru}
                                onChange={(event) =>
                                    form.setData(
                                        'date_thru',
                                        event.target.value,
                                    )
                                }
                                aria-invalid={!!form.errors.date_thru}
                            />
                            <p className="text-xs text-destructive">
                                {form.errors.date_thru}
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="dashboard-mapping">
                                Pemetaan customer
                            </Label>
                            <select
                                id="dashboard-mapping"
                                className="h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm shadow-xs"
                                value={form.data.mapping}
                                onChange={(event) => {
                                    form.setData('mapping', event.target.value);
                                    if (event.target.value !== 'all') {
                                        form.setData('customer_id', null);
                                        setCustomer(null);
                                    }
                                }}
                            >
                                <option value="all">Semua pemetaan</option>
                                <option value="matched">
                                    Customer terkonfirmasi
                                </option>
                                <option value="unmapped">
                                    Belum terpetakan
                                </option>
                                <option value="ambiguous">
                                    Pemetaan ambigu
                                </option>
                                <option value="candidate">
                                    Kandidat customer
                                </option>
                                <option value="conflict">
                                    Bukti bertentangan
                                </option>
                            </select>
                            <p className="text-xs text-destructive">
                                {form.errors.mapping}
                            </p>
                        </div>
                        <Button
                            type="submit"
                            className="min-h-11"
                            disabled={form.processing}
                        >
                            {form.processing ? 'Memuat…' : 'Terapkan filter'}
                        </Button>
                    </form>
                    {networkError && (
                        <p
                            role="alert"
                            className="mt-3 text-sm text-destructive"
                        >
                            Data gagal dimuat. Periksa koneksi lalu coba
                            kembali.
                        </p>
                    )}
                    {(filters.service ||
                        filters.destination ||
                        filters.status) && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                                Rincian aktif:
                            </span>
                            {filters.service && (
                                <Badge variant="secondary">
                                    Layanan {filters.service}
                                </Badge>
                            )}
                            {filters.destination && (
                                <Badge
                                    variant="secondary"
                                    className="max-w-full break-words whitespace-normal"
                                >
                                    Tujuan{' '}
                                    {selectedDestination ?? filters.destination}
                                </Badge>
                            )}
                            {filters.status && (
                                <Badge variant="secondary">
                                    {trackingLabels[filters.status]}
                                </Badge>
                            )}
                            <Button
                                size="sm"
                                variant="ghost"
                                className="min-h-11"
                                onClick={() =>
                                    visit({
                                        service: '',
                                        destination: '',
                                        status: '',
                                    })
                                }
                            >
                                Hapus rincian
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            <CustomerServerSummary
                servers={servers}
                selected={filters.server}
                onSelect={(server) => visit({ server })}
            />

            <JneWorkspaceMetrics
                items={[
                    {
                        label: 'Total resi',
                        value: summary.shipments,
                        detail: `${summary.customers} customer terkonfirmasi · ${summary.accounts} account JNE`,
                        icon: Package,
                    },
                    {
                        label: 'Amount APEX',
                        value: money(summary.amount),
                        detail: `${summary.amount_known}/${summary.shipments} resi memiliki amount${knownAmount ? '' : ' · total parsial'}`,
                        icon: Wallet,
                    },
                    {
                        label: 'Berhasil terkirim',
                        value: summary.delivered,
                        detail: `${summary.shipments ? ((summary.delivered / summary.shipments) * 100).toFixed(1) : 0}% dari resi terfilter`,
                        icon: CheckCheck,
                    },
                    {
                        label: 'Belum selesai',
                        value: summary.active,
                        detail: `${number(summary.active_7_plus)} resi berumur 7+ hari`,
                        icon: Truck,
                    },
                    {
                        label: 'Berat kiriman',
                        value:
                            summary.weight_kg === null
                                ? 'Tidak tersedia'
                                : `${number(summary.weight_kg)} kg`,
                        detail: `${summary.weight_known}/${summary.shipments} resi memiliki berat`,
                        icon: Scale,
                    },
                    {
                        label: 'Jumlah koli',
                        value: summary.quantity_known
                            ? summary.quantity
                            : 'Tidak tersedia',
                        detail: `${summary.quantity_known}/${summary.shipments} resi memiliki jumlah koli`,
                        icon: Layers3,
                    },
                    {
                        label: 'Dikembalikan',
                        value: summary.returned,
                        detail: 'Status retur dari JNE',
                        icon: Undo2,
                    },
                    {
                        label: 'Dibatalkan',
                        value: summary.cancelled,
                        detail: 'Status batal dari JNE',
                        icon: XCircle,
                    },
                ]}
            />

            {(summary.unmapped > 0 || summary.undated > 0) && (
                <Alert>
                    <CircleHelp aria-hidden="true" />
                    <AlertTitle>Cakupan data</AlertTitle>
                    <AlertDescription>
                        <div className="flex flex-col gap-2">
                            <p>
                                {number(summary.unmapped)} resi belum
                                terkonfirmasi customernya
                                {summary.ambiguous
                                    ? `, termasuk ${summary.ambiguous} dengan pemetaan ambigu`
                                    : ''}
                                . {summary.candidates ?? 0} kandidat ·{' '}
                                {summary.conflicts ?? 0} konflik.
                                {summary.undated > 0 &&
                                    ` Ada ${number(summary.undated)} resi tanpa tanggal kirim yang tidak masuk angka periode ini.`}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {summary.unmapped > 0 && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="min-h-11"
                                        onClick={() =>
                                            visit({
                                                customer_id: null,
                                                mapping: 'unmapped',
                                            })
                                        }
                                    >
                                        <Users aria-hidden="true" />
                                        Periksa belum terpetakan
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="min-h-11"
                                    asChild
                                >
                                    <Link href={aliases.index.url()}>
                                        Kelola nama pengirim
                                        <ArrowUpRight aria-hidden="true" />
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            <p className="text-sm text-muted-foreground">
                {number(summary.mapped)} AWB memiliki customer terkonfirmasi ·{' '}
                {number(summary.pickup_matched ?? 0)} AWB memiliki pickup
                terkonfirmasi. Kecocokan kategori POP dan kelengkapan
                pengumpulan report diperiksa terpisah di{' '}
                <Link className="underline" href={routes.reconciliation.url()}>
                    rekonsiliasi POP
                </Link>
                .
            </p>

            {summary.shipments === 0 && (
                <Alert>
                    <Package aria-hidden="true" />
                    <AlertTitle>Belum ada kiriman pada pilihan ini</AlertTitle>
                    <AlertDescription>
                        Ubah customer, perluas periode, atau periksa pemetaan
                        nama pengirim. Grafik di bawah menampilkan kalender
                        periode yang dipilih.
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid items-start gap-4 xl:grid-cols-3">
                <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
                    <CustomerDailyChart
                        key={JSON.stringify(filters)}
                        days={daily}
                    />
                    <CustomerComparison comparison={comparison} />
                </div>
                <div className="flex min-w-0 flex-col gap-4">
                    <Card className="min-w-0">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Truck
                                    aria-hidden="true"
                                    className="size-4 text-primary"
                                />
                                Status pengiriman
                            </CardTitle>
                            <CardDescription>
                                Status terbaru untuk resi dalam periode
                                terpilih.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            {statuses.map((row) => (
                                <Button
                                    key={row.label}
                                    variant="ghost"
                                    className="h-auto min-h-11 justify-between gap-3 px-0 py-2"
                                    onClick={() => visit({ status: row.label })}
                                >
                                    <JneShipmentStatus status={row.label} />
                                    <span className="tabular-nums">
                                        {number(row.shipments)}
                                    </span>
                                </Button>
                            ))}
                            <div className="mt-2 grid grid-cols-2 gap-3 border-t pt-4">
                                <div>
                                    <p className="text-xs text-muted-foreground">
                                        Rata-rata waktu kirim
                                    </p>
                                    <p className="mt-1 text-xl font-semibold tabular-nums">
                                        {summary.average_delivery_hours === null
                                            ? 'Tidak tersedia'
                                            : `${number(Math.round((summary.average_delivery_hours / 24) * 10) / 10)} hari`}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">
                                        Rata-rata amount
                                    </p>
                                    <p className="mt-1 font-semibold break-words tabular-nums">
                                        {money(summary.average_amount)}
                                    </p>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Waktu kirim dari tanggal entry sampai
                                penyerahan, tersedia pada{' '}
                                {summary.delivery_known}/{summary.delivered}{' '}
                                resi terkirim. Rata-rata amount hanya memakai
                                nilai yang tersedia.
                            </p>
                        </CardContent>
                    </Card>
                    <CustomerPendingAges
                        summary={summary}
                        ages={ages}
                        selected={filters.age}
                        onSelect={(age) => visit({ age })}
                    />
                </div>
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-2">
                <CustomerRanking
                    title="Tujuan pengiriman"
                    kind="destination"
                    rows={destinations}
                    total={summary.shipments}
                    onSelect={(destination) => visit({ destination })}
                />
                <CustomerRanking
                    title="Layanan yang digunakan"
                    kind="service"
                    rows={services}
                    total={summary.shipments}
                    onSelect={(service) => visit({ service })}
                />
            </div>

            <p className="text-xs text-muted-foreground">
                {number(summary.destination_named)}/{number(summary.shipments)}{' '}
                resi memiliki referensi nama daerah ·{' '}
                {number(summary.destination_count)} kode tujuan. Nama mengikuti
                lokasi penyerahan pada report JNE; beberapa nama lokasi untuk
                kode yang sama ditampilkan bersama.
            </p>

            <Card className="min-w-0">
                <CardHeader>
                    <div className="flex flex-wrap justify-between gap-3">
                        <div className="flex flex-col gap-2">
                            <CardTitle className="flex items-center gap-2">
                                <Layers3
                                    aria-hidden="true"
                                    className="size-4 text-primary"
                                />
                                Detail resi
                            </CardTitle>
                            <CardDescription>
                                Terbaru berdasarkan tanggal kirim ·{' '}
                                {number(shipments.total)} resi.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="h-fit">
                            Satu snapshot terbaru per account + AWB
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="flex min-w-0 flex-col gap-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Resi / customer</TableHead>
                                <TableHead>Tanggal kirim</TableHead>
                                <TableHead>Tujuan JNE</TableHead>
                                <TableHead>Layanan</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">
                                    Amount APEX
                                </TableHead>
                                <TableHead className="text-right">
                                    Berat
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {shipments.data.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <Link
                                            href={routes.show.url(row.id)}
                                            className="inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline"
                                        >
                                            {row.awb}
                                            <ArrowUpRight
                                                aria-hidden="true"
                                                className="size-3"
                                            />
                                        </Link>
                                        <Badge
                                            variant="secondary"
                                            className="ml-2"
                                        >
                                            {jneServerLabels[row.server] ??
                                                'Lainnya'}
                                        </Badge>
                                        <p
                                            className="max-w-60 truncate text-xs text-muted-foreground"
                                            title={
                                                row.customer_name ??
                                                'Belum terpetakan'
                                            }
                                        >
                                            {row.customer_name ??
                                                'Belum terpetakan'}{' '}
                                            · {row.customer_account}
                                        </p>
                                        {row.customer_match_status !==
                                            'MATCHED' && (
                                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                                {matchLabels[
                                                    row.customer_match_status
                                                ] ?? 'Belum dikonfirmasi'}
                                            </p>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {jneTimestamp(row.entry_at, timezone)}
                                    </TableCell>
                                    <TableCell>
                                        <span className="flex items-center gap-2">
                                            <MapPin
                                                aria-hidden="true"
                                                className="size-3 text-muted-foreground"
                                            />
                                            <span
                                                title={
                                                    row.destination ?? undefined
                                                }
                                                className="max-w-56 whitespace-normal"
                                            >
                                                {row.destination_name ??
                                                    'Nama daerah belum tersedia'}
                                                {!row.destination_name &&
                                                row.destination ? (
                                                    <span className="block text-xs text-muted-foreground">
                                                        {row.destination}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        {row.service ?? 'Tidak tersedia'}
                                    </TableCell>
                                    <TableCell>
                                        <JneShipmentStatus
                                            status={row.tracking_status}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {money(row.amount)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {row.weight_kg === null
                                            ? 'Tidak tersedia'
                                            : `${number(row.weight_kg)} kg`}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {shipments.data.length === 0 && (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="h-24 text-center text-muted-foreground"
                                    >
                                        Tidak ada resi yang sesuai filter.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                            {shipments.from ?? 0}–{shipments.to ?? 0} dari{' '}
                            {number(shipments.total)}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                className="size-11"
                                aria-label="Halaman sebelumnya"
                                disabled={shipments.current_page <= 1}
                                onClick={() =>
                                    router.get(
                                        routes.customerDashboard.url(),
                                        {
                                            ...filters,
                                            page: shipments.current_page - 1,
                                        },
                                        { preserveScroll: true },
                                    )
                                }
                            >
                                <ChevronLeft aria-hidden="true" />
                            </Button>
                            <span className="text-xs tabular-nums">
                                {shipments.current_page}/{shipments.last_page}
                            </span>
                            <Button
                                variant="outline"
                                size="icon"
                                className="size-11"
                                aria-label="Halaman berikutnya"
                                disabled={
                                    shipments.current_page >=
                                    shipments.last_page
                                }
                                onClick={() =>
                                    router.get(
                                        routes.customerDashboard.url(),
                                        {
                                            ...filters,
                                            page: shipments.current_page + 1,
                                        },
                                        { preserveScroll: true },
                                    )
                                }
                            >
                                <ChevronRight aria-hidden="true" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <details className="rounded-lg border px-4 text-xs leading-relaxed text-muted-foreground">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-foreground">
                    Tentang data dashboard
                </summary>
                <div className="flex flex-col gap-2 pb-4">
                    <p>
                        Amount adalah penjumlahan kolom AMOUNT dari APEX untuk
                        seluruh status, termasuk dibatalkan. Angka ini bukan
                        tagihan final atau pembayaran diterima. Nama tujuan
                        memakai lokasi penyerahan yang tercatat pada report JNE.
                        Untuk satu kode dengan beberapa nama lokasi, semua
                        varian ditampilkan; kode asli tetap disimpan untuk
                        penelusuran.
                    </p>
                    <p>
                        Resi dikelompokkan melalui pemetaan nama pengirim ke
                        customer. Penarikan berulang memperbarui snapshot, tanpa
                        menambah hitungan resi yang sama pada account yang sama.
                        Resi tanpa tanggal kirim tidak masuk agregat periode.
                        Server resi ditentukan dari awalan AWB: 0101 untuk
                        Server PM, 0166 untuk Server Puman, serta CGKEC/CSS01
                        untuk CSS/Orion. Awalan lain masuk Lainnya.
                    </p>
                </div>
            </details>
        </PageContainer>
    );
}

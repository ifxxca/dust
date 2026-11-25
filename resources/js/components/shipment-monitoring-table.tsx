import { Link } from "@inertiajs/react";
import { ArrowUpRight } from "lucide-react";
import { CustomerLinkage, ShipmentSla } from "@/components/shipment-monitoring-ui";
import { useState } from "react";
import ShipmentStatus from "@/components/jne-shipment-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { attentionReasons, slaDuration, type TrackingFilters } from "@/lib/shipment-monitoring";
import { jneTimestamp } from "@/lib/jne-monitoring";
import { show } from "@/routes/shipment-monitoring";
import type { TrackingShipment } from "@/types/shipment-monitoring";

export default function MonitoringTable({
    rows,
    timezone,
    attention = false,
    filters = {},
    page = 1,
    busy = false,
}: {
    rows: TrackingShipment[];
    timezone: string;
    attention?: boolean;
    filters?: Partial<TrackingFilters>;
    page?: number;
    busy?: boolean;
}) {
    const [details, setDetails] = useState(false);
    const hasDuration = (row: TrackingShipment) =>
        row.sla_variance !== null &&
        row.sla_variance !== undefined &&
        !["EXCLUDED", "RETURN"].includes(row.sla_status ?? "");
    const href = (id: number) =>
        show(id, {
            query: {
                ...filters,
                back: attention ? "attention" : "shipments",
                return_page: page,
            },
        });
    const reasons = (row: TrackingShipment) => (
        <ul className="space-y-1">
            {attentionReasons(row).map((reason) => (
                <li key={reason.label} className="text-xs">
                    <span className="text-muted-foreground">{reason.group}: </span>
                    {reason.label}
                </li>
            ))}
        </ul>
    );
    return (
        <section
            aria-label={attention ? "Daftar resi perlu perhatian" : "Daftar resi"}
            aria-busy={busy}
            className="min-w-0 overflow-hidden rounded-xl border bg-card"
        >
            <div className="hidden justify-end border-b px-3 py-1 md:flex">
                <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={details}
                    onClick={() => setDetails(!details)}
                >
                    {details ? "Sembunyikan kolom rinci" : "Tampilkan kolom rinci"}
                </Button>
            </div>
            <div className="md:hidden">
                {rows.length ? (
                    <ul className="divide-y">
                        {rows.map((row) => (
                            <li key={row.id} className="flex min-w-0 flex-col gap-3 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <Link
                                        href={href(row.id)}
                                        className="font-mono font-semibold break-all text-primary underline-offset-4 hover:underline"
                                        translate="no"
                                    >
                                        {row.awb}
                                    </Link>
                                    <ShipmentStatus status={row.tracking_status} />
                                </div>
                                <CustomerLinkage shipment={row} />
                                <div className="flex flex-wrap items-center gap-2">
                                    <ShipmentSla status={row.native_sla_grade} />
                                    {row.potential_overdue && (
                                        <div className="mt-1">
                                            <ShipmentSla status="POTENTIAL_OVERDUE" />
                                        </div>
                                    )}
                                    {details && hasDuration(row) && (
                                        <span className="text-xs">{slaDuration(row)}</span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {row.service || "Layanan belum tersedia"} ·{" "}
                                    {row.destination || "Destinasi belum tersedia"} · Aging{" "}
                                    {row.aging_days ?? "—"} · Ongoing {row.ongoing_days ?? "—"} ·
                                    ETD {row.etd_days ?? "—"} (nilai sumber)
                                </p>
                                <p className="text-sm break-words">
                                    <span className="text-muted-foreground">
                                        Pengirim (report):{" "}
                                    </span>
                                    {row.shipper_name || "Tidak tersedia"}
                                </p>
                                {attention && reasons(row)}
                                <dl className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="col-span-2">
                                        <dt className="text-muted-foreground">Tanggal Entry AWB</dt>
                                        <dd className="mt-1 font-medium">
                                            {row.entry_at
                                                ? jneTimestamp(row.entry_at, timezone)
                                                : "Tidak tersedia"}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-muted-foreground">
                                            Update status sumber
                                        </dt>
                                        <dd className="mt-1">
                                            {row.source_status_at
                                                ? jneTimestamp(row.source_status_at, timezone)
                                                : "Tidak tersedia"}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-muted-foreground">Acuan pengamatan</dt>
                                        <dd className="mt-1">
                                            {jneTimestamp(row.observed_at, timezone)}
                                        </dd>
                                    </div>
                                </dl>
                                <Button asChild variant="outline" className="min-h-11 self-start">
                                    <Link href={href(row.id)} aria-label={`Lihat resi ${row.awb}`}>
                                        Lihat detail
                                        <ArrowUpRight aria-hidden="true" />
                                    </Link>
                                </Button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Tidak ada resi yang sesuai. Ubah atau reset filter.
                    </p>
                )}
            </div>
            <div className="hidden md:block">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>AWB</TableHead>
                            <TableHead>Tanggal Entry AWB</TableHead>
                            <TableHead>Customer / Pengirim (report)</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Native SLA / Indikasi</TableHead>
                            {details && (
                                <>
                                    <TableHead>Layanan / Destinasi</TableHead>
                                    <TableHead>Aging / Ongoing / ETD</TableHead>
                                </>
                            )}
                            {attention && <TableHead>Perlu diperiksa</TableHead>}
                            {details && (
                                <>
                                    <TableHead>Update status sumber</TableHead>
                                    <TableHead>Acuan pengamatan</TableHead>
                                </>
                            )}
                            <TableHead>
                                <span className="sr-only">Aksi</span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {!rows.length && (
                            <TableRow>
                                <TableCell
                                    colSpan={(attention ? 7 : 6) + (details ? 4 : 0)}
                                    className="py-12 text-center text-muted-foreground"
                                >
                                    Tidak ada resi yang sesuai. Ubah atau reset filter.
                                </TableCell>
                            </TableRow>
                        )}
                        {rows.map((row) => (
                            <TableRow key={row.id}>
                                <TableCell>
                                    <Link
                                        href={href(row.id)}
                                        translate="no"
                                        className="font-mono font-medium text-primary underline-offset-4 hover:underline"
                                    >
                                        {row.awb}
                                    </Link>
                                </TableCell>
                                <TableCell className="text-xs whitespace-normal">
                                    {row.entry_at
                                        ? jneTimestamp(row.entry_at, timezone)
                                        : "Tidak tersedia"}
                                </TableCell>
                                <TableCell className="max-w-64 min-w-48 text-sm whitespace-normal">
                                    <CustomerLinkage shipment={row} />
                                    <p className="mt-1 text-xs break-words">
                                        <span className="text-muted-foreground">Pengirim: </span>
                                        {row.shipper_name || "Tidak tersedia"}
                                    </p>
                                </TableCell>
                                <TableCell>
                                    <ShipmentStatus status={row.tracking_status} />
                                    {row.freshness === "stale" && (
                                        <Badge
                                            variant="outline"
                                            className="mt-1 block w-fit text-warning"
                                        >
                                            Data belum diperbarui
                                        </Badge>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <ShipmentSla status={row.native_sla_grade} />
                                    {row.potential_overdue && (
                                        <div className="mt-1">
                                            <ShipmentSla status="POTENTIAL_OVERDUE" />
                                        </div>
                                    )}
                                    {details && hasDuration(row) && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {slaDuration(row)}
                                        </p>
                                    )}
                                </TableCell>
                                {details && (
                                    <>
                                        <TableCell className="text-xs">
                                            {row.service ?? "—"}
                                            <p className="text-muted-foreground">
                                                {row.destination ?? "—"}
                                            </p>
                                        </TableCell>
                                        <TableCell className="text-xs tabular-nums">
                                            {row.aging_days ?? "—"} / {row.ongoing_days ?? "—"} /{" "}
                                            {row.etd_days ?? "—"}
                                        </TableCell>
                                    </>
                                )}
                                {attention && (
                                    <TableCell className="max-w-64 min-w-40 whitespace-normal">
                                        {reasons(row)}
                                    </TableCell>
                                )}
                                {details && (
                                    <>
                                        <TableCell className="text-xs whitespace-normal">
                                            {row.source_status_at
                                                ? jneTimestamp(row.source_status_at, timezone)
                                                : "Tidak tersedia"}
                                        </TableCell>
                                        <TableCell className="text-xs whitespace-normal">
                                            {jneTimestamp(row.observed_at, timezone)}
                                        </TableCell>
                                    </>
                                )}
                                <TableCell>
                                    <Button asChild variant="ghost" size="icon" className="size-11">
                                        <Link
                                            href={href(row.id)}
                                            aria-label={`Lihat resi ${row.awb}`}
                                        >
                                            <ArrowUpRight aria-hidden="true" />
                                        </Link>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </section>
    );
}

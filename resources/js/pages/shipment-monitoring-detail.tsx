import { Head, Link, router } from "@inertiajs/react";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { DataTablePagination } from "@/components/data-table";
import PageHeader from "@/components/page-header";
import PageContainer from "@/components/page-container";
import ShipmentStatus from "@/components/jne-shipment-status";
import { ShipmentSla } from "@/components/shipment-monitoring-ui";
import { attentionReasons, slaDuration } from "@/lib/shipment-monitoring";
import SecondaryDisclosure from "@/components/secondary-disclosure";
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
import { jneTimestamp } from "@/lib/jne-monitoring";
import { cn } from "@/lib/utils";
import { index, show } from "@/routes/shipment-monitoring";
import type { JnePage } from "@/types/jne";
import type { TrackingShipment, TrackingHistory } from "@/types/shipment-monitoring";

type Source = {
    id: number;
    report_job_id: number;
    source_row: number;
    source: string | null;
    shipper_name: string | null;
    consignee_name: string | null;
    checksum: string | null;
    delivered_at: string | null;
    raw_data: Record<string, unknown> | null;
    source_evidence: unknown;
    service: string | null;
    destination_name: string | null;
    entry_at: string | null;
    observed_at: string | null;
    source_status_at: string | null;
};

export default function ShipmentMonitoringDetail({
    shipment,
    source,
    history,
    historyMode,
    timezone,
    returnTo,
    context,
    journey = [],
}: {
    shipment: TrackingShipment;
    source: Source | null;
    history: JnePage<TrackingHistory>;
    historyMode: "changes" | "all";
    timezone: string;
    returnTo: string;
    context: Record<string, string | number>;
    journey?: { label: string; field: string; at: string }[];
}) {
    const [section, setSection] = useState("history");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const historyQuery = (page: number, mode = historyMode) =>
        router.get(
            show.url(shipment.id),
            { ...context, history: mode, page },
            {
                preserveScroll: true,
                preserveState: true,
                onStart: () => {
                    setBusy(true);
                    setError("");
                },
                onFinish: () => setBusy(false),
                onNetworkError: () => {
                    setError("Riwayat belum dimuat. Periksa koneksi lalu coba lagi.");
                    return false;
                },
                onHttpException: (response) => {
                    if (response.status >= 500) {
                        setError("Riwayat belum dapat dimuat. Coba lagi.");
                        return false;
                    }
                },
            },
        );
    const information = [
        ["Pengirim JNE", source?.shipper_name || "Tidak tersedia"],
        ["Penerima", source?.consignee_name || "Tidak tersedia"],
        [
            "Customer",
            shipment.customer
                ? [shipment.customer.customer_code, shipment.customer.name]
                      .filter(Boolean)
                      .join(" · ")
                : "Belum Terhubung",
        ],
        ["Referensi pickup", shipment.pickup_reference ?? "Tidak tersedia"],
        ["Layanan", source?.service || "Tidak tersedia"],
        [
            "Asal sumber",
            typeof source?.raw_data?.ORIGIN === "string" && source.raw_data.ORIGIN.trim()
                ? source.raw_data.ORIGIN
                : "Tidak tersedia",
        ],
        [
            "Tanggal Entry AWB",
            source?.entry_at ? jneTimestamp(source.entry_at, timezone) : "Tidak tersedia",
        ],
        ["Destinasi sumber", source?.destination_name || shipment.destination || "Tidak tersedia"],
        ["Account sumber", shipment.customer_account || "Tidak tersedia"],
    ];
    const times = [
        [
            "Update status sumber",
            shipment.source_status_at
                ? jneTimestamp(shipment.source_status_at, timezone)
                : "Tidak tersedia",
        ],
        ["Acuan pengamatan", jneTimestamp(shipment.observed_at, timezone)],
        ["Report diterima", jneTimestamp(shipment.received_at, timezone)],
        ["Pemantauan", shipment.terminal ? "Selesai" : "Masih Dipantau"],
        ...(source?.delivered_at
            ? [["Waktu delivered", jneTimestamp(source.delivered_at, timezone)]]
            : []),
    ];
    return (
        <PageContainer className="flex min-w-0 flex-col gap-4 space-y-0 py-4 shipment-monitoring-surface">
            <Head title={`Detail Resi ${shipment.awb}`} />
            <Button asChild variant="outline" className="min-h-11 self-start">
                <Link href={returnTo || index.url()}>
                    <ArrowLeft aria-hidden="true" />
                    Kembali
                </Link>
            </Button>
            <PageHeader
                title={
                    <span translate="no" className="break-all">
                        {shipment.awb}
                    </span>
                }
                description="Status terakhir dari report JNE."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <ShipmentStatus status={shipment.tracking_status} />
                        {!shipment.customer && <Badge variant="secondary">Belum Terhubung</Badge>}
                    </div>
                }
            />
            <section
                aria-label="Evaluasi SLA"
                className="flex flex-col gap-3 rounded-xl border bg-card p-4"
            >
                <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-semibold">Penilaian SLA</h2>
                    <ShipmentSla status={shipment.native_sla_grade} />
                    <span className="text-sm">{slaDuration(shipment)}</span>
                </div>
                <p className="text-sm">
                    AGING {shipment.aging_days ?? "—"} · AGING_ONGOING{" "}
                    {shipment.ongoing_days ?? "—"} · ETD {shipment.etd_days ?? "—"} · Acuan{" "}
                    {jneTimestamp(shipment.observed_at, timezone)}
                </p>
                {shipment.potential_overdue && (
                    <div className="flex flex-col gap-2">
                        <div>
                            <ShipmentSla status="POTENTIAL_OVERDUE" />
                        </div>
                        <p className="text-sm text-muted-foreground">{shipment.potential_reason}</p>
                    </div>
                )}
                {shipment.sla_reason && (
                    <p className="text-sm text-muted-foreground">{shipment.sla_reason}</p>
                )}
                {attentionReasons(shipment).length > 0 && (
                    <ul className="flex flex-col gap-1 text-sm">
                        {attentionReasons(shipment).map((reason) => (
                            <li key={reason.label}>
                                {reason.group}: {reason.label}
                            </li>
                        ))}
                    </ul>
                )}
                <SecondaryDisclosure title="Dasar penilaian & bukti sumber">
                    <p>
                        Native SLA memakai CARRER dan tanda SLA sumber secara independen dari status
                        pengiriman. Suffix became bukan penentu delivered. Indikasi internal
                        membandingkan AGING_ONGOING dengan ETD; satuan layanan dan kalender belum
                        memastikan deadline atau jumlah hari keterlambatan aktual.
                    </p>
                    <p>
                        AGING: {shipment.aging_days ?? "—"} · AGING_ONGOING:{" "}
                        {shipment.ongoing_days ?? "—"} · SLA sumber: {shipment.source_sla ?? "—"} ·
                        CARRER: {shipment.source_carrer ?? "—"}
                    </p>
                </SecondaryDisclosure>
            </section>
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <section
                    aria-labelledby="shipment-info"
                    className="min-w-0 rounded-xl border bg-card p-4"
                >
                    <h2 id="shipment-info" className="mb-4 font-semibold">
                        Informasi Resi
                    </h2>
                    <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] gap-x-4 gap-y-3 text-sm">
                        {information.map(([label, value]) => (
                            <div key={label} className="contents">
                                <dt className="text-muted-foreground">{label}</dt>
                                <dd className="break-words">{value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
                <section
                    aria-labelledby="current-status"
                    className="min-w-0 rounded-xl border bg-card p-4"
                >
                    <h2 id="current-status" className="mb-3 font-semibold">
                        Status Terkini
                    </h2>
                    <p className="mb-4 text-sm break-words">
                        {shipment.status_web ||
                            shipment.status_pod ||
                            "Status sumber tidak tersedia"}
                    </p>
                    <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] gap-x-4 gap-y-3 text-sm">
                        {times.map(([label, value]) => (
                            <div key={label} className="contents">
                                <dt className="text-muted-foreground">{label}</dt>
                                <dd className="break-words">{value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            </div>
            <SecondaryDisclosure title="Perjalanan dari bukti sumber">
                {journey.length > 0 ? (
                    <ol className="flex flex-col gap-3">
                        {journey.map((event) => (
                            <li
                                key={event.field}
                                className="flex flex-wrap items-start justify-between gap-2 border-b pb-2 last:border-0"
                            >
                                <span title={event.field}>{event.label}</span>
                                <time dateTime={event.at} className="text-xs text-muted-foreground">
                                    {jneTimestamp(event.at, timezone)}
                                </time>
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className="text-muted-foreground">
                        Belum ada event manifest atau pengantaran bertanggal pada report ini.
                    </p>
                )}
                <p className="text-xs text-muted-foreground">
                    Hanya event bertanggal yang tersedia pada report, bukan riwayat tracking
                    lengkap.
                </p>
            </SecondaryDisclosure>
            <nav aria-label="Isi detail resi" className="flex flex-wrap gap-2 border-b">
                {[
                    ["history", "Riwayat Status"],
                    ["source", "Bukti Sumber"],
                    ["technical", "Informasi Teknis"],
                ].map(([key, label]) => (
                    <Button
                        key={key}
                        variant="ghost"
                        aria-pressed={section === key}
                        onClick={() => setSection(key)}
                        className={cn(
                            "min-h-11 rounded-none border-b-2",
                            section === key
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground",
                        )}
                    >
                        {label}
                    </Button>
                ))}
            </nav>
            {section === "history" && (
                <section aria-labelledby="snapshot-history" className="flex min-w-0 flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 id="snapshot-history" className="font-semibold">
                                Riwayat pengamatan report
                            </h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Snapshot terbaru lebih dahulu; bukan timeline lengkap perjalanan
                                kurir.
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            className="min-h-11"
                            disabled={busy}
                            onClick={() =>
                                historyQuery(1, historyMode === "changes" ? "all" : "changes")
                            }
                        >
                            {historyMode === "changes"
                                ? "Lihat semua bukti"
                                : "Hanya perubahan status"}
                        </Button>
                    </div>
                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    {busy && (
                        <p role="status" className="text-sm text-muted-foreground">
                            Memuat riwayat…
                        </p>
                    )}
                    <div
                        className="min-w-0 overflow-hidden rounded-xl border bg-card"
                        aria-busy={busy}
                    >
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Acuan pengamatan</TableHead>
                                    <TableHead>Status / keterangan sumber</TableHead>
                                    <TableHead className="hidden lg:table-cell">
                                        Update status sumber
                                    </TableHead>
                                    <TableHead className="hidden md:table-cell">
                                        Report diterima
                                    </TableHead>
                                    <TableHead className="hidden md:table-cell">Bukti</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {!history.data.length && (
                                    <TableRow>
                                        <TableCell
                                            colSpan={5}
                                            className="py-10 text-center text-muted-foreground"
                                        >
                                            Tidak ada{" "}
                                            {historyMode === "changes"
                                                ? "perubahan status yang tercatat"
                                                : "bukti report"}
                                            .
                                        </TableCell>
                                    </TableRow>
                                )}
                                {history.data.map((event) => (
                                    <TableRow key={event.id}>
                                        <TableCell className="text-xs whitespace-normal">
                                            {jneTimestamp(event.observed_at, timezone)}
                                        </TableCell>
                                        <TableCell className="max-w-56 whitespace-normal sm:max-w-96">
                                            <ShipmentStatus status={event.tracking_status} />
                                            <p className="mt-1 text-xs break-words">
                                                {event.status_web ||
                                                    event.status_pod ||
                                                    "Status sumber tidak tersedia"}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {event.changes_current
                                                    ? "Mengubah status saat diproses"
                                                    : "Bukti tersimpan; tidak mengganti status saat diproses"}
                                            </p>
                                            <span className="text-xs text-muted-foreground md:hidden">
                                                Report #{event.report_id}, baris {event.source_row}
                                            </span>
                                        </TableCell>
                                        <TableCell className="hidden text-xs lg:table-cell">
                                            {event.source_status_at
                                                ? jneTimestamp(event.source_status_at, timezone)
                                                : "Tidak tersedia"}
                                        </TableCell>
                                        <TableCell className="hidden text-xs md:table-cell">
                                            {jneTimestamp(event.received_at, timezone)}
                                        </TableCell>
                                        <TableCell className="hidden text-xs md:table-cell">
                                            Report #{event.report_id}
                                            <br />
                                            Baris {event.source_row}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <DataTablePagination
                        meta={history}
                        page={history.current_page}
                        itemLabel={historyMode === "changes" ? "perubahan" : "bukti"}
                        onPage={(page) => historyQuery(page)}
                        loading={busy}
                        className="border-t-0 px-0 sm:px-0 [&_button]:min-h-11 [&_button]:min-w-11"
                    />
                </section>
            )}
            {section === "source" && (
                <section
                    aria-labelledby="source-evidence"
                    className="min-w-0 rounded-xl border bg-card p-4"
                >
                    <h2 id="source-evidence" className="mb-4 font-semibold">
                        Bukti Sumber
                    </h2>
                    {source ? (
                        <>
                            <dl className="grid gap-3 text-sm sm:grid-cols-2">
                                <div>
                                    <dt className="text-muted-foreground">Report / sumber</dt>
                                    <dd>
                                        #{source.report_job_id} ·{" "}
                                        {source.source ?? "Tidak tersedia"} · baris{" "}
                                        {source.source_row}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-muted-foreground">Checksum file</dt>
                                    <dd className="font-mono text-xs break-all">
                                        {source.checksum ?? "Tidak tersedia"}
                                    </dd>
                                </div>
                            </dl>
                            <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-muted p-3 text-xs break-all whitespace-pre-wrap">
                                {JSON.stringify(
                                    {
                                        raw_data: source.raw_data,
                                        source_evidence: source.source_evidence,
                                        observed_at: source.observed_at,
                                        source_status_at: source.source_status_at,
                                    },
                                    null,
                                    2,
                                )}
                            </pre>
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Bukti sumber belum tersedia.
                        </p>
                    )}
                </section>
            )}
            {section === "technical" && (
                <section
                    aria-labelledby="technical-info"
                    className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-sm"
                >
                    <h2 id="technical-info" className="font-semibold">
                        Informasi Teknis
                    </h2>
                    <p>
                        Update status sumber adalah waktu kejadian yang tersedia dalam report. Acuan
                        pengamatan memakai waktu snapshot sumber atau fallback waktu report. Report
                        diterima adalah waktu pencatatan lokal; ketiganya tidak saling menggantikan.
                    </p>
                    <p>
                        Bukti yang datang terlambat tetap disimpan tanpa mengganti snapshot yang
                        lebih baru. Riwayat perubahan mencatat perubahan saat pemrosesan; koreksi
                        dapat membuka kembali resi terminal.
                    </p>
                    <p>
                        Terminal bawaan: terkirim dan dibatalkan. Retur, kendala pengiriman dan
                        FAILED mentah tidak dianggap gagal final. Batas hari operasional:
                        05.00–04.59 WIB.
                    </p>
                    <p>
                        Status atribusi customer: {shipment.customer_match_status}. Tidak ada
                        perubahan kepemilikan customer dari halaman ini.
                    </p>
                </section>
            )}
        </PageContainer>
    );
}

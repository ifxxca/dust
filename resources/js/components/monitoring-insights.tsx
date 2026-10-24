import { useRef, useState } from 'react';
import { ChartNoAxesCombined, CircleHelp, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { PickupOperationsSummary } from '@/components/pickup-monitoring-period';
import type { MonitoringOperations } from '@/components/pickup-monitoring-period';
import { metricDefinitions } from '@/components/pickup-result-ui';
import {
    categoryName,
    processingDate,
    quantity,
} from '@/components/package-processing-ui';
import type { ProcessingMonitor } from '@/types/package-processing';

export function MetricHelpContent({
    processing = false,
}: {
    processing?: boolean;
}) {
    return (
        <div className="space-y-4 text-sm">
            <dl className="space-y-3">
                {[
                    [
                        'Pickup Dijadwalkan',
                        'Pickup pada hari operasional pilihan, termasuk rencana yang belum dikunjungi. Setelah dikunjungi, pickup mengikuti waktu kunjungan sebenarnya.',
                    ],
                    [
                        'Pickup Dikunjungi',
                        'Pickup dalam hari operasional pilihan yang sudah mulai dikunjungi atau sudah diambil. Setiap pickup dihitung sekali.',
                    ],
                    [
                        'POP Final',
                        'Pickup dalam periode pilihan yang bukti pengambilannya sudah difinalkan.',
                    ],
                    [
                        'Menunggu Handover',
                        'POP sudah final, tetapi pickup belum masuk sesi serah terima.',
                    ],
                    [
                        'Menunggu Verifikasi',
                        'Pickup sudah masuk sesi serah terima dan belum diperiksa Retail, atau perlu diperiksa ulang karena nilai POP berubah.',
                    ],
                    [
                        'Ada Selisih',
                        'Jumlah diterima Retail berbeda dari POP yang diperiksa. Selisih tetap terlihat setelah verifikasi atau penutupan sesi.',
                    ],
                ].map(([label, text]) => (
                    <div key={label}>
                        <dt className="font-medium">{label}</dt>
                        <dd className="mt-0.5 text-muted-foreground">{text}</dd>
                    </div>
                ))}
            </dl>
            <section className="space-y-1 border-t pt-3">
                <h3 className="font-medium">
                    Hari operasional dan status terbaru
                </h3>
                <p className="text-muted-foreground">
                    Hari operasional dimulai pukul 05.00 WIB sampai sebelum
                    pukul 05.00 keesokan hari. Pukul 04.59 masih masuk hari
                    sebelumnya. Kedua tampilan memakai pickup yang sama: waktu
                    pengambilan atau hasil kunjungan, awal kunjungan bila belum
                    selesai, dan jadwal hanya bila belum dikunjungi.
                </p>
                <p className="text-muted-foreground">
                    {processing
                        ? 'Jumlah paket mengikuti pickup dalam hari operasional pilihan dan filter daftar.'
                        : 'Kartu utama mengikuti periode, pencarian, customer, dan petugas. Filter status menyaring daftar.'}{' '}
                    Handover, verifikasi, pemrosesan, dan koreksi yang dilakukan
                    kemudian memperbarui status pickup asal; tidak memindahkan
                    pickup ke hari pekerjaan tersebut dilakukan. Satu pickup
                    dapat masuk beberapa hitungan; angka-angka ini tidak untuk
                    dijumlahkan.
                </p>
            </section>
            <section className="space-y-1 border-t pt-3">
                <h3 className="font-medium">Pekerjaan lintas hari</h3>
                <p className="text-muted-foreground">
                    Backlog mencakup pekerjaan belum tuntas dari pickup sebelum
                    hari operasional saat ini dan tetap tersedia saat daftar
                    difilter ke hari ini. Buka Pekerjaan Tertunda untuk
                    rinciannya. Antrean Perlu Ditindaklanjuti juga mencakup
                    jadwal dan aktivitas sampai hari operasional saat ini,
                    termasuk pekerjaan lama. Backlog tidak ditambahkan ke total
                    pickup hari yang dipilih.
                </p>
            </section>
            {processing && (
                <section className="space-y-1 border-t pt-3">
                    <h3 className="font-medium">Pemrosesan paket</h3>
                    <p className="text-muted-foreground">
                        Berhasil Diinput memerlukan konfirmasi JNE Hybrid atau
                        MyORION. Tanda — berarti konfirmasi belum tersedia.
                        Catatan berhasil manual tetap ditampilkan terpisah.
                    </p>
                    <p className="text-muted-foreground">
                        Belum Terkonfirmasi dapat mencakup paket yang dicatat
                        berhasil, menunggu, atau gagal secara manual. Jika
                        Retail belum memeriksa paket, jumlah POP menjadi acuan.
                        Angka ini tidak berarti paket pasti belum diproses.
                    </p>
                    <p className="text-muted-foreground">
                        Filter sistem memilih kategori dengan catatan pada
                        sistem tersebut. Jumlah kategori tetap mencakup catatan
                        kedua sistem. Perlu Perhatian menghitung kategori pickup
                        dengan jumlah tidak cocok, kegagalan, atau hasil yang
                        belum jelas.
                    </p>
                </section>
            )}
        </div>
    );
}

export default function MonitoringInsights({
    operations,
    filters,
    disabled = false,
    pickupSummary,
    processing,
    timezone,
}: {
    operations: MonitoringOperations;
    filters: Record<string, string>;
    disabled?: boolean;
    pickupSummary?: Record<string, number>;
    processing?: ProcessingMonitor;
    timezone: string;
}) {
    const [panel, setPanel] = useState<'help' | 'activity' | 'backlog' | null>(
        null,
    );
    const origin = useRef<HTMLButtonElement | null>(null);
    const restoreFocus = (event: Event) => {
        if (origin.current?.isConnected) {
            event.preventDefault();
            origin.current.focus({ preventScroll: true });
        }
    };
    return (
        <>
            <div
                className="flex flex-wrap items-center gap-1"
                aria-label="Bantuan dan rincian monitoring"
            >
                {(
                    [
                        ['help', 'Bantuan Metrik', CircleHelp],
                        ['activity', 'Aktivitas Harian', ChartNoAxesCombined],
                        ['backlog', 'Pekerjaan Tertunda', History],
                    ] as const
                ).map(([key, label, Icon]) => (
                    <Button
                        key={key}
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        onClick={(event) => {
                            origin.current = event.currentTarget;
                            setPanel(key);
                        }}
                    >
                        <Icon className="size-3.5" />
                        {label}
                    </Button>
                ))}
            </div>
            <Dialog
                open={panel === 'help'}
                onOpenChange={(open) => {
                    if (!open) setPanel(null);
                }}
            >
                <DialogContent
                    className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-xl"
                    onCloseAutoFocus={restoreFocus}
                >
                    <DialogHeader className="shrink-0 pr-5">
                        <DialogTitle>Bantuan Metrik</DialogTitle>
                        <DialogDescription>
                            Cara membaca angka monitoring Retail.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 overflow-y-auto">
                        <MetricHelpContent processing={!!processing} />
                    </div>
                    <DialogFooter className="shrink-0">
                        <DialogClose asChild>
                            <Button size="sm" variant="outline">
                                Tutup
                            </Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Sheet
                open={panel === 'activity' || panel === 'backlog'}
                onOpenChange={(open) => {
                    if (!open) setPanel(null);
                }}
            >
                <SheetContent
                    overlayClassName="bg-black/25"
                    className="w-full gap-0 sm:max-w-2xl"
                    onCloseAutoFocus={restoreFocus}
                >
                    <SheetHeader className="shrink-0 border-b pr-12">
                        <SheetTitle>
                            {panel === 'backlog'
                                ? 'Pekerjaan Tertunda'
                                : 'Aktivitas Harian'}
                        </SheetTitle>
                        <SheetDescription>
                            {panel === 'backlog'
                                ? `Pekerjaan sebelum ${operations.today} WIB, di luar batas periode daftar.`
                                : `${filters.date_from} – ${filters.date_to} · hari operasional pickup, status terkini. Pencatatan manual memakai waktu catatan Admin.`}
                        </SheetDescription>
                        <div
                            className="flex gap-1 pt-2"
                            aria-label="Pilih rincian monitoring"
                        >
                            <Button
                                size="sm"
                                variant={
                                    panel === 'activity' ? 'secondary' : 'ghost'
                                }
                                aria-pressed={panel === 'activity'}
                                onClick={() => setPanel('activity')}
                            >
                                Aktivitas
                            </Button>
                            <Button
                                size="sm"
                                variant={
                                    panel === 'backlog' ? 'secondary' : 'ghost'
                                }
                                aria-pressed={panel === 'backlog'}
                                onClick={() => setPanel('backlog')}
                            >
                                Pekerjaan Tertunda
                            </Button>
                        </div>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                        {(panel === 'activity' || panel === 'backlog') && (
                            <PickupOperationsSummary
                                operations={operations}
                                filters={filters}
                                section={panel}
                            />
                        )}
                        {panel === 'activity' && pickupSummary && (
                            <section className="space-y-3">
                                <h3 className="text-sm font-semibold">
                                    Status terbaru pickup dalam daftar
                                </h3>
                                <dl className="grid gap-3 sm:grid-cols-2">
                                    {metricDefinitions.map(([key, label]) => (
                                        <div
                                            key={key}
                                            className="rounded-lg border p-3"
                                        >
                                            <dt className="text-sm font-medium">
                                                {label}
                                            </dt>
                                            <dd className="mt-1 text-xl font-semibold tabular-nums">
                                                {(
                                                    pickupSummary[key] ?? 0
                                                ).toLocaleString('id-ID')}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </section>
                        )}
                        {panel === 'activity' && processing && (
                            <section className="space-y-3">
                                <h3 className="text-sm font-semibold">
                                    Catatan manual per kategori
                                </h3>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Kategori</TableHead>
                                            <TableHead>Gagal</TableHead>
                                            <TableHead>Menunggu</TableHead>
                                            <TableHead>
                                                Hasil belum jelas
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {processing.categories.map((row) => (
                                            <TableRow key={row.category}>
                                                <TableCell>
                                                    {categoryName(row.category)}
                                                </TableCell>
                                                {[
                                                    'failed_quantity',
                                                    'pending_quantity',
                                                    'unknown_outcome_quantity',
                                                ].map((key) => (
                                                    <TableCell key={key}>
                                                        {quantity(row[key])}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <p className="text-xs text-muted-foreground">
                                    Diperbarui{' '}
                                    {processingDate(
                                        processing.generated_at,
                                        timezone,
                                    )}
                                    . Jumlah mengikuti status terbaru paket
                                    dalam daftar.
                                </p>
                            </section>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}

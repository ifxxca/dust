import { Head, Link, useForm, usePoll } from '@inertiajs/react';
import PageContainer from '@/components/page-container';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import * as reports from '@/routes/jne-reports';
import * as monitoring from '@/routes/jne-monitoring';
import { reportStage } from '@/lib/jne-report-flow';

type Awb = {
    id: number;
    awb: string;
    customer_account: string;
    source_row: number;
    status_web: string | null;
    status_pod: string | null;
    awb_cancel: string | null;
    shipper_name: string | null;
    consignee_name: string | null;
};
type Report = {
    id: number;
    customer_account: string;
    date_from: string;
    date_thru: string;
    status: string;
    projection_status?: string;
    projection_error?: string | null;
    error_message?: string | null;
    reviewed_at?: string | null;
    review_note?: string | null;
    import_status: string;
    imported_awb_count: number;
    duplicate_awb_count: number;
    imported_at: string | null;
    import_error: string | null;
};
const importStatuses: Record<string, string> = {
    NOT_IMPORTED: 'Belum diimpor',
    QUEUED: 'Menunggu / diproses worker',
    IMPORTED: 'Impor selesai',
    FAILED: 'Impor gagal',
};

export default function JneReportAwbs({
    report,
    awbs,
    filters,
    timezone,
}: {
    report: Report;
    awbs: {
        data: Awb[];
        current_page: number;
        last_page: number;
        total: number;
    };
    filters: { q: string };
    timezone: string;
}) {
    usePoll(5000, { only: ['report', 'awbs'] });
    const search = useForm({ q: filters.q });
    const review = useForm({ reason: '', return_to_report: true });
    const processing = useForm({});
    const stage = reportStage(report);
    const importedAt = report.imported_at
        ? new Intl.DateTimeFormat('id-ID', {
              timeZone: timezone,
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(report.imported_at))
        : '—';
    return (
        <PageContainer className="flex flex-col gap-4 space-y-0 py-4">
            <Head title={`Detail Report JNE #${report.id}`} />
            <div className="space-y-2">
                <Button variant="outline" size="sm" asChild>
                    <Link href={reports.index.url()}>
                        Kembali ke report JNE
                    </Link>
                </Button>
                <h1 className="text-2xl font-semibold">
                    Detail Report JNE #{report.id}
                </h1>
                <p className="text-sm text-muted-foreground">
                    Nomor penarikan {report.customer_account} ·{' '}
                    {report.date_from} s.d. {report.date_thru}
                </p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Progres penarikan & pemrosesan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Badge variant={stage.issue ? 'destructive' : 'secondary'}>
                        {stage.label}
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                        Mengambil report → CSV tersimpan → Memproses data → Siap
                        dimonitor. CSV tersimpan belum berarti monitoring sudah
                        diperbarui.
                    </p>
                    {(report.error_message || report.projection_error) && (
                        <p role="alert" className="text-sm text-destructive">
                            {report.error_message || report.projection_error}
                        </p>
                    )}
                    {report.status === 'COMPLETED' &&
                        report.import_status === 'IMPORTED' &&
                        report.projection_status !== 'PROJECTED' && (
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground">
                                    Memperbarui monitoring dari data CSV yang
                                    sudah tersimpan. Tidak meminta report baru
                                    ke JNE.
                                </p>
                                <Button
                                    disabled={
                                        processing.processing ||
                                        report.projection_status === 'QUEUED'
                                    }
                                    onClick={() =>
                                        processing.post(
                                            reports.project.url(report.id),
                                            { preserveScroll: true },
                                        )
                                    }
                                >
                                    {report.projection_status === 'QUEUED'
                                        ? 'Menunggu pemrosesan monitoring'
                                        : 'Ulangi pemrosesan monitoring'}
                                </Button>
                            </div>
                        )}
                    {['FAILED', 'NEEDS_ATTENTION'].includes(report.status) && (
                        <p className="text-sm">
                            Periksa History JNE dan rentang tanggal report ini
                            sebelum meminta ulang. Sistem tidak mengirim ulang
                            otomatis karena report sebelumnya mungkin sudah
                            dibuat di JNE.
                        </p>
                    )}
                    <Badge
                        variant={
                            report.import_status === 'FAILED'
                                ? 'destructive'
                                : 'secondary'
                        }
                    >
                        {importStatuses[report.import_status] ??
                            report.import_status}
                    </Badge>
                    <p className="text-sm">
                        {report.imported_awb_count.toLocaleString('id-ID')} AWB
                        diimpor ·{' '}
                        {report.duplicate_awb_count.toLocaleString('id-ID')}{' '}
                        baris duplikat identik dilewati · Waktu impor:{' '}
                        {importedAt}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Status di bawah adalah isi CSV pada saat report ditarik.
                        Buka daftar pengiriman untuk observasi terakhir,
                        riwayat, dan hubungan pickup. Snapshot report ini tetap
                        dipertahankan.
                    </p>
                    {report.import_error && (
                        <p role="alert" className="text-sm text-destructive">
                            {report.import_error}
                        </p>
                    )}
                    {report.status === 'COMPLETED' && (
                        <div className="flex flex-wrap gap-2">
                            {!['IMPORTED', 'QUEUED'].includes(
                                report.import_status,
                            ) && (
                                <Button
                                    disabled={processing.processing}
                                    onClick={() =>
                                        processing.post(
                                            reports.importAwbs.url(report.id),
                                            { preserveScroll: true },
                                        )
                                    }
                                >
                                    {report.import_status === 'NOT_IMPORTED'
                                        ? 'Impor AWB dari CSV'
                                        : 'Ulangi antrean impor'}
                                </Button>
                            )}
                            <Button variant="outline" asChild>
                                <a href={reports.download.url(report.id)}>
                                    Unduh CSV sumber
                                </a>
                            </Button>
                        </div>
                    )}
                    {stage.issue && (
                        <form
                            className="space-y-2 rounded-md border p-3"
                            onSubmit={(event) => {
                                event.preventDefault();
                                review.post(
                                    monitoring.reviewReport.url(report.id),
                                    { preserveScroll: true },
                                );
                            }}
                        >
                            <Label htmlFor="report-review">
                                Catatan pemeriksaan
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Catatan ini hanya mengakui pemeriksaan dan
                                membuka blokir jadwal berikutnya. Tidak
                                memperbaiki kegagalan atau mengirim ulang
                                report.
                            </p>
                            <Input
                                id="report-review"
                                required
                                maxLength={500}
                                value={review.data.reason}
                                onChange={(event) =>
                                    review.setData('reason', event.target.value)
                                }
                            />
                            <InputError message={review.errors.reason} />
                            <Button
                                variant="outline"
                                disabled={review.processing}
                            >
                                Simpan catatan pemeriksaan
                            </Button>
                            {report.reviewed_at && (
                                <p className="text-xs text-muted-foreground">
                                    Catatan tersimpan: {report.review_note}
                                </p>
                            )}
                        </form>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Daftar AWB</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <form
                        className="flex flex-wrap items-end gap-3"
                        onSubmit={(event) => {
                            event.preventDefault();
                            search.get(reports.awbs.url(report.id), {
                                preserveState: true,
                                preserveScroll: true,
                            });
                        }}
                    >
                        <div className="space-y-2">
                            <Label htmlFor="awb-search">
                                Cari awalan nomor AWB
                            </Label>
                            <Input
                                id="awb-search"
                                value={search.data.q}
                                maxLength={100}
                                onChange={(event) =>
                                    search.setData('q', event.target.value)
                                }
                            />
                            <InputError message={search.errors.q} />
                        </div>
                        <Button
                            type="submit"
                            variant="outline"
                            disabled={search.processing}
                        >
                            Cari
                        </Button>
                    </form>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {[
                                    'AWB',
                                    'Nomor penarikan',
                                    'Status web',
                                    'Status POD',
                                    'Pembatalan (CSV)',
                                    'Pengirim',
                                    'Penerima',
                                    'Baris CSV',
                                ].map((label) => (
                                    <TableHead key={label}>{label}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {awbs.data.length === 0 && (
                                <TableRow>
                                    <TableCell
                                        colSpan={8}
                                        className="py-8 text-center text-muted-foreground"
                                    >
                                        Belum ada AWB yang sesuai.
                                    </TableCell>
                                </TableRow>
                            )}
                            {awbs.data.map((awb) => (
                                <TableRow key={awb.id}>
                                    <TableCell className="font-mono">
                                        {awb.awb}
                                    </TableCell>
                                    <TableCell>
                                        {awb.customer_account}
                                    </TableCell>
                                    <TableCell>
                                        {awb.status_web || '—'}
                                    </TableCell>
                                    <TableCell>
                                        {awb.status_pod || '—'}
                                    </TableCell>
                                    <TableCell>
                                        {awb.awb_cancel || '—'}
                                    </TableCell>
                                    <TableCell>
                                        {awb.shipper_name || '—'}
                                    </TableCell>
                                    <TableCell>
                                        {awb.consignee_name || '—'}
                                    </TableCell>
                                    <TableCell>{awb.source_row}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-muted-foreground">
                            {awbs.total.toLocaleString('id-ID')} AWB · Halaman{' '}
                            {awbs.current_page} / {awbs.last_page}
                        </p>
                        <div className="flex gap-2">
                            {awbs.current_page > 1 && (
                                <Button variant="outline" size="sm" asChild>
                                    <Link
                                        preserveScroll
                                        href={reports.awbs.url(report.id, {
                                            query: {
                                                q: filters.q,
                                                page: awbs.current_page - 1,
                                            },
                                        })}
                                    >
                                        Sebelumnya
                                    </Link>
                                </Button>
                            )}
                            {awbs.current_page < awbs.last_page && (
                                <Button variant="outline" size="sm" asChild>
                                    <Link
                                        preserveScroll
                                        href={reports.awbs.url(report.id, {
                                            query: {
                                                q: filters.q,
                                                page: awbs.current_page + 1,
                                            },
                                        })}
                                    >
                                        Berikutnya
                                    </Link>
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </PageContainer>
    );
}

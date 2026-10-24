import { Head, Link, useForm } from '@inertiajs/react';
import PageContainer from '@/components/page-container';
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
import * as monitoring from '@/routes/jne-monitoring';
import { show as pickupDetail } from '@/routes/pickup-results';

type Row = {
    id: number;
    reference: string;
    customer_name: string;
    declared_successful: number;
    received_quantity: number | null;
    matched_awbs: number;
    difference: number;
    state: string;
    comparison_ready: boolean;
};

const states: Record<string, string> = {
    NO_BASELINE: 'Penerimaan belum tersedia',
    BASELINE_REVIEW: 'Baseline perlu diperiksa',
    MISMATCH: 'Jumlah berbeda',
    MATCHED_COUNTS: 'Jumlah cocok',
};

export default function JneReconciliation({
    pickups,
    filters,
    linkage,
}: {
    pickups: {
        data: Row[];
        total: number;
        current_page: number;
        last_page: number;
    };
    filters: { q: string };
    linkage?: { total: number; linked: number };
}) {
    const form = useForm({ q: filters.q });
    return (
        <PageContainer className="flex flex-col gap-4 space-y-0 py-4">
            <Head title="Perbandingan paket & AWB" />
            <h1 className="text-2xl font-semibold">Perbandingan paket & AWB</h1>
            <p className="text-sm text-muted-foreground">
                Perbandingan baru bermakna setelah AWB terhubung ke pickup
                melalui referensi yang dapat diverifikasi. Tanpa hubungan
                tersebut, selisih belum dapat dinilai dan bukan bukti paket
                hilang. Bandingkan deklarasi pemrosesan efektif dengan AWB unik
                yang terhubung. Jumlah cocok tidak otomatis menutup selisih
                POP/retail atau membuktikan alokasi per kategori; koreksi tetap
                memakai alur operasional yang ada.
            </p>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-medium">Syarat perbandingan</p>
                <p className="text-sm text-muted-foreground">
                    POP sudah final, customer dikenali, dan referensi JNE cocok
                    dengan referensi pickup yang dapat diverifikasi. Nama atau
                    tanggal yang mirip tidak cukup untuk menghubungkan AWB.
                </p>
                {linkage && (
                    <p className="text-sm">
                        {linkage.linked.toLocaleString('id-ID')} dari{' '}
                        {linkage.total.toLocaleString('id-ID')} AWB tersimpan
                        sudah terhubung ke pickup.{' '}
                        {linkage.linked === 0
                            ? 'Belum ada hubungan yang bisa dipakai untuk membandingkan jumlah paket.'
                            : 'Jumlah pada tabel hanya mencakup AWB yang sudah terhubung; periksa kelengkapan hubungan sebelum menyimpulkan selisih.'}
                    </p>
                )}
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Hasil per pickup</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <form
                        className="flex flex-wrap items-end gap-3"
                        onSubmit={(event) => {
                            event.preventDefault();
                            form.get(monitoring.reconciliation.url(), {
                                preserveScroll: true,
                                preserveState: true,
                            });
                        }}
                    >
                        <div className="space-y-2">
                            <Label htmlFor="reconciliation-search">
                                Referensi / customer
                            </Label>
                            <Input
                                id="reconciliation-search"
                                value={form.data.q}
                                onChange={(event) =>
                                    form.setData('q', event.target.value)
                                }
                                maxLength={100}
                            />
                        </div>
                        <Button type="submit" variant="outline">
                            Cari
                        </Button>
                    </form>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {[
                                    'Pickup / customer',
                                    'Diterima retail',
                                    'Deklarasi berhasil',
                                    'AWB terhubung',
                                    'Selisih deklarasi − AWB',
                                    'Pemeriksaan',
                                ].map((label) => (
                                    <TableHead key={label}>{label}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pickups.data.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <Link
                                            className="underline"
                                            href={pickupDetail.url(row.id)}
                                        >
                                            {row.reference}
                                        </Link>
                                        <p>{row.customer_name}</p>
                                    </TableCell>
                                    <TableCell>
                                        {row.received_quantity ?? '—'}
                                    </TableCell>
                                    <TableCell>
                                        {row.declared_successful}
                                    </TableCell>
                                    <TableCell>{row.matched_awbs}</TableCell>
                                    <TableCell>
                                        {row.comparison_ready
                                            ? row.difference
                                            : '—'}
                                    </TableCell>
                                    <TableCell>
                                        {row.comparison_ready
                                            ? states[row.state]
                                            : 'Belum ada AWB terhubung'}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {pickups.data.length === 0 && (
                                <TableRow>
                                    <TableCell
                                        colSpan={6}
                                        className="py-8 text-center text-muted-foreground"
                                    >
                                        Tidak ada pickup yang sesuai.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-muted-foreground">
                            {pickups.total} pickup · Halaman{' '}
                            {pickups.current_page} / {pickups.last_page}
                        </p>
                        <div className="flex gap-2">
                            {pickups.current_page > 1 && (
                                <Button size="sm" variant="outline" asChild>
                                    <Link
                                        href={monitoring.reconciliation.url({
                                            query: {
                                                q: filters.q,
                                                page: pickups.current_page - 1,
                                            },
                                        })}
                                    >
                                        Sebelumnya
                                    </Link>
                                </Button>
                            )}
                            {pickups.current_page < pickups.last_page && (
                                <Button size="sm" variant="outline" asChild>
                                    <Link
                                        href={monitoring.reconciliation.url({
                                            query: {
                                                q: filters.q,
                                                page: pickups.current_page + 1,
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

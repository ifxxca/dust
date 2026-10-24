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
    pop_reconciliation?: {
        confirmed_pickup_awbs: number;
        category_confirmed_awbs: number;
        unclassified_awbs: number;
        sertim_window: string;
        categories: Record<
            string,
            {
                expected_quantity: number | null;
                confirmed_awbs: number;
                identified_awbs: number;
                candidate_awbs: number;
                conflicts: number;
                shortfall_quantity: number | null;
                excess_quantity: number | null;
                state: string;
            }
        >;
    };
};

const states: Record<string, string> = {
    AWAITING_POP: 'POP belum final',
    CONFLICT: 'Bukti bertentangan',
    EXCESS: 'Bukti melebihi POP',
    CATEGORY_EVIDENCE_REQUIRED: 'Perlu bukti kategori',
    IDENTIFIED_COUNTS:
        'Jumlah bukti sesuai POP · kelengkapan report belum disahkan',
    AWAITING_EVIDENCE: 'Menunggu bukti / report',
};
const categories = [
    ['manual_hybrid', 'Manual'],
    ['cashless_hybrid', 'Cashless'],
    ['css_orion', 'CSS / Orion'],
] as const;

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
            <Head title="Rekonsiliasi POP & AWB" />
            <h1 className="text-2xl font-semibold">Rekonsiliasi POP & AWB</h1>
            <p className="text-sm text-muted-foreground">
                Bandingkan POP efektif per kategori dengan AWB yang customer,
                pickup dan buktinya dapat diverifikasi. Jumlah total yang sama
                tidak membuktikan kategori. Kekurangan masih sementara sampai
                kelengkapan pengumpulan report dapat dipastikan.
            </p>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-medium">Syarat perbandingan</p>
                <p className="text-sm text-muted-foreground">
                    Bukti Sertim dapat menetapkan Cashless. AWB lain tetap
                    menunggu bukti kategori yang sah; prefix dan account tidak
                    menetapkan kategori atau pemilik. Jendela Sertim yang
                    ditutup tidak menandakan Hybrid/APEX selesai. Perbandingan
                    jumlah tidak otomatis menutup selisih POP atau verifikasi
                    Retail.
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
                                    'Kategori',
                                    'POP efektif',
                                    'AWB terkonfirmasi',
                                    'Kurang sementara',
                                    'Lebih',
                                    'Pemeriksaan',
                                ].map((label) => (
                                    <TableHead key={label}>{label}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {pickups.data.flatMap((row) =>
                                categories.map(([category, label], index) => {
                                    const result =
                                        row.pop_reconciliation?.categories[
                                            category
                                        ];
                                    return (
                                        <TableRow key={row.id + '-' + category}>
                                            {index === 0 && (
                                                <TableCell
                                                    rowSpan={3}
                                                    className="min-w-52 whitespace-normal"
                                                >
                                                    <Link
                                                        className="underline"
                                                        href={pickupDetail.url(
                                                            row.id,
                                                        )}
                                                    >
                                                        {row.reference}
                                                    </Link>
                                                    <p>{row.customer_name}</p>
                                                    <p className="mt-2 text-xs text-muted-foreground">
                                                        {row.pop_reconciliation
                                                            ?.confirmed_pickup_awbs ??
                                                            row.matched_awbs}{' '}
                                                        AWB terhubung ·{' '}
                                                        {row.pop_reconciliation
                                                            ?.unclassified_awbs ??
                                                            0}{' '}
                                                        belum punya bukti
                                                        kategori
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Sertim:{' '}
                                                        {row.pop_reconciliation
                                                            ?.sertim_window ===
                                                        'CLOSED'
                                                            ? 'Ditutup'
                                                            : 'Terbuka'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Diterima Retail:{' '}
                                                        {row.received_quantity ??
                                                            'Belum diverifikasi'}{' '}
                                                        · Deklarasi berhasil:{' '}
                                                        {
                                                            row.declared_successful
                                                        }
                                                    </p>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        {row.state ===
                                                        'NO_BASELINE'
                                                            ? 'Baseline Retail belum tersedia.'
                                                            : row.state ===
                                                                'BASELINE_REVIEW'
                                                              ? 'Baseline POP berubah; periksa deklarasi pemrosesan.'
                                                              : !row.comparison_ready
                                                                ? 'Belum ada AWB terhubung; ini bukan bukti paket hilang.'
                                                                : row.state ===
                                                                    'MATCHED_COUNTS'
                                                                  ? 'Jumlah cocok dengan deklarasi; bukti kategori tetap diperiksa.'
                                                                  : 'Jumlah berbeda dari deklarasi; periksa bukti dan kelengkapan report.'}
                                                    </p>
                                                </TableCell>
                                            )}
                                            <TableCell>{label}</TableCell>
                                            <TableCell>
                                                {result?.expected_quantity ??
                                                    '—'}
                                            </TableCell>
                                            <TableCell>
                                                {result?.confirmed_awbs ?? 0}
                                                <p className="text-xs text-muted-foreground">
                                                    {result?.identified_awbs ??
                                                        0}{' '}
                                                    bukti ·{' '}
                                                    {result?.candidate_awbs ??
                                                        0}{' '}
                                                    kandidat ·{' '}
                                                    {result?.conflicts ?? 0}{' '}
                                                    konflik
                                                </p>
                                            </TableCell>
                                            <TableCell>
                                                {result?.shortfall_quantity ??
                                                    '—'}
                                            </TableCell>
                                            <TableCell>
                                                {result?.excess_quantity ?? '—'}
                                            </TableCell>
                                            <TableCell className="max-w-64 whitespace-normal">
                                                {result
                                                    ? states[result.state]
                                                    : 'Menunggu bukti kategori'}
                                            </TableCell>
                                        </TableRow>
                                    );
                                }),
                            )}
                            {pickups.data.length === 0 && (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
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

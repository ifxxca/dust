import { Head, Link, router, useForm, usePoll } from '@inertiajs/react';
import { useState } from 'react';
import { Plus, Upload, Users, ArrowRight, Search } from 'lucide-react';
import PageContainer from '@/components/page-container';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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
import * as aliasesRoutes from '@/routes/jne-shipper-aliases';
import * as monitoring from '@/routes/jne-monitoring';
import * as reports from '@/routes/jne-reports';
import { operations } from '@/routes';

type Customer = {
    id: number;
    name: string;
    customer_code: string | null;
    is_active: boolean;
    alias_count?: number;
    pickup_details_missing?: boolean;
};
type Alias = {
    id: number;
    shipper_name: string;
    is_active: boolean;
    version: number;
    active_candidates: number;
    customer: Customer;
};
type Page<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
};
type Filters = {
    customer_id: string | number;
    q: string;
    alias_q: string;
    conflicts: boolean;
};

export default function JneShipperAliases({
    aliases,
    directory,
    selectedCustomer,
    filters,
    stats,
    importResult,
    ownership,
    conflictGroups,
    mappingRuns = [],
    mappingPagination,
}: {
    mappingPagination?: {
        current_page: number;
        last_page: number;
        total: number;
    };
    mappingRuns?: {
        id: number;
        status: string;
        affected_count: number;
        error_message: string | null;
    }[];
    aliases: Page<Alias>;
    directory: Page<Customer>;
    selectedCustomer: Customer | null;
    filters: Filters;
    stats: { customers: number; without_names: number; conflicts: number };
    importResult: { inserted: number; duplicates: number } | null;
    ownership?: {
        total: number;
        recognized: number;
        ambiguous: number;
        unmatched: number;
        candidates?: number;
        conflicts?: number;
    };
    conflictGroups?: Page<{
        name: string;
        customers: { id: number; name: string; code: string | null }[];
    }> | null;
}) {
    usePoll(5000, { only: ['mappingRuns', 'mappingPagination', 'ownership'] });
    const retry = useForm({});
    const unresolved = ownership
        ? Math.max(0, ownership.total - ownership.recognized)
        : 0;
    const reviewStatuses = [
        ['CONFLICT', ownership?.conflicts ?? 0, 'Konflik bukti'],
        ['AMBIGUOUS', ownership?.ambiguous ?? 0, 'Pemetaan ambigu'],
        ['CANDIDATE', ownership?.candidates ?? 0, 'Kandidat customer'],
        ['UNMATCHED', ownership?.unmatched ?? 0, 'Tanpa nama cocok'],
    ].filter((entry) => Number(entry[1]) > 0);
    const [importOpen, setImportOpen] = useState(false);
    const search = useForm({ q: filters.q || '' });
    const form = useForm({
        customer_id: selectedCustomer?.id || '',
        shipper_name: '',
    });
    const upload = useForm<{ file: File | null }>({ file: null });
    const select = (id: number) =>
        aliasesRoutes.index.url({
            query: { q: filters.q || undefined, customer_id: id },
        });
    return (
        <PageContainer>
            <nav aria-label="Customer">
                <Button variant="ghost" size="sm" asChild>
                    <Link href={operations.url({ screen: 'customers' })}>
                        Kembali ke Customer
                    </Link>
                </Button>
            </nav>
            <Head title="Customer & nama pengirim" />
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Customer & nama pengirim
                    </h1>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setImportOpen(true)}
                    >
                        <Upload className="size-4" />
                        Impor daftar
                    </Button>
                    <Button asChild>
                        <Link href={operations.url({ screen: 'customers' })}>
                            <Plus className="size-4" />
                            Kelola customer
                        </Link>
                    </Button>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                <span>
                    <strong>{stats.customers}</strong> customer
                </span>
                <span className="text-muted-foreground">
                    {stats.without_names} belum punya nama pengirim
                </span>
                <Link
                    className={
                        stats.conflicts
                            ? 'font-medium underline underline-offset-4'
                            : 'text-muted-foreground'
                    }
                    href={aliasesRoutes.index.url({ query: { conflicts: 1 } })}
                >
                    {stats.conflicts} nama ganda di daftar
                </Link>
            </div>
            <details
                open={mappingRuns.some((run) => run.status !== 'COMPLETED')}
                className="rounded-lg border bg-muted/20 p-3"
            >
                <summary className="cursor-pointer text-sm font-medium">
                    Penerapan nama pengirim & riwayat
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                    <p className="text-sm font-medium">
                        Perubahan diterapkan otomatis ke AWB yang sudah
                        tersimpan
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Hanya nama pengirim yang berubah yang diterapkan.
                        Hubungan manual dipertahankan. Tidak menarik report baru
                        dari JNE.
                    </p>
                    {mappingRuns.map((run) => (
                        <div
                            key={run.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-sm"
                            role="status"
                        >
                            <p>
                                #{run.id} ·{' '}
                                {run.status === 'COMPLETED'
                                    ? `${run.affected_count} AWB terkait telah diperiksa`
                                    : run.status === 'FAILED'
                                      ? run.error_message
                                      : 'Penerapan nama pengirim menunggu / sedang diproses worker'}
                            </p>
                            {run.status === 'FAILED' && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={retry.processing}
                                    onClick={() =>
                                        retry.post(
                                            aliasesRoutes.retrySync.url(run.id),
                                            { preserveScroll: true },
                                        )
                                    }
                                >
                                    Ulangi penerapan
                                </Button>
                            )}
                        </div>
                    ))}
                    {mappingPagination && mappingPagination.last_page > 1 && (
                        <div className="flex flex-wrap items-center gap-3">
                            <p className="text-xs text-muted-foreground">
                                Riwayat penerapan: halaman{' '}
                                {mappingPagination.current_page} dari{' '}
                                {mappingPagination.last_page}
                            </p>
                            {mappingPagination.current_page > 1 && (
                                <Button variant="outline" size="sm" asChild>
                                    <Link
                                        href={aliasesRoutes.index.url({
                                            query: {
                                                ...filters,
                                                mapping_page:
                                                    mappingPagination.current_page -
                                                    1,
                                            },
                                        })}
                                    >
                                        Penerapan sebelumnya
                                    </Link>
                                </Button>
                            )}
                            {mappingPagination.current_page <
                                mappingPagination.last_page && (
                                <Button variant="outline" size="sm" asChild>
                                    <Link
                                        href={aliasesRoutes.index.url({
                                            query: {
                                                ...filters,
                                                mapping_page:
                                                    mappingPagination.current_page +
                                                    1,
                                            },
                                        })}
                                    >
                                        Penerapan berikutnya
                                    </Link>
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </details>
            {ownership && (
                <div
                    className={
                        'flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 ' +
                        (unresolved > 0
                            ? 'border-amber-500/30 bg-amber-500/5'
                            : 'border-emerald-500/30 bg-emerald-500/5')
                    }
                >
                    <div className="space-y-1">
                        <p className="font-semibold">
                            {ownership.total === 0
                                ? 'Belum ada AWB tersimpan'
                                : unresolved === 0
                                  ? 'Semua ' +
                                    ownership.recognized +
                                    ' AWB sudah dikenali customernya'
                                  : unresolved +
                                    ' AWB belum dikenali pemiliknya'}
                        </p>
                        <p className="max-w-3xl text-sm text-muted-foreground">
                            {ownership.total === 0
                                ? 'Tarik report terlebih dahulu untuk melihat kiriman. Nama ganda di daftar belum tentu dipakai dalam report.'
                                : unresolved === 0
                                  ? 'Kamu bisa lanjut ke Pengiriman. Nama ganda di daftar tidak menghambat AWB yang tersimpan saat ini. Tidak perlu menonaktifkan nama yang belum kamu pastikan pemiliknya.'
                                  : 'Pastikan customer dari dokumen pengiriman sebelum memperbaiki nama pengirim.'}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button asChild>
                            <Link
                                href={
                                    ownership.total === 0
                                        ? reports.index.url()
                                        : monitoring.index.url({
                                              query:
                                                  reviewStatuses.length > 0
                                                      ? {
                                                            customer_match:
                                                                String(
                                                                    reviewStatuses[0][0],
                                                                ),
                                                        }
                                                      : {},
                                          })
                                }
                            >
                                {ownership.total === 0
                                    ? 'Tarik report'
                                    : unresolved > 0
                                      ? 'Periksa AWB'
                                      : 'Lihat Pengiriman'}
                            </Link>
                        </Button>
                        {reviewStatuses
                            .slice(1)
                            .map(([status, count, label]) => (
                                <Button key={status} variant="outline" asChild>
                                    <Link
                                        href={monitoring.index.url({
                                            query: {
                                                customer_match: String(status),
                                            },
                                        })}
                                    >
                                        {label}: {count}
                                    </Link>
                                </Button>
                            ))}
                    </div>
                </div>
            )}
            {importResult && (
                <div
                    role="status"
                    className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm"
                >
                    {importResult.inserted} nama ditambahkan.{' '}
                    {importResult.duplicates} baris sudah tercatat dan dilewati.
                </div>
            )}
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.6fr)]">
                <Card className="gap-0 overflow-hidden py-0">
                    <CardHeader className="border-b p-4">
                        <CardTitle className="text-base">
                            Pilih customer
                        </CardTitle>
                        <form
                            className="flex gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                search.get(aliasesRoutes.index.url());
                            }}
                        >
                            <Input
                                aria-label="Cari kode atau nama customer"
                                placeholder="Cari kode atau nama customer"
                                value={search.data.q}
                                maxLength={100}
                                onChange={(event) =>
                                    search.setData('q', event.target.value)
                                }
                            />
                            <Button
                                size="icon"
                                variant="outline"
                                aria-label="Cari customer"
                            >
                                <Search className="size-4" />
                            </Button>
                        </form>
                        <InputError message={search.errors.q} />
                    </CardHeader>
                    <div className="max-h-[560px] divide-y overflow-y-auto">
                        {directory.data.length === 0 && (
                            <p className="p-6 text-sm text-muted-foreground">
                                Customer belum ditemukan. Tambahkan melalui
                                Kelola customer.
                            </p>
                        )}
                        {directory.data.map((customer) => (
                            <Link
                                key={customer.id}
                                href={select(customer.id)}
                                preserveScroll
                                className={
                                    'flex items-center justify-between gap-3 border-l-2 p-4 transition-colors hover:bg-muted/50 ' +
                                    (selectedCustomer?.id === customer.id
                                        ? 'border-l-primary bg-primary/5'
                                        : 'border-l-transparent')
                                }
                            >
                                <div className="min-w-0">
                                    <p className="font-mono text-xs font-semibold text-primary">
                                        {customer.customer_code ||
                                            'Kode belum diisi'}
                                    </p>
                                    <p className="mt-1 truncate text-sm font-medium">
                                        {customer.name}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {customer.alias_count || 0} nama
                                        pengirim
                                        {!customer.is_active &&
                                            ' · dinonaktifkan'}
                                    </p>
                                </div>
                                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                            </Link>
                        ))}
                    </div>
                    <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
                        <span>{directory.total} customer</span>
                        <div className="flex gap-2">
                            {directory.current_page > 1 && (
                                <Link
                                    href={aliasesRoutes.index.url({
                                        query: {
                                            ...filters,
                                            directory_page:
                                                directory.current_page - 1,
                                            conflicts: filters.conflicts
                                                ? 1
                                                : 0,
                                        },
                                    })}
                                    preserveScroll
                                >
                                    Sebelumnya
                                </Link>
                            )}
                            {directory.current_page < directory.last_page && (
                                <Link
                                    href={aliasesRoutes.index.url({
                                        query: {
                                            ...filters,
                                            directory_page:
                                                directory.current_page + 1,
                                            conflicts: filters.conflicts
                                                ? 1
                                                : 0,
                                        },
                                    })}
                                    preserveScroll
                                >
                                    Berikutnya
                                </Link>
                            )}
                        </div>
                    </div>
                </Card>
                <div className="space-y-4">
                    {selectedCustomer ? (
                        <Card>
                            <CardHeader className="border-b">
                                <p className="font-mono text-sm font-semibold text-primary">
                                    CUSTOMER{' '}
                                    {selectedCustomer.customer_code || '—'}
                                </p>
                                <CardTitle>{selectedCustomer.name}</CardTitle>
                                {selectedCustomer.pickup_details_missing && (
                                    <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                                        Identitas customer sudah tersedia untuk
                                        pengelompokan AWB. Lengkapi alamat dan
                                        kontak melalui Kelola customer sebelum
                                        membuat pickup.
                                    </p>
                                )}
                                <p className="text-sm text-muted-foreground">
                                    Tambahkan nama pengirim persis seperti yang
                                    muncul di report. Nomor penarikan JNE tidak
                                    diperlukan.
                                </p>
                            </CardHeader>
                            <CardContent className="space-y-5 pt-5">
                                <form
                                    className="flex flex-wrap items-start gap-2"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        form.transform((data) => ({
                                            ...data,
                                            customer_id: selectedCustomer.id,
                                        }));
                                        form.post(aliasesRoutes.store.url(), {
                                            preserveScroll: true,
                                            onSuccess: () =>
                                                form.setData(
                                                    'shipper_name',
                                                    '',
                                                ),
                                        });
                                    }}
                                >
                                    <div className="min-w-48 flex-1">
                                        <Label
                                            className="sr-only"
                                            htmlFor="new-shipper"
                                        >
                                            Nama pengirim
                                        </Label>
                                        <Input
                                            id="new-shipper"
                                            placeholder="Contoh: 100 TOKO A atau nama pengirim lainnya"
                                            required
                                            maxLength={500}
                                            value={form.data.shipper_name}
                                            onChange={(event) =>
                                                form.setData(
                                                    'shipper_name',
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        <InputError
                                            message={
                                                form.errors.shipper_name ||
                                                form.errors.customer_id
                                            }
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        disabled={
                                            form.processing ||
                                            !selectedCustomer.is_active
                                        }
                                    >
                                        <Plus className="size-4" />
                                        Tambah nama
                                    </Button>
                                </form>
                                <AliasTable aliases={aliases} />
                            </CardContent>
                        </Card>
                    ) : filters.conflicts ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>
                                    Nama yang tercatat untuk beberapa customer
                                </CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    Ini catatan pada daftar nama, bukan berarti
                                    AWB kamu bermasalah. Jika belum tahu pemilik
                                    yang benar, biarkan dulu. Koreksi hanya
                                    setelah ada bukti dari data atau dokumen
                                    pengiriman.
                                </p>
                            </CardHeader>
                            <CardContent>
                                {conflictGroups ? (
                                    <div className="space-y-3">
                                        {conflictGroups.data.map((group) => (
                                            <div
                                                key={group.name}
                                                className="rounded-md border p-4"
                                            >
                                                <p className="font-medium">
                                                    {group.name}
                                                </p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Tercatat pada customer:
                                                </p>
                                                <ul className="mt-2 space-y-2">
                                                    {group.customers.map(
                                                        (customer) => (
                                                            <li
                                                                key={
                                                                    customer.id
                                                                }
                                                                className="flex flex-wrap items-center justify-between gap-2 text-sm"
                                                            >
                                                                <span>
                                                                    <span className="font-mono">
                                                                        {customer.code ||
                                                                            '—'}
                                                                    </span>{' '}
                                                                    ·{' '}
                                                                    {
                                                                        customer.name
                                                                    }
                                                                </span>
                                                                <Link
                                                                    className="text-xs underline"
                                                                    href={select(
                                                                        customer.id,
                                                                    )}
                                                                >
                                                                    Buka daftar
                                                                    nama
                                                                    customer
                                                                </Link>
                                                            </li>
                                                        ),
                                                    )}
                                                </ul>
                                            </div>
                                        ))}
                                        {conflictGroups.last_page > 1 && (
                                            <div className="flex gap-3 text-sm">
                                                <span>
                                                    Halaman{' '}
                                                    {
                                                        conflictGroups.current_page
                                                    }{' '}
                                                    / {conflictGroups.last_page}
                                                </span>
                                                {conflictGroups.current_page >
                                                    1 && (
                                                    <Link
                                                        href={aliasesRoutes.index.url(
                                                            {
                                                                query: {
                                                                    conflicts: 1,
                                                                    conflict_page:
                                                                        conflictGroups.current_page -
                                                                        1,
                                                                },
                                                            },
                                                        )}
                                                    >
                                                        Sebelumnya
                                                    </Link>
                                                )}
                                                {conflictGroups.current_page <
                                                    conflictGroups.last_page && (
                                                    <Link
                                                        href={aliasesRoutes.index.url(
                                                            {
                                                                query: {
                                                                    conflicts: 1,
                                                                    conflict_page:
                                                                        conflictGroups.current_page +
                                                                        1,
                                                                },
                                                            },
                                                        )}
                                                    >
                                                        Berikutnya
                                                    </Link>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <AliasTable aliases={aliases} />
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
                            <Users className="mb-4 size-9 text-muted-foreground/60" />
                            <h2 className="font-semibold">
                                Mulai dari kode customer
                            </h2>
                            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                                Pilih customer di sebelah kiri untuk melihat dan
                                menambah nama pengirimnya. Customer tetap dapat
                                digunakan meski tidak memiliki nomor penarikan
                                JNE sendiri.
                            </p>
                        </div>
                    )}
                    {!conflictGroups && aliases.last_page > 1 && (
                        <div className="flex items-center justify-end gap-3 text-sm">
                            <span>
                                Halaman {aliases.current_page} /{' '}
                                {aliases.last_page}
                            </span>
                            {aliases.current_page > 1 && (
                                <Link
                                    href={aliasesRoutes.index.url({
                                        query: {
                                            ...filters,
                                            conflicts: filters.conflicts
                                                ? 1
                                                : 0,
                                            page: aliases.current_page - 1,
                                        },
                                    })}
                                >
                                    Sebelumnya
                                </Link>
                            )}
                            {aliases.current_page < aliases.last_page && (
                                <Link
                                    href={aliasesRoutes.index.url({
                                        query: {
                                            ...filters,
                                            conflicts: filters.conflicts
                                                ? 1
                                                : 0,
                                            page: aliases.current_page + 1,
                                        },
                                    })}
                                >
                                    Berikutnya
                                </Link>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Impor nama pengirim</DialogTitle>
                        <DialogDescription>
                            Hubungkan nama pengirim ke kode customer yang sudah
                            ada. Tidak perlu memilih sumber report JNE.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="space-y-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            upload.post(aliasesRoutes.importMethod.url(), {
                                preserveScroll: true,
                                forceFormData: true,
                                onSuccess: () => setImportOpen(false),
                            });
                        }}
                    >
                        <div className="rounded-md bg-muted/50 p-3 text-sm">
                            <p className="font-medium">Format CSV UTF-8</p>
                            <p className="mt-1 font-mono text-xs">
                                SHIPPER_NAME,KODE,NAMA_CUSTOMER
                            </p>
                            <p className="mt-2 text-muted-foreground">
                                Ekspor kolom A–C Excel. Maksimal 5 MB / 10.000
                                baris. Kode dan nama harus sesuai master
                                customer. Customer baru tidak dibuat otomatis.
                            </p>
                        </div>
                        <Label htmlFor="alias-file">File CSV</Label>
                        <Input
                            id="alias-file"
                            required
                            type="file"
                            accept=".csv,text/csv"
                            onChange={(event) =>
                                upload.setData(
                                    'file',
                                    event.target.files?.[0] || null,
                                )
                            }
                        />
                        <InputError message={upload.errors.file} />
                        <Button
                            className="w-full"
                            type="submit"
                            disabled={upload.processing}
                        >
                            {upload.processing
                                ? 'Memeriksa daftar…'
                                : 'Impor daftar nama'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </PageContainer>
    );
}
function AliasTable({ aliases }: { aliases: Page<Alias> }) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Nama pengirim di report</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Tindakan</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {aliases.data.length === 0 && (
                    <TableRow>
                        <TableCell
                            colSpan={4}
                            className="py-8 text-center text-muted-foreground"
                        >
                            Belum ada nama pengirim.
                        </TableCell>
                    </TableRow>
                )}
                {aliases.data.map((alias) => (
                    <TableRow key={alias.id}>
                        <TableCell className="max-w-56 font-medium whitespace-normal">
                            {alias.shipper_name}
                        </TableCell>
                        <TableCell>
                            <span className="font-mono text-xs">
                                {alias.customer.customer_code || '—'}
                            </span>
                            <p className="text-xs text-muted-foreground">
                                {alias.customer.name}
                            </p>
                        </TableCell>
                        <TableCell>
                            <Badge
                                variant={
                                    alias.is_active &&
                                    alias.active_candidates > 1
                                        ? 'destructive'
                                        : 'outline'
                                }
                            >
                                {!alias.is_active
                                    ? 'Nonaktif'
                                    : alias.active_candidates > 1
                                      ? 'Periksa pemilik'
                                      : 'Digunakan'}
                            </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                    router.put(
                                        aliasesRoutes.update.url(alias.id),
                                        {
                                            is_active: !alias.is_active,
                                            version: alias.version,
                                        },
                                        { preserveScroll: true },
                                    )
                                }
                            >
                                {alias.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

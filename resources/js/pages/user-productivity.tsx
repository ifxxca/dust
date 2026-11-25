import { Head, useForm } from '@inertiajs/react';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import InputError from '@/components/input-error';
import PageContainer from '@/components/page-container';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Disclosure, DisclosureSummary } from '@/components/ui/disclosure';
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
import { userProductivity } from '@/routes';
import type {
    ProductivityData,
    ProductivityFilters,
    ProductivityRow,
} from '@/types/user-productivity';

const number = new Intl.NumberFormat('id-ID');
const percent = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
});
const categories = [
    ['manual', 'Manual'],
    ['cashless', 'Cashless'],
    ['orion', 'Orion'],
] as const;

function duration(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remaining = seconds % 60;
    return [
        hours > 0 ? `${number.format(hours)}j` : '',
        `${minutes % 60}m`,
        remaining > 0 ? `${remaining}d` : '',
    ]
        .filter(Boolean)
        .join(' ');
}

function Productivity({ row }: { row: ProductivityRow }) {
    if (row.productivity_percent === null) {
        return <Badge variant="outline">Belum lengkap</Badge>;
    }
    return (
        <Badge
            variant={
                row.productivity_percent >= 100
                    ? 'success'
                    : row.productivity_percent >= 50
                      ? 'warning'
                      : 'secondary'
            }
        >
            {percent.format(row.productivity_percent)}%
        </Badge>
    );
}

export default function UserProductivity({
    productivity,
    filters,
}: {
    productivity: ProductivityData;
    filters: ProductivityFilters;
}) {
    const { data, setData, get, processing, errors } =
        useForm<ProductivityFilters>(filters);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [loadError, setLoadError] = useState('');
    useEffect(() => setData(filters), [filters, setData]);
    useEffect(() => {
        const field = Object.keys(errors)[0];
        if (!field) return;
        if (field.endsWith('_seconds')) setSettingsOpen(true);
        const frame = requestAnimationFrame(() =>
            document.getElementById(field)?.focus(),
        );
        return () => cancelAnimationFrame(frame);
    }, [errors]);

    function apply() {
        setLoadError('');
        get(userProductivity.url(), {
            preserveState: true,
            preserveScroll: true,
            onNetworkError: () => {
                setLoadError(
                    'Data belum diperbarui. Periksa koneksi lalu coba lagi.',
                );
                return false;
            },
            onHttpException: (response) => {
                if (response.status >= 500) {
                    setLoadError(
                        'Data belum dapat dimuat. Coba lagi beberapa saat lagi.',
                    );
                    return false;
                }
            },
        });
    }

    return (
        <PageContainer>
            <Head title="User Productivity" />
            <header className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-balance">
                    User Productivity{' '}
                    <span className="text-base font-normal text-muted-foreground">
                        (Entry SLA)
                    </span>
                </h1>
                <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={apply}
                    disabled={processing}
                >
                    <RefreshCw aria-hidden="true" />
                    {processing ? 'Memuat…' : 'Refresh'}
                </Button>
            </header>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    apply();
                }}
                className="flex min-w-0 flex-col gap-3"
            >
                <div className="grid min-w-0 grid-cols-2 items-start gap-3 lg:grid-cols-[180px_180px_minmax(160px,1fr)_auto]">
                    {(['date_from', 'date_thru'] as const).map((field) => (
                        <div
                            key={field}
                            className="flex min-w-0 flex-col gap-1.5"
                        >
                            <Label htmlFor={field}>
                                {field === 'date_from'
                                    ? 'Dari tanggal'
                                    : 'Sampai tanggal'}
                            </Label>
                            <Input
                                id={field}
                                name={field}
                                type="date"
                                className="min-h-11 min-w-0"
                                value={data[field]}
                                onChange={(event) =>
                                    setData(field, event.target.value)
                                }
                                aria-invalid={!!errors[field]}
                                aria-describedby={
                                    errors[field] ? `${field}-error` : undefined
                                }
                            />
                            <InputError
                                id={`${field}-error`}
                                message={errors[field]}
                            />
                        </div>
                    ))}
                    <div className="col-span-2 flex min-w-0 flex-col gap-1.5 lg:col-span-1">
                        <Label htmlFor="q">Cari petugas</Label>
                        <Input
                            id="q"
                            name="q"
                            type="search"
                            autoComplete="off"
                            className="min-h-11"
                            placeholder="Nama atau user entry…"
                            value={data.q}
                            onChange={(event) =>
                                setData('q', event.target.value)
                            }
                            aria-invalid={!!errors.q}
                            aria-describedby={errors.q ? 'q-error' : undefined}
                        />
                        <InputError id="q-error" message={errors.q} />
                    </div>
                    <Button
                        type="submit"
                        className="col-span-2 min-h-11 lg:col-span-1 lg:mt-5"
                        disabled={processing}
                    >
                        {processing ? 'Memuat…' : 'Tampilkan'}
                    </Button>
                </div>
                <Disclosure
                    open={settingsOpen}
                    onToggle={(event) =>
                        setSettingsOpen(event.currentTarget.open)
                    }
                >
                    <DisclosureSummary>
                        Pengaturan SLA & dasar perhitungan
                    </DisclosureSummary>
                    <div className="flex flex-col gap-3 px-4 pb-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                            {categories.map(([key, label]) => {
                                const field = `${key}_seconds` as const;
                                return (
                                    <div
                                        key={key}
                                        className="flex flex-col gap-1.5"
                                    >
                                        <Label htmlFor={field}>
                                            SLA {label} (detik/entry)
                                        </Label>
                                        <Input
                                            id={field}
                                            name={field}
                                            type="number"
                                            inputMode="numeric"
                                            min={1}
                                            max={3600}
                                            step={1}
                                            className="min-h-11"
                                            value={data[field]}
                                            onChange={(event) =>
                                                setData(
                                                    field,
                                                    event.target.value,
                                                )
                                            }
                                            aria-invalid={!!errors[field]}
                                            aria-describedby={
                                                errors[field]
                                                    ? `${field}-error`
                                                    : undefined
                                            }
                                        />
                                        <InputError
                                            id={`${field}-error`}
                                            message={errors[field]}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Estimasi waktu = jumlah entry × SLA kategori.
                            Produktivitas = estimasi waktu ÷ (
                            {number.format(productivity.days)} hari × 7 jam) ×
                            100%. Setiap tanggal dalam periode dihitung; data
                            kehadiran dan hari libur belum digunakan. Nilai di
                            atas 100% tetap ditampilkan.
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Hari operasional 05.00–05.00 WIB. Satu resi dihitung
                            sekali dari report terbaru, berdasarkan petugas
                            entry dan kategori terverifikasi. SLA merupakan
                            estimasi beban kerja, bukan durasi kerja aktual.
                            Pengaturan berlaku untuk tampilan ini dan tersimpan
                            di URL.
                        </p>
                        <Button
                            type="submit"
                            variant="outline"
                            className="min-h-11 self-start"
                            disabled={processing}
                        >
                            Terapkan SLA
                        </Button>
                    </div>
                </Disclosure>
            </form>
            {loadError && (
                <Alert variant="destructive" role="alert">
                    <AlertDescription>{loadError}</AlertDescription>
                </Alert>
            )}
            {(productivity.totals.unclassified > 0 ||
                productivity.totals.missing_staff > 0) && (
                <Alert>
                    <AlertDescription>
                        {number.format(productivity.totals.unclassified)} resi
                        belum memiliki kategori terverifikasi;{' '}
                        {number.format(productivity.totals.missing_staff)} resi
                        tanpa petugas entry. Persentase pada baris terkait belum
                        tersedia.
                    </AlertDescription>
                </Alert>
            )}
            <section
                aria-label="Produktivitas petugas"
                aria-busy={processing}
                className="flex min-w-0 flex-col gap-3"
            >
                <p className="text-sm text-muted-foreground" role="status">
                    {processing
                        ? 'Memperbarui data…'
                        : `${number.format(productivity.rows.length)} petugas · ${number.format(productivity.totals.total)} entry · ${number.format(productivity.days)} hari · ${number.format(productivity.capacity_seconds / 3600)} jam per petugas`}
                </p>
                {productivity.rows.length === 0 ? (
                    <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                        Tidak ada entry untuk periode atau petugas ini. Ubah
                        tanggal atau pencarian, lalu pilih Tampilkan.
                    </div>
                ) : (
                    <>
                        <div className="hidden overflow-hidden rounded-lg border md:block">
                            <Table>
                                <caption className="sr-only">
                                    User Productivity berdasarkan entry SLA,{' '}
                                    {filters.date_from} sampai{' '}
                                    {filters.date_thru}
                                </caption>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead scope="col">
                                            Nama petugas
                                        </TableHead>
                                        {categories.map(([key, label]) => (
                                            <TableHead
                                                key={key}
                                                scope="col"
                                                className="text-right"
                                            >
                                                {label}
                                                <span className="block text-xs font-normal text-muted-foreground">
                                                    {number.format(
                                                        Number(
                                                            filters[
                                                                `${key}_seconds`
                                                            ],
                                                        ),
                                                    )}{' '}
                                                    detik/entry
                                                </span>
                                            </TableHead>
                                        ))}
                                        {productivity.totals.unclassified >
                                            0 && (
                                            <TableHead
                                                scope="col"
                                                className="text-right"
                                            >
                                                Belum terklasifikasi
                                            </TableHead>
                                        )}
                                        <TableHead
                                            scope="col"
                                            className="bg-muted text-right"
                                        >
                                            Total entry
                                        </TableHead>
                                        <TableHead
                                            scope="col"
                                            className="text-right"
                                        >
                                            Estimasi waktu SLA
                                        </TableHead>
                                        <TableHead
                                            scope="col"
                                            className="text-right"
                                        >
                                            Produktivitas
                                            <span className="block text-xs font-normal text-muted-foreground">
                                                7 jam/hari
                                            </span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {productivity.rows.map((row) => (
                                        <TableRow
                                            key={row.staff ?? '__missing__'}
                                            className="tabular-nums even:bg-muted/30"
                                        >
                                            <TableCell className="max-w-64 whitespace-normal">
                                                <span className="block font-medium wrap-break-word">
                                                    {row.name}
                                                </span>
                                                {row.staff &&
                                                    row.staff !== row.name && (
                                                        <span className="text-xs text-muted-foreground">
                                                            {row.staff}
                                                        </span>
                                                    )}
                                            </TableCell>
                                            {categories.map(([key]) => (
                                                <TableCell
                                                    key={key}
                                                    className="text-right"
                                                >
                                                    {number.format(row[key])}
                                                </TableCell>
                                            ))}
                                            {productivity.totals.unclassified >
                                                0 && (
                                                <TableCell className="text-right">
                                                    {number.format(
                                                        row.unclassified,
                                                    )}
                                                </TableCell>
                                            )}
                                            <TableCell className="bg-muted text-right font-semibold">
                                                {number.format(row.total)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {row.unclassified > 0
                                                    ? '≥ '
                                                    : ''}
                                                {duration(
                                                    row.estimated_seconds,
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Productivity row={row} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <ul
                            className="flex flex-col gap-2 md:hidden"
                            aria-label="Daftar petugas"
                        >
                            {productivity.rows.map((row) => (
                                <li
                                    key={row.staff ?? '__missing__'}
                                    className="flex min-w-0 flex-col gap-3 rounded-lg border p-3 tabular-nums"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-medium wrap-break-word">
                                                {row.name}
                                            </p>
                                            {row.staff &&
                                                row.staff !== row.name && (
                                                    <p className="text-xs text-muted-foreground">
                                                        {row.staff}
                                                    </p>
                                                )}
                                        </div>
                                        <Productivity row={row} />
                                    </div>
                                    <dl className="grid grid-cols-4 gap-2 text-sm">
                                        {[
                                            ...categories,
                                            ['total', 'Total'] as const,
                                        ].map(([key, label]) => (
                                            <div key={key}>
                                                <dt className="text-xs text-muted-foreground">
                                                    {label}
                                                </dt>
                                                <dd className="font-medium">
                                                    {number.format(row[key])}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                    <p className="text-sm text-muted-foreground">
                                        Estimasi SLA:{' '}
                                        {row.unclassified > 0 ? '≥ ' : ''}
                                        {duration(row.estimated_seconds)}
                                        {row.unclassified > 0 &&
                                            ` · ${number.format(row.unclassified)} belum terklasifikasi`}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </section>
        </PageContainer>
    );
}

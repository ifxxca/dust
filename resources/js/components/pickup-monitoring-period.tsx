import { Link, router } from '@inertiajs/react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { index } from '@/routes/pickup-results';

export type MonitoringOperations = {
    today: string;
    presets: Record<string, { date_from: string; date_to: string }>;
    activity: Record<string, number | null>;
    backlog: Record<string, number>;
};
export const dateBases: Record<string, string> = {
    pickup: 'Hari operasional pickup',
};
export function operationalRangeLabel(from: string, to = from) {
    const format = (date: string) =>
        new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'Asia/Jakarta',
        }).format(new Date(`${date}T05:00:00+07:00`));
    return `Hari Operasional: ${format(from)}${from === to ? '' : ` – ${format(to)}`} · 05.00–04.59 WIB`;
}
export function cohortScope(filters: Record<string, string>, today: string) {
    if (filters.scope === 'outstanding')
        return `Antrean lintas hari · hingga hari operasional ${today}; status terkini`;
    return filters.scope === 'backlog'
        ? `Backlog pickup sebelum hari operasional ${today}; status terkini`
        : `${operationalRangeLabel(filters.date_from, filters.date_to)} · status terkini`;
}
export function MonitoringPeriodControls({
    operations,
    filters,
    values,
    setData,
    errors = {},
}: {
    operations: MonitoringOperations;
    filters: Record<string, string>;
    values: Record<string, string>;
    setData: (
        update: (current: Record<string, string>) => Record<string, string>,
    ) => void;
    errors?: Record<string, string | undefined>;
}) {
    const dateInput = useRef<HTMLInputElement>(null);
    return (
        <div className="space-y-3 border-b pb-4">
            {['date_from', 'date_to', 'date_basis'].map(
                (key) =>
                    errors[key] && (
                        <p
                            key={key}
                            role="alert"
                            className="text-xs text-destructive"
                        >
                            {errors[key]}
                        </p>
                    ),
            )}
            <div
                className="flex flex-wrap gap-2"
                aria-label="Periode monitoring"
            >
                {Object.entries(operations.presets).map(([key, dates]) => (
                    <Button
                        key={key}
                        type="button"
                        variant={
                            filters.scope !== 'backlog' &&
                            filters.date_from === dates.date_from &&
                            filters.date_to === dates.date_to
                                ? 'default'
                                : 'outline'
                        }
                        onClick={() =>
                            router.get(
                                index({
                                    query: {
                                        ...filters,
                                        ...dates,
                                        scope: 'daily',
                                        page: 1,
                                    },
                                }),
                                {},
                                { preserveScroll: true },
                            )
                        }
                    >
                        {
                            {
                                today: 'Hari Ini',
                                yesterday: 'Kemarin',
                                week: '7 Hari',
                            }[key]
                        }
                    </Button>
                ))}
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => dateInput.current?.focus()}
                >
                    Rentang Tanggal
                </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                    <Label htmlFor="monitoring-from">Dari tanggal</Label>
                    <Input
                        ref={dateInput}
                        id="monitoring-from"
                        type="date"
                        value={values.date_from}
                        required
                        onInput={(event) => {
                            const value = event.currentTarget.value;
                            setData((current) => ({
                                ...current,
                                date_from: value,
                                scope: 'daily',
                            }));
                        }}
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="monitoring-to">Sampai tanggal</Label>
                    <Input
                        id="monitoring-to"
                        type="date"
                        value={values.date_to}
                        required
                        onInput={(event) => {
                            const value = event.currentTarget.value;
                            setData((current) => ({
                                ...current,
                                date_to: value,
                                scope: 'daily',
                            }));
                        }}
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="monitoring-basis">
                        Acuan tanggal daftar & ekspor
                    </Label>
                    <select
                        id="monitoring-basis"
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={values.date_basis}
                        onChange={(event) => {
                            const value = event.target.value;
                            setData((current) => ({
                                ...current,
                                date_basis: value,
                            }));
                        }}
                    >
                        {Object.entries(dateBases).map(([key, label]) => (
                            <option key={key} value={key}>
                                {label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <p className="text-xs text-muted-foreground">
                Asia/Jakarta · 7 Hari = hari ini dan enam hari sebelumnya.
                Tanggal sukses JNE Hybrid/MyORION belum tersedia; waktu
                pencatatan manual tidak membuktikan waktu sukses input.
            </p>
            {filters.scope === 'backlog' && (
                <p
                    role="status"
                    className="text-sm text-amber-800 dark:text-amber-300"
                >
                    Daftar backlog memakai pickup sebelum hari operasional{' '}
                    {operations.today}, di luar periode pilihan. Pilih periode
                    atau ubah tanggal untuk kembali ke daftar harian.
                </p>
            )}
        </div>
    );
}

export function PickupOperationsSummary({
    operations,
    filters,
    section = 'all',
}: {
    operations: MonitoringOperations;
    filters: Record<string, string>;
    section?: 'activity' | 'backlog' | 'all';
}) {
    const isToday =
        filters.date_from === operations.today &&
        filters.date_to === operations.today;
    const backlogFilters = Object.fromEntries(
        Object.entries(filters).filter(
            ([key]) =>
                ![
                    'visit_outcome',
                    'pop_status',
                    'handover_status',
                    'verification_status',
                    'discrepancy_status',
                    'processing_status',
                    'provenance',
                    'reconciliation',
                    'group_by',
                    'pickup_queue',
                ].includes(key),
        ),
    );
    const activity = [
        [
            'pop_quantity',
            'Total paket POP',
            'Jumlah POP terkini untuk pickup dalam hari operasional pilihan',
        ],
        [
            'scheduled',
            'Pickup dijadwalkan',
            'Pickup dan rencana dalam hari operasional pilihan',
        ],
        [
            'visited',
            'Pickup dikunjungi',
            'Pickup dalam hari operasional pilihan yang sudah dikunjungi; dihitung sekali',
        ],
        [
            'received_quantity',
            'Paket diterima Retail',
            'Penerimaan terkini untuk pickup dalam hari operasional pilihan',
        ],
        [
            'confirmed_processed_quantity',
            'Berhasil dikonfirmasi sistem',
            'Tanggal sukses eksternal belum tersedia',
        ],
        [
            'manual_success_change',
            'Perubahan berhasil manual',
            'Perubahan bersih catatan Admin; koreksi dapat mengurangi jumlah',
        ],
        [
            'manual_failed_change',
            'Perubahan gagal manual',
            'Perubahan bersih catatan Admin, termasuk koreksi',
        ],
        [
            'manual_unknown_change',
            'Perubahan hasil belum jelas',
            'Perubahan bersih catatan Admin, termasuk koreksi',
        ],
        [
            'received_cohort_manual_remaining',
            'Sisa menurut catatan Admin',
            'Pickup periode pilihan: jumlah diterima yang belum tercakup catatan berhasil manual',
        ],
    ];
    const backlog = [
        [
            'unconfirmed_quantity',
            'Backlog paket belum terkonfirmasi',
            'Pickup sebelum hari operasional saat ini; termasuk yang dinyatakan berhasil manual',
        ],
        [
            'manual_remaining_quantity',
            'Sisa menurut catatan Admin',
            'Penerimaan lama yang belum tercakup catatan berhasil manual',
        ],
        [
            'waiting_handover',
            'Menunggu handover',
            'Pickup lama dengan POP final, tanpa sesi',
        ],
        [
            'waiting_verification',
            'Menunggu verifikasi',
            'Pickup lama; belum diperiksa atau perlu tinjau ulang',
        ],
        [
            'reconciliation_count',
            'Rekonsiliasi pemrosesan',
            'Kategori yang perlu ditinjau; dihitung per kategori pickup',
        ],
    ];
    return (
        <div className="space-y-5">
            {section !== 'backlog' && (
                <section
                    className="space-y-3"
                    aria-label="Aktivitas operasional"
                >
                    <h2 className="font-semibold">
                        {isToday
                            ? 'Aktivitas Hari Ini'
                            : 'Aktivitas Periode Terpilih'}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        {filters.date_from} – {filters.date_to} · Asia/Jakarta.
                        Mengikuti pencarian, customer, petugas, kategori dan
                        sistem. Filter status hanya menyaring daftar pickup.
                    </p>
                    <div
                        className={
                            section === 'all'
                                ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4'
                                : 'grid gap-3 sm:grid-cols-2'
                        }
                    >
                        {activity.map(([key, label, basis]) => (
                            <div
                                key={key}
                                className="rounded-xl border bg-card p-4"
                            >
                                <p className="text-xs text-muted-foreground">
                                    {label}
                                </p>
                                <p className="my-2 text-2xl font-semibold tabular-nums">
                                    {operations.activity[key] == null
                                        ? '—'
                                        : Number(
                                              operations.activity[key],
                                          ).toLocaleString('id-ID')}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {basis} · {filters.date_from} –{' '}
                                    {filters.date_to} WIB
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            )}
            {section !== 'activity' && (
                <section
                    className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/30 p-4 dark:bg-amber-950/10"
                    aria-label="Pekerjaan tertunda"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-semibold">Pekerjaan Tertunda</h2>
                        <Button asChild variant="outline" size="sm">
                            <Link
                                href={index({
                                    query: {
                                        ...backlogFilters,
                                        scope: 'backlog',
                                        page: 1,
                                    },
                                })}
                            >
                                Lihat backlog
                            </Link>
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Status terkini untuk pickup sebelum hari operasional{' '}
                        {operations.today} WIB. Tidak dibatasi periode pilihan;
                        hitungan di bawah dapat beririsan. Catatan manual belum
                        membuktikan keberhasilan input di JNE Hybrid / MyORION.
                    </p>
                    <div
                        className={
                            section === 'all'
                                ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-5'
                                : 'grid gap-3 sm:grid-cols-2'
                        }
                    >
                        {backlog.map(([key, label, basis]) => (
                            <div
                                key={key}
                                className="rounded-lg border bg-card p-3"
                            >
                                <p className="text-xs text-muted-foreground">
                                    {label}
                                </p>
                                <p className="my-2 text-xl font-semibold tabular-nums">
                                    {operations.backlog[key].toLocaleString(
                                        'id-ID',
                                    )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {basis} · sebelum {operations.today} WIB
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

import type {
    ReconciliationCounts,
    ReconciliationRow,
} from '@/types/pickup-reconciliation';

export const reconciliationCategories = [
    ['manual_hybrid', 'Manual Hybrid'],
    ['cashless_hybrid', 'Cashless Hybrid'],
    ['css_orion', 'CSS / Orion'],
] as const;
const categoryNames = {
    manual_hybrid: 'Manual',
    cashless_hybrid: 'Cashless',
    css_orion: 'CSS/Orion',
} as const;

export function reconciliationCategoryStates(
    row: Pick<ReconciliationRow, 'categories'> &
        Partial<Pick<ReconciliationRow, 'dirty' | 'quantity_status'>>,
) {
    const stale = row.dirty || row.quantity_status === 'NOT_EVALUATED';
    return reconciliationCategories.map(([key]) => {
        const count = row.categories[key];
        const expected = count?.expected ?? null;
        const confirmed = count?.confirmed ?? 0;
        const delta = expected === null ? null : confirmed - expected;
        const relevant =
            expected !== 0 || confirmed > 0 || (count?.pop ?? 0) > 0;
        const state = stale
            ? 'stale'
            : expected === null
              ? 'waiting'
              : delta! < 0
                ? 'shortage'
                : delta! > 0
                  ? 'excess'
                  : 'matched';
        const label = categoryNames[key];
        return {
            key,
            label,
            expected,
            confirmed,
            delta,
            relevant,
            state,
            text:
                state === 'stale'
                    ? `${label} belum diperiksa`
                    : state === 'waiting'
                      ? `${label} menunggu target`
                      : state === 'shortage'
                        ? `${label} kurang ${Math.abs(delta!)}`
                        : state === 'excess'
                          ? `${label} lebih ${delta}`
                          : `${label} cocok`,
        };
    });
}

export function reconciliationProgress(
    row: Pick<ReconciliationRow, 'categories'> &
        Partial<
            Pick<
                ReconciliationRow,
                'dirty' | 'quantity_status' | 'finalization_status'
            >
        >,
) {
    const states = reconciliationCategoryStates(row);
    if (
        states.some(
            (category) =>
                category.state === 'stale' || category.expected === null,
        )
    ) {
        return { percent: null, fill: 0, tone: 'pending' as const };
    }
    const expected = states.reduce(
        (sum, category) => sum + category.expected!,
        0,
    );
    if (expected <= 0)
        return { percent: null, fill: 0, tone: 'pending' as const };
    const hasShortage = states.some(
        (category) => category.state === 'shortage',
    );
    const hasExcess = states.some((category) => category.state === 'excess');
    const allocated = states.reduce(
        (sum, category) =>
            sum +
            (hasShortage && hasExcess
                ? Math.min(category.confirmed, category.expected!)
                : category.confirmed),
        0,
    );
    const percent = Math.round((allocated / expected) * 100);
    const tone =
        hasExcess || row.finalization_status === 'LOCKED_REVIEW'
            ? 'danger'
            : hasShortage ||
                row.quantity_status === 'CONFLICT' ||
                row.finalization_status !== 'LOCKED'
              ? 'warning'
              : 'success';
    return { percent, fill: Math.min(100, percent), tone };
}
export const quantityLabels: Record<string, string> = {
    MATCHED: 'Cocok',
    SHORTAGE: 'Kurang',
    EXCESS: 'Lebih',
    CONFLICT: 'Konflik',
    UNKNOWN: 'Target belum sah',
    NOT_EVALUATED: 'Perlu hitung ulang',
};
export const deliveryLabels: Record<string, string> = {
    NOT_READY: 'Belum siap',
    BUILDING_DOCUMENT: 'Membuat dokumen',
    DOCUMENT_FAILED: 'Dokumen gagal',
    AWAITING_CONFIGURATION: 'Menunggu konfigurasi',
    READY: 'Antre kirim',
    SENDING: 'Sedang dikirim',
    ACCEPTED: 'Diterima provider',
    DELIVERED: 'Terkirim',
    FAILED: 'Gagal',
    UNKNOWN: 'Hasil belum pasti',
    CANCELLED: 'Dibatalkan',
    REVIEW: 'Periksa koreksi',
};
export const reconciliationLabels: Record<string, string> = {
    NOT_EVALUATED: 'Belum diperiksa',
    AWAITING_VERIFICATION: 'Menunggu gudang',
    WAITING_DATA: 'Menunggu data',
    PARTIAL: 'Menunggu data',
    COUNTS_MATCHED: 'Validasi sumber',
    REVIEW: 'Perlu diperiksa',
    DONE: 'Selesai',
};
export function reconciliationTotal(
    counts: Record<string, ReconciliationCounts>,
    field: 'expected' | 'pop' | 'received' | 'confirmed',
): number | null {
    const values = reconciliationCategories
        .map(([key]) => counts[key]?.[field])
        .filter((value): value is number => value != null);
    return values.length
        ? values.reduce((sum, value) => sum + Number(value), 0)
        : null;
}
export function reconciliationIssue(
    counts: Record<string, ReconciliationCounts>,
    reasons: string[] | null = [],
): { title: string; description: string } {
    const issues = reasons ?? [];
    const changed = Object.values(counts).some(
        (row) => row.expected !== null && row.confirmed !== row.expected,
    );
    if (
        changed &&
        reconciliationTotal(counts, 'expected') ===
            reconciliationTotal(counts, 'confirmed')
    )
        return {
            title: 'Indikasi kategori tertukar',
            description:
                'Total jumlah cocok, tetapi distribusi per kategori berbeda. Periksa bukti kategori sebelum melakukan koreksi.',
        };
    if (changed)
        return {
            title: 'Jumlah resi belum sesuai',
            description:
                issues[0] ??
                'Bandingkan jumlah resi JNE dengan target verifikasi gudang pada setiap kategori.',
        };
    return {
        title: issues.length
            ? 'Bukti perlu diperiksa'
            : 'Menunggu kelengkapan data',
        description:
            issues[0] ??
            'Validasi akan diperbarui saat bukti pickup, verifikasi gudang, dan data JNE tersedia.',
    };
}
export function rowPackageTotal(row: ReconciliationRow): number | null {
    const total = reconciliationTotal(row.categories, 'pop');
    return (
        total ??
        (row.picked_up_at
            ? Number(row.manual_hybrid ?? 0) +
              Number(row.cashless_hybrid ?? 0) +
              Number(row.css_orion ?? 0)
            : null)
    );
}
export function reconciliationTime(
    value: string | null,
    timezone: string,
    short = false,
): string {
    if (!value) return '—';
    const date = new Date(
        value.includes('T') ? value : value.replace(' ', 'T') + 'Z',
    );
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('id-ID', {
        timeZone: timezone,
        day: '2-digit',
        month: short ? 'short' : 'long',
        ...(short ? {} : { year: 'numeric' as const }),
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

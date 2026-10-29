import type { ScannedCashlessEntry } from '@/types/cashless-handover';

export function cashlessScanStatus(entry: ScannedCashlessEntry | null): {
    label: string;
    variant: 'secondary' | 'outline' | 'destructive';
    complete: boolean;
    detail: string | null;
} {
    if (!entry)
        return {
            label: 'Tercatat',
            variant: 'outline',
            complete: false,
            detail: 'Belum masuk antrean pemrosesan.',
        };
    if (entry.status === 'ACCEPTED') {
        const complete =
            !!entry.approved_at &&
            ['DONE', 'PARTIAL'].includes(entry.batch_status);
        const interrupted = ['FAILED', 'UNKNOWN', 'CANCELLED'].includes(
            entry.batch_status,
        );
        return {
            label: complete
                ? 'Selesai'
                : interrupted
                  ? 'Perlu diperiksa'
                  : 'Menunggu approve',
            variant: complete ? 'secondary' : 'outline',
            complete,
            detail: complete
                ? null
                : (entry.batch_message ??
                  'Resi sudah masuk HO; persetujuan batch belum selesai.'),
        };
    }
    const labels: Record<string, string> = {
        PENDING: 'Dalam antrean',
        IN_FLIGHT: 'Sedang diproses',
        PREVIOUSLY_ENTERED: 'Sudah pernah diproses',
        ORION_REJECTED: 'Ditolak Orion',
        NOT_FOUND: 'Resi tidak ditemukan',
        NEEDS_DATA: 'Lengkapi data',
        INVALID: 'Resi tidak valid',
        UNKNOWN: 'Perlu diperiksa',
        CANCELLED: 'Dibatalkan',
    };
    const interrupted =
        entry.status === 'PENDING' &&
        ['FAILED', 'UNKNOWN', 'CANCELLED'].includes(entry.batch_status);
    return {
        label: interrupted
            ? 'Perlu diperiksa'
            : (labels[entry.status] ?? 'Perlu diperiksa'),
        variant: ['ORION_REJECTED', 'NOT_FOUND', 'INVALID'].includes(
            entry.status,
        )
            ? 'destructive'
            : 'outline',
        complete: false,
        detail: entry.message ?? entry.batch_message,
    };
}

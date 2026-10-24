import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/operational-ui';
import type { PickupResult } from '@/types/pickup-result';
import { operationalRangeLabel } from '@/components/pickup-monitoring-period';

export function OperationalPickupContext({
    result,
    timezone,
}: {
    result: PickupResult;
    timezone: string;
}) {
    return (
        <div className="space-y-1 text-xs text-muted-foreground">
            {result.operational_date && (
                <p>{operationalRangeLabel(result.operational_date)}</p>
            )}
            {result.period_source === 'UNAVAILABLE' && (
                <p>
                    Waktu pickup/kunjungan belum tersedia; hari operasional
                    belum dapat ditentukan.
                </p>
            )}
            {result.period_source === 'SCHEDULE' && (
                <p>Rencana · belum dikunjungi</p>
            )}
            {result.handed_over_at && (
                <p>
                    {result.subsequent_handover
                        ? 'Handover pada hari berikutnya'
                        : 'Handover'}{' '}
                    · {resultDate(result.handed_over_at, timezone)}
                </p>
            )}
        </div>
    );
}

export const categories = [
    ['manual_hybrid', 'Manual Hybrid (Non-Cashless)'],
    ['cashless_hybrid', 'Cashless Hybrid'],
    ['css_orion', 'CSS / Orion'],
] as const;
export const metricDefinitions = [
    ['total', 'Total Pickup', 'Seluruh pickup sesuai filter.'],
    ['pop_final', 'POP Final', 'Memiliki waktu finalisasi POP.'],
    [
        'incomplete',
        'Belum Selesai',
        'Belum final POP, kecuali task selesai tanpa paket atau dibatalkan.',
    ],
    [
        'waiting_handover',
        'Menunggu Handover',
        'POP final dan belum masuk sesi handover.',
    ],
    [
        'unverified',
        'Belum Diverifikasi',
        'Sudah masuk handover; belum diperiksa atau perlu tinjau ulang POP.',
    ],
    [
        'verified',
        'Sudah Diverifikasi',
        'Pemeriksaan selesai atas revisi POP terkini, termasuk yang memiliki selisih.',
    ],
    [
        'discrepancy',
        'Ada Selisih',
        'Hasil verifikasi efektif DISCREPANCY; termasuk hasil yang perlu tinjau ulang.',
    ],
] as const;
export function ResultMetrics({
    summary,
    scope,
}: {
    summary: Record<string, number>;
    scope?: string;
}) {
    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {metricDefinitions.map(([key, label, description]) => (
                <div
                    key={key}
                    title={description}
                    className="rounded-xl border bg-card p-4"
                >
                    <p className="text-xs font-medium text-muted-foreground">
                        {label}
                    </p>
                    <p
                        className={`mt-2 text-2xl font-semibold tabular-nums ${key === 'discrepancy' && summary[key] ? 'text-amber-700 dark:text-amber-300' : ''}`}
                    >
                        {(summary[key] ?? 0).toLocaleString('id-ID')}
                    </p>
                    {scope && (
                        <p className="mt-2 text-xs text-muted-foreground">
                            {scope}
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}
export function ResultStatus({
    result,
    dimension,
}: {
    result: PickupResult;
    dimension: 'visit' | 'pop' | 'handover' | 'verification' | 'discrepancy';
}) {
    const tag = (text: string, warning = false) => (
        <Badge
            variant="outline"
            className={
                warning
                    ? 'border-amber-400 text-amber-800 dark:text-amber-300'
                    : 'text-muted-foreground'
            }
        >
            {text}
        </Badge>
    );
    switch (dimension) {
        case 'visit':
            return result.visit_outcome ? (
                <StatusBadge status={result.visit_outcome} />
            ) : (
                tag(
                    result.visit_started_at
                        ? 'Kunjungan berjalan'
                        : 'Belum dikunjungi',
                )
            );
        case 'pop':
            return tag(
                result.finalized_at
                    ? 'POP Final'
                    : result.task_status === 'NO_PACKAGES'
                      ? 'Tanpa paket'
                      : result.task_status === 'CANCELLED'
                        ? 'Dibatalkan'
                        : result.proof_id
                          ? 'Draft'
                          : 'Belum dibuat',
            );
        case 'handover':
            return result.handover_status ? (
                <StatusBadge status={result.handover_status} />
            ) : (
                tag(
                    result.finalized_at
                        ? 'Menunggu handover'
                        : 'Belum ada handover',
                )
            );
        case 'verification':
            return tag(
                result.needs_review
                    ? 'Perlu tinjau ulang'
                    : ['VERIFIED', 'DISCREPANCY'].includes(
                            result.verification_status ?? '',
                        )
                      ? 'Sudah diverifikasi'
                      : 'Belum diverifikasi',
                result.needs_review,
            );
        case 'discrepancy':
            return tag(
                result.verification_status === 'DISCREPANCY'
                    ? 'Ada selisih'
                    : result.verification_status === 'VERIFIED'
                      ? result.needs_review
                          ? 'Sesuai · POP lama'
                          : 'Sesuai'
                      : 'Belum diperiksa',
                result.verification_status === 'DISCREPANCY',
            );
    }
}
export function resultDate(value: string | null | undefined, timezone: string) {
    return value
        ? new Date(value).toLocaleString('id-ID', {
              timeZone: timezone,
              dateStyle: 'medium',
              timeStyle: 'short',
          })
        : '—';
}

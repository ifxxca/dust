import { MonitoringMetric } from '@/components/monitoring-workspace';
import { router } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { categories, resultDate } from '@/components/pickup-result-ui';
import { Badge } from '@/components/ui/badge';
import type {
    ProcessingPagination,
    ProcessingSummary,
} from '@/types/package-processing';
export const processingLabels: Record<string, string> = {
    NOT_RECORDED: 'Belum ada catatan',
    MANUAL_RECORDED: 'Dicatat manual',
    PENDING: 'Menunggu — manual',
    FAILED: 'Gagal — manual',
    UNKNOWN: 'Outcome tidak diketahui',
    RECONCILIATION_REQUIRED: 'Perlu rekonsiliasi',
    MANUAL: 'Dicatat Manual',
    EXTERNAL: 'Dikonfirmasi Sistem',
    JNE_HYBRID: 'JNE Hybrid',
    MYORION: 'MyORION',
};
export const categoryName = (key: string) =>
    categories.find(([category]) => category === key)?.[1] ?? key;
export const quantity = (value: number | string | null | undefined) =>
    value == null ? '—' : Number(value).toLocaleString('id-ID');
export function ProcessingStatus({ status }: { status: string }) {
    const color =
        status === 'RECONCILIATION_REQUIRED' || status === 'PENDING'
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
            : status === 'FAILED'
              ? 'border-red-200 bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
              : status === 'MANUAL_RECORDED'
                ? 'border-blue-200 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200'
                : 'bg-muted text-muted-foreground';
    return (
        <Badge
            variant="outline"
            className={`font-normal whitespace-nowrap ${color}`}
        >
            {processingLabels[status] ?? status}
        </Badge>
    );
}
export const processingDate = (value: string | null, timezone: string) =>
    resultDate(
        value
            ? /[Zz]|[+-]\d\d:\d\d$/.test(value)
                ? value
                : value.replace(' ', 'T') + 'Z'
            : null,
        timezone,
    );
export function ProcessingSource() {
    return (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-medium">
                Sumber: deklarasi manual Admin. Konfirmasi JNE Hybrid / MyORION
                belum tersedia.
            </p>
            <p className="text-muted-foreground">
                Berhasil manual bukan konfirmasi sistem. Status belum diketahui
                mencakup seluruh jumlah Retail yang belum terkonfirmasi
                eksternal; jika Retail belum diverifikasi, acuannya POP. Angka
                ini dapat tumpang tindih dengan catatan manual, pending, dan
                gagal.
            </p>
        </div>
    );
}
export function ProcessingMetrics({
    summary,
    received = summary.received_quantity,
    confirmed = summary.confirmed_quantity,
    periodText = 'Periode terpilih',
}: {
    summary: ProcessingSummary;
    received?: number | null;
    confirmed?: number | null;
    periodText?: string;
}) {
    const primary = [
        [
            'Paket Diterima',
            received,
            `Pickup ${periodText} · penerimaan terkini`,
            '',
        ],
        [
            'Berhasil Diinput',
            confirmed,
            'Konfirmasi JNE Hybrid / MyORION belum tersedia',
            '',
        ],
        [
            'Belum Terkonfirmasi',
            summary.unconfirmed_quantity,
            'Paket dalam daftar · termasuk catatan manual',
            '',
        ],
        [
            'Perlu Perhatian',
            summary.attention_count,
            'Kategori pickup · konflik, gagal, atau outcome hilang',
            'text-amber-700 dark:text-amber-300',
        ],
    ] as const;
    return (
        <section
            className="grid grid-cols-2 gap-2 xl:grid-cols-4"
            aria-label="Ringkasan operasional"
        >
            {primary.map(([label, value, hint, color]) => (
                <MonitoringMetric
                    key={label}
                    label={label}
                    value={value ?? null}
                    hint={hint}
                    warning={!!value && !!color}
                />
            ))}
        </section>
    );
}
export function ProcessingDeclarations({
    summary,
}: {
    summary: ProcessingSummary;
}) {
    return (
        <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span>
                Berhasil manual{' '}
                <strong className="ml-1 tabular-nums">
                    {quantity(summary.manual_quantity)}
                </strong>
            </span>
            <span>
                Gagal manual{' '}
                <strong className="ml-1 tabular-nums">
                    {quantity(summary.failed_quantity)}
                </strong>
            </span>
            <span>
                Outcome tidak diketahui{' '}
                <strong className="ml-1 tabular-nums">
                    {quantity(summary.unknown_outcome_quantity)}
                </strong>
            </span>
        </div>
    );
}
export function ProcessingPager({
    page,
}: {
    page: ProcessingPagination<unknown>;
}) {
    return (
        <div className="flex items-center justify-between gap-3 text-sm">
            <span>
                Halaman {page.current_page} / {page.last_page} · {page.total}{' '}
                baris
            </span>
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    disabled={!page.prev_page_url}
                    onClick={() =>
                        page.prev_page_url &&
                        router.visit(page.prev_page_url, {
                            preserveState: true,
                            preserveScroll: true,
                        })
                    }
                >
                    Sebelumnya
                </Button>
                <Button
                    variant="outline"
                    disabled={!page.next_page_url}
                    onClick={() =>
                        page.next_page_url &&
                        router.visit(page.next_page_url, {
                            preserveState: true,
                            preserveScroll: true,
                        })
                    }
                >
                    Berikutnya
                </Button>
            </div>
        </div>
    );
}

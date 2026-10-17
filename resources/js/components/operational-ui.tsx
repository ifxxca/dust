import {
    Inbox,
    LoaderCircle,
    Clock3,
    Truck,
    CheckCircle2,
    AlertTriangle,
    PackageCheck,
    LockKeyhole,
    CalendarDays,
    XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const statusLabels: Record<string, string> = {
    SCHEDULED: 'Menunggu assignment',
    ASSIGNED: 'Ditugaskan',
    IN_PROGRESS: 'Pickup Berjalan',
    PICKED_UP: 'Pickup berhasil',
    CANCELLED: 'Dibatalkan',
    DRAFT: 'Menunggu penerimaan',
    IN_VERIFICATION: 'Dalam verifikasi',
    CLOSED: 'Ditutup',
    PENDING: 'Belum diperiksa',
    VERIFIED: 'Sesuai',
    DISCREPANCY: 'Selisih',
    COLLECTED: 'Paket diambil',
    NO_PACKAGES: 'Selesai tanpa paket',
};
export function StatusBadge({ status }: { status: string }) {
    const icons = {
        SCHEDULED: CalendarDays,
        DRAFT: Clock3,
        ASSIGNED: Truck,
        IN_PROGRESS: Clock3,
        PICKED_UP: CheckCircle2,
        COLLECTED: CheckCircle2,
        VERIFIED: PackageCheck,
        DISCREPANCY: AlertTriangle,
        NO_PACKAGES: AlertTriangle,
        CLOSED: LockKeyhole,
        CANCELLED: XCircle,
        IN_VERIFICATION: Clock3,
    };
    const StatusIcon = icons[status as keyof typeof icons];
    const style = ['PICKED_UP', 'VERIFIED', 'COLLECTED'].includes(status)
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
        : ['DISCREPANCY', 'NO_PACKAGES', 'SCHEDULED', 'DRAFT'].includes(status)
          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
          : ['ASSIGNED', 'IN_VERIFICATION', 'IN_PROGRESS'].includes(status)
            ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300'
            : 'border-border bg-muted text-muted-foreground';
    return (
        <Badge
            title={status}
            variant="outline"
            className={`gap-1.5 px-2.5 py-1 font-medium whitespace-nowrap ${style}`}
        >
            {StatusIcon && <StatusIcon aria-hidden="true" className="size-3" />}
            {statusLabels[status] ?? status}
        </Badge>
    );
}
export function EmptyState({
    title = 'Belum ada data',
    description = 'Data akan muncul di sini setelah aktivitas operasional dicatat.',
    loading = false,
}: {
    title?: string;
    description?: string;
    loading?: boolean;
}) {
    return (
        <div
            role={loading ? 'status' : undefined}
            className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed bg-card p-5 text-center"
        >
            <div className="mb-3 rounded-full bg-muted p-3">
                {loading ? (
                    <LoaderCircle className="size-5 animate-spin text-primary" />
                ) : (
                    <Inbox className="size-5 text-muted-foreground" />
                )}
            </div>
            <h3 className="font-semibold">
                {loading ? 'Memuat data…' : title}
            </h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {loading ? 'Mengambil informasi terbaru.' : description}
            </p>
        </div>
    );
}

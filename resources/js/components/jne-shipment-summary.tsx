import { CircleCheck, PackageSearch, Truck, XCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { trackingLabels } from '@/lib/jne-monitoring';

export default function JneShipmentSummary({
    summary,
    status,
    loading,
    onChange,
}: {
    summary: Record<string, number>;
    status: string;
    loading: boolean;
    onChange: (status: string) => void;
}) {
    return (
        <section aria-label="Ringkasan status pengiriman" className="space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                    {
                        key: '',
                        label: 'Semua pengiriman',
                        count: Object.values(summary).reduce(
                            (sum, count) => sum + count,
                            0,
                        ),
                        icon: PackageSearch,
                    },
                    {
                        key: 'DELIVERED',
                        label: 'Terkirim',
                        count: summary.DELIVERED || 0,
                        icon: CircleCheck,
                    },
                    {
                        key: 'IN_TRANSIT',
                        label: 'Dalam proses',
                        count: summary.IN_TRANSIT || 0,
                        icon: Truck,
                    },
                    {
                        key: 'CANCELLED',
                        label: 'Dibatalkan',
                        count: summary.CANCELLED || 0,
                        icon: XCircle,
                    },
                ].map(({ key, label, count, icon: Icon }) => (
                    <button
                        key={key}
                        type="button"
                        aria-pressed={status === key}
                        disabled={loading}
                        onClick={() => onChange(key)}
                        className={`flex min-w-0 cursor-pointer flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-50 ${status === key ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/10' : ''}`}
                    >
                        <span className="flex w-full items-center justify-between gap-2 text-xs font-medium text-muted-foreground sm:text-sm">
                            {label}
                            <Icon
                                aria-hidden="true"
                                className="size-4 shrink-0"
                            />
                        </span>
                        <span className="text-3xl font-semibold tracking-tight tabular-nums">
                            {count.toLocaleString('id-ID')}
                        </span>
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                    Ringkasan mengikuti pencarian dan filter customer.
                </p>
                <div className="flex w-full items-center gap-3 sm:w-auto">
                    <Label
                        htmlFor="jne-status-filter"
                        className="shrink-0 text-xs"
                    >
                        Status
                    </Label>
                    <Select
                        value={status || 'all'}
                        disabled={loading}
                        onValueChange={(value) =>
                            onChange(value === 'all' ? '' : value)
                        }
                    >
                        <SelectTrigger
                            id="jne-status-filter"
                            className="min-h-11 w-full sm:w-64"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Semua status</SelectItem>
                            {Object.entries(trackingLabels).map(
                                ([key, label]) => (
                                    <SelectItem key={key} value={key}>
                                        {label} ·{' '}
                                        {(summary[key] || 0).toLocaleString(
                                            'id-ID',
                                        )}
                                    </SelectItem>
                                ),
                            )}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </section>
    );
}

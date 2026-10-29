import { CircleCheck, FileText, HelpCircle, Truck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { trackingLabels } from '@/lib/jne-monitoring';
import { cn } from '@/lib/utils';

export function JneShipmentMetrics({
    summary,
}: {
    summary: Record<string, number>;
}) {
    const total = Object.values(summary).reduce((sum, value) => sum + value, 0);
    return (
        <section
            aria-label="Ringkasan pengiriman"
            className="grid grid-cols-2 gap-3 xl:grid-cols-4"
        >
            {[
                {
                    label: 'Total AWB',
                    count: total,
                    icon: FileText,
                    tone: 'bg-primary/10 text-primary',
                    caption: 'Sesuai filter pencarian',
                },
                {
                    label: 'Dalam proses',
                    count: summary.IN_TRANSIT || 0,
                    icon: Truck,
                    tone: 'bg-primary/10 text-primary',
                },
                {
                    label: 'Terkirim',
                    count: summary.DELIVERED || 0,
                    icon: CircleCheck,
                    tone: 'bg-success/10 text-success',
                },
                {
                    label: 'Belum dikenali',
                    count: summary.UNKNOWN || 0,
                    icon: HelpCircle,
                    tone: 'bg-warning/10 text-warning',
                },
            ].map(({ label, count, icon: Icon, tone, caption }) => (
                <Card key={label} className="py-0 shadow-none">
                    <CardContent className="flex gap-2 p-3 sm:gap-3 sm:p-5">
                        <div
                            className={cn(
                                'flex size-8 shrink-0 items-center justify-center rounded-xl sm:size-12',
                                tone,
                            )}
                        >
                            <Icon
                                aria-hidden="true"
                                className="size-5 sm:size-6"
                            />
                        </div>
                        <div className="flex min-w-0 flex-col gap-1">
                            <h2 className="text-xs text-muted-foreground">
                                {label}
                            </h2>
                            <p className="text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
                                {count.toLocaleString('id-ID')}
                            </p>
                            <p className="hidden text-xs text-muted-foreground sm:block">
                                {caption ||
                                    `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(total ? (count / total) * 100 : 0)}% dari total`}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </section>
    );
}

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
    const total = Object.values(summary).reduce((sum, count) => sum + count, 0);
    return (
        <section
            aria-label="Ringkasan status pengiriman"
            className="min-w-0 overflow-x-auto pb-1"
        >
            <ToggleGroup
                type="single"
                variant="outline"
                value={status || 'all'}
                disabled={loading}
                onValueChange={(value) => {
                    if (value) onChange(value === 'all' ? '' : value);
                }}
                className="w-max justify-start"
            >
                {[
                    ['all', 'Semua'],
                    ...[
                        'IN_TRANSIT',
                        'DELIVERED',
                        'UNKNOWN',
                        'EXCEPTION',
                        'CANCELLED',
                        'RETURNED',
                    ].map((key) => [key, trackingLabels[key]]),
                ].map(([key, label]) => (
                    <ToggleGroupItem
                        key={key}
                        value={key}
                        aria-label={`${label}: ${key === 'all' ? total : summary[key] || 0}`}
                        className="min-h-10 gap-2 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    >
                        <span>{label}</span>
                        <Badge
                            variant="secondary"
                            className="px-1.5 py-0 tabular-nums"
                        >
                            {(key === 'all'
                                ? total
                                : summary[key] || 0
                            ).toLocaleString('id-ID')}
                        </Badge>
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
        </section>
    );
}

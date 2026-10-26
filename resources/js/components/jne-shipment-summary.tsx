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
    const count = status
        ? summary[status] || 0
        : Object.values(summary).reduce((total, value) => total + value, 0);
    return (
        <section
            aria-label="Ringkasan status pengiriman"
            className="flex flex-wrap items-center gap-2"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
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
                            <SelectValue>
                                {status
                                    ? (trackingLabels[status] ?? status)
                                    : 'Semua status'}{' '}
                                · {count.toLocaleString('id-ID')}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">
                                Semua status ·{' '}
                                {Object.values(summary)
                                    .reduce((total, count) => total + count, 0)
                                    .toLocaleString('id-ID')}
                            </SelectItem>
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

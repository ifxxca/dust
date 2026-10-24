import { Badge } from '@/components/ui/badge';
import { trackingLabels } from '@/lib/jne-monitoring';
import {
    CircleCheck,
    CircleHelp,
    TriangleAlert,
    Truck,
    Undo2,
    XCircle,
} from 'lucide-react';

export default function JneShipmentStatus({ status }: { status: string }) {
    const Icon =
        status === 'DELIVERED'
            ? CircleCheck
            : status === 'CANCELLED'
              ? XCircle
              : status === 'RETURNED'
                ? Undo2
                : status === 'IN_TRANSIT'
                  ? Truck
                  : status === 'EXCEPTION'
                    ? TriangleAlert
                    : CircleHelp;
    const tone =
        status === 'DELIVERED'
            ? 'border-emerald-600/20 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
            : status === 'IN_TRANSIT'
              ? 'border-blue-600/20 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
              : status === 'EXCEPTION'
                ? 'border-amber-600/30 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                : '';
    return (
        <Badge
            variant="outline"
            className={`max-w-full text-left whitespace-normal ${tone}`}
        >
            <Icon aria-hidden="true" />
            {trackingLabels[status] || status || trackingLabels.UNKNOWN}
        </Badge>
    );
}

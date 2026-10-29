import { Badge } from '@/components/ui/badge';
import { categoryLabels } from '@/lib/jne-monitoring';

export default function JneCategoryBadge({
    category,
    status,
}: {
    category?: string | null;
    status?: string;
}) {
    const label = category ? categoryLabels[category] : null;
    if (status === 'CONFLICT') {
        return (
            <Badge
                variant="destructive"
                className="max-w-full whitespace-normal"
            >
                {label
                    ? `${label} · Perlu diperiksa`
                    : 'Kategori perlu diperiksa'}
            </Badge>
        );
    }
    return (
        <Badge
            variant={status === 'MATCHED' && label ? 'outline' : 'secondary'}
            className="max-w-full whitespace-normal"
        >
            {status === 'MATCHED' && label ? label : 'Belum ditandai'}
        </Badge>
    );
}

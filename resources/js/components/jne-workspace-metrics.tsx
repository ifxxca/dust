import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function JneWorkspaceMetrics({
    items,
    scope,
}: {
    items: {
        label: string;
        value: number | string;
        icon: LucideIcon;
        detail?: string;
    }[];
    scope?: string;
}) {
    return (
        <section aria-label="Ringkasan halaman" className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {items.map(({ label, value, icon: Icon, detail }) => (
                    <Card
                        key={label}
                        className="min-w-0 gap-0 py-4 shadow-none"
                    >
                        <CardContent className="px-4">
                            <div className="flex items-center justify-between gap-2 text-muted-foreground">
                                <p className="text-xs font-medium sm:text-sm">
                                    {label}
                                </p>
                                <Icon
                                    aria-hidden="true"
                                    className="size-4 shrink-0"
                                />
                            </div>
                            <p
                                className={`mt-2 font-semibold tracking-tight break-words tabular-nums ${typeof value === 'number' ? 'text-3xl' : 'text-lg sm:text-2xl'}`}
                            >
                                {typeof value === 'number'
                                    ? value.toLocaleString('id-ID')
                                    : value}
                            </p>
                            {detail && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {detail}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
            {scope && <p className="text-xs text-muted-foreground">{scope}</p>}
        </section>
    );
}

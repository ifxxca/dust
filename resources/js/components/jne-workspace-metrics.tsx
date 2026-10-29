import type { LucideIcon } from 'lucide-react';

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
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border bg-card p-3 lg:grid-cols-4">
                {items.map(({ label, value, icon: Icon, detail }) => (
                    <div key={label} className="flex min-w-0 items-start gap-2">
                        <Icon
                            aria-hidden="true"
                            className="mt-0.5 hidden size-4 shrink-0 text-muted-foreground sm:block"
                        />
                        <div className="min-w-0">
                            <dt className="text-xs font-medium text-muted-foreground">
                                {label}
                            </dt>
                            <dd className="text-lg font-semibold break-words tabular-nums">
                                {typeof value === 'number'
                                    ? value.toLocaleString('id-ID')
                                    : value}
                            </dd>
                            {detail && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {detail}
                                </p>
                            )}
                        </div>
                    </div>
                ))}
            </dl>
            {scope && <p className="text-xs text-muted-foreground">{scope}</p>}
        </section>
    );
}

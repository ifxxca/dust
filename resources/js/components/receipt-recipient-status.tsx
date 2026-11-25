export type ReceiptRecipientStatuses = Record<
    string,
    { status: string; last_error?: string | null }
>;

export function ReceiptRecipientStatus({
    recipients,
}: {
    recipients?: ReceiptRecipientStatuses | null;
}) {
    if (!recipients || Object.keys(recipients).length === 0) return null;
    const labels: Record<string, string> = {
        PENDING: 'Belum dikirim',
        PROCESSING: 'Mengirim',
        ACCEPTED_BY_PROVIDER: 'Diterima server email',
        DELIVERED: 'Diterima customer',
        FAILED: 'Gagal',
        UNKNOWN: 'Perlu diperiksa',
    };
    return (
        <ul
            className="divide-y rounded-md border px-3"
            aria-label="Status email setiap penerima"
        >
            {Object.entries(recipients).map(([email, result]) => (
                <li key={email} className="space-y-1 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 break-all">{email}</span>
                        <span
                            className={
                                ['FAILED', 'UNKNOWN'].includes(result.status)
                                    ? 'text-amber-700 dark:text-amber-300'
                                    : 'text-muted-foreground'
                            }
                        >
                            {labels[result.status] ?? result.status}
                        </span>
                    </div>
                    {result.last_error && (
                        <p className="text-xs text-muted-foreground">
                            {result.last_error}
                        </p>
                    )}
                </li>
            ))}
        </ul>
    );
}

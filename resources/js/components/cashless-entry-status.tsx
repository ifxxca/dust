import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { CashlessEntryBatch } from '@/types/cashless-handover';

const statuses: Record<string, string> = {
    WAITING_SOURCE: 'Pilih server',
    QUEUED: 'Menunggu proses',
    CLAIMED: 'Disiapkan',
    CREATING_HO: 'Membuat HO',
    ENTERING: 'Memasukkan resi',
    APPROVING: 'Approval',
    DONE: 'Selesai',
    PARTIAL: 'Selesai dengan pengecualian',
    FAILED: 'Gagal',
    CANCELLED: 'Dibatalkan',
    UNKNOWN: 'Perlu diperiksa',
};

export function CashlessSourcePicker({
    id,
    value,
    disabled,
    onChange,
}: {
    id: string;
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <div className="flex flex-col gap-2">
            <Label id={`${id}-label`}>Server tujuan</Label>
            <ToggleGroup
                id={id}
                type="single"
                variant="outline"
                value={value}
                onValueChange={onChange}
                disabled={disabled}
                aria-labelledby={`${id}-label`}
            >
                <ToggleGroupItem value="roberto" className="h-11 px-5">
                    PM
                </ToggleGroupItem>
                <ToggleGroupItem value="nuralamt" className="h-11 px-5">
                    Puman
                </ToggleGroupItem>
            </ToggleGroup>
        </div>
    );
}

export function CashlessEntryStatus({
    batches,
    enabled = true,
}: {
    batches: CashlessEntryBatch[];
    enabled?: boolean;
}) {
    if (!batches.length) return null;
    return (
        <section
            className="flex flex-col gap-3 p-4"
            aria-label="Pemrosesan cashless"
        >
            <h3 className="text-sm font-medium">Pemrosesan cashless</h3>
            {!enabled && (
                <p role="status" className="text-sm text-muted-foreground">
                    Resi tersimpan. Pemrosesan otomatis belum diaktifkan.
                </p>
            )}
            {batches.map((batch) => (
                <details key={batch.id} className="rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm">
                        <span>
                            Batch #{batch.id} ·{' '}
                            {batch.source === 'roberto'
                                ? 'PM'
                                : batch.source === 'nuralamt'
                                  ? 'Puman'
                                  : 'Server belum dipilih'}{' '}
                            · {batch.items_count} resi{' '}
                        </span>
                        <Badge
                            variant={
                                ['UNKNOWN', 'FAILED', 'PARTIAL'].includes(
                                    batch.status,
                                )
                                    ? 'destructive'
                                    : 'secondary'
                            }
                        >
                            {statuses[batch.status] ?? batch.status}
                        </Badge>
                    </summary>
                    <div className="mt-3 flex flex-col gap-2 text-sm">
                        {batch.ho_number && (
                            <p className="break-all">HO: {batch.ho_number}</p>
                        )}
                        {batch.error_message && (
                            <p role="status" className="text-destructive">
                                {batch.error_message}
                            </p>
                        )}
                        <ul className="max-h-60 divide-y overflow-y-auto">
                            {batch.items.map((item) => (
                                <li
                                    key={item.id}
                                    className="flex flex-col gap-1 py-2"
                                >
                                    <span className="font-mono break-all">
                                        {item.awb}
                                    </span>
                                    <span className="text-muted-foreground">
                                        {item.message ??
                                            (item.status === 'IN_FLIGHT'
                                                ? 'Menunggu respons server'
                                                : item.status)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </details>
            ))}
        </section>
    );
}

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import type { CashlessResult } from '@/types/cashless-handover';
export type { CashlessResult } from '@/types/cashless-handover';
const labels: Record<string, string> = {
    PREVIOUSLY_ENTERED: 'Sudah pernah diproses',
    ORION_REJECTED: 'Ditolak: sudah dientry di Orion',
    NOT_FOUND: 'Resi tidak ditemukan',
    NEEDS_DATA: 'Data perlu dilengkapi',
    INVALID: 'Nomor resi tidak valid',
    UNKNOWN: 'Hasil perlu diperiksa',
    PENDING: 'Belum diproses',
    IN_FLIGHT: 'Menunggu respons',
    CANCELLED: 'Percobaan dibatalkan',
};
export default function CashlessResultView({
    result,
    busy = false,
    onPage,
}: {
    result: CashlessResult;
    busy?: boolean;
    onPage: (page: number) => void;
}) {
    return (
        <section
            className="flex flex-col gap-4"
            aria-label="Hasil pemrosesan cashless"
        >
            <div className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold">
                    Hasil Cashless · Batch #{result.id}
                </h1>
                <p className="text-sm break-words">
                    {result.customer} · {result.reference}
                </p>
                <p className="text-sm text-muted-foreground">
                    {result.accepted} dari {result.total} resi berhasil ·{' '}
                    {result.server}
                    {result.ho_number ? ` · ${result.ho_number}` : ''}
                </p>
            </div>
            {result.message && (
                <p
                    role="status"
                    className="rounded-lg border p-3 text-sm break-words"
                >
                    {result.message}
                </p>
            )}
            <h2 className="text-sm font-medium">
                Resi dengan pengecualian ({result.items.total})
            </h2>
            {!result.items.data.length && (
                <p className="text-sm text-muted-foreground">
                    Tidak ada resi dengan pengecualian.
                </p>
            )}
            <ul className="divide-y rounded-lg border">
                {result.items.data.map((item) => (
                    <li key={item.id} className="flex flex-col gap-2 p-3">
                        <span className="font-mono text-sm break-all">
                            {item.awb}
                        </span>
                        <Badge variant="secondary" className="w-fit">
                            {labels[item.status] ?? item.status}
                        </Badge>
                        {item.message && (
                            <p className="text-sm break-words text-muted-foreground">
                                {item.message}
                            </p>
                        )}
                    </li>
                ))}
            </ul>
            {result.items.last_page > 1 && (
                <div className="flex items-center justify-between gap-2">
                    <Button
                        variant="outline"
                        disabled={busy || result.items.current_page <= 1}
                        onClick={() => onPage(result.items.current_page - 1)}
                    >
                        Sebelumnya
                    </Button>
                    <span className="text-xs">
                        {result.items.current_page} / {result.items.last_page}
                    </span>
                    <Button
                        variant="outline"
                        disabled={
                            busy ||
                            result.items.current_page >= result.items.last_page
                        }
                        onClick={() => onPage(result.items.current_page + 1)}
                    >
                        Berikutnya
                    </Button>
                </div>
            )}
        </section>
    );
}

import { Link } from '@inertiajs/react';
import * as monitoring from '@/routes/jne-monitoring';
import * as exceptions from '@/routes/jne-exceptions';
import * as runs from '@/routes/report-runs';

export type JneOperations = {
    source_observations: number;
    pickup_conflicts: number;
    category_confirmed: number | null;
    unclassified: number | null;
    last_report_received_at: string | null;
    global_collection_failures: number;
    global_sertim_awaiting_source: number;
    gates: Record<string, boolean>;
};
export default function JneOperationsSummary({
    data,
}: {
    data: JneOperations;
}) {
    return (
        <section
            aria-label="Tindak lanjut koleksi dan rekonsiliasi"
            className="space-y-3 rounded-lg border p-4"
        >
            <h2 className="font-semibold">
                Tindak lanjut koleksi dan rekonsiliasi
            </h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                    <dt className="text-muted-foreground">
                        Observasi sumber pada AWB terfilter
                    </dt>
                    <dd>
                        {data.source_observations} baris report; satu AWB dapat
                        memiliki beberapa observasi.
                    </dd>
                </div>
                <div>
                    <dt className="text-muted-foreground">
                        Customer, pickup dan kategori terkonfirmasi
                    </dt>
                    <dd>
                        {data.category_confirmed ??
                            'Klasifikasi belum diaktifkan'}
                    </dd>
                </div>
                <div>
                    <dt className="text-muted-foreground">
                        Konflik pickup pada filter ini
                    </dt>
                    <dd>
                        <Link
                            href={exceptions.index.url({
                                query: { cause: 'pickup' },
                            })}
                            className="underline"
                        >
                            {data.pickup_conflicts} · periksa exception
                        </Link>
                    </dd>
                </div>
                <div>
                    <dt className="text-muted-foreground">
                        Kategori belum pasti pada filter ini
                    </dt>
                    <dd>
                        {data.unclassified ??
                            'Menunggu aktivasi aturan terverifikasi'}
                    </dd>
                </div>
            </dl>
            <p className="text-sm">
                Seluruh operasi Admin:{' '}
                <Link href={runs.index.url()} className="underline">
                    {data.global_collection_failures} kegagalan report belum
                    ditinjau
                </Link>{' '}
                · {data.global_sertim_awaiting_source} AWB Sertim menunggu
                sumber.
            </p>
            <Link
                href={monitoring.reconciliation.url()}
                className="text-sm underline"
            >
                Periksa POP, kekurangan sementara, dan pengesahan koleksi per
                pickup
            </Link>
            <details>
                <summary className="text-sm">
                    Kesiapan aktivasi kebijakan
                </summary>
                <ul className="mt-2 space-y-1 text-sm">
                    {Object.entries(data.gates).map(([name, active]) => (
                        <li key={name}>
                            {name}:{' '}
                            {active
                                ? 'Gate lingkungan dibuka; aturan terverifikasi tetap diperlukan'
                                : 'Nonaktif; siapkan dan validasi pada UAT'}
                        </li>
                    ))}
                </ul>
            </details>
        </section>
    );
}

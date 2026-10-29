import type { JneSourceProvenance } from '@/types/jne';

export default function JneSourceEvidence({
    code,
    evidence,
    title = 'Bukti asal dan kontrak sumber',
}: {
    code?: string | null;
    evidence?: JneSourceProvenance | null;
    title?: string;
}) {
    if (!code && !evidence?.contract && !evidence?.hybrid_origins?.length)
        return null;
    return (
        <details className="rounded-lg border p-3 text-sm">
            <summary className="cursor-pointer font-medium">{title}</summary>
            <div className="mt-3 space-y-2 break-words">
                {code != null && (
                    <p>
                        Kode customer asli:{' '}
                        <span className="font-mono">{code}</span>
                    </p>
                )}
                {evidence?.contract && (
                    <p>
                        Kontrak #{evidence.contract.id} revisi{' '}
                        {evidence.contract.revision} · Kolom:{' '}
                        {evidence.contract.customer_code_column ??
                            'Belum ditetapkan'}
                    </p>
                )}
                {evidence?.hybrid_origins?.map((origin) => (
                    <p key={origin.report_job_id}>
                        Sumber #{origin.report_job_id} · {origin.source} /{' '}
                        {origin.report_type}
                        <br />
                        <span className="text-xs text-muted-foreground">
                            SHA-256: {origin.checksum}
                        </span>
                    </p>
                ))}
                <p className="text-xs text-muted-foreground">
                    Asal report disimpan sebagai bukti. Kategori dan pemilik
                    tetap memerlukan aturan terverifikasi.
                </p>
            </div>
        </details>
    );
}

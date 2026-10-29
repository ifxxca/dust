import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { JneCustomerCandidate } from '@/types/jne';

export default function JneCustomerCandidates({
    candidates,
}: {
    candidates?: JneCustomerCandidate[] | null;
}) {
    if (!candidates?.length) return null;
    return (
        <Alert>
            <AlertTitle>Kandidat customer · perlu bukti tambahan</AlertTitle>
            <AlertDescription>
                <p>Kemiripan nama belum menetapkan pemilik atau pickup.</p>
                <ul className="flex list-inside list-disc flex-col gap-2">
                    {candidates.map((candidate) => (
                        <li key={candidate.customer_id}>
                            {candidate.customer_code || '—'} ·{' '}
                            {candidate.customer_name}
                            {' · Nama terdaftar: '}
                            {candidate.registered_name}
                            {' · Selisih karakter: '}
                            {candidate.distance}
                        </li>
                    ))}
                </ul>
            </AlertDescription>
        </Alert>
    );
}

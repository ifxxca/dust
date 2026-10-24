import { useHttp } from '@inertiajs/react';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import InputError from '@/components/input-error';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { jneTimestamp, matchLabels } from '@/lib/jne-monitoring';
import { submissionKey } from '@/lib/submission-key';
import * as routes from '@/routes/api/cashless-awbs';

type Evidence = {
    id: number;
    awb: string | null;
    original_awb: string;
    version: number;
    events_count: number;
    shipment: { customer_match_status: string; match_status: string } | null;
};
type Page = {
    data: Evidence[];
    meta: { current_page: number; last_page: number; total: number };
    can: { record: boolean; correct: boolean };
    reconciliation: {
        expected_quantity: number | null;
        identified_awbs: number;
        collected_awbs: number;
        confirmed_awbs: number;
        awaiting_source_awbs: number;
        conflicts: number;
        shortfall_quantity: number | null;
        excess_quantity: number | null;
        window: string;
    };
};
type Audit = {
    data: {
        id: number;
        previous_awb: string | null;
        awb: string | null;
        actor_id: number;
        reason: string | null;
        created_at: string;
        affected_results: {
            before: { reconciliation: { confirmed_awbs: number } };
            after: { reconciliation: { confirmed_awbs: number } };
        };
    }[];
    current_page: number;
    last_page: number;
};
type Correction = {
    awb: string | null;
    reason: string;
    submission_key: string;
    evidence_id?: number;
    expected_version?: number;
};

export default function PickupCashlessAwbs({
    taskId,
    timezone,
}: {
    taskId: number;
    timezone: string;
}) {
    const [page, setPage] = useState<Page | null>(null);
    const [error, setError] = useState('');
    const [correcting, setCorrecting] = useState(false);
    const [correctionError, setCorrectionError] = useState('');
    const [auditId, setAuditId] = useState<number | null>(null);
    const [audit, setAudit] = useState<Audit | null>(null);
    const loadRequest = useHttp({});
    const historyRequest = useHttp({});
    const entry = useHttp({ awb: '', submission_key: '' });
    const correction = useHttp<Correction>({
        awb: '',
        reason: '',
        submission_key: '',
    });
    const entryKey = useRef<string | null>(null);
    const correctionKey = useRef<string | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const formId = useId();

    async function load(number = 1) {
        try {
            const result = await loadRequest.get(
                routes.index.url(taskId, { query: { page: number } }),
            );
            setPage(result as Page);
            setError('');
        } catch {
            setError(
                'Belum dapat memuat Sertim. Muat ulang sebelum mencoba menyimpan lagi.',
            );
        }
    }
    useEffect(() => {
        setPage(null);
        void load();
        return () => {
            loadRequest.cancel();
            historyRequest.cancel();
        };
    }, [taskId]);

    async function saveEntry(event: React.SubmitEvent) {
        event.preventDefault();
        entryKey.current ??= submissionKey();
        entry.transform((data) => ({
            ...data,
            submission_key: entryKey.current!,
        }));
        try {
            await entry.post(routes.store.url(taskId));
            entryKey.current = null;
            entry.setData('awb', '');
            toast.success('AWB cashless dicatat.');
            await load();
            input.current?.focus();
        } catch {
            if (!entry.hasErrors)
                setError(
                    'Hasil penyimpanan belum pasti. Muat ulang daftar; ulangi input yang sama bila belum tercatat.',
                );
        }
    }
    function openCorrection(row?: Evidence) {
        correction.setData({
            awb: row?.awb ?? '',
            reason: '',
            submission_key: '',
            ...(row
                ? { evidence_id: row.id, expected_version: row.version }
                : {}),
        });
        correction.clearErrors();
        setCorrectionError('');
        correctionKey.current = null;
        setCorrecting(true);
    }
    async function saveCorrection(event: React.SubmitEvent) {
        event.preventDefault();
        correctionKey.current ??= submissionKey();
        correction.transform((data) => ({
            ...data,
            submission_key: correctionKey.current!,
        }));
        try {
            await correction.post(routes.correct.url(taskId));
            setCorrecting(false);
            toast.success(
                'Koreksi Sertim diaudit dan pencocokan diperiksa ulang.',
            );
            await load(page?.meta.current_page);
        } catch {
            setCorrectionError(
                'Koreksi belum dapat dipastikan. Tutup dialog dan muat ulang Sertim; versi mungkin sudah berubah.',
            );
        }
    }
    async function loadHistory(id: number, number = 1) {
        setAuditId(id);
        try {
            const result = await historyRequest.get(
                routes.history.url(
                    { task: taskId, evidence: id },
                    { query: { page: number } },
                ),
            );
            setAudit(result as Audit);
        } catch {
            setError('Riwayat belum dapat dimuat. Coba kembali.');
            setAuditId(null);
        }
    }

    return (
        <Card className="w-full min-w-0">
            <CardHeader>
                <CardTitle>Sertim Cashless</CardTitle>
                <CardDescription>
                    Catat atau scan AWB cashless untuk pickup ini. AWB CSS /
                    Orion tidak perlu dipindai di sini.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                {error && (
                    <Alert variant="destructive">
                        <AlertTitle>Perlu diperiksa</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                <Button
                    type="button"
                    variant="outline"
                    disabled={loadRequest.processing}
                    onClick={() => void load(page?.meta.current_page)}
                >
                    Muat ulang Sertim
                </Button>
                {!page ? (
                    <Skeleton className="h-20 w-full" />
                ) : (
                    <>
                        <p className="text-sm">
                            Jendela Sertim:{' '}
                            {page.reconciliation.window === 'CLOSED'
                                ? 'Ditutup'
                                : 'Terbuka'}{' '}
                            · POP cashless:{' '}
                            {page.reconciliation.expected_quantity ??
                                'Belum final'}{' '}
                            · {page.reconciliation.identified_awbs} AWB dicatat
                            · {page.reconciliation.confirmed_awbs} terkonfirmasi
                            · {page.reconciliation.awaiting_source_awbs}{' '}
                            menunggu report
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Penutupan Sertim tidak berarti report Hybrid/APEX
                            lengkap. Data terlambat tetap dapat dicocokkan;
                            jumlah kurang belum membuktikan AWB hilang.
                        </p>
                        {page.can.record && (
                            <form
                                onSubmit={(event) => void saveEntry(event)}
                                className="flex flex-col gap-3"
                            >
                                <Label htmlFor={formId}>AWB cashless</Label>
                                <Input
                                    id={formId}
                                    ref={input}
                                    autoComplete="off"
                                    autoCapitalize="characters"
                                    maxLength={100}
                                    required
                                    disabled={entry.processing}
                                    aria-invalid={Boolean(entry.errors.awb)}
                                    value={entry.data.awb}
                                    onChange={(event) => {
                                        entryKey.current = null;
                                        entry.setData(
                                            'awb',
                                            event.target.value,
                                        );
                                    }}
                                />
                                <InputError
                                    message={
                                        entry.errors.awb ||
                                        entry.errors.submission_key
                                    }
                                />
                                <Button
                                    type="submit"
                                    disabled={entry.processing}
                                >
                                    {entry.processing
                                        ? 'Menyimpan…'
                                        : 'Catat AWB'}
                                </Button>
                            </form>
                        )}
                        {!page.can.record && (
                            <p className="text-sm text-muted-foreground">
                                Entri biasa mengikuti penugasan aktif dan hanya
                                tersedia sebelum POP final serta penutupan
                                pertama handover. Koreksi hanya oleh Admin.
                            </p>
                        )}
                        {page.can.correct && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => openCorrection()}
                                className="h-auto min-h-11 whitespace-normal"
                            >
                                Tambah bukti lewat koreksi Admin
                            </Button>
                        )}
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>AWB / bukti awal</TableHead>
                                    <TableHead>Pencocokan</TableHead>
                                    <TableHead>Tindakan</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {page.data.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="break-all">
                                            {row.awb ?? 'Klaim dibatalkan'}
                                            <p className="text-xs text-muted-foreground">
                                                Awal: {row.original_awb}
                                            </p>
                                        </TableCell>
                                        <TableCell>
                                            {row.shipment ? (
                                                <>
                                                    {
                                                        matchLabels[
                                                            row.shipment
                                                                .customer_match_status
                                                        ]
                                                    }{' '}
                                                    · Pickup:{' '}
                                                    {
                                                        matchLabels[
                                                            row.shipment
                                                                .match_status
                                                        ]
                                                    }
                                                </>
                                            ) : row.awb ? (
                                                'Menunggu report JNE'
                                            ) : (
                                                'Bukti lama dipertahankan'
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setAudit(null);
                                                        void loadHistory(
                                                            row.id,
                                                        );
                                                    }}
                                                >
                                                    Riwayat ({row.events_count})
                                                </Button>
                                                {page.can.correct && (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() =>
                                                            openCorrection(row)
                                                        }
                                                    >
                                                        Koreksi
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {!page.data.length && (
                                    <TableRow>
                                        <TableCell colSpan={3}>
                                            Belum ada AWB cashless dicatat.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm">
                                {page.meta.total} bukti · Halaman{' '}
                                {page.meta.current_page} / {page.meta.last_page}
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={
                                        page.meta.current_page <= 1 ||
                                        loadRequest.processing
                                    }
                                    onClick={() =>
                                        void load(page.meta.current_page - 1)
                                    }
                                >
                                    Sebelumnya
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={
                                        page.meta.current_page >=
                                            page.meta.last_page ||
                                        loadRequest.processing
                                    }
                                    onClick={() =>
                                        void load(page.meta.current_page + 1)
                                    }
                                >
                                    Berikutnya
                                </Button>
                            </div>
                        </div>
                    </>
                )}
                <Dialog
                    open={correcting}
                    onOpenChange={(value) => {
                        if (!correction.processing) setCorrecting(value);
                    }}
                >
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                Koreksi Admin · Sertim Cashless
                            </DialogTitle>
                            <DialogDescription>
                                Bukti awal dan alasan disimpan. POP, penerimaan
                                fisik dan riwayat penutupan tetap. Kosongkan AWB
                                pada bukti tersimpan untuk membatalkan klaim.
                            </DialogDescription>
                        </DialogHeader>
                        {correctionError && (
                            <Alert variant="destructive">
                                <AlertTitle>Koreksi perlu diperiksa</AlertTitle>
                                <AlertDescription>
                                    {correctionError}
                                </AlertDescription>
                            </Alert>
                        )}
                        <form
                            onSubmit={(event) => void saveCorrection(event)}
                            className="flex flex-col gap-3"
                        >
                            <Label htmlFor={formId + '-correction'}>
                                AWB yang benar
                            </Label>
                            <Input
                                id={formId + '-correction'}
                                maxLength={100}
                                required={!correction.data.evidence_id}
                                disabled={correction.processing}
                                aria-invalid={Boolean(correction.errors.awb)}
                                value={correction.data.awb ?? ''}
                                onChange={(event) => {
                                    correctionKey.current = null;
                                    correction.setData(
                                        'awb',
                                        event.target.value || null,
                                    );
                                }}
                            />
                            <InputError message={correction.errors.awb} />
                            <Label htmlFor={formId + '-reason'}>
                                Alasan koreksi
                            </Label>
                            <Input
                                id={formId + '-reason'}
                                required
                                maxLength={500}
                                disabled={correction.processing}
                                aria-invalid={Boolean(correction.errors.reason)}
                                value={correction.data.reason}
                                onChange={(event) => {
                                    correctionKey.current = null;
                                    correction.setData(
                                        'reason',
                                        event.target.value,
                                    );
                                }}
                            />
                            <InputError
                                message={
                                    correction.errors.reason ||
                                    correction.errors.expected_version ||
                                    correction.errors.submission_key
                                }
                            />
                            <Button
                                type="submit"
                                disabled={correction.processing}
                            >
                                {correction.processing
                                    ? 'Menyimpan koreksi…'
                                    : 'Simpan koreksi & periksa ulang'}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
                <Dialog
                    open={auditId !== null}
                    onOpenChange={(value) => {
                        if (!value) {
                            historyRequest.cancel();
                            setAuditId(null);
                        }
                    }}
                >
                    <DialogContent className="max-h-[85dvh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Riwayat bukti Sertim</DialogTitle>
                            <DialogDescription>
                                Perubahan AWB dan hasil pencocokan dipertahankan
                                untuk pemeriksaan.
                            </DialogDescription>
                        </DialogHeader>
                        {!audit ? (
                            <Skeleton className="h-20 w-full" />
                        ) : (
                            <>
                                <ol className="flex flex-col gap-4">
                                    {audit.data.map((event) => (
                                        <li
                                            key={event.id}
                                            className="flex flex-col gap-1 text-sm"
                                        >
                                            <strong className="break-all">
                                                {event.previous_awb ??
                                                    'Bukti baru'}{' '}
                                                →{' '}
                                                {event.awb ??
                                                    'Klaim dibatalkan'}
                                            </strong>
                                            <p>
                                                Petugas #{event.actor_id} ·{' '}
                                                {jneTimestamp(
                                                    event.created_at,
                                                    timezone,
                                                )}
                                            </p>
                                            <p className="break-words">
                                                {event.reason ||
                                                    'Pencatatan awal'}
                                            </p>
                                            <p>
                                                AWB cashless terkonfirmasi:{' '}
                                                {
                                                    event.affected_results
                                                        .before.reconciliation
                                                        .confirmed_awbs
                                                }{' '}
                                                →{' '}
                                                {
                                                    event.affected_results.after
                                                        .reconciliation
                                                        .confirmed_awbs
                                                }
                                            </p>
                                        </li>
                                    ))}
                                </ol>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={
                                            audit.current_page <= 1 ||
                                            historyRequest.processing
                                        }
                                        onClick={() =>
                                            void loadHistory(
                                                auditId!,
                                                audit.current_page - 1,
                                            )
                                        }
                                    >
                                        Riwayat sebelumnya
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={
                                            audit.current_page >=
                                                audit.last_page ||
                                            historyRequest.processing
                                        }
                                        onClick={() =>
                                            void loadHistory(
                                                auditId!,
                                                audit.current_page + 1,
                                            )
                                        }
                                    >
                                        Riwayat berikutnya
                                    </Button>
                                </div>
                            </>
                        )}
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
}

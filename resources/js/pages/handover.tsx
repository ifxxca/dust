import { Head, router, useHttp, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/page-container';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/operational-ui';
import { toast } from 'sonner';
import { Plus, RefreshCw } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { handover } from '@/routes';
import * as api from '@/routes/api/handovers';
import { submissionKey } from '@/lib/submission-key';
import { staff as staffApi } from '@/routes/api';
import HandoverSessionList, {
    type HandoverFilters,
    type HandoverCounts,
    type HandoverPagination,
} from '@/components/handover-session-list';
import HandoverSessionDetail from '@/components/handover-session-detail';
import { type HandoverSession as Session } from '@/types/handover';

type Candidate = {
    id: number;
    reference: string;
    customer_name: string;
    staff_name: string;
    total: number;
};
type Envelope<T> = {
    data: T;
    meta?: HandoverPagination;
    summary?: HandoverCounts;
};

function message(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'response' in error) {
        const response = error.response as {
            data?: string | { message?: string };
        };
        try {
            const data =
                typeof response.data === 'string'
                    ? (JSON.parse(response.data) as { message?: string })
                    : response.data;
            if (data?.message) return data.message;
        } catch {
            /* Use generic error when response is not JSON. */
        }
    }
    return 'Permintaan gagal. Muat ulang untuk memeriksa hasil sebelum mencoba kembali.';
}

export default function Handover({
    sessionId,
    timezone,
}: {
    sessionId: number | null;
    timezone: string;
}) {
    const isAdmin = usePage().props.auth.user.role === 'admin_supervisor';
    const history =
        new URL(usePage().url, 'http://localhost').searchParams.get(
            'history',
        ) === '1';
    const [filters, setFilters] = useState<HandoverFilters>({
        q: '',
        status: '',
        from: '',
        to: '',
        staff: '',
    });
    const [counts, setCounts] = useState<HandoverCounts>();
    const [pagination, setPagination] = useState<HandoverPagination>({});
    const [perPage, setPerPage] = useState(10);
    const [filterStaff, setFilterStaff] = useState<
        { id: number; name: string }[]
    >([]);
    const staffLoader = useHttp({});
    const [sessions, setSessions] = useState<Session[]>([]);
    const [session, setSession] = useState<Session | null>(null);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [selected, setSelected] = useState<number[]>([]);
    const [creating, setCreating] = useState(false);
    const [amending, setAmending] = useState(false);
    const [closing, setClosing] = useState(false);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [candidatePage, setCandidatePage] = useState(1);
    const [candidateLastPage, setCandidateLastPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const loader = useHttp({});
    const chooser = useHttp({});
    const create = useHttp({
        submission_key: submissionKey(),
        task_ids: [] as number[],
        reason: '',
        expected_version: 1,
    });
    const close = useHttp({ expected_version: 0 });
    useEffect(() => {
        let cancelled = false;
        setError('');
        void loader
            .get(
                sessionId
                    ? api.show.url(sessionId)
                    : api.index.url({
                          query: {
                              page,
                              per_page: perPage,
                              summary: 1,
                              ...(history ? {} : { active: 1 }),
                              ...(history ? { history: 1 } : {}),
                              ...(filters.status
                                  ? { status: filters.status }
                                  : {}),
                              ...(filters.q ? { q: filters.q } : {}),
                              ...(filters.from
                                  ? { date_from: filters.from }
                                  : {}),
                              ...(filters.to ? { date_to: filters.to } : {}),
                              ...(filters.staff
                                  ? { staff_id: filters.staff }
                                  : {}),
                          },
                      }),
            )
            .then((result) => {
                const response = result as
                    | Envelope<Session | Session[]>
                    | undefined;
                if (cancelled) return;
                if (!response) {
                    setError(
                        'Filter belum dapat diterapkan. Periksa pencarian dan rentang tanggal.',
                    );
                    return;
                }
                if (Array.isArray(response.data)) {
                    setSessions(response.data);
                    setPagination(response.meta ?? {});
                    setCounts(response.summary);
                } else setSession(response.data);
            })
            .catch((error: unknown) => {
                if (!cancelled) setError(message(error));
            });
        return () => {
            cancelled = true;
            loader.cancel();
        };
    }, [sessionId, page, revision, history, filters, perPage]);
    useEffect(() => {
        if (sessionId) return;
        let cancelled = false;
        void staffLoader
            .get(staffApi.url())
            .then((result) => {
                if (result && !cancelled)
                    setFilterStaff(
                        (result as { data: { id: number; name: string }[] })
                            .data,
                    );
            })
            .catch(() => {
                if (!cancelled)
                    setError(
                        'Daftar petugas belum dapat dimuat. Gunakan pencarian nama atau muat ulang.',
                    );
            });
        return () => {
            cancelled = true;
            staffLoader.cancel();
        };
    }, [sessionId]);
    useEffect(() => {
        if (!creating) return;
        void chooser
            .get(api.candidates.url({ query: { page: candidatePage } }))
            .then((result) => {
                const response = result as Envelope<Candidate[]> | undefined;
                if (response) {
                    const existing = amending
                        ? (session?.items ?? []).map((item) => ({
                              id: item.task_id,
                              reference: item.reference,
                              customer_name: item.customer_name,
                              staff_name: item.pickup_staff?.name ?? '—',
                              total: item.pickup.total ?? 0,
                          }))
                        : [];
                    setCandidates([...existing, ...response.data]);
                    setCandidateLastPage(response.meta?.last_page ?? 1);
                }
            })
            .catch((error: unknown) => setError(message(error)));
    }, [creating, candidatePage, amending, session]);
    const refresh = () => {
        setClosing(false);
        setRevision((value) => value + 1);
    };
    const items = session?.items ?? [];

    return (
        <PageContainer variant={sessionId ? 'wide' : 'fluid'}>
            <Head
                title={
                    sessionId
                        ? `Handover Session HO-${String(sessionId).padStart(4, '0')}`
                        : 'Handover & Verifikasi'
                }
            />
            {!sessionId && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                            Handover & Verifikasi
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Kelola sesi handover dari petugas pickup dan
                            verifikasi jumlah paket per kategori.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {!sessionId && !history && (
                            <Button
                                className="h-11"
                                onClick={() => {
                                    setSelected([]);
                                    setCandidatePage(1);
                                    create.setData(
                                        'submission_key',
                                        submissionKey(),
                                    );
                                    setCreating(true);
                                    setAmending(false);
                                }}
                            >
                                <Plus className="size-4" />
                                Buat Handover Session
                            </Button>
                        )}
                        <Button
                            className="h-11"
                            variant="outline"
                            disabled={loader.processing}
                            onClick={refresh}
                        >
                            <RefreshCw
                                className={`size-4 ${loader.processing ? 'animate-spin' : ''}`}
                            />
                            Muat ulang
                        </Button>
                    </div>
                </div>
            )}
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            {sessionId && loader.processing && <EmptyState loading />}
            {!sessionId ? (
                <HandoverSessionList
                    rows={sessions}
                    history={history}
                    counts={counts}
                    meta={pagination}
                    page={page}
                    perPage={perPage}
                    filters={filters}
                    staff={filterStaff}
                    loading={loader.processing}
                    error={error}
                    timezone={timezone}
                    onFilter={(key, value) => {
                        setFilters((current) => ({ ...current, [key]: value }));
                        setPage(1);
                    }}
                    onReset={() => {
                        setFilters({
                            q: '',
                            status: '',
                            from: '',
                            to: '',
                            staff: '',
                        });
                        setPage(1);
                    }}
                    onPage={setPage}
                    onPerPage={(value) => {
                        setPerPage(value);
                        setPage(1);
                    }}
                />
            ) : session ? (
                <HandoverSessionDetail
                    session={session}
                    timezone={timezone}
                    history={history}
                    isAdmin={isAdmin}
                    loading={loader.processing}
                    onRefresh={refresh}
                    onClose={() => setClosing(true)}
                    onUpdated={setSession}
                    onAmend={() => {
                        setSelected(items.map((item) => item.task_id));
                        setCandidatePage(1);
                        create.setData('reason', '');
                        setAmending(true);
                        setCreating(true);
                    }}
                />
            ) : (
                !loader.processing && <p>Session tidak tersedia.</p>
            )}
            <Dialog
                open={creating}
                onOpenChange={(value) => {
                    if (!create.processing) setCreating(value);
                }}
            >
                <DialogContent className="max-h-[90dvh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {amending
                                ? 'Ubah Anggota Session DRAFT'
                                : 'Buat Handover Session'}
                        </DialogTitle>
                        <DialogDescription>
                            Pilih pickup final untuk diserahkan penuh. Task dari
                            beberapa petugas dapat digabung; satu task hanya
                            satu session.
                        </DialogDescription>
                    </DialogHeader>
                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    {chooser.processing ? (
                        <p>Memuat pickup…</p>
                    ) : candidates.length === 0 ? (
                        <p>Tidak ada pickup final yang belum diserahkan.</p>
                    ) : (
                        candidates.map((candidate) => (
                            <Label
                                key={candidate.id}
                                className="flex items-start gap-3 rounded-md border p-3"
                            >
                                <input
                                    type="checkbox"
                                    checked={selected.includes(candidate.id)}
                                    onChange={(event) =>
                                        setSelected((ids) =>
                                            event.target.checked
                                                ? [...ids, candidate.id]
                                                : ids.filter(
                                                      (id) =>
                                                          id !== candidate.id,
                                                  ),
                                        )
                                    }
                                />
                                <span>
                                    {candidate.customer_name} ·{' '}
                                    {candidate.staff_name} · {candidate.total}{' '}
                                    paket
                                    <span className="block text-xs break-all text-muted-foreground">
                                        {candidate.reference}
                                    </span>
                                </span>
                            </Label>
                        ))
                    )}
                    <div className="flex justify-between">
                        <Button
                            variant="outline"
                            disabled={candidatePage <= 1}
                            onClick={() => setCandidatePage(candidatePage - 1)}
                        >
                            Sebelumnya
                        </Button>
                        <span>
                            {candidatePage}/{candidateLastPage}
                        </span>
                        <Button
                            variant="outline"
                            disabled={candidatePage >= candidateLastPage}
                            onClick={() => setCandidatePage(candidatePage + 1)}
                        >
                            Berikutnya
                        </Button>
                    </div>
                    {Object.entries(create.errors).map(([key, value]) => (
                        <p key={key} className="text-sm text-destructive">
                            {value}
                        </p>
                    ))}
                    {amending && (
                        <div className="space-y-2">
                            <Label htmlFor="member-reason">
                                Alasan perubahan (wajib)
                            </Label>
                            <Input
                                id="member-reason"
                                maxLength={500}
                                value={create.data.reason}
                                onChange={(event) =>
                                    create.setData('reason', event.target.value)
                                }
                            />
                        </div>
                    )}
                    <Button
                        disabled={
                            create.processing ||
                            selected.length === 0 ||
                            (amending && !create.data.reason.trim()) ||
                            selected.length > 100
                        }
                        onClick={() => {
                            create.transform((data) => ({
                                ...data,
                                task_ids: selected,
                                expected_version: session?.version ?? 1,
                            }));
                            void (
                                amending && session
                                    ? create.patch(api.amend.url(session.id))
                                    : create.post(api.store.url())
                            )
                                .then((result) => {
                                    const response = result as
                                        | Envelope<Session>
                                        | undefined;
                                    if (response) {
                                        setCreating(false);
                                        router.visit(
                                            handover({
                                                session: response.data.id,
                                            }),
                                        );
                                    }
                                })
                                .catch((error: unknown) =>
                                    setError(message(error)),
                                );
                        }}
                    >
                        {create.processing
                            ? 'Membuat…'
                            : `${amending ? 'Simpan Anggota' : 'Buat Session'} (${selected.length} task)`}
                    </Button>
                </DialogContent>
            </Dialog>

            <Dialog
                open={closing}
                onOpenChange={(value) => {
                    if (!close.processing) setClosing(value);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Tutup Handover Session?</DialogTitle>
                        <DialogDescription>
                            Seluruh task sudah diperiksa. Penutupan tidak
                            menyelesaikan discrepancy. Reopen belum tersedia.
                        </DialogDescription>
                    </DialogHeader>
                    {error && (
                        <p role="alert" className="text-sm text-destructive">
                            {error}
                        </p>
                    )}
                    <Button
                        disabled={close.processing}
                        onClick={() => {
                            if (!session) return;
                            close.transform(() => ({
                                expected_version: session.version,
                            }));
                            void close
                                .post(api.close.url(session.id))
                                .then((result) => {
                                    if (result) {
                                        toast.success(
                                            'Session ditutup; discrepancy tetap tercatat',
                                        );
                                        refresh();
                                    }
                                })
                                .catch((error: unknown) =>
                                    setError(message(error)),
                                );
                        }}
                    >
                        Konfirmasi Tutup Session
                    </Button>
                </DialogContent>
            </Dialog>
        </PageContainer>
    );
}
Handover.layout = {
    breadcrumbs: [{ title: 'Handover & Verifikasi', href: handover() }],
};

import { Head, Link, router, useForm, usePoll } from '@inertiajs/react';
import { useState } from 'react';
import {
    Clock3,
    CheckCheck,
    ChevronDown,
    CircleAlert,
    Code2,
    Layers3,
    Copy,
    Download,
    Play,
    RefreshCw,
    Search,
    Settings2,
} from 'lucide-react';
import JneRunList, { type JneRun } from '@/components/jne-run-list';
import { JneRunState, JneRunProgress } from '@/components/jne-run-state';
import JneWorkspaceMetrics from '@/components/jne-workspace-metrics';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import PageContainer from '@/components/page-container';
import InputError from '@/components/input-error';
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
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import { jneTimestamp } from '@/lib/jne-monitoring';
import {
    reportLabel,
    runStatuses,
    scrapingSources,
    sourceLabel,
} from '@/lib/scraping';
import * as monitoring from '@/routes/jne-monitoring';
import * as reports from '@/routes/jne-reports';
import * as routes from '@/routes/report-runs';

type Run = JneRun;

type Profile = {
    id: number;
    source: string;
    report_type: string;
    customer_account: string;
    label: string | null;
};
type Props = {
    runs: {
        data: Run[];
        current_page: number;
        last_page: number;
        total: number;
    };
    profiles: Profile[];
    filters: { source: string; status: string; q: string };
    timezone: string;
    today: string;
};

export default function ReportRuns({
    runs,
    profiles,
    filters,
    timezone,
    today,
}: Props) {
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [runOpen, setRunOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const selected = runs.data.find((run) => run.id === selectedId);
    const filter = useForm(filters);
    const manual = useForm({ profile_id: 0, for_date: '' });
    const review = useForm({ reason: '', return_to_runs: true });
    const retry = useForm({});
    usePoll(15000, { only: ['runs'] });
    const applyFilters = () =>
        filter.get(routes.index.url(), {
            preserveState: true,
            preserveScroll: true,
        });
    const problem =
        selected &&
        (selected.error_message ||
            selected.import_error ||
            selected.projection_error);
    const page = (number: number) =>
        routes.index.url({ query: { ...filters, page: number } });

    return (
        <PageContainer className="flex flex-col gap-4 space-y-0 py-4">
            <Head title="Riwayat run report" />
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="text-2xl font-semibold tracking-tight">
                        Riwayat run report
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Pantau antrean, hasil APEX, dan pemrosesan data.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className="min-h-11" asChild>
                        <Link href={monitoring.profiles.url()}>
                            <Settings2 data-icon="inline-start" />
                            Pengaturan
                        </Link>
                    </Button>
                    <Button
                        className="min-h-11"
                        onClick={() => {
                            manual.clearErrors();
                            setRunOpen(true);
                        }}
                    >
                        <Play aria-hidden="true" data-icon="inline-start" />
                        Tarik sekarang
                    </Button>
                </div>
            </div>
            <JneWorkspaceMetrics
                scope="Ringkasan status dihitung dari run pada halaman ini."
                items={[
                    {
                        label: 'Run di halaman ini',
                        value: runs.data.length,
                        icon: Layers3,
                    },
                    {
                        label: 'Sedang diproses',
                        value: runs.data.filter(
                            (run) =>
                                [
                                    'RUNNING',
                                    'WAITING_REPORT',
                                    'DOWNLOADING',
                                    'WAITING_APEX',
                                    'COLLECTING_SOURCES',
                                ].includes(run.status) ||
                                run.workflow_stage === 'PROCESSING',
                        ).length,
                        icon: Clock3,
                    },
                    {
                        label: 'Siap dimonitor',
                        value: runs.data.filter(
                            (run) => run.workflow_stage === 'READY',
                        ).length,
                        icon: CheckCheck,
                    },
                    {
                        label: 'Perlu diperiksa',
                        value: runs.data.filter(
                            (run) =>
                                !run.reviewed_at &&
                                (run.workflow_stage === 'ATTENTION' ||
                                    ['FAILED', 'NEEDS_ATTENTION'].includes(
                                        run.status,
                                    )),
                        ).length,
                        icon: CircleAlert,
                    },
                ]}
            />
            <Card className="shadow-none">
                <CardHeader className="gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-col gap-1">
                            <CardTitle>Semua penarikan</CardTitle>
                            <CardDescription>
                                {runs.total.toLocaleString('id-ID')} run
                                tersimpan · diperbarui setiap 15 detik
                            </CardDescription>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11"
                            onClick={() => router.reload({ only: ['runs'] })}
                        >
                            <RefreshCw data-icon="inline-start" />
                            Perbarui
                        </Button>
                    </div>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            applyFilters();
                        }}
                        className="flex flex-wrap items-end gap-3"
                    >
                        <div className="flex min-w-48 flex-1 flex-col gap-2">
                            <Label htmlFor="run-search">
                                Nomor customer / akun
                            </Label>
                            <Input
                                id="run-search"
                                className="min-h-11"
                                placeholder="Cari nomor account…"
                                value={filter.data.q}
                                onChange={(event) =>
                                    filter.setData('q', event.target.value)
                                }
                                maxLength={100}
                            />
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-auto">
                            <Label htmlFor="run-source">Sumber</Label>
                            <Select
                                value={filter.data.source || 'all'}
                                onValueChange={(value) =>
                                    filter.setData(
                                        'source',
                                        value === 'all' ? '' : value,
                                    )
                                }
                            >
                                <SelectTrigger
                                    id="run-source"
                                    className="min-h-11 w-full sm:w-48"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="all">
                                            Semua sumber
                                        </SelectItem>
                                        {Object.entries(scrapingSources).map(
                                            ([key, label]) => (
                                                <SelectItem
                                                    key={key}
                                                    value={key}
                                                >
                                                    {label}
                                                </SelectItem>
                                            ),
                                        )}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-auto">
                            <Label htmlFor="run-status">Status</Label>
                            <Select
                                value={filter.data.status || 'all'}
                                onValueChange={(value) =>
                                    filter.setData(
                                        'status',
                                        value === 'all' ? '' : value,
                                    )
                                }
                            >
                                <SelectTrigger
                                    id="run-status"
                                    className="min-h-11 w-full sm:w-48"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="all">
                                            Semua status
                                        </SelectItem>
                                        {Object.entries(runStatuses).map(
                                            ([key, label]) => (
                                                <SelectItem
                                                    key={key}
                                                    value={key}
                                                >
                                                    {label}
                                                </SelectItem>
                                            ),
                                        )}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            type="submit"
                            variant="outline"
                            className="min-h-11"
                            disabled={filter.processing}
                        >
                            <Search data-icon="inline-start" />
                            Terapkan
                        </Button>
                    </form>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <JneRunList
                        runs={runs.data}
                        timezone={timezone}
                        onDetail={(run) => {
                            setSelectedId(run.id);
                            setCopied(false);
                            review.reset();
                            review.clearErrors();
                        }}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                            Halaman {runs.current_page} dari {runs.last_page} ·
                            20 run per halaman
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="min-h-11"
                                disabled={runs.current_page <= 1}
                                asChild={runs.current_page > 1}
                            >
                                {runs.current_page > 1 ? (
                                    <Link href={page(runs.current_page - 1)}>
                                        Sebelumnya
                                    </Link>
                                ) : (
                                    'Sebelumnya'
                                )}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="min-h-11"
                                disabled={runs.current_page >= runs.last_page}
                                asChild={runs.current_page < runs.last_page}
                            >
                                {runs.current_page < runs.last_page ? (
                                    <Link href={page(runs.current_page + 1)}>
                                        Berikutnya
                                    </Link>
                                ) : (
                                    'Berikutnya'
                                )}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                    <Clock3 className="size-4" />
                    Run lama tetap tersimpan ketika konfigurasi diubah.
                </p>
                <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
                    onClick={() =>
                        router.post(
                            routes.recover.url(),
                            {},
                            { preserveScroll: true },
                        )
                    }
                >
                    Periksa worker terhenti
                </Button>
            </div>
            <Dialog open={runOpen} onOpenChange={setRunOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Tarik report sekarang</DialogTitle>
                        <DialogDescription>
                            Pilih konfigurasi. Penarikan masuk antrean sumber
                            yang sesuai tanpa menunggu interval berikutnya.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            manual.post(routes.store.url(), {
                                onSuccess: () => setRunOpen(false),
                            });
                        }}
                    >
                        <div className="flex w-full flex-col gap-2 sm:w-auto">
                            <Label htmlFor="run-profile">Konfigurasi</Label>
                            <Select
                                value={
                                    manual.data.profile_id
                                        ? String(manual.data.profile_id)
                                        : ''
                                }
                                onValueChange={(value) =>
                                    manual.setData({
                                        ...manual.data,
                                        profile_id: Number(value),
                                        for_date:
                                            profiles.find(
                                                (profile) =>
                                                    profile.id ===
                                                    Number(value),
                                            )?.source === 'hybrid'
                                                ? today
                                                : '',
                                    })
                                }
                            >
                                <SelectTrigger
                                    id="run-profile"
                                    className="min-h-11 w-full"
                                >
                                    <SelectValue placeholder="Pilih konfigurasi" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        {profiles.map((profile) => (
                                            <SelectItem
                                                key={profile.id}
                                                value={String(profile.id)}
                                            >
                                                {profile.label ||
                                                    sourceLabel(
                                                        profile.source,
                                                    )}{' '}
                                                ·{' '}
                                                {reportLabel(
                                                    profile.report_type,
                                                )}{' '}
                                                · {profile.customer_account}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <InputError message={manual.errors.profile_id} />
                        </div>
                        {profiles.find(
                            (profile) => profile.id === manual.data.profile_id,
                        )?.source === 'hybrid' && (
                            <div className="space-y-2">
                                <Label htmlFor="run-date">
                                    Tanggal data Hybrid
                                </Label>
                                <Input
                                    id="run-date"
                                    className="min-h-11 dark:scheme-dark"
                                    type="date"
                                    required
                                    max={today}
                                    value={manual.data.for_date}
                                    onChange={(event) =>
                                        manual.setData(
                                            'for_date',
                                            event.target.value,
                                        )
                                    }
                                />
                                <InputError message={manual.errors.for_date} />
                                <p className="text-xs text-muted-foreground">
                                    Keempat report pada tanggal ini digabung
                                    sebelum dikirim ke APEX.
                                </p>
                            </div>
                        )}
                        <InputError
                            message={
                                (manual.errors as Record<string, string>).run
                            }
                        />
                        {profiles.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                                Tambahkan konfigurasi pada halaman Pengaturan
                                terlebih dahulu.
                            </p>
                        )}
                        <Button
                            type="submit"
                            className="min-h-11"
                            disabled={
                                manual.processing || !manual.data.profile_id
                            }
                        >
                            {manual.processing
                                ? 'Memasukkan antrean…'
                                : 'Masukkan antrean'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
            <Dialog
                open={!!selected}
                onOpenChange={(open) => {
                    if (!open) setSelectedId(null);
                }}
            >
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Run #{selected?.id}</DialogTitle>
                        <DialogDescription>
                            {selected &&
                                `${sourceLabel(selected.source)} · ${reportLabel(selected.report_type)} · ${selected.customer_account}`}
                        </DialogDescription>
                    </DialogHeader>
                    {selected && (
                        <div className="flex flex-col gap-5">
                            {selected.status === 'COMPLETED' && (
                                <p className="text-sm font-medium">
                                    {selected.workflow_stage === 'READY'
                                        ? 'Hasil APEX sudah diimpor dan siap dimonitor.'
                                        : selected.workflow_stage ===
                                            'PROCESSING'
                                          ? 'CSV APEX tersimpan; sistem sedang memproses data.'
                                          : 'CSV APEX tersimpan.'}
                                </p>
                            )}
                            <JneRunProgress run={selected} />
                            <div className="flex flex-wrap gap-2">
                                <JneRunState run={selected} />
                            </div>
                            {problem && (
                                <div
                                    role="alert"
                                    className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3"
                                >
                                    <p className="text-sm font-medium text-destructive">
                                        Error yang perlu diperiksa
                                    </p>
                                    <p className="text-sm break-words text-destructive">
                                        {problem}
                                    </p>
                                </div>
                            )}
                            {selected.source === 'hybrid' &&
                                selected.status === 'NEEDS_ATTENTION' &&
                                selected.sources.some((source) =>
                                    ['FAILED', 'NEEDS_ATTENTION'].includes(
                                        source.status,
                                    ),
                                ) && (
                                    <div className="space-y-2 rounded-lg border p-3">
                                        <Button
                                            className="min-h-11"
                                            disabled={retry.processing}
                                            onClick={() =>
                                                retry.post(
                                                    routes.retrySources.url(
                                                        selected.id,
                                                    ),
                                                    { preserveScroll: true },
                                                )
                                            }
                                        >
                                            <RefreshCw aria-hidden="true" />
                                            {retry.processing
                                                ? 'Mengantrekan ulang…'
                                                : 'Ulangi sumber gagal'}
                                        </Button>
                                        <p className="text-xs text-muted-foreground">
                                            Hanya report Hybrid yang gagal
                                            diulang. Sumber yang sudah tersimpan
                                            dipakai kembali; Process APEX belum
                                            dijalankan.
                                        </p>
                                    </div>
                                )}
                            <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/20 p-3">
                                {[
                                    {
                                        label: 'Baris sumber',
                                        value: selected.source_row_count,
                                    },
                                    {
                                        label: 'AWB unik',
                                        value: selected.awb_count,
                                    },
                                    {
                                        label: 'Baris CSV APEX',
                                        value: selected.row_count,
                                    },
                                ].map(({ label, value }) => (
                                    <div key={label}>
                                        <p className="text-xs text-muted-foreground">
                                            {label}
                                        </p>
                                        <p className="mt-2 text-xl font-semibold tabular-nums">
                                            {value?.toLocaleString('id-ID') ??
                                                '—'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            <ol
                                className="ml-2 flex flex-col gap-5 border-l border-primary/20 pl-6 [&>li]:relative [&>li]:before:absolute [&>li]:before:top-1 [&>li]:before:-left-[29px] [&>li]:before:size-2.5 [&>li]:before:rounded-full [&>li]:before:border-2 [&>li]:before:border-background [&>li]:before:bg-primary"
                                aria-label="Timeline proses"
                            >
                                <li className="flex flex-col gap-1">
                                    <p className="text-sm font-medium">
                                        Masuk antrean
                                    </p>
                                    <time className="text-xs text-muted-foreground">
                                        {jneTimestamp(
                                            selected.created_at,
                                            timezone,
                                        )}
                                    </time>
                                </li>
                                {selected.events.map((event) => (
                                    <li
                                        key={event.id}
                                        className="flex flex-col gap-1"
                                    >
                                        <p className="text-sm font-medium">
                                            {runStatuses[event.status] ||
                                                event.status}
                                        </p>
                                        <time className="text-xs text-muted-foreground">
                                            {jneTimestamp(
                                                event.created_at,
                                                timezone,
                                            )}{' '}
                                            · {event.worker_id || 'Aplikasi'}
                                        </time>
                                        {event.message && (
                                            <p className="text-sm break-words text-muted-foreground">
                                                {event.message}
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ol>
                            {selected.sources?.length > 0 && (
                                <div className="space-y-3 rounded-lg border p-4">
                                    <p className="text-sm font-medium">
                                        Empat report sumber
                                    </p>
                                    {selected.sources.map((source) => (
                                        <div
                                            key={source.id}
                                            className="flex flex-col gap-1 text-sm"
                                        >
                                            <p>
                                                {sourceLabel(source.source)} ·{' '}
                                                {reportLabel(
                                                    source.report_type,
                                                )}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {runStatuses[source.status]}
                                                {source.source_row_count !==
                                                null
                                                    ? ` · ${source.source_row_count} baris`
                                                    : ''}
                                            </p>
                                            {source.error_message && (
                                                <p className="text-xs text-destructive">
                                                    {source.error_message}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {selected.status === 'COMPLETED' && (
                                    <Button
                                        variant="outline"
                                        className="min-h-11"
                                        asChild
                                    >
                                        <a
                                            href={reports.download.url(
                                                selected.id,
                                            )}
                                        >
                                            <Download data-icon="inline-start" />
                                            Unduh CSV
                                        </a>
                                    </Button>
                                )}
                                {(selected.source === 'apex' ||
                                    selected.awb_count !== null) &&
                                    selected.status === 'COMPLETED' && (
                                        <Button
                                            variant="outline"
                                            className="min-h-11"
                                            asChild
                                        >
                                            <Link
                                                href={reports.awbs.url(
                                                    selected.id,
                                                )}
                                            >
                                                Detail AWB
                                            </Link>
                                        </Button>
                                    )}
                            </div>
                            <Collapsible className="group rounded-lg border">
                                <CollapsibleTrigger className="flex min-h-12 w-full cursor-pointer items-center gap-2 px-3 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                    <Code2
                                        aria-hidden="true"
                                        className="size-4 text-muted-foreground"
                                    />
                                    <span className="flex-1">
                                        Informasi developer
                                    </span>
                                    <ChevronDown
                                        aria-hidden="true"
                                        className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                                    />
                                </CollapsibleTrigger>
                                <CollapsibleContent className="space-y-3 border-t p-3">
                                    <p className="text-xs break-all text-muted-foreground">
                                        Worker:{' '}
                                        {selected.worker_id ||
                                            'Belum mengambil'}{' '}
                                        · Percobaan {selected.attempt_count}
                                    </p>
                                    {selected.file_checksum && (
                                        <div className="flex flex-col gap-1">
                                            <p className="text-sm font-medium">
                                                SHA-256 CSV
                                            </p>
                                            <code className="text-xs break-all text-muted-foreground">
                                                {selected.file_checksum}
                                            </code>
                                        </div>
                                    )}
                                    <Button
                                        variant="outline"
                                        className="min-h-11"
                                        onClick={() => {
                                            void navigator.clipboard
                                                .writeText(
                                                    JSON.stringify(
                                                        selected,
                                                        null,
                                                        2,
                                                    ),
                                                )
                                                .then(() => setCopied(true))
                                                .catch(() => setCopied(false));
                                        }}
                                    >
                                        <Copy data-icon="inline-start" />
                                        {copied
                                            ? 'Log tersalin'
                                            : 'Salin log developer'}
                                    </Button>
                                </CollapsibleContent>
                            </Collapsible>
                            {problem && !selected.reviewed_at && (
                                <form
                                    className="flex flex-col gap-3"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        review.post(
                                            monitoring.reviewReport.url(
                                                selected.id,
                                            ),
                                            { preserveScroll: true },
                                        );
                                    }}
                                >
                                    <Label htmlFor="review-reason">
                                        Catatan pemeriksaan
                                    </Label>
                                    <Input
                                        id="review-reason"
                                        className="min-h-11"
                                        required
                                        maxLength={500}
                                        value={review.data.reason}
                                        onChange={(event) =>
                                            review.setData(
                                                'reason',
                                                event.target.value,
                                            )
                                        }
                                        placeholder="Hasil pemeriksaan sebelum siklus berikutnya…"
                                    />
                                    <InputError
                                        message={review.errors.reason}
                                    />
                                    <Button
                                        type="submit"
                                        className="min-h-11"
                                        disabled={review.processing}
                                    >
                                        Tandai sudah diperiksa
                                    </Button>
                                </form>
                            )}
                            {selected.review_note && (
                                <p className="text-sm text-muted-foreground">
                                    Catatan: {selected.review_note}
                                </p>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </PageContainer>
    );
}

ReportRuns.layout = {
    breadcrumbs: [{ title: 'Riwayat run report', href: routes.index() }],
};

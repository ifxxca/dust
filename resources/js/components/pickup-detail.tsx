import { Link, router, setLayoutProps, useHttp } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    CalendarDays,
    MapPin,
    UserRound,
    Play,
    ArrowRight,
    CheckCircle2,
    Package,
    FileText,
    Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/operational-ui';
import OperationalChange from '@/components/operational-change';
import PickupProof, { type Proof } from '@/components/pickup-proof';
import PickupCashlessAwbs from '@/components/pickup-cashless-awbs';
import { type Visit } from '@/components/pickup-execution';
import { handover, operations } from '@/routes';
import * as api from '@/routes/api/tasks';

type Task = {
    id: number;
    reference: string;
    previous_task_id?: number | null;
    pickup_type: string;
    customer: { name: string };
    pickup_address: string;
    contact?: string;
    notes?: string | null;
    scheduled_at: string;
    status: string;
    version: number;
    assigned_staff: { name: string } | null;
    execution_started_at?: string | null;
    visits?: Visit[];
    proof?: Proof | null;
    handover_session_id?: number | null;
    can: {
        assign: boolean;
        take_over: boolean;
        execute?: boolean;
        retry?: boolean;
        cancel?: boolean;
        correct_proof?: boolean;
        create_follow_up?: boolean;
    };
    events?: {
        action: string;
        actor_id: number;
        actor_name?: string | null;
        previous_staff_id: number | null;
        new_staff_id: number | null;
        previous_staff_name?: string | null;
        new_staff_name?: string | null;
        occurred_at: string;
        reason: string | null;
    }[];
};
const eventLabels: Record<string, string> = {
    created: 'Pickup dibuat',
    scheduled_generated: 'Pickup dihasilkan dari jadwal',
    assigned: 'Petugas ditugaskan',
    taken_over: 'Tugas diambil alih',
    execution_started: 'Kunjungan dimulai',
    visit_recorded: 'Hasil kunjungan dicatat',
    pickup_finalized: 'Bukti pickup difinalisasi',
    retry_authorized: 'Kunjungan ulang diizinkan',
    cancelled: 'Pickup dibatalkan',
    no_packages_completed: 'Task selesai tanpa paket (penyesuaian kebijakan)',
    proof_corrected: 'POP dikoreksi dengan versi baru',
};
export default function PickupDetail({
    task,
    timezone,
    role,
    onAssign,
    onTakeover,
    onSaved,
}: {
    task: Task;
    timezone: string;
    role: string;
    onAssign: () => void;
    onTakeover: () => void;
    onSaved: () => void;
}) {
    const latest = task.visits?.at(-1);
    const proof = task.proof;
    useEffect(() => {
        const manager = ['cs', 'admin_supervisor'].includes(role);
        const list = operations({ screen: manager ? 'tasks' : 'mine' });
        setLayoutProps({
            breadcrumbs: [
                { title: 'Retail Pickup', href: list },
                {
                    title: manager ? 'Operasional Pickup' : 'Tugas Saya',
                    href: list,
                },
                {
                    title: 'Detail Pickup',
                    href: operations({ screen: 'detail', task: task.id }),
                },
            ],
        });
    }, [role, task.id]);
    const [proofOpen, setProofOpen] = useState(false);
    const photos =
        proof?.attachments.filter((file) => file.kind !== 'signature') ?? [];
    const signatures =
        proof?.attachments.filter((file) => file.kind === 'signature') ?? [];
    const start = useHttp({ expected_version: task.version });
    const starting = useRef(false);
    const launch = async () => {
        if (starting.current) return;
        starting.current = true;
        try {
            start.transform(() => ({ expected_version: task.version }));
            const result = await start.post(api.start.url(task.id));
            if (result)
                router.visit(operations({ screen: 'execute', task: task.id }));
        } catch {
            toast.error(
                'Tugas berubah atau kunjungan belum dapat dimulai. Status akan dimuat ulang.',
            );
            onSaved();
        } finally {
            starting.current = false;
        }
    };
    const format = (date: string) =>
        new Date(date).toLocaleString('id-ID', {
            timeZone: timezone,
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    return (
        <div className="space-y-5">
            <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="font-mono text-xs break-all text-muted-foreground">
                            {task.reference}
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight break-words sm:text-3xl">
                            {task.customer.name}
                        </h2>
                        <p className="mt-3 flex items-center gap-2 text-sm">
                            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                            {format(task.scheduled_at)} · {timezone}
                        </p>
                    </div>
                    <StatusBadge
                        status={
                            task.execution_started_at &&
                            task.status === 'ASSIGNED' &&
                            !latest?.outcome
                                ? 'IN_PROGRESS'
                                : task.status
                        }
                    />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {task.can.execute && !task.execution_started_at && (
                        <Button
                            className="h-11"
                            disabled={start.processing}
                            onClick={() => void launch()}
                        >
                            <Play className="size-4" />
                            {start.processing ? 'Memulai…' : 'Mulai Pickup'}
                        </Button>
                    )}
                    {task.can.execute &&
                        task.execution_started_at &&
                        latest?.outcome !== 'NO_PACKAGES' && (
                            <Button asChild className="h-11">
                                <Link
                                    href={operations({
                                        screen: 'execute',
                                        task: task.id,
                                    })}
                                >
                                    <Play className="size-4" />
                                    Lanjutkan Pickup
                                </Link>
                            </Button>
                        )}
                    {proof && (
                        <div className="flex min-w-0 flex-1 basis-full items-center gap-3 rounded-lg bg-blue-50 px-3 py-2.5 text-blue-700 sm:basis-auto dark:bg-blue-950/50 dark:text-blue-300">
                            <CheckCircle2 className="size-5 shrink-0" />
                            <div className="min-w-0 text-sm">
                                <p className="font-medium">
                                    Pickup berhasil diselesaikan
                                </p>
                                <p className="mt-0.5 text-xs text-blue-700/80 dark:text-blue-300/80">
                                    {proof.total} paket · {photos.length} foto ·{' '}
                                    {signatures.length} tanda tangan
                                </p>
                            </div>
                        </div>
                    )}
                    {proof ? (
                        <Button
                            variant="outline"
                            className="h-11 w-full sm:w-auto"
                            onClick={() => setProofOpen(true)}
                        >
                            <FileText className="size-4" /> Lihat Hasil Pickup
                        </Button>
                    ) : latest?.outcome && task.execution_started_at ? (
                        <Button asChild variant="outline" className="h-11">
                            <a href="#pickup-result">
                                <CheckCircle2 className="size-4" />
                                Lihat Hasil Pickup
                            </a>
                        </Button>
                    ) : null}
                    {task.can.assign && (
                        <Button className="h-11" onClick={onAssign}>
                            Tugaskan Petugas
                        </Button>
                    )}
                    {task.can.take_over && (
                        <Button className="h-11" onClick={onTakeover}>
                            {task.assigned_staff ? 'Ambil Alih' : 'Ambil Tugas'}
                        </Button>
                    )}
                </div>
            </section>
            <div className="grid items-start gap-5 xl:grid-cols-3">
                <div className="space-y-5 xl:col-span-2">
                    <section className="rounded-xl border bg-card p-5 sm:p-6">
                        <h2 className="text-base font-semibold">
                            Informasi Pickup
                        </h2>

                        <dl className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                            {[
                                {
                                    label: 'Customer',
                                    icon: UserRound,
                                    value: task.customer.name,
                                    detail: task.contact,
                                },
                                {
                                    label: 'Petugas',
                                    icon: UserRound,
                                    value:
                                        task.assigned_staff?.name ??
                                        'Belum ditugaskan',
                                },
                                {
                                    label: 'Alamat Pickup',
                                    icon: MapPin,
                                    value: task.pickup_address,
                                },
                                {
                                    label: 'Jenis Pickup',
                                    icon: Package,
                                    value:
                                        task.pickup_type === 'regular'
                                            ? 'Regular / Terjadwal'
                                            : 'On-Demand',
                                },
                                {
                                    label: 'Jadwal Pickup',
                                    icon: CalendarDays,
                                    value: format(task.scheduled_at),
                                },
                                {
                                    label: 'Catatan',
                                    icon: FileText,
                                    value: task.notes || '—',
                                },
                            ].map(({ label, icon: Icon, value, detail }) => (
                                <div
                                    key={label}
                                    className="flex min-w-0 items-start gap-3"
                                >
                                    <Icon
                                        aria-hidden="true"
                                        className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                                    />
                                    <div className="min-w-0">
                                        <dt className="text-sm text-muted-foreground">
                                            {label}
                                        </dt>
                                        <dd className="mt-1 text-sm leading-relaxed font-medium break-words">
                                            {value}
                                        </dd>
                                        {detail && (
                                            <dd className="mt-0.5 text-sm break-words text-muted-foreground">
                                                {detail}
                                            </dd>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </dl>
                    </section>
                    <section
                        id="pickup-result"
                        className="scroll-mt-6 space-y-4 rounded-xl border bg-card p-5 sm:p-6"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-base font-semibold">
                                Ringkasan Eksekusi
                            </h2>
                            {latest?.outcome && (
                                <StatusBadge status={latest.outcome} />
                            )}
                        </div>
                        {!proof &&
                            (latest?.outcome ? (
                                <div className="space-y-2">
                                    {latest.reason && (
                                        <p className="text-sm break-words">
                                            {latest.reason}
                                        </p>
                                    )}
                                    {latest.notes && (
                                        <p className="text-sm text-muted-foreground">
                                            {latest.notes}
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        {latest.recorded_at
                                            ? format(latest.recorded_at)
                                            : format(latest.started_at)}
                                    </p>
                                    {task.status === 'NO_PACKAGES' && (
                                        <p className="text-sm">
                                            Task selesai tanpa paket. Tidak ada
                                            POP; gunakan Buat Kunjungan Baru
                                            jika customer meminta pickup
                                            berikutnya.
                                        </p>
                                    )}
                                    {!task.execution_started_at &&
                                        task.status === 'ASSIGNED' && (
                                            <p className="text-sm text-primary">
                                                Kunjungan ulang sudah diizinkan;
                                                hasil di atas adalah riwayat
                                                kunjungan sebelumnya.
                                            </p>
                                        )}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    {task.execution_started_at
                                        ? 'Kunjungan sedang berjalan. Lanjutkan pencatatan melalui wizard.'
                                        : 'Belum ada hasil kunjungan. Petugas yang ditugaskan dapat mulai pickup melalui wizard.'}
                                </p>
                            ))}
                        {proof && (
                            <>
                                {(latest?.reason || latest?.notes) && (
                                    <div className="text-sm">
                                        <p className="mb-1 text-muted-foreground">
                                            Catatan Kunjungan
                                        </p>
                                        {latest.reason && (
                                            <p className="break-words">
                                                {latest.reason}
                                            </p>
                                        )}
                                        <p className="break-words">
                                            {latest.notes}
                                        </p>
                                    </div>
                                )}
                                <div className="grid gap-5 lg:grid-cols-2">
                                    <div className="min-w-0">
                                        <h3 className="mb-2 text-sm font-medium">
                                            Jumlah Paket per Kategori
                                        </h3>
                                        <dl className="overflow-hidden rounded-lg border text-sm">
                                            {(
                                                [
                                                    [
                                                        'manual_hybrid',
                                                        'Manual Hybrid (Non-Cashless)',
                                                    ],
                                                    [
                                                        'cashless_hybrid',
                                                        'Cashless Hybrid',
                                                    ],
                                                    [
                                                        'css_orion',
                                                        'CSS / Orion',
                                                    ],
                                                ] as const
                                            ).map(([key, label]) => (
                                                <div
                                                    key={key}
                                                    className="flex items-center justify-between gap-3 border-b px-3 py-2"
                                                >
                                                    <dt className="text-muted-foreground">
                                                        {label}
                                                    </dt>
                                                    <dd className="shrink-0 font-medium tabular-nums">
                                                        {proof[key]}
                                                    </dd>
                                                </div>
                                            ))}
                                            <div className="flex justify-between gap-3 bg-blue-50/70 px-3 py-2 font-semibold dark:bg-blue-950/30">
                                                <dt>Total Paket</dt>
                                                <dd className="tabular-nums">
                                                    {proof.total}
                                                </dd>
                                            </div>
                                        </dl>
                                    </div>
                                    <div className="min-w-0 lg:border-l lg:pl-5">
                                        <h3 className="mb-2 text-sm font-medium">
                                            Bukti Pickup
                                        </h3>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[...photos, ...signatures].map(
                                                (file, index) => {
                                                    const label =
                                                        file.kind ===
                                                        'signature'
                                                            ? 'Tanda tangan'
                                                            : `Foto ${index + 1}`;
                                                    return (
                                                        <a
                                                            key={file.id}
                                                            href={file.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="group min-w-0"
                                                            aria-label={`Lihat ${label.toLowerCase()}`}
                                                        >
                                                            <img
                                                                loading="lazy"
                                                                className={`h-16 w-full rounded-md border bg-white transition-opacity group-hover:opacity-80 ${file.kind === 'signature' ? 'object-contain' : 'object-cover'}`}
                                                                src={file.url}
                                                                alt={
                                                                    file.kind ===
                                                                    'signature'
                                                                        ? 'Tanda tangan customer/sender'
                                                                        : label
                                                                }
                                                            />
                                                            <span className="mt-1 block text-xs text-muted-foreground">
                                                                {label}
                                                            </span>
                                                        </a>
                                                    );
                                                },
                                            )}
                                        </div>
                                        {!photos.length && (
                                            <p className="mt-2 text-xs text-muted-foreground">
                                                Tidak ada foto yang dilampirkan.
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {proof.notes && (
                                    <div className="text-sm">
                                        <p className="mb-1 text-muted-foreground">
                                            Catatan Pickup
                                        </p>
                                        <p className="break-words">
                                            {proof.notes}
                                        </p>
                                    </div>
                                )}
                                <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-3 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                                    <Info className="mt-0.5 size-4 shrink-0" />
                                    <p className="text-xs leading-relaxed">
                                        POP sudah final · versi{' '}
                                        {proof.revision ?? 0}. Receipt:{' '}
                                        {(
                                            {
                                                PENDING_CONFIGURATION:
                                                    'belum dikirim, provider belum dikonfigurasi',
                                                PENDING_RECIPIENT:
                                                    'kontak tujuan belum valid',
                                                ACCEPTED_BY_PROVIDER:
                                                    'diterima provider; penerimaan customer belum dikonfirmasi',
                                                DELIVERED:
                                                    'penerimaan dikonfirmasi provider',
                                                UNKNOWN:
                                                    'hasil pengiriman belum pasti',
                                                FAILED: 'pengiriman belum berhasil',
                                                PROCESSING: 'sedang diproses',
                                            } as Record<string, string>
                                        )[proof.receipt?.status] ??
                                            proof.receipt?.status ??
                                            'status belum tersedia'}
                                        .
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {task.can.correct_proof && proof && (
                                        <OperationalChange
                                            title="Koreksi POP"
                                            description="Versi awal dan bukti tetap tersimpan. Verifikasi terdampak perlu diperiksa ulang. Koreksi input berbeda dari penyelesaian selisih fisik."
                                            url={api.correct.url(task.id)}
                                            version={task.version}
                                            values={{
                                                customer_name:
                                                    proof.customer_name,
                                                pickup_address:
                                                    proof.pickup_address,
                                                contact: proof.contact,
                                                manual_hybrid:
                                                    proof.manual_hybrid,
                                                cashless_hybrid:
                                                    proof.cashless_hybrid,
                                                css_orion: proof.css_orion,
                                                notes: proof.notes ?? '',
                                            }}
                                            labels={{
                                                customer_name: 'Nama Customer',
                                                pickup_address: 'Alamat Pickup',
                                                contact: 'Kontak',
                                                manual_hybrid:
                                                    'Manual Hybrid (Non-Cashless)',
                                                cashless_hybrid:
                                                    'Cashless Hybrid',
                                                css_orion: 'CSS / Orion',
                                                notes: 'Catatan',
                                            }}
                                            onSaved={onSaved}
                                        />
                                    )}
                                    {task.handover_session_id &&
                                        role !== 'cs' && (
                                            <Button asChild variant="outline">
                                                <Link
                                                    href={handover({
                                                        session:
                                                            task.handover_session_id,
                                                    })}
                                                >
                                                    Lihat Handover
                                                    <ArrowRight className="size-4" />
                                                </Link>
                                            </Button>
                                        )}
                                </div>
                            </>
                        )}
                    </section>
                </div>
                <section className="min-w-0 rounded-xl border bg-card p-5 shadow-sm sm:p-6">
                    <h2 className="text-base font-semibold">
                        Jejak Operasional
                    </h2>
                    {!task.events?.length ? (
                        <p className="mt-4 text-sm text-muted-foreground">
                            Belum ada aktivitas yang dapat ditampilkan.
                        </p>
                    ) : (
                        <ol className="mt-6 ml-2 space-y-6 border-l border-blue-200 dark:border-blue-900">
                            {task.events.map((event, index) => (
                                <li
                                    key={`${event.occurred_at}-${index}`}
                                    className="relative pl-5"
                                >
                                    <span className="absolute top-1.5 -left-1.5 size-3.5 rounded-full border-2 border-card bg-blue-600" />
                                    <p className="text-sm font-medium">
                                        {eventLabels[event.action] ??
                                            event.action}
                                    </p>
                                    <p className="mt-1 text-xs leading-relaxed break-words text-muted-foreground">
                                        {event.actor_name ??
                                            `Pengguna #${event.actor_id}`}{' '}
                                        · {format(event.occurred_at)}
                                    </p>
                                    {event.new_staff_id && (
                                        <p className="mt-1 text-xs">
                                            {event.previous_staff_name ??
                                                (event.previous_staff_id
                                                    ? `Petugas #${event.previous_staff_id}`
                                                    : 'Belum ditugaskan')}{' '}
                                            →{' '}
                                            {event.new_staff_name ??
                                                `Petugas #${event.new_staff_id}`}
                                        </p>
                                    )}
                                    {event.reason && (
                                        <p className="mt-2 text-sm leading-relaxed break-words">
                                            {event.reason}
                                        </p>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}
                </section>
            </div>
            <PickupCashlessAwbs taskId={task.id} timezone={timezone} />
            <div className="flex flex-wrap gap-2">
                {task.previous_task_id && (
                    <Button asChild variant="outline">
                        <Link
                            href={operations({
                                screen: 'detail',
                                task: task.previous_task_id,
                            })}
                        >
                            Task Asal PCK-{task.previous_task_id}
                        </Link>
                    </Button>
                )}
                {task.can.create_follow_up && (
                    <Button asChild>
                        <Link
                            href={operations(
                                { screen: 'create' },
                                { query: { previous_task_id: task.id } },
                            )}
                        >
                            Buat Kunjungan Baru
                        </Link>
                    </Button>
                )}
                {task.can.retry && (
                    <OperationalChange
                        title="Izinkan Kunjungan Ulang"
                        description="Riwayat sebelumnya tetap tersimpan. Petugas dapat memulai kunjungan baru setelah konfirmasi."
                        url={api.retry.url(task.id)}
                        version={task.version}
                        onSaved={onSaved}
                    />
                )}
                {task.can.cancel && (
                    <OperationalChange
                        title="Batalkan Pickup"
                        description="Tugas dibatalkan; riwayat tugas dan kunjungan tetap tersimpan."
                        url={api.cancel.url(task.id)}
                        version={task.version}
                        onSaved={onSaved}
                    />
                )}
            </div>
            {proof && (
                <Dialog open={proofOpen} onOpenChange={setProofOpen}>
                    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
                        <DialogHeader>
                            <DialogTitle>Hasil Pickup</DialogTitle>
                            <DialogDescription className="break-all">
                                {task.customer.name} · {task.reference}
                            </DialogDescription>
                        </DialogHeader>
                        <PickupProof
                            taskId={task.id}
                            version={task.version}
                            proof={proof}
                            canFinalize={false}
                            timezone={timezone}
                            customerName={task.customer.name}
                            onSaved={onSaved}
                        />
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

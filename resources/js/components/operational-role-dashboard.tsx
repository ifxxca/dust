import DataTable from '@/components/data-table';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { useState } from 'react';
import {
    ArrowRight,
    CalendarDays,
    CheckCircle2,
    ClipboardList,
    Clock3,
    PackageCheck,
    Plus,
    RefreshCw,
    AlertTriangle,
    ArrowUp,
    ArrowDown,
    Inbox,
    Package,
    Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/page-container';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, StatusBadge } from '@/components/operational-ui';
import { handover, operations } from '@/routes';
import CreatePickupDialog from '@/components/create-pickup-dialog';

type Task = {
    id: number;
    reference: string;
    customer_name: string;
    pickup_address: string;
    scheduled_at: string;
    staff_name: string | null;
    status: string;
};
type Session = {
    id: number;
    reference: string;
    status: string;
    items_count: number;
    pending_count: number;
    discrepancy_count: number;
    created_at: string;
};
export type RoleDashboardProps = {
    operationalDate: string;
    timezone: string;
    trends: {
        today: number[];
        waiting: number[];
        assigned_today: number[];
        picked_up_today: number[];
    };
    stats: {
        today: number;
        waiting: number;
        assigned_today: number;
        picked_up_today: number;
        no_packages_today: number;
    };
    recent: Task[];
    attention: Task[];
    nextTasks: Task[];
    retail: {
        draft: number;
        in_verification: number;
        pending_items: number;
        discrepancies: number;
        sessions: Session[];
    } | null;
};
function Sparkline({
    values,
    label,
    color,
}: {
    values: number[];
    label: string;
    color: string;
}) {
    const highest = Math.max(...values, 1);
    const points = values
        .map(
            (value, index) =>
                `${3 + index * 14},${28 - (value / highest) * 23}`,
        )
        .join(' ');
    return (
        <svg
            viewBox="0 0 90 32"
            className={`h-7 w-16 shrink-0 ${color}`}
            role="img"
            aria-label={`${label}: ${values.join(', ')}`}
        >
            <title>{`${label}: ${values.join(', ')}`}</title>
            <polygon
                points={`3,31 ${points} 87,31`}
                fill="currentColor"
                opacity="0.08"
            />
            <polyline
                points={points}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    );
}
export default function RoleDashboard({
    operationalDate,
    timezone,
    stats,
    trends,
    recent,
    attention,
    nextTasks,
    retail,
}: RoleDashboardProps) {
    const user = usePage().props.auth.user;
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const manager = ['cs', 'admin_supervisor'].includes(user.role);
    const isRetail = user.role === 'retail_staff';
    const taskListUrl = operations({ screen: manager ? 'tasks' : 'mine' });
    const sessions =
        retail?.sessions.filter(
            (session) =>
                session.status !== 'CLOSED' || session.discrepancy_count > 0,
        ) ?? [];
    const trendSeries = [
        trends.today,
        manager ? trends.waiting : trends.assigned_today,
        trends.assigned_today,
        trends.picked_up_today,
    ];
    const colors = [
        'text-blue-600 dark:text-blue-300',
        'text-amber-600 dark:text-amber-300',
        'text-blue-600 dark:text-blue-300',
        'text-emerald-600 dark:text-emerald-300',
    ];
    const backgrounds = [
        'bg-blue-50 dark:bg-blue-950',
        'bg-amber-50 dark:bg-amber-950',
        'bg-blue-50 dark:bg-blue-950',
        'bg-emerald-50 dark:bg-emerald-950',
    ];
    const format = (value: string) =>
        new Date(value).toLocaleString('id-ID', {
            timeZone: timezone,
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    const cards =
        isRetail && retail
            ? [
                  {
                      title: 'Menunggu penerimaan',
                      value: retail.draft,
                      icon: PackageCheck,
                  },
                  {
                      title: 'Dalam verifikasi',
                      value: retail.in_verification,
                      icon: Clock3,
                  },
                  {
                      title: 'Task belum diperiksa',
                      value: retail.pending_items,
                      icon: ClipboardList,
                  },
                  {
                      title: 'Discrepancy tercatat',
                      value: retail.discrepancies,
                      icon: AlertTriangle,
                  },
              ]
            : [
                  {
                      title: 'Pickup hari ini',
                      value: stats.today,
                      icon: CalendarDays,
                  },
                  {
                      title: manager
                          ? 'Menunggu assignment'
                          : 'Ditugaskan hari ini',
                      value: manager ? stats.waiting : stats.assigned_today,
                      icon: ClipboardList,
                  },
                  {
                      title: 'Sedang ditangani',
                      value: stats.assigned_today,
                      icon: Truck,
                  },
                  {
                      title: 'Pickup berhasil',
                      value: stats.picked_up_today,
                      icon: CheckCircle2,
                  },
              ];
    const taskSection = (title: string, description: string, tasks: Task[]) => (
        <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
                <div className="min-w-0 flex-1">
                    <CardTitle className="text-sm sm:text-base">
                        {title}
                    </CardTitle>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {description}
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="ghost"
                    asChild
                    className="h-8 bg-primary/5 px-2.5 text-xs text-primary"
                >
                    <Link href={taskListUrl}>
                        Lihat semua <ArrowRight className="size-3.5" />
                    </Link>
                </Button>
            </CardHeader>
            <CardContent className="p-0">
                {tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 px-5 py-5 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
                            <Inbox className="size-6 text-muted-foreground" />
                        </span>
                        <div>
                            <h3 className="text-sm font-semibold">
                                Tidak ada task pada bagian ini
                            </h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Informasi diperbarui dari aktivitas pickup yang
                                tercatat.
                            </p>
                        </div>
                    </div>
                ) : (
                    tasks.map((task) => (
                        <Link
                            key={task.id}
                            className="flex flex-wrap items-center gap-3 border-b px-4 py-2 last:border-0 hover:bg-muted/40 sm:px-5"
                            href={operations({
                                screen: 'detail',
                                task: task.id,
                            })}
                        >
                            <span className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-muted/70 sm:flex">
                                <Package className="size-5 text-muted-foreground" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] leading-4 font-semibold break-words">
                                    {task.customer_name}
                                </p>
                                <p
                                    title={task.pickup_address}
                                    className="line-clamp-1 text-[11px] leading-4 text-muted-foreground"
                                >
                                    {task.pickup_address}
                                </p>
                                <p className="text-[10px] leading-4 text-muted-foreground">
                                    {format(task.scheduled_at)} ·{' '}
                                    {task.staff_name ?? 'Belum ditugaskan'}
                                </p>
                            </div>
                            <div className="flex max-w-full items-center gap-2">
                                <StatusBadge status={task.status} />
                                <ArrowRight className="size-4 text-muted-foreground" />
                            </div>
                        </Link>
                    ))
                )}
            </CardContent>
        </Card>
    );
    return (
        <PageContainer variant="fluid" className="space-y-4">
            <Head title="Dashboard Operasional" />
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                        {user.role === 'pickup_staff'
                            ? `Selamat bekerja, ${user.name.split(' ')[0]}`
                            : 'Ringkasan Operasional'}
                    </h1>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        disabled={refreshing}
                        onClick={() =>
                            router.reload({
                                onStart: () => {
                                    setRefreshing(true);
                                    setError('');
                                },
                                onFinish: () => setRefreshing(false),
                                onError: () =>
                                    setError(
                                        'Informasi belum diperbarui. Silakan muat ulang.',
                                    ),
                            })
                        }
                    >
                        <RefreshCw
                            className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
                        />
                        Muat ulang
                    </Button>
                    {(manager || user.role === 'pickup_staff') && (
                        <Button onClick={() => setCreateOpen(true)}>
                            <Plus className="size-4" />
                            Buat Pickup
                        </Button>
                    )}
                </div>
            </header>
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            <section
                aria-label="Ringkasan operasional"
                aria-busy={refreshing}
                className="grid grid-cols-2 gap-3 xl:grid-cols-4"
            >
                {cards.map((card, index) => {
                    const series = !isRetail ? trendSeries[index] : null;
                    const delta = series ? series[6] - series[5] : 0;
                    return (
                        <Card
                            key={card.title}
                            className="min-w-0 gap-0 py-0 shadow-sm"
                        >
                            <CardContent className="flex gap-3 p-4 sm:p-5">
                                <span
                                    className={`hidden size-11 shrink-0 items-center justify-center rounded-xl sm:flex ${backgrounds[index]} ${colors[index]}`}
                                >
                                    <card.icon className="size-6" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs leading-5 text-muted-foreground">
                                        {card.title}
                                    </p>
                                    <p
                                        className={`mt-1 text-3xl font-bold tracking-tight tabular-nums ${refreshing ? 'animate-pulse' : ''}`}
                                    >
                                        {card.value}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-end justify-between gap-2 sm:flex-nowrap">
                                        {!isRetail && (
                                            <p
                                                className={`flex min-w-0 items-center gap-1 text-[10px] leading-4 sm:flex-1 ${(index === 1 && manager) || delta === 0 ? 'text-muted-foreground' : delta > 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground'}`}
                                            >
                                                {index === 1 && manager ? (
                                                    'Semua jadwal'
                                                ) : (
                                                    <>
                                                        {delta !== 0 &&
                                                            (delta > 0 ? (
                                                                <ArrowUp className="size-3" />
                                                            ) : (
                                                                <ArrowDown className="size-3" />
                                                            ))}
                                                        {delta === 0
                                                            ? 'Sama dengan kemarin'
                                                            : `${Math.abs(delta)} ${delta > 0 ? 'lebih banyak' : 'lebih sedikit'} dari kemarin`}
                                                    </>
                                                )}
                                            </p>
                                        )}
                                        {series && (
                                            <Sparkline
                                                values={series}
                                                label={`${card.title} — status saat ini per hari jadwal, 7 hari terakhir`}
                                                color={colors[index]}
                                            />
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </section>
            <p className="text-[11px] text-muted-foreground">
                Tanggal operasional {operationalDate} · {timezone}. Grafik
                berdasarkan status saat ini per hari jadwal, bukan snapshot
                historis.
            </p>
            {!isRetail && (
                <p className="sr-only">
                    Antrean assignment mencakup semua tanggal.
                </p>
            )}
            {!isRetail && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs dark:border-amber-900 dark:bg-amber-950/50">
                    <p className="flex min-w-0 flex-1 items-start gap-2 leading-5">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                        <span>
                            <span className="font-semibold">
                                {stats.no_packages_today}
                            </span>{' '}
                            task terjadwal hari ini selesai tanpa paket.
                            Kunjungan berikutnya dibuat sebagai task baru.
                        </span>
                    </p>
                    <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-primary"
                    >
                        <Link
                            href={operations(
                                { screen: manager ? 'tasks' : 'mine' },
                                { query: { history: 1 } },
                            )}
                        >
                            Lihat riwayat <ArrowRight className="size-3.5" />
                        </Link>
                    </Button>
                </div>
            )}
            {user.role === 'pickup_staff' ? (
                <>
                    {taskSection(
                        'Tugas berikutnya',
                        'Diurutkan berdasarkan jadwal; tidak menggunakan lokasi atau GPS.',
                        nextTasks,
                    )}
                    <Button asChild>
                        <Link href={operations({ screen: 'mine' })}>
                            Buka Tugas Saya <ArrowRight className="size-4" />
                        </Link>
                    </Button>
                </>
            ) : (
                !isRetail && (
                    <div className="grid items-start gap-4 xl:grid-cols-2">
                        <div className="min-w-0">
                            {taskSection(
                                'Memerlukan tindakan CS',
                                'Task yang belum ditugaskan, termasuk jadwal sebelumnya.',
                                attention.slice(0, 4),
                            )}
                        </div>
                        <div className="min-w-0">
                            {taskSection(
                                'Pickup terbaru',
                                'Hingga empat task terbaru yang dapat Anda akses.',
                                recent.slice(0, 4),
                            )}
                        </div>
                    </div>
                )
            )}
            {retail && (
                <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
                    <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-5">
                        <div>
                            <CardTitle className="text-base">
                                Handover yang Perlu Ditangani
                            </CardTitle>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {retail.pending_items} task belum diperiksa ·{' '}
                                {retail.discrepancies} discrepancy tercatat,
                                termasuk session tertutup.
                            </p>
                        </div>
                        <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="bg-primary/5 text-primary"
                        >
                            <Link href={handover()}>
                                Penerimaan Paket{' '}
                                <ArrowRight className="size-4" />
                            </Link>
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        {sessions.length === 0 ? (
                            <div className="p-5">
                                <EmptyState
                                    title="Tidak ada handover yang memerlukan tindakan pada daftar terbaru"
                                    description="Buka Penerimaan Paket untuk melihat seluruh session dan riwayatnya."
                                />
                            </div>
                        ) : (
                            <>
                                <div className="hidden overflow-x-auto px-5 pb-5 lg:block">
                                    <DataTable
                                        data={sessions}
                                        getRowId={(session) =>
                                            String(session.id)
                                        }
                                        bordered={false}
                                        tableClassName="text-xs"
                                        columns={[
                                            {
                                                id: 'session_id',
                                                header: 'Session ID',
                                                hideable: false,
                                                className: 'px-3 py-3',
                                                cell: (session) => (
                                                    <>
                                                        <p className="font-medium">
                                                            HO-
                                                            {String(
                                                                session.id,
                                                            ).padStart(4, '0')}
                                                        </p>
                                                        <p
                                                            title={
                                                                session.reference
                                                            }
                                                            className="mt-1 max-w-40 truncate font-mono text-[10px] text-muted-foreground"
                                                        >
                                                            {session.reference}
                                                        </p>
                                                    </>
                                                ),
                                            },
                                            {
                                                id: 'tanggal',
                                                header: 'Tanggal',
                                                hideable: false,
                                                className:
                                                    'px-3 py-3 whitespace-nowrap',
                                                cell: (session) => (
                                                    <>
                                                        {format(
                                                            session.created_at,
                                                        )}
                                                    </>
                                                ),
                                            },
                                            {
                                                id: 'task',
                                                header: 'Task',
                                                hideable: false,
                                                className:
                                                    'px-3 py-3 tabular-nums',
                                                cell: (session) => (
                                                    <>{session.items_count}</>
                                                ),
                                            },
                                            {
                                                id: 'belum_diperiksa',
                                                header: 'Belum diperiksa',
                                                hideable: false,
                                                className:
                                                    'px-3 py-3 tabular-nums',
                                                cell: (session) => (
                                                    <>{session.pending_count}</>
                                                ),
                                            },
                                            {
                                                id: 'discrepancy',
                                                header: 'Discrepancy',
                                                hideable: false,
                                                className: (session) =>
                                                    `px-3 py-3 tabular-nums ${session.discrepancy_count > 0 ? 'font-semibold text-rose-600 dark:text-rose-300' : ''}`,
                                                cell: (session) => (
                                                    <>
                                                        {
                                                            session.discrepancy_count
                                                        }
                                                    </>
                                                ),
                                            },
                                            {
                                                id: 'status',
                                                header: 'Status',
                                                hideable: false,
                                                className: 'px-3 py-3',
                                                cell: (session) => (
                                                    <>
                                                        <StatusBadge
                                                            status={
                                                                session.status
                                                            }
                                                        />
                                                    </>
                                                ),
                                            },
                                            {
                                                id: 'aksi',
                                                header: 'Aksi',
                                                hideable: false,
                                                className: 'px-3 py-3',
                                                cell: (session) => (
                                                    <>
                                                        <Button
                                                            asChild
                                                            size="sm"
                                                            variant="outline"
                                                        >
                                                            <Link
                                                                href={handover({
                                                                    session:
                                                                        session.id,
                                                                })}
                                                            >
                                                                {session.status ===
                                                                'CLOSED'
                                                                    ? 'Detail'
                                                                    : 'Verifikasi'}
                                                            </Link>
                                                        </Button>
                                                    </>
                                                ),
                                            },
                                        ]}
                                    />
                                </div>
                                <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:hidden">
                                    {sessions.map((session) => (
                                        <article
                                            key={session.id}
                                            className="min-w-0 space-y-3 rounded-lg border p-4"
                                        >
                                            <div className="flex flex-wrap justify-between gap-2">
                                                <p className="text-sm font-semibold">
                                                    HO-
                                                    {String(
                                                        session.id,
                                                    ).padStart(4, '0')}
                                                </p>
                                                <StatusBadge
                                                    status={session.status}
                                                />
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {format(session.created_at)}
                                            </p>
                                            <dl className="grid grid-cols-3 gap-2 text-xs">
                                                <div>
                                                    <dt className="text-muted-foreground">
                                                        Task
                                                    </dt>
                                                    <dd className="mt-1 text-base font-semibold">
                                                        {session.items_count}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-muted-foreground">
                                                        Belum diperiksa
                                                    </dt>
                                                    <dd className="mt-1 text-base font-semibold">
                                                        {session.pending_count}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-muted-foreground">
                                                        Discrepancy
                                                    </dt>
                                                    <dd
                                                        className={`mt-1 text-base font-semibold ${session.discrepancy_count > 0 ? 'text-rose-600 dark:text-rose-300' : ''}`}
                                                    >
                                                        {
                                                            session.discrepancy_count
                                                        }
                                                    </dd>
                                                </div>
                                            </dl>
                                            <Button
                                                asChild
                                                size="sm"
                                                variant="outline"
                                            >
                                                <Link
                                                    href={handover({
                                                        session: session.id,
                                                    })}
                                                >
                                                    {session.status === 'CLOSED'
                                                        ? 'Detail'
                                                        : 'Verifikasi'}
                                                </Link>
                                            </Button>
                                        </article>
                                    ))}
                                </div>
                            </>
                        )}
                    </CardContent>
                    <p className="border-t px-4 py-3 text-[11px] leading-5 text-muted-foreground sm:px-5">
                        Delapan session terbaru diprioritaskan dari yang masih
                        terbuka. Menutup session tidak menyelesaikan
                        discrepancy.
                    </p>
                </Card>
            )}
            {(manager || user.role === 'pickup_staff') && (
                <CreatePickupDialog
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                    timezone={timezone}
                    onCreated={() => router.reload()}
                />
            )}
            {isRetail && (
                <div className="flex flex-wrap gap-3">
                    <Button asChild variant="outline">
                        <Link href={operations({ screen: 'mine' })}>
                            Jalankan Tugas Pickup
                        </Link>
                    </Button>
                    <p className="self-center text-xs text-muted-foreground">
                        Akses pickup tetap tersedia sesuai permission
                        operasional existing.
                    </p>
                </div>
            )}
        </PageContainer>
    );
}

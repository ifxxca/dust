import {
    Bell,
    House,
    LayoutGrid,
    UserRound,
    Package,
    Handshake,
    Car,
    Clock3,
    MoreHorizontal,
    MapPin,
    CalendarDays,
    ChevronRight,
    Check,
    Phone,
} from 'lucide-react';
import { StatusBadge } from '@/components/operational-ui';
import type { Task } from './types';

export type WorkspaceTab =
    | 'mine'
    | 'available'
    | 'handover'
    | 'history'
    | 'account';

export type AppScreen =
    | 'home'
    | 'menu'
    | 'notifications'
    | 'pickup'
    | 'handover'
    | 'cashless'
    | 'account';

export function BottomNavigation({
    tab,
    disabled,
    onNavigate,
}: {
    tab: AppScreen;
    disabled: boolean;
    onNavigate: (tab: AppScreen) => void;
}) {
    return (
        <nav aria-label="Navigasi utama" className="mobile-bottom-nav">
            {(
                [
                    { tab: 'home', label: 'Beranda', icon: House },
                    { tab: 'menu', label: 'Menu', icon: LayoutGrid },
                    { tab: 'notifications', label: 'Notifikasi', icon: Bell },
                    { tab: 'account', label: 'Akun', icon: UserRound },
                ] as const
            ).map(({ tab: destination, label, icon: Icon }) => {
                const selected =
                    tab === destination ||
                    (destination === 'menu' &&
                        (tab === 'pickup' ||
                            tab === 'handover' ||
                            tab === 'cashless'));
                return (
                    <button
                        key={destination}
                        type="button"
                        disabled={disabled}
                        aria-current={selected ? 'page' : undefined}
                        className={
                            selected ? 'text-primary' : 'text-muted-foreground'
                        }
                        onClick={() => onNavigate(destination)}
                    >
                        <Icon size={21} aria-hidden="true" />
                        <span>{label}</span>
                    </button>
                );
            })}
        </nav>
    );
}

export function TaskCard({
    task,
    schedule,
    onOpen,
    history,
}: {
    task: Task;
    schedule: string;
    onOpen: () => void;
    history: boolean;
}) {
    return (
        <button type="button" className="task-card" onClick={onOpen}>
            <div className="flex items-center justify-between gap-2">
                <strong className="min-w-0 flex-1 text-base leading-snug">
                    {task.customer.name}
                </strong>
                <StatusBadge status={task.status} />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
                PCK-{task.id}
            </p>
            {task.status !== 'NO_PACKAGES' &&
                task.visits?.at(-1)?.outcome === 'NO_PACKAGES' && (
                    <p>
                        <StatusBadge status="NO_PACKAGES" />
                    </p>
                )}
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <MapPin size={14} className="mt-0.5 shrink-0" />
                <span className="line-clamp-2">{task.pickup_address}</span>
            </p>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarDays size={14} />
                {schedule}
            </p>
            <span
                className={
                    !history && task.can.execute
                        ? 'task-card-action'
                        : 'task-card-action secondary'
                }
            >
                {!history && task.can.execute
                    ? 'Lihat & Kerjakan'
                    : !history && task.can.take_over
                      ? 'Ambil Tugas'
                      : 'Lihat Detail'}
            </span>
        </button>
    );
}

export function TaskSummary({
    task,
    schedule,
}: {
    task: Task;
    schedule: string;
}) {
    const visit = task.visits?.at(-1);
    const progress =
        task.status === 'NO_PACKAGES'
            ? 'Selesai tanpa paket · kunjungan berikutnya menggunakan task baru'
            : task.status === 'CANCELLED'
              ? 'Tugas dibatalkan · hanya dapat dilihat'
              : task.proof
                ? 'Pickup selesai · POP tersimpan'
                : visit?.outcome === 'COLLECTED'
                  ? 'Paket terkumpul · lanjutkan POP'
                  : visit?.outcome === 'NO_PACKAGES'
                    ? 'Kunjungan tercatat tanpa paket · tugas masih terbuka'
                    : task.execution_started_at
                      ? 'Kunjungan berlangsung · catat hasil'
                      : 'Kunjungan belum dimulai';
    return (
        <article className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="mb-1 text-xs text-muted-foreground">
                        PCK-{task.id}
                    </p>
                    <h2 className="text-lg leading-snug font-semibold">
                        {task.customer.name}
                    </h2>
                </div>
                <StatusBadge status={task.status} />
            </div>
            <dl className="space-y-2 text-sm">
                <div>
                    <dt className="text-xs text-muted-foreground">
                        Alamat pickup
                    </dt>
                    <dd className="leading-relaxed">{task.pickup_address}</dd>
                </div>
                {task.contact !== undefined && (
                    <div>
                        <dt className="text-xs text-muted-foreground">
                            Kontak
                        </dt>
                        <dd className="flex flex-wrap items-center justify-between gap-2 break-words">
                            {task.contact}
                            {/^[+\d ()-]+$/.test(task.contact) && (
                                <a
                                    className="inline-flex items-center gap-1 text-primary"
                                    href={`tel:${task.contact.replace(/[^+\d]/g, '')}`}
                                >
                                    <Phone size={14} />
                                    Telepon
                                </a>
                            )}
                        </dd>
                    </div>
                )}
                <div>
                    <dt className="text-xs text-muted-foreground">Jadwal</dt>
                    <dd>{schedule}</dd>
                </div>
            </dl>
            <p className="rounded-lg bg-muted px-3 py-2 text-sm font-medium text-primary">
                {progress}
            </p>
            {task.handover_session_id && (
                <p className="text-sm">
                    Handover HO-{task.handover_session_id}
                </p>
            )}
            <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                    Informasi tambahan
                </summary>
                <dl className="mt-2 space-y-2">
                    <div>
                        <dt>Referensi</dt>
                        <dd className="break-all">{task.reference}</dd>
                    </div>
                    {task.previous_task_id && (
                        <div>
                            <dt>Task asal</dt>
                            <dd>PCK-{task.previous_task_id}</dd>
                        </div>
                    )}
                    <div>
                        <dt>Petugas</dt>
                        <dd>
                            {task.assigned_staff?.name || 'Belum ditugaskan'}
                        </dd>
                    </div>
                    {task.notes && (
                        <div>
                            <dt>Catatan</dt>
                            <dd>{task.notes}</dd>
                        </div>
                    )}
                </dl>
            </details>
        </article>
    );
}

const modules = [
    {
        id: 'pickup',
        name: 'Pickup',
        description: 'Tugas, kunjungan, dan proof of pickup',
        icon: Package,
    },
    {
        id: 'fleet',
        name: 'Fleet',
        description: 'Penggunaan kendaraan',
        icon: Car,
    },
    {
        id: 'attendance',
        name: 'Absensi',
        description: 'Kehadiran karyawan',
        icon: Clock3,
    },
    {
        id: 'handover',
        name: 'Handover Pickup',
        description: 'Pintasan Pickup · Serah terima paket fisik',
        icon: Handshake,
    },
    {
        id: 'other',
        name: 'Lainnya',
        description: 'Modul operasional lainnya',
        icon: MoreHorizontal,
    },
] as const;
export function ModuleMenu({
    onPickup,
    onHandover,
    compact = false,
}: {
    onPickup: () => void;
    onHandover: () => void;
    onCashless?: () => void;
    compact?: boolean;
}) {
    return (
        <section
            aria-label="Modul operasional"
            className={compact ? 'grid grid-cols-3 gap-2' : 'space-y-2'}
        >
            {modules.map(({ id, name, description, icon: Icon }) => {
                const active = id === 'pickup' || id === 'handover';
                return (
                    <button
                        key={id}
                        aria-label={name}
                        disabled={!active}
                        onClick={id === 'pickup' ? onPickup : onHandover}
                        className={
                            compact
                                ? `module-tile ${id === 'pickup' ? 'primary' : ''}`
                                : 'module-row'
                        }
                    >
                        <span className="module-icon">
                            <Icon size={compact ? 23 : 22} />
                        </span>
                        <span
                            className={
                                compact ? '' : 'min-w-0 flex-1 text-left'
                            }
                        >
                            <strong>{name}</strong>
                            {compact && id === 'handover' && (
                                <small className="module-shortcut-label">
                                    Pintasan Pickup
                                </small>
                            )}
                            {!compact && (
                                <span className="block text-xs text-muted-foreground">
                                    {description}
                                </span>
                            )}
                            {!active && <small>Segera Hadir</small>}
                        </span>
                        {!compact && active && <ChevronRight size={18} />}
                    </button>
                );
            })}
        </section>
    );
}
export function WorkflowStepper({
    labels,
    step,
    label,
}: {
    labels: string[];
    step: number;
    label: string;
}) {
    return (
        <ol aria-label={label} className="workflow-stepper">
            {labels.map((name, index) => (
                <li
                    key={name}
                    aria-current={step === index + 1 ? 'step' : undefined}
                    data-completed={step > index + 1}
                >
                    <span>
                        {step > index + 1 ? <Check size={14} /> : index + 1}
                    </span>
                    <small>{name}</small>
                </li>
            ))}
        </ol>
    );
}
export function PickupProgress({
    task,
    review,
}: {
    task: Task;
    review: boolean;
}) {
    const step = task.proof
        ? 5
        : review
          ? 4
          : task.visits?.at(-1)?.outcome === 'COLLECTED'
            ? 3
            : task.execution_started_at
              ? 2
              : 1;
    if (!task.can.execute && !task.proof) return null;
    return (
        <WorkflowStepper
            labels={['Mulai', 'Hasil', 'POP', 'Review']}
            step={step}
            label="Progres pickup"
        />
    );
}

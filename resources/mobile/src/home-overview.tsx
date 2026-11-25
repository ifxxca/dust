import { Camera, ChevronRight, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/operational-ui';
import type { Task, TaskPage } from './types';
import { TaskCard } from './workspace-ui';

export function HomeOverview({
    name,
    summary,
    tasks,
    total,
    loading,
    error,
    onPickup,
    onScan,
    onTask,
    schedule,
}: {
    name: string;
    summary: TaskPage['summary'];
    tasks: Task[];
    total: number | null;
    loading: boolean;
    error: string;
    onPickup: () => void;
    onScan: () => void;
    onTask: (id: number) => void;
    schedule: (value: string) => string;
}) {
    return (
        <section className="home-workspace flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <p className="min-w-0 break-words">Halo, {name}</p>
                {summary && (
                    <time dateTime={summary.date}>
                        {new Intl.DateTimeFormat('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                        }).format(new Date(`${summary.date}T00:00:00`))}
                    </time>
                )}
            </div>
            <dl className="home-totals" aria-label="Aktivitas hari ini">
                {[
                    [summary?.total, 'Pickup hari ini'],
                    [summary?.successful, 'Berhasil'],
                    [summary?.no_packages, 'Tanpa paket'],
                ].map(([count, label]) => (
                    <div key={String(label)}>
                        <dt>{label}</dt>
                        <dd>{count ?? '—'}</dd>
                    </div>
                ))}
            </dl>
            <div className="grid grid-cols-2 gap-3">
                <Button onClick={onScan} className="h-12">
                    <Camera data-icon="inline-start" aria-hidden="true" />
                    Scan AWB
                </Button>
                <Button onClick={onPickup} variant="outline" className="h-12">
                    <Package data-icon="inline-start" aria-hidden="true" />
                    Buka Pickup
                </Button>
            </div>
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold">
                        Tugas saya
                        {total !== null && (
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                                {total}
                            </span>
                        )}
                    </h2>
                    <Button variant="ghost" onClick={onPickup}>
                        Lihat semua
                        <ChevronRight
                            data-icon="inline-end"
                            aria-hidden="true"
                        />
                    </Button>
                </div>
                {loading ? (
                    <EmptyState loading />
                ) : (
                    tasks
                        .slice(0, 3)
                        .map((task) => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                schedule={schedule(task.scheduled_at)}
                                history={false}
                                onOpen={() => onTask(task.id)}
                            />
                        ))
                )}
                {!loading && !error && tasks.length === 0 && (
                    <EmptyState
                        title="Belum ada tugas"
                        description="Buka Pickup untuk melihat tugas tersedia."
                    />
                )}
            </div>
        </section>
    );
}

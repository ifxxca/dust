import { Activity, Cpu, HardDrive, MemoryStick, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { monitorNumber, monitorTime } from '@/components/it-control-center-ui';
import type { MonitorHost } from '@/types/it-control-center';

const gib = (value: number | null) =>
    value === null ? '—' : `${monitorNumber(value / 1024 ** 3)} GiB`;
const uptime = (value: number | null) => {
    if (value === null) return 'Belum terukur';
    const days = Math.floor(value / 86400);
    const hours = Math.floor((value % 86400) / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    return `${days ? `${days} hari ` : ''}${hours} jam ${minutes} menit`;
};

function Metric({
    label,
    value,
    detail,
    icon: Icon,
}: {
    label: string;
    value: number | null;
    detail: string;
    icon: typeof Cpu;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon aria-hidden="true" className="size-4" />
                    {label}
                </span>
                <span className="text-lg font-semibold tabular-nums">
                    {value === null ? '—' : `${monitorNumber(value)}%`}
                </span>
            </div>
            <meter
                aria-label={`${label} terpakai`}
                className="h-2 w-full accent-primary"
                min={0}
                max={100}
                low={70}
                high={90}
                optimum={0}
                value={value ?? 0}
                hidden={value === null}
            >
                {value}%
            </meter>
            <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
    );
}

function CpuHistory({ host }: { host: MonitorHost }) {
    const rows = host.history;
    if (rows.filter((row) => row.cpu_percent !== null).length < 2)
        return (
            <p className="text-xs text-muted-foreground">
                Mengumpulkan riwayat CPU…
            </p>
        );
    const first = Date.parse(rows[0].observed_at);
    const span = Math.max(1, Date.parse(rows.at(-1)!.observed_at) - first);
    let connected = false;
    const line = rows
        .map((row) => {
            if (row.cpu_percent === null) {
                connected = false;
                return '';
            }
            const point = `${((Date.parse(row.observed_at) - first) / span) * 300},${48 - (row.cpu_percent / 100) * 44}`;
            const command = connected ? 'L' : 'M';
            connected = true;
            return `${command}${point}`;
        })
        .join(' ');
    return (
        <div className="flex flex-col gap-1">
            <svg
                viewBox="0 0 300 52"
                className="h-14 w-full text-primary"
                role="img"
                aria-label={`Riwayat CPU server ${host.host}, ${rows.length} sampel, skala 0 sampai 100 persen`}
                preserveAspectRatio="none"
            >
                <path
                    d="M0,48 H300 M0,4 H300"
                    className="stroke-border"
                    fill="none"
                    strokeWidth="1"
                />
                <path
                    d={line}
                    stroke="currentColor"
                    fill="none"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
            <p className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span>CPU · {rows.length} sampel</span>
                <span>Skala 0–100%</span>
            </p>
        </div>
    );
}

export default function ServerHeartbeatPanel({
    hosts,
}: {
    hosts: MonitorHost[];
}) {
    return (
        <section
            aria-label="Heartbeat server"
            className="flex min-w-0 flex-col gap-3"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                    <Server
                        aria-hidden="true"
                        className="size-4 text-primary"
                    />
                    Heartbeat server
                </h2>
                <span className="text-xs text-muted-foreground">
                    Pengukuran setiap 15 detik · terlambat setelah 120 detik
                </span>
            </div>
            {hosts.length === 0 ? (
                <Card>
                    <CardContent className="flex items-start gap-3 py-5">
                        <Activity
                            aria-hidden="true"
                            className="size-5 shrink-0 text-muted-foreground"
                        />
                        <div>
                            <p className="text-sm font-medium">
                                Belum ada pengukuran server
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Heartbeat host akan muncul setelah worker APEX
                                atau Hybrid menjalankan agent terbaru.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid min-w-0 gap-3">
                    {hosts.map((host) => (
                        <Card key={host.host} className="min-w-0">
                            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
                                <div className="flex flex-col gap-1">
                                    <CardTitle className="text-sm">
                                        Server {host.host}
                                    </CardTitle>
                                    <p className="text-xs text-muted-foreground">
                                        {host.platform ?? 'OS belum diketahui'}{' '}
                                        · {host.cpu_count ?? '—'} CPU logis
                                    </p>
                                </div>
                                <Badge
                                    variant={
                                        host.stale || host.warnings.length
                                            ? 'warning'
                                            : 'success'
                                    }
                                >
                                    <Activity aria-hidden="true" />
                                    {host.stale
                                        ? 'Heartbeat terlambat'
                                        : host.warnings.length
                                          ? 'Beban tinggi'
                                          : 'Online'}
                                </Badge>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <div className="grid gap-4 sm:grid-cols-3">
                                    <Metric
                                        label="CPU"
                                        value={host.cpu_percent}
                                        detail={
                                            host.cpu_percent === null
                                                ? 'Menunggu dua sampel'
                                                : 'Pemakaian seluruh CPU host'
                                        }
                                        icon={Cpu}
                                    />
                                    <Metric
                                        label="RAM"
                                        value={host.memory_percent}
                                        detail={`${gib(host.memory_free_bytes)} tersedia / ${gib(host.memory_total_bytes)}`}
                                        icon={MemoryStick}
                                    />
                                    <Metric
                                        label="Disk"
                                        value={host.disk_percent}
                                        detail={`${gib(host.disk_free_bytes)} kosong / ${gib(host.disk_total_bytes)}`}
                                        icon={HardDrive}
                                    />
                                </div>
                                <CpuHistory host={host} />
                                <dl className="grid gap-3 border-t pt-3 text-xs sm:grid-cols-3">
                                    <div>
                                        <dt className="text-muted-foreground">
                                            Heartbeat terakhir
                                        </dt>
                                        <dd className="mt-1">
                                            <time dateTime={host.observed_at}>
                                                {monitorTime(host.observed_at)}{' '}
                                                WIB
                                            </time>
                                            <span className="mt-1 block text-muted-foreground">
                                                {monitorNumber(
                                                    host.age_seconds,
                                                )}{' '}
                                                detik sebelum snapshot
                                            </span>
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-muted-foreground">
                                            Uptime server
                                        </dt>
                                        <dd className="mt-1">
                                            {uptime(host.uptime_seconds)}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-muted-foreground">
                                            Worker online
                                        </dt>
                                        <dd className="mt-1">
                                            {monitorNumber(host.workers_online)}{' '}
                                            proses
                                        </dd>
                                    </div>
                                </dl>
                                {host.stale && (
                                    <p
                                        role="status"
                                        className="text-warning-foreground text-sm"
                                    >
                                        Agent belum mengirim heartbeat baru.
                                        Angka di atas adalah pengukuran
                                        terakhir.
                                    </p>
                                )}
                                {host.warnings.length > 0 && (
                                    <p className="text-sm font-medium">
                                        {host.warnings.join(' · ')}
                                    </p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Disk: volume penyimpanan telemetry. Riwayat
                                    mengikuti proses agent; kosong setelah agent
                                    baru dijalankan.
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </section>
    );
}

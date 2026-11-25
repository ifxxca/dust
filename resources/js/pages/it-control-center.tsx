import { Head, router } from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Activity,
    CircleAlert,
    Layers,
    RefreshCw,
    ShieldCheck,
    Users,
    Workflow,
} from 'lucide-react';
import SecondaryDisclosure from '@/components/secondary-disclosure';
import PageContainer from '@/components/page-container';
import {
    ControlCenterContent,
    monitorTime,
} from '@/components/it-control-center-content';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { itControlCenter } from '@/routes';
import type { ControlCenterData } from '@/types/it-control-center';

const sections = [
    ['overview', 'Overview', Activity],
    ['workers', 'Workers & Queues', Users],
    ['integrations', 'Integrations', Layers],
    ['pipelines', 'Job Runs', Workflow],
    ['diagnostics', 'Errors', CircleAlert],
    ['attention', 'Attention Queue', CircleAlert],
] as const;

export default function ItControlCenter({
    monitoring,
}: {
    monitoring: ControlCenterData;
}) {
    const [section, setSection] = useState('overview');
    const [automatic, setAutomatic] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const loading = useRef(false);
    useEffect(() => {
        const read = () => {
            const hash = location.hash.slice(1);
            const selected =
                hash === 'scheduler' || hash === 'performance'
                    ? 'pipelines'
                    : hash;
            if (sections.some(([key]) => key === selected))
                setSection(selected);
        };
        read();
        window.addEventListener('hashchange', read);
        return () => window.removeEventListener('hashchange', read);
    }, []);
    const refresh = useCallback(() => {
        if (loading.current) return;
        loading.current = true;
        setBusy(true);
        setError('');
        router.reload({
            only: ['monitoring'],
            onFinish: () => {
                loading.current = false;
                setBusy(false);
            },
            onNetworkError: () => {
                setError(
                    'Pembaruan gagal. Snapshot sebelumnya tetap ditampilkan; coba Segarkan lagi.',
                );
                return false;
            },
            onHttpException: () => {
                setError(
                    'Snapshot belum dapat diperbarui. Periksa sesi dan koneksi, lalu coba Segarkan.',
                );
                return false;
            },
        });
    }, []);
    useEffect(() => {
        if (!automatic) return;
        const timer = window.setInterval(() => {
            if (!document.hidden) refresh();
        }, 30000);
        return () => window.clearInterval(timer);
    }, [automatic, refresh]);
    return (
        <>
            <Head title="IT Control Center" />
            <PageContainer className="flex flex-col gap-4 space-y-0">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-semibold tracking-tight">
                                IT Control Center
                            </h1>
                            <Badge variant="outline">
                                <ShieldCheck
                                    aria-hidden="true"
                                    className="size-3"
                                />
                                Read-only
                            </Badge>
                        </div>
                        <p
                            className="text-xs text-muted-foreground"
                            aria-live="polite"
                        >
                            Snapshot {monitorTime(monitoring.observed_at)} WIB
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 text-xs">
                            <Checkbox
                                checked={automatic}
                                onCheckedChange={(checked) =>
                                    setAutomatic(checked === true)
                                }
                            />
                            Otomatis 30 detik
                        </label>
                        <Button
                            className="min-h-11"
                            onClick={refresh}
                            disabled={busy}
                            variant="outline"
                        >
                            <RefreshCw
                                aria-hidden="true"
                                className={
                                    busy ? 'motion-safe:animate-spin' : ''
                                }
                            />
                            {busy ? 'Memperbarui…' : 'Segarkan'}
                        </Button>
                    </div>
                </header>
                {error && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                {monitoring.unavailable.length > 0 && (
                    <Alert variant="destructive">
                        <AlertDescription>
                            Sebagian sumber tidak dapat dibaca:{' '}
                            {monitoring.unavailable.join(', ')}. Nilainya
                            UNKNOWN. Buka Errors untuk diagnostik sumber.
                        </AlertDescription>
                    </Alert>
                )}
                <nav aria-label="Bagian monitoring" className="min-w-0">
                    <ToggleGroup
                        aria-label="Bagian IT Control Center"
                        type="single"
                        variant="navigation"
                        value={section}
                        onValueChange={(value) => {
                            if (value) {
                                setSection(value);
                                history.replaceState(
                                    history.state,
                                    '',
                                    `${itControlCenter.url()}#${value}`,
                                );
                            }
                        }}
                        className="flex w-full flex-wrap justify-start gap-2 rounded-none"
                    >
                        {sections.map(([key, title, Icon]) => (
                            <ToggleGroupItem
                                key={key}
                                value={key}
                                className="min-h-11 shrink-0 rounded-lg px-4 first:rounded-lg last:rounded-lg"
                                aria-label={title}
                            >
                                <Icon
                                    aria-hidden="true"
                                    className="hidden sm:block"
                                />
                                {title}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                </nav>
                <div aria-busy={busy} className="min-w-0 tabular-nums">
                    <ControlCenterContent data={monitoring} section={section} />
                </div>
                <SecondaryDisclosure
                    title={
                        <span className="flex items-center gap-2">
                            <ShieldCheck
                                aria-hidden="true"
                                className="size-4 text-primary"
                            />
                            Ambang health & cakupan
                        </span>
                    }
                >
                    <div className="mt-3 flex flex-col gap-2 text-muted-foreground">
                        <p>
                            Runtime: heartbeat 120 detik (toleransi heartbeat
                            10–15 detik). IDLE tetap sehat. Tidak ada bukti /
                            heartbeat kedaluwarsa = UNKNOWN. STOPPED memerlukan
                            event eksplisit.
                        </p>
                        <p>
                            Readiness: pemeriksaan sesi maksimal 660 detik (dua
                            siklus keepalive 300 detik + toleransi). Bukti
                            hilang = NOT VERIFIED; tidak menurunkan runtime
                            health.
                        </p>
                        <p>
                            Execution: hasil terminal terbaru dalam sampel 24
                            jam. NEEDS_ATTENTION berarti perlu ditinjau, bukan
                            kepastian insiden aktif. Kegagalan historis tetap
                            terlihat setelah sukses berikutnya.
                        </p>
                        <p>
                            Scheduler: jadwal berikutnya + toleransi 120 detik.
                            SKIPPED bukan gagal; hitungan missed UNKNOWN tanpa
                            bukti kontinuitas.
                        </p>
                        <p>
                            Queue: timeout &gt;= retry_after berisiko eksekusi
                            ganda. Concurrency adalah jumlah proses fresh per
                            queue/koneksi; satu proses dapat melayani beberapa
                            queue. Konfigurasi worker lama belum tentu
                            terverifikasi.
                        </p>
                        <p>
                            {monitoring.window}. Grup fingerprint mengelompokkan
                            bukti, bukan jumlah pasti insiden unik. Bukti error,
                            attempt, failed job dan business attention dapat
                            merujuk pekerjaan yang sama.
                        </p>
                        <p>
                            CPU/RAM host dan lock terdistribusi belum
                            terverifikasi. Disk dan memori PHP hanya mengukur
                            runtime monitoring. FCM/email diterima provider
                            bukan bukti diterima atau dibaca pengguna.
                        </p>
                    </div>
                </SecondaryDisclosure>
            </PageContainer>
        </>
    );
}

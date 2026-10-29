import {
    ArrowRight,
    Building2,
    CheckCheck,
    ChevronDown,
    CircleAlert,
    Clock3,
    FileDown,
    Layers3,
    LoaderCircle,
    Pause,
    Play,
    RefreshCw,
    Settings2,
    ShieldCheck,
    Timer,
    Workflow,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { jneTimestamp } from '@/lib/jne-monitoring';
import { sourceLabel, reportLabel } from '@/lib/scraping';

export type PullProfile = {
    id: number;
    source: string;
    report_type: string;
    customer_account: string;
    national_account?: string;
    label?: string | null;
    enabled: boolean;
    mode: string;
    lookback_days: number;
    date_from: string | null;
    date_thru: string | null;
    interval_minutes: number;
    last_error: string | null;
    version: number;
    next_run_at: string | null;
    last_run_at: string | null;
};

const flowIcons = {
    apex: Building2,
    hybrid_pm: Layers3,
    hybrid_puman: Layers3,
    unresolved: RefreshCw,
};

export default function JnePullSettings({
    profiles,
    activeAwbs,
    timezone,
    busy,
    running,
    onCreate,
    onEdit,
    onRun,
    onToggle,
}: {
    profiles: PullProfile[];
    activeAwbs: { total: number; eligible: number };
    timezone: string;
    busy: number | null;
    running: number | null;
    onCreate: (
        source: string,
        reportType: string,
        hybridAccount?: string,
    ) => void;
    onEdit: (profile: PullProfile) => void;
    onRun: (profile: PullProfile) => void;
    onToggle: (profile: PullProfile, enabled: boolean) => void;
}) {
    const sourceProfiles = profiles.filter(
        (profile) =>
            !(profile.source === 'apex' && profile.report_type === 'apex'),
    );
    const enabled = profiles.filter((profile) => profile.enabled).length;
    const pullFlows = (
        <section aria-labelledby="pull-flows-title" className="space-y-3">
            <div className="flex items-center gap-2">
                <Workflow
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                />
                <h2 id="pull-flows-title" className="text-sm font-semibold">
                    Pilih alur penarikan
                </h2>
            </div>
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                {[
                    {
                        key: 'apex',
                        title: 'Report customer',
                        subtitle: 'Nomor account & periode tanggal',
                        steps: ['Account', 'APEX', 'CSV'],
                        action: 'Tambah account',
                        source: 'apex',
                        type: 'apex',
                        account: '',
                    },
                    {
                        key: 'hybrid_pm',
                        title: 'Hybrid Server PM',
                        subtitle: 'ROBERTO · cashless dan manual',
                        steps: ['2 report PM', 'AWB unik', 'APEX'],
                        action: 'Atur Server PM',
                        source: 'hybrid',
                        type: 'combined',
                        account: 'HYBRID_PM',
                    },
                    {
                        key: 'hybrid_puman',
                        title: 'Hybrid Server Puman',
                        subtitle: 'NURALAMT · cashless dan manual',
                        steps: ['2 report Puman', 'AWB unik', 'APEX'],
                        action: 'Atur Server Puman',
                        source: 'hybrid',
                        type: 'combined',
                        account: 'HYBRID_PUMAN',
                    },
                    {
                        key: 'unresolved',
                        title: 'Resi aktif',
                        subtitle: 'Pantau sampai delivered / cancel',
                        steps: ['AWB aktif', 'APEX', 'Status'],
                        action: 'Atur resi aktif',
                        source: 'apex',
                        type: 'unresolved',
                        account: '',
                    },
                ].map((flow) => {
                    const Icon = flowIcons[flow.key as keyof typeof flowIcons];
                    const configured = profiles.some((profile) =>
                        flow.type === 'apex'
                            ? profile.source === 'apex' &&
                              profile.report_type === 'apex'
                            : profile.report_type === flow.type &&
                              (!flow.account ||
                                  profile.customer_account === flow.account),
                    );
                    return (
                        <Card key={flow.key} className="gap-4 py-4 shadow-none">
                            <CardHeader className="flex-row items-start gap-3 px-4">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Icon
                                        aria-hidden="true"
                                        className="size-5"
                                    />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-sm font-semibold">
                                        {flow.title}
                                    </h3>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                        {flow.subtitle}
                                    </p>
                                </div>
                                {configured && (
                                    <CheckCheck
                                        aria-label="Sudah dikonfigurasi"
                                        className="size-4 shrink-0 text-primary"
                                    />
                                )}
                            </CardHeader>
                            <CardContent className="space-y-4 px-4">
                                <ol
                                    aria-label={`Alur ${flow.title}`}
                                    className="flex items-center gap-1.5"
                                >
                                    {flow.steps.map((step, index) => (
                                        <li
                                            key={step}
                                            className="flex min-w-0 flex-1 items-center gap-1.5"
                                        >
                                            <span className="min-w-0 flex-1 rounded-md border bg-muted/30 px-1 py-2 text-center text-xs font-medium">
                                                {step}
                                            </span>
                                            {index < 2 && (
                                                <ArrowRight
                                                    aria-hidden="true"
                                                    className="size-3 shrink-0 text-muted-foreground"
                                                />
                                            )}
                                        </li>
                                    ))}
                                </ol>
                                <Button
                                    variant="outline"
                                    className="min-h-11 w-full"
                                    onClick={() =>
                                        onCreate(
                                            flow.source,
                                            flow.type,
                                            flow.account || undefined,
                                        )
                                    }
                                >
                                    <Settings2
                                        aria-hidden="true"
                                        data-icon="inline-start"
                                    />
                                    {flow.action}
                                </Button>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </section>
    );
    return (
        <>
            <section
                aria-label="Ringkasan penarikan"
                className="grid grid-cols-2 gap-3 lg:grid-cols-4"
            >
                {[
                    {
                        label: 'Jadwal aktif',
                        value: enabled,
                        detail: `dari ${profiles.length} konfigurasi`,
                        icon: Timer,
                    },
                    {
                        label: 'AWB siap diperbarui',
                        value: activeAwbs.eligible,
                        detail: `${activeAwbs.total.toLocaleString('id-ID')} resi belum delivered/cancel`,
                        icon: RefreshCw,
                    },
                    {
                        label: 'Sumber Hybrid',
                        value: 2,
                        detail: 'ROBERTO + NURALAMT',
                        icon: Layers3,
                    },
                    {
                        label: 'Account APEX',
                        value: profiles.filter(
                            (profile) =>
                                profile.source === 'apex' &&
                                profile.report_type === 'apex',
                        ).length,
                        detail: 'Kelola nomor dan National Acc/Cust',
                        icon: Building2,
                    },
                ].map(({ label, value, detail, icon: Icon }) => (
                    <Card key={label} className="gap-0 py-4 shadow-none">
                        <CardContent className="px-4">
                            <div className="flex items-center justify-between gap-2 text-muted-foreground">
                                <p className="text-xs font-medium sm:text-sm">
                                    {label}
                                </p>
                                <Icon
                                    aria-hidden="true"
                                    className="size-4 shrink-0"
                                />
                            </div>
                            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
                                {value.toLocaleString('id-ID')}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {detail}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </section>

            {profiles.length === 0 && pullFlows}

            {(sourceProfiles.length > 0 || profiles.length === 0) && (
                <section
                    aria-labelledby="saved-schedules-title"
                    className="space-y-3"
                >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2
                            id="saved-schedules-title"
                            className="text-base font-semibold"
                        >
                            Sumber tersimpan{' '}
                            <span className="ml-1 text-sm font-normal text-muted-foreground">
                                ({sourceProfiles.length})
                            </span>
                        </h2>
                        <Badge variant="outline">
                            <Clock3 aria-hidden="true" />
                            WIB
                        </Badge>
                    </div>
                    {profiles.length === 0 ? (
                        <Card className="gap-3 border-dashed py-7 text-center shadow-none">
                            <CardContent className="flex flex-col items-center gap-2">
                                <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-muted">
                                    <Timer
                                        aria-hidden="true"
                                        className="size-6 text-muted-foreground"
                                    />
                                </div>
                                <p className="font-medium">
                                    Belum ada sumber tersimpan.
                                </p>
                                <p className="max-w-sm text-sm text-muted-foreground">
                                    Pilih salah satu alur di atas untuk mulai
                                    mengatur jadwal.
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Tidak ada penarikan otomatis yang aktif.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-3 xl:grid-cols-2">
                            {sourceProfiles.map((profile) => {
                                const Icon =
                                    profile.report_type === 'unresolved'
                                        ? RefreshCw
                                        : profile.source === 'apex'
                                          ? Building2
                                          : Layers3;
                                const period =
                                    profile.report_type === 'unresolved'
                                        ? `Entry ${profile.lookback_days} hari terakhir`
                                        : profile.source !== 'apex'
                                          ? 'Hari ini · WIB'
                                          : profile.mode === 'fixed'
                                            ? `${profile.date_from} – ${profile.date_thru}`
                                            : `${profile.lookback_days} hari terakhir + kiriman lama aktif`;
                                const isRunning = running === profile.id;
                                return (
                                    <Card
                                        key={profile.id}
                                        role="article"
                                        aria-label={
                                            profile.label ||
                                            `${sourceLabel(profile.source, profile.customer_account)} ${reportLabel(profile.report_type)}`
                                        }
                                        className="gap-0 overflow-hidden py-0 shadow-none"
                                    >
                                        <CardHeader className="flex-row items-start justify-between gap-3 p-4">
                                            <div className="flex min-w-0 gap-3">
                                                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                                                    <Icon
                                                        aria-hidden="true"
                                                        className="size-4"
                                                    />
                                                </span>
                                                <div className="min-w-0">
                                                    <h3 className="font-semibold break-words">
                                                        {profile.label ||
                                                            'Sumber belum diberi nama'}
                                                    </h3>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        {sourceLabel(
                                                            profile.source,
                                                            profile.customer_account,
                                                        )}{' '}
                                                        ·{' '}
                                                        {reportLabel(
                                                            profile.report_type,
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                            <Badge
                                                variant={
                                                    profile.enabled
                                                        ? 'secondary'
                                                        : 'outline'
                                                }
                                            >
                                                {profile.enabled ? (
                                                    <Play aria-hidden="true" />
                                                ) : (
                                                    <Pause aria-hidden="true" />
                                                )}
                                                {profile.enabled
                                                    ? 'Aktif'
                                                    : 'Nonaktif'}
                                            </Badge>
                                        </CardHeader>
                                        <CardContent className="space-y-4 px-4 pb-4">
                                            <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-3">
                                                <div>
                                                    <p className="text-xs text-muted-foreground">
                                                        Interval penarikan
                                                    </p>
                                                    <p className="mt-1 font-medium">
                                                        <span className="text-2xl font-semibold tabular-nums">
                                                            {
                                                                profile.interval_minutes
                                                            }
                                                        </span>{' '}
                                                        <span className="text-sm">
                                                            menit
                                                        </span>
                                                    </p>
                                                    <span className="sr-only">
                                                        Setiap{' '}
                                                        {
                                                            profile.interval_minutes
                                                        }{' '}
                                                        menit
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-muted-foreground">
                                                        Penarikan berikutnya
                                                    </p>
                                                    <p className="mt-2 text-sm font-medium">
                                                        {profile.enabled
                                                            ? jneTimestamp(
                                                                  profile.next_run_at,
                                                                  timezone,
                                                              )
                                                            : 'Saat diminta'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <Badge
                                                    variant="outline"
                                                    className="max-w-full font-normal break-words whitespace-normal"
                                                >
                                                    {profile.report_type ===
                                                    'unresolved'
                                                        ? 'Semua account'
                                                        : profile.customer_account}
                                                </Badge>
                                                <Badge
                                                    variant="outline"
                                                    className="max-w-full font-normal whitespace-normal"
                                                >
                                                    {period}
                                                </Badge>
                                            </div>
                                            {profile.last_error && (
                                                <p className="flex items-start gap-2 text-sm text-destructive">
                                                    <CircleAlert
                                                        aria-hidden="true"
                                                        className="mt-0.5 size-4 shrink-0"
                                                    />
                                                    {profile.last_error}
                                                </p>
                                            )}
                                            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                                                <Label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                                                    <Checkbox
                                                        aria-label={`Jadwal otomatis ${profile.label || sourceLabel(profile.source, profile.customer_account)} ${reportLabel(profile.report_type)}`}
                                                        checked={
                                                            profile.enabled
                                                        }
                                                        disabled={busy !== null}
                                                        onCheckedChange={(
                                                            value,
                                                        ) =>
                                                            onToggle(
                                                                profile,
                                                                value === true,
                                                            )
                                                        }
                                                    />
                                                    {busy === profile.id ? (
                                                        <>
                                                            <LoaderCircle
                                                                aria-hidden="true"
                                                                className="size-4 animate-spin motion-reduce:animate-none"
                                                            />
                                                            Menyimpan…
                                                        </>
                                                    ) : (
                                                        'Jadwal otomatis'
                                                    )}
                                                </Label>
                                                <div className="flex gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        className="min-h-11"
                                                        onClick={() =>
                                                            onEdit(profile)
                                                        }
                                                    >
                                                        <Settings2
                                                            aria-hidden="true"
                                                            data-icon="inline-start"
                                                        />
                                                        Atur
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        className="min-h-11"
                                                        disabled={
                                                            running !== null ||
                                                            busy !== null
                                                        }
                                                        onClick={() =>
                                                            onRun(profile)
                                                        }
                                                    >
                                                        {isRunning ? (
                                                            <LoaderCircle
                                                                aria-hidden="true"
                                                                data-icon="inline-start"
                                                                className="animate-spin motion-reduce:animate-none"
                                                            />
                                                        ) : (
                                                            <Play
                                                                aria-hidden="true"
                                                                data-icon="inline-start"
                                                            />
                                                        )}
                                                        {isRunning
                                                            ? 'Mengantrekan…'
                                                            : 'Tarik sekarang'}
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {profiles.length > 0 && pullFlows}
            <Collapsible className="group rounded-xl border bg-card">
                <CollapsibleTrigger className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <ShieldCheck
                        aria-hidden="true"
                        className="size-5 text-muted-foreground"
                    />
                    <span className="flex-1">Aturan pembaruan status</span>
                    <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
                        Batas usia, kondisi berhenti & proses
                    </span>
                    <ChevronDown
                        aria-hidden="true"
                        className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                    />
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t p-4">
                    <div className="grid gap-5 sm:grid-cols-2">
                        <Rule
                            icon={RefreshCw}
                            title="Terus dipantau"
                            text="Dalam proses, kendala, dikembalikan, dan status belum dikenali. Resi delivered atau cancel berhenti masuk antrean pembaruan; datanya tetap tersimpan."
                        />
                        <Rule
                            icon={Timer}
                            title="Batas usia entry"
                            text="Dihitung dari tanggal entry JNE. Resi tanpa tanggal entry tetap ikut; resi di luar batas usia tetap terlihat di monitoring."
                        />
                        <Rule
                            icon={CircleAlert}
                            title="Satu siklus pada satu waktu"
                            text="Proses yang belum selesai atau kegagalan yang belum diperiksa menahan siklus berikutnya."
                        />
                        <Rule
                            icon={FileDown}
                            title="Hasil masuk setelah diproses"
                            text="Download APEX → impor AWB → perbarui monitoring. Segarkan tampilan memuat data yang sudah ada."
                        />
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
                        <Badge variant="outline">
                            <Timer aria-hidden="true" />
                            Interval 5–1.440 menit
                        </Badge>
                        <Badge variant="outline">
                            <FileDown aria-hidden="true" />
                            Maks. 6.000 AWB / CSV
                        </Badge>
                        <Badge variant="outline">
                            <Clock3 aria-hidden="true" />
                            Hybrid jeda 00:00–00:30 WIB
                        </Badge>
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </>
    );
}

function Rule({
    icon: Icon,
    title,
    text,
}: {
    icon: typeof RefreshCw;
    title: string;
    text: string;
}) {
    return (
        <div className="flex items-start gap-3">
            <Icon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
            />
            <div>
                <h3 className="text-sm font-medium">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {text}
                </p>
            </div>
        </div>
    );
}

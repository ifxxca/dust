import {
    ArrowDownRight,
    ArrowUpRight,
    CircleMinus,
    Clock3,
    Server,
    TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    dashboardMoney as money,
    dashboardNumber as number,
} from './jne-customer-charts';
import type { CustomerDashboardProps } from '@/types/jne-customer-dashboard';

export const jneServerLabels: Record<string, string> = {
    pm: 'Server PM',
    puman: 'Server Puman',
    css_orion: 'CSS/Orion',
    other: 'Lainnya',
};
const prefixes: Record<string, string> = {
    pm: 'Awalan 0101',
    puman: 'Awalan 0166',
    css_orion: 'Awalan CGKEC / CSS01',
    other: 'Awalan lain',
};

export function CustomerServerSummary({
    servers,
    selected,
    onSelect,
}: {
    servers: CustomerDashboardProps['servers'];
    selected: string;
    onSelect: (key: string) => void;
}) {
    return (
        <section className="flex flex-col gap-3" aria-label="Server resi">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold">Server resi</h2>
                    <p className="text-xs text-muted-foreground">
                        Kelompok berdasarkan awalan AWB. Pilih server untuk
                        merinci.
                    </p>
                </div>
                <Button
                    size="sm"
                    variant={selected === 'all' ? 'secondary' : 'outline'}
                    className="min-h-11"
                    aria-pressed={selected === 'all'}
                    onClick={() => onSelect('all')}
                >
                    Semua server
                </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {servers.map((server) => (
                    <button
                        key={server.key}
                        type="button"
                        aria-pressed={selected === server.key}
                        onClick={() => onSelect(server.key)}
                        className={`flex min-w-0 cursor-pointer flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring ${selected === server.key ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/10' : ''}`}
                    >
                        <span className="flex items-center justify-between gap-2 text-sm font-medium">
                            <span>{server.label}</span>
                            <Server
                                aria-hidden="true"
                                className="size-4 shrink-0 text-muted-foreground"
                            />
                        </span>
                        <span className="text-2xl font-semibold tabular-nums">
                            {number(server.shipments)}{' '}
                            <span className="text-xs font-normal text-muted-foreground">
                                resi
                            </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {prefixes[server.key]}
                        </span>
                        <span className="text-xs font-medium break-words tabular-nums">
                            {money(server.amount)}
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
}

export function CustomerComparison({
    comparison,
}: {
    comparison: CustomerDashboardProps['comparison'];
}) {
    return (
        <Card className="gap-3 py-4 shadow-none">
            <CardHeader className="px-4">
                <CardTitle className="text-sm">Perbandingan periode</CardTitle>
                <CardDescription>
                    Periode sebelumnya: {comparison.date_from} s.d.{' '}
                    {comparison.date_thru} · berdasarkan report tersimpan.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 px-4 sm:grid-cols-2">
                {[
                    {
                        label: 'Jumlah resi',
                        previous: `${number(comparison.shipments)} resi`,
                        change: comparison.shipment_change_percent,
                    },
                    {
                        label: 'Amount APEX',
                        previous: money(comparison.amount),
                        change: comparison.amount_change_percent,
                    },
                ].map((item) => {
                    const Icon =
                        item.change === null
                            ? CircleMinus
                            : item.change >= 0
                              ? ArrowUpRight
                              : ArrowDownRight;
                    return (
                        <div
                            key={item.label}
                            className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3"
                        >
                            <div>
                                <p className="text-xs text-muted-foreground">
                                    {item.label} sebelumnya
                                </p>
                                <p className="mt-1 font-medium tabular-nums">
                                    {item.previous}
                                </p>
                                {item.label === 'Amount APEX' && (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {comparison.amount_known}/
                                        {comparison.shipments} resi memiliki
                                        amount.
                                    </p>
                                )}
                            </div>
                            <span className="flex items-center gap-1 text-right text-sm font-medium tabular-nums">
                                <Icon
                                    aria-hidden="true"
                                    className="size-4 shrink-0"
                                />
                                {item.change === null
                                    ? item.label === 'Amount APEX' &&
                                      !comparison.amount_complete &&
                                      comparison.shipments > 0
                                        ? 'Cakupan amount belum lengkap'
                                        : 'Belum ada pembanding'
                                    : `${item.change > 0 ? '+' : ''}${number(item.change)}%`}
                            </span>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}

export function CustomerPendingAges({
    summary,
    ages,
    selected,
    onSelect,
}: {
    summary: CustomerDashboardProps['summary'];
    ages: CustomerDashboardProps['ages'];
    selected: string;
    onSelect: (age: string) => void;
}) {
    const max = Math.max(1, ...ages.map((item) => item.shipments));
    return (
        <Card className="min-w-0">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Clock3
                        aria-hidden="true"
                        className="size-4 text-primary"
                    />
                    Umur resi belum selesai
                </CardTitle>
                <CardDescription>
                    Dihitung dari tanggal kirim sampai hari ini, untuk status
                    selain terkirim, batal, dan retur.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-2xl font-semibold tabular-nums">
                            {number(summary.active_7_plus)}{' '}
                            <span className="text-sm font-normal text-muted-foreground">
                                resi berumur 7+ hari
                            </span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Tertua:{' '}
                            {summary.oldest_active_days === null
                                ? 'Tidak ada'
                                : `${summary.oldest_active_days} hari`}{' '}
                            · {number(summary.exceptions)} resi berstatus
                            kendala.
                        </p>
                    </div>
                    <TriangleAlert
                        aria-hidden="true"
                        className="size-5 text-muted-foreground"
                    />
                </div>
                <div className="flex flex-col gap-3">
                    {ages.map((item) => (
                        <div
                            key={item.label}
                            className="grid grid-cols-[5rem_1fr_3rem] items-center gap-3 text-xs"
                        >
                            <span>{item.label}</span>
                            <span
                                className="h-2 overflow-hidden rounded-full bg-muted"
                                aria-hidden="true"
                            >
                                <span
                                    className="block h-full rounded-full bg-primary/70"
                                    style={{
                                        width: `${(item.shipments / max) * 100}%`,
                                    }}
                                />
                            </span>
                            <span className="text-right tabular-nums">
                                {number(item.shipments)}
                            </span>
                        </div>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        variant={
                            selected === '7_plus' ? 'secondary' : 'outline'
                        }
                        className="min-h-11"
                        onClick={() => onSelect('7_plus')}
                    >
                        Periksa 7+ hari
                    </Button>
                    <Button
                        size="sm"
                        variant={
                            selected === '14_plus' ? 'secondary' : 'outline'
                        }
                        className="min-h-11"
                        onClick={() => onSelect('14_plus')}
                    >
                        Periksa 14+ hari
                    </Button>
                    {selected !== 'all' && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-11"
                            onClick={() => onSelect('all')}
                        >
                            Semua umur
                        </Button>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">
                    Umur resi tidak menyatakan keterlambatan terhadap SLA.
                    Status mengikuti snapshot terakhir.
                </p>
            </CardContent>
        </Card>
    );
}

import {
    ArrowDownRight,
    ArrowUpRight,
    CircleMinus,
    Clock3,
    TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OperationalPanel } from '@/components/operational-dashboard-charts';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
        <section className="flex flex-col gap-2" aria-label="Server resi">
            <div className="flex flex-wrap gap-2">
                <Button
                    variant={selected === 'all' ? 'secondary' : 'ghost'}
                    className="min-h-11"
                    aria-pressed={selected === 'all'}
                    onClick={() => onSelect('all')}
                >
                    Semua server
                </Button>
                {servers.map((server) => (
                    <Button
                        key={server.key}
                        variant={
                            selected === server.key ? 'secondary' : 'ghost'
                        }
                        className="min-h-11"
                        aria-pressed={selected === server.key}
                        onClick={() => onSelect(server.key)}
                    >
                        {server.label}
                        <span className="tabular-nums">
                            {number(server.shipments)}
                        </span>
                    </Button>
                ))}
            </div>
        </section>
    );
}

export function CustomerServerDetails({
    servers,
}: {
    servers: CustomerDashboardProps['servers'];
}) {
    return (
        <section aria-label="Amount & awalan server">
            <h3 className="mb-3 text-sm font-medium">Amount & awalan server</h3>
            <dl className="grid gap-3 pb-3 sm:grid-cols-2 lg:grid-cols-4">
                {servers.map((server) => (
                    <div key={server.key}>
                        <dt>
                            {server.label} · {prefixes[server.key]}
                        </dt>
                        <dd className="mt-1 font-medium tabular-nums">
                            {money(server.amount)}
                        </dd>
                    </div>
                ))}
            </dl>
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
    const total = ages.reduce((sum, item) => sum + item.shipments, 0);
    const oldest =
        ages.find((item) => item.label === '14+ hari')?.shipments ?? 0;
    return (
        <OperationalPanel
            title="Umur resi belum selesai"
            icon={Clock3}
            className="h-full"
            contentClassName="flex flex-col gap-5 pt-3"
        >
            <p className="text-xs text-muted-foreground">
                Total {number(summary.active)} resi belum selesai
            </p>
            <div className="flex flex-col gap-5">
                {ages.map((item, index) => {
                    const percent = total ? (item.shipments / total) * 100 : 0;
                    return (
                        <div
                            key={item.label}
                            className="grid grid-cols-[4.5rem_1fr_2.5rem_2rem] items-center gap-3 text-xs"
                        >
                            <span className="text-muted-foreground">
                                {item.label}
                            </span>
                            <span
                                className="h-2 overflow-hidden rounded-full bg-muted"
                                aria-hidden="true"
                            >
                                <span
                                    className="block h-full rounded-full bg-primary"
                                    style={{
                                        width: percent + '%',
                                        opacity: 1 - index * 0.18,
                                    }}
                                />
                            </span>
                            <span className="text-right font-medium tabular-nums">
                                {number(item.shipments)}
                            </span>
                            <span className="text-right text-muted-foreground tabular-nums">
                                {Math.round(percent)}%
                            </span>
                        </div>
                    );
                })}
            </div>
            <div className="grid grid-cols-2 gap-2">
                <Button
                    size="sm"
                    variant={selected === '7_plus' ? 'default' : 'secondary'}
                    className="min-h-11 px-2"
                    aria-pressed={selected === '7_plus'}
                    onClick={() => onSelect('7_plus')}
                >
                    Periksa 7+ hari ({number(summary.active_7_plus)})
                </Button>
                <Button
                    size="sm"
                    variant={selected === '14_plus' ? 'default' : 'secondary'}
                    className="min-h-11 px-2"
                    aria-pressed={selected === '14_plus'}
                    onClick={() => onSelect('14_plus')}
                >
                    Periksa 14+ hari ({number(oldest)})
                </Button>
            </div>
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
            <Alert className="border-warning/15 bg-warning/5">
                <TriangleAlert className="text-warning" aria-hidden="true" />
                <AlertDescription>
                    Umur resi tidak menyatakan keterlambatan SLA. Status
                    mengikuti snapshot terakhir JNE.
                </AlertDescription>
            </Alert>
            <p className="text-xs text-muted-foreground">
                Tertua:{' '}
                {summary.oldest_active_days === null
                    ? 'Tidak ada'
                    : number(summary.oldest_active_days) + ' hari'}{' '}
                · {number(summary.exceptions)} resi berkendala.
            </p>
        </OperationalPanel>
    );
}

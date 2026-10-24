import { Head, Link, useForm } from '@inertiajs/react';
import PageContainer from '@/components/page-container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import * as windows from '@/routes/jne-collections';
import * as monitoring from '@/routes/jne-monitoring';

type Page<T> = {
    data: T[];
    prev_page_url: string | null;
    next_page_url: string | null;
};
type Props = {
    task: { id: number; reference: string; customer_name_snapshot: string };
    enabled: boolean;
    window: { status: string; version: number; reason: string | null };
    contracts: {
        id: number;
        source: string;
        report_type: string;
        revision: number;
        definition: Record<string, unknown>;
    }[];
    reports: Page<{
        id: number;
        source: string;
        report_type: string;
        customer_account: string | null;
        status: string;
        import_status: string;
        projection_status: string;
    }>;
    events: Page<{
        id: number;
        actor_name: string;
        reason: string;
        created_at: string;
        before: string;
        after: string;
    }> | null;
    q: string;
    timezone: string;
};
export default function JneCollectionWindow({
    task,
    enabled,
    window,
    contracts,
    reports,
    events,
    q,
    timezone,
}: Props) {
    const form = useForm({
        status: 'COMPLETE',
        expected_version: window.version,
        submission_key: crypto.randomUUID(),
        contract_id: '',
        report_job_ids: [] as number[],
        cutoff_at: '',
        reason: '',
        confirmed_scope: false,
    });
    const search = useForm({ q });
    return (
        <PageContainer className="space-y-4 py-4">
            <Head title="Pengesahan koleksi eksternal" />
            <Link href={monitoring.reconciliation.url()} className="underline">
                Rekonsiliasi POP
            </Link>
            <h1 className="text-2xl font-semibold break-all">
                Koleksi eksternal · {task.reference}
            </h1>
            <p>
                {task.customer_name_snapshot} · {window.status}
            </p>
            <p className="text-sm text-muted-foreground">
                {window.reason ?? 'Koleksi disahkan dengan bukti laporan.'}{' '}
                Pengesahan ini terpisah dari penutupan Sertim dan tidak mengubah
                POP.
            </p>
            {!enabled && (
                <p role="status">
                    Pengesahan belum diaktifkan. Siapkan kontrak terverifikasi
                    dan lakukan UAT terlebih dahulu.
                </p>
            )}
            <form
                className="space-y-3 rounded-lg border p-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.post(windows.store.url(task.id), {
                        onSuccess: () => {
                            form.setData('submission_key', crypto.randomUUID());
                            form.setData(
                                'expected_version',
                                window.version + 1,
                            );
                        },
                    });
                }}
            >
                <Label htmlFor="collection-status">Keputusan</Label>
                <select
                    id="collection-status"
                    className="block w-full rounded border bg-background p-2"
                    value={form.data.status}
                    onChange={(event) =>
                        form.setData('status', event.target.value)
                    }
                >
                    <option value="COMPLETE">Sahkan koleksi lengkap</option>
                    <option value="OPEN">
                        Buka kembali pengesahan eksternal
                    </option>
                </select>
                <Label htmlFor="collection-contract">
                    Kontrak sumber terverifikasi
                </Label>
                <select
                    id="collection-contract"
                    className="block w-full rounded border bg-background p-2"
                    value={form.data.contract_id}
                    onChange={(event) =>
                        form.setData('contract_id', event.target.value)
                    }
                >
                    <option value="">Pilih kontrak</option>
                    {contracts.map((contract) => (
                        <option key={contract.id} value={contract.id}>
                            #{contract.id} {contract.source}/
                            {contract.report_type} r{contract.revision}
                        </option>
                    ))}
                </select>
                <details>
                    <summary>Persyaratan kontrak</summary>
                    <pre className="overflow-auto text-xs">
                        {JSON.stringify(
                            contracts.find(
                                (c) => String(c.id) === form.data.contract_id,
                            )?.definition ?? {},
                            null,
                            2,
                        )}
                    </pre>
                </details>
                <Label htmlFor="collection-jobs">
                    ID laporan bukti (pisahkan koma)
                </Label>
                <Input
                    id="collection-jobs"
                    value={form.data.report_job_ids.join(',')}
                    onChange={(event) =>
                        form.setData(
                            'report_job_ids',
                            event.target.value
                                .split(',')
                                .filter((id) => /^\d+$/.test(id.trim()))
                                .map(Number),
                        )
                    }
                />
                <Label htmlFor="collection-cutoff">
                    Cutoff yang diperiksa · {timezone}
                </Label>
                <Input
                    id="collection-cutoff"
                    type="datetime-local"
                    value={form.data.cutoff_at}
                    onChange={(event) =>
                        form.setData('cutoff_at', event.target.value)
                    }
                />
                <Label htmlFor="collection-reason">
                    Alasan dan cakupan bukti
                </Label>
                <Textarea
                    id="collection-reason"
                    required
                    maxLength={500}
                    value={form.data.reason}
                    onChange={(event) =>
                        form.setData('reason', event.target.value)
                    }
                />
                <Label className="flex items-start gap-2">
                    <input
                        type="checkbox"
                        checked={form.data.confirmed_scope}
                        onChange={(event) =>
                            form.setData(
                                'confirmed_scope',
                                event.target.checked,
                            )
                        }
                    />
                    Saya telah memeriksa seluruh sumber, account, rentang
                    tanggal, dan laporan untuk pickup ini.
                </Label>
                {Object.entries(form.errors).map(([field, message]) => (
                    <p
                        key={field}
                        role="alert"
                        className="text-sm text-destructive"
                    >
                        {message}
                    </p>
                ))}
                <Button disabled={!enabled || form.processing}>
                    Simpan pengesahan yang diaudit
                </Button>
            </form>
            <h2 className="text-lg font-semibold">Cari laporan bukti</h2>
            <form
                className="flex gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    search.get(windows.show.url(task.id));
                }}
            >
                <Input
                    aria-label="Cari laporan"
                    value={search.data.q}
                    onChange={(event) =>
                        search.setData('q', event.target.value)
                    }
                />
                <Button variant="outline">Cari</Button>
            </form>
            <div className="space-y-2">
                {reports.data.map((report) => (
                    <Label
                        key={report.id}
                        className="flex gap-2 rounded border p-3"
                    >
                        <input
                            type="checkbox"
                            checked={form.data.report_job_ids.includes(
                                report.id,
                            )}
                            onChange={(event) =>
                                form.setData(
                                    'report_job_ids',
                                    event.target.checked
                                        ? [
                                              ...form.data.report_job_ids,
                                              report.id,
                                          ]
                                        : form.data.report_job_ids.filter(
                                              (id) => id !== report.id,
                                          ),
                                )
                            }
                        />
                        #{report.id} {report.source}/{report.report_type} ·{' '}
                        {report.customer_account} · {report.status}/
                        {report.import_status}/{report.projection_status}
                    </Label>
                ))}
            </div>
            <nav className="flex gap-4">
                {reports.prev_page_url && (
                    <Link href={reports.prev_page_url}>Laporan sebelumnya</Link>
                )}
                {reports.next_page_url && (
                    <Link href={reports.next_page_url}>Laporan berikutnya</Link>
                )}
            </nav>
            <h2 className="text-lg font-semibold">Riwayat pengesahan</h2>
            {events?.data.map((event) => (
                <details key={event.id} className="rounded border p-3">
                    <summary>
                        {event.created_at} · {event.actor_name} · {event.reason}
                    </summary>
                    <pre className="overflow-auto text-xs">
                        {event.before}
                        {'\n'}
                        {event.after}
                    </pre>
                </details>
            ))}
            <nav className="flex gap-4">
                {events?.prev_page_url && (
                    <Link href={events.prev_page_url}>Riwayat sebelumnya</Link>
                )}
                {events?.next_page_url && (
                    <Link href={events.next_page_url}>Riwayat berikutnya</Link>
                )}
            </nav>
        </PageContainer>
    );
}

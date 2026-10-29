import { Head, Link, useForm } from '@inertiajs/react';
import { focusFormError } from '@/lib/utils';
import { collectionLabels } from '@/lib/jne-monitoring';
import InputError from '@/components/input-error';
import * as evidence from '@/routes/jne-evidence';
import PageContainer from '@/components/page-container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import * as windows from '@/routes/jne-collections';

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
    const complete = form.data.status === 'COMPLETE';
    return (
        <PageContainer className="flex flex-col gap-4 py-4">
            <Head title="Pengesahan koleksi eksternal" />
            <h1 className="text-2xl font-semibold break-all">
                Koleksi eksternal · {task.reference}
            </h1>
            <p>
                {task.customer_name_snapshot} ·{' '}
                {collectionLabels[window.status] ?? window.status}
            </p>
            {window.reason && (
                <details className="text-sm text-muted-foreground">
                    <summary className="cursor-pointer">
                        Alasan terakhir
                    </summary>
                    <p className="mt-2">{window.reason}</p>
                </details>
            )}
            {!enabled && (
                <p role="status">Pengesahan nonaktif di lingkungan ini.</p>
            )}
            {complete && contracts.length > 0 && (
                <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        search.get(windows.show.url(task.id), {
                            preserveState: true,
                            preserveScroll: true,
                        });
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
            )}
            <form
                className="flex flex-col gap-3 rounded-lg border p-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    const element = event.currentTarget;
                    form.transform((data) =>
                        data.status === 'OPEN'
                            ? {
                                  ...data,
                                  contract_id: null,
                                  report_job_ids: [],
                                  cutoff_at: null,
                                  confirmed_scope: false,
                              }
                            : data,
                    );
                    form.post(windows.store.url(task.id), {
                        preserveScroll: true,
                        onError: () => focusFormError(element),
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
                    aria-invalid={!!form.errors.status}
                    aria-describedby={
                        form.errors.status
                            ? 'collection-status-error'
                            : undefined
                    }
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
                <InputError
                    id="collection-status-error"
                    message={form.errors.status}
                />
                {complete && contracts.length === 0 && (
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span>Belum ada kontrak terverifikasi.</span>
                        <Button variant="outline" asChild>
                            <Link href={evidence.index.url()}>
                                Atur kontrak sumber
                            </Link>
                        </Button>
                    </div>
                )}
                {complete && contracts.length > 0 && (
                    <>
                        <Label htmlFor="collection-contract">
                            Kontrak sumber terverifikasi
                        </Label>
                        <select
                            id="collection-contract"
                            aria-invalid={!!form.errors.contract_id}
                            aria-describedby={
                                form.errors.contract_id
                                    ? 'collection-contract-error'
                                    : undefined
                            }
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
                        <InputError
                            id="collection-contract-error"
                            message={form.errors.contract_id}
                        />
                        <details>
                            <summary>Persyaratan kontrak</summary>
                            <pre className="overflow-auto text-xs">
                                {JSON.stringify(
                                    contracts.find(
                                        (c) =>
                                            String(c.id) ===
                                            form.data.contract_id,
                                    )?.definition ?? {},
                                    null,
                                    2,
                                )}
                            </pre>
                        </details>
                        <fieldset
                            className="flex min-w-0 flex-col gap-2"
                            tabIndex={-1}
                            aria-invalid={!!form.errors.report_job_ids}
                            aria-describedby={
                                form.errors.report_job_ids
                                    ? 'collection-reports-error'
                                    : undefined
                            }
                        >
                            <legend className="mb-2 text-sm font-medium">
                                Laporan bukti ·{' '}
                                {form.data.report_job_ids.length} dipilih
                            </legend>
                            <div className="flex flex-wrap gap-2">
                                {form.data.report_job_ids.map((id) => (
                                    <Button
                                        key={id}
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        aria-label={'Hapus laporan #' + id}
                                        onClick={() =>
                                            form.setData(
                                                'report_job_ids',
                                                form.data.report_job_ids.filter(
                                                    (selected) =>
                                                        selected !== id,
                                                ),
                                            )
                                        }
                                    >
                                        #{id} ×
                                    </Button>
                                ))}
                            </div>
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
                                            onChange={(event) => {
                                                const ids = event.target.checked
                                                    ? Array.from(
                                                          new Set([
                                                              ...form.data
                                                                  .report_job_ids,
                                                              report.id,
                                                          ]),
                                                      )
                                                    : form.data.report_job_ids.filter(
                                                          (id) =>
                                                              id !== report.id,
                                                      );
                                                form.setData(
                                                    'report_job_ids',
                                                    ids,
                                                );
                                            }}
                                        />
                                        #{report.id} {report.source}/
                                        {report.report_type} ·{' '}
                                        {report.customer_account} ·{' '}
                                        {report.status}/{report.import_status}/
                                        {report.projection_status}
                                    </Label>
                                ))}
                            </div>
                            <nav className="flex gap-4">
                                {reports.prev_page_url && (
                                    <Link
                                        preserveState
                                        preserveScroll
                                        href={reports.prev_page_url}
                                    >
                                        Laporan sebelumnya
                                    </Link>
                                )}
                                {reports.next_page_url && (
                                    <Link
                                        preserveState
                                        preserveScroll
                                        href={reports.next_page_url}
                                    >
                                        Laporan berikutnya
                                    </Link>
                                )}
                            </nav>
                            {reports.data.length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                    Tidak ada laporan sesuai pencarian.
                                </p>
                            )}
                            <InputError
                                id="collection-reports-error"
                                message={form.errors.report_job_ids}
                            />
                        </fieldset>
                        <Label htmlFor="collection-cutoff">
                            Cutoff yang diperiksa · {timezone}
                        </Label>
                        <Input
                            id="collection-cutoff"
                            aria-invalid={!!form.errors.cutoff_at}
                            aria-describedby={
                                form.errors.cutoff_at
                                    ? 'collection-cutoff-error'
                                    : undefined
                            }
                            type="datetime-local"
                            value={form.data.cutoff_at}
                            onChange={(event) =>
                                form.setData('cutoff_at', event.target.value)
                            }
                        />
                        <InputError
                            id="collection-cutoff-error"
                            message={form.errors.cutoff_at}
                        />
                    </>
                )}
                <Label htmlFor="collection-reason">
                    Alasan dan cakupan bukti
                </Label>
                <Textarea
                    id="collection-reason"
                    aria-invalid={!!form.errors.reason}
                    aria-describedby={
                        form.errors.reason
                            ? 'collection-reason-error'
                            : undefined
                    }
                    required
                    maxLength={500}
                    value={form.data.reason}
                    onChange={(event) =>
                        form.setData('reason', event.target.value)
                    }
                />
                <InputError
                    id="collection-reason-error"
                    message={form.errors.reason}
                />
                {complete && contracts.length > 0 && (
                    <>
                        <Label className="flex items-start gap-2">
                            <input
                                type="checkbox"
                                aria-invalid={!!form.errors.confirmed_scope}
                                aria-describedby={
                                    form.errors.confirmed_scope
                                        ? 'collection-scope-error'
                                        : undefined
                                }
                                checked={form.data.confirmed_scope}
                                onChange={(event) =>
                                    form.setData(
                                        'confirmed_scope',
                                        event.target.checked,
                                    )
                                }
                            />
                            Saya telah memeriksa seluruh sumber, account,
                            rentang tanggal, dan laporan untuk pickup ini.
                        </Label>
                        <InputError
                            id="collection-scope-error"
                            message={form.errors.confirmed_scope}
                        />
                    </>
                )}
                <div
                    data-form-errors
                    tabIndex={-1}
                    className="scroll-mt-20 focus-visible:outline-destructive"
                >
                    {Object.entries(form.errors)
                        .filter(
                            ([field]) =>
                                ![
                                    'reason',
                                    'cutoff_at',
                                    'confirmed_scope',
                                    'report_job_ids',
                                    'status',
                                    'contract_id',
                                ].includes(field),
                        )
                        .map(([field, message]) => (
                            <p
                                key={field}
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {message}
                            </p>
                        ))}
                </div>
                <Button
                    disabled={
                        !enabled ||
                        form.processing ||
                        (complete && contracts.length === 0)
                    }
                >
                    Simpan pengesahan
                </Button>
            </form>
            <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                    Riwayat pengesahan
                </summary>
                <div className="mt-3 flex flex-col gap-2">
                    {events?.data.map((event) => (
                        <details key={event.id} className="rounded border p-3">
                            <summary>
                                {event.created_at} · {event.actor_name} ·{' '}
                                {event.reason}
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
                            <Link href={events.prev_page_url}>
                                Riwayat sebelumnya
                            </Link>
                        )}
                        {events?.next_page_url && (
                            <Link href={events.next_page_url}>
                                Riwayat berikutnya
                            </Link>
                        )}
                    </nav>
                </div>
            </details>
        </PageContainer>
    );
}

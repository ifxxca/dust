import { Head, Link, router, useForm } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import PageContainer from '@/components/page-container';
import CustomerPicker from '@/components/customer-picker';
import DateRangeFields from '@/components/date-range-fields';
import FilterSelect from '@/components/filter-select';
import InputError from '@/components/input-error';
import MonitoringTable from '@/components/shipment-monitoring-table';
import {
    MonitoringHeader,
    MonitoringNavigation,
    MonitoringPeriod,
    trackingNumber,
} from '@/components/shipment-monitoring-ui';
import { DataTablePagination } from '@/components/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { trackingLabels } from '@/lib/jne-monitoring';
import {
    attentionCategories,
    slaLabels,
    nativeSlaLabels,
    emptyTrackingFilters,
    normalizeTrackingFilters,
    removeTrackingFilter,
    trackingFilterChips,
    trackingStatusFilters,
    trackingStatusScope,
    monitoringDateInput,
    type TrackingFilters,
} from '@/lib/shipment-monitoring';
import { cn } from '@/lib/utils';
import { attention, index } from '@/routes/shipment-monitoring';
import type { JneCustomer } from '@/types/jne';
import type {
    MonitoringSummary,
    TrackingPage,
} from '@/types/shipment-monitoring';

export type MonitoringExplorerProps = {
    shipments: TrackingPage;
    summary: MonitoringSummary;
    facets: MonitoringSummary;
    filters: Partial<Record<keyof TrackingFilters, string | number | null>>;
    selectedCustomer: JneCustomer | null;
    timezone: string;
};

export default function MonitoringExplorer({
    shipments,
    facets,
    filters,
    selectedCustomer,
    timezone,
    queue = false,
}: MonitoringExplorerProps & { queue?: boolean }) {
    const endpoint = queue ? attention : index;
    const applied = normalizeTrackingFilters({
        ...filters,
        attention: queue ? filters.attention || 'all' : filters.attention,
    });
    const form = useForm({
        ...applied,
        date_from: monitoringDateInput(applied.date_from),
        date_thru: monitoringDateInput(applied.date_thru, true),
    });
    const [customer, setCustomer] = useState(selectedCustomer);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [visiting, setVisiting] = useState(false);
    const [error, setError] = useState('');
    const mobile = useIsMobile();
    const busy = visiting || form.processing;
    const chips = trackingFilterChips(applied, selectedCustomer?.name).filter(
        (chip) => chip.key !== 'date_from',
    );
    const appliedKey = JSON.stringify(applied);
    useEffect(() => {
        const next = JSON.parse(appliedKey) as TrackingFilters;
        form.setData({
            ...next,
            date_from: monitoringDateInput(next.date_from),
            date_thru: monitoringDateInput(next.date_thru, true),
        });
        setCustomer(selectedCustomer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appliedKey, selectedCustomer]);
    useEffect(() => {
        const first = Object.keys(form.errors)[0];
        if (!first) return;
        setSheetOpen(
            !['q', 'shipper'].includes(first) &&
                (mobile || first !== 'customer_id'),
        );
        const frame = requestAnimationFrame(() =>
            document
                .querySelector<HTMLElement>('[aria-invalid="true"]')
                ?.focus(),
        );
        return () => cancelAnimationFrame(frame);
    }, [form.errors, sheetOpen, mobile]);
    const options = {
        preserveScroll: true,
        onStart: () => {
            setVisiting(true);
            setError('');
        },
        onFinish: () => setVisiting(false),
        onNetworkError: () => {
            setError(
                'Daftar belum diperbarui. Periksa koneksi lalu coba lagi.',
            );
            return false as const;
        },
        onHttpException: (response: { status: number }) => {
            if (response.status >= 500) {
                setError(
                    'Daftar belum dapat dimuat. Coba muat ulang beberapa saat lagi.',
                );
                return false as const;
            }
        },
    };
    const visit = (next: TrackingFilters, page = 1) =>
        router.get(endpoint.url(), { ...next, page }, options);
    const submit = () => {
        form.transform((data) => ({
            ...data,
            q: data.q.trim(),
            shipper: data.shipper.trim(),
        }));
        form.get(endpoint.url(), {
            ...options,
            preserveState: true,
            onSuccess: () => setSheetOpen(false),
        });
    };
    const customerField = (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="tracking-customer">Customer</Label>
            <CustomerPicker
                selected={customer}
                triggerId="tracking-customer"
                allowClear
                className="min-h-11 w-full"
                disabled={busy}
                invalid={!!form.errors.customer_id}
                errorId="customer-error"
                onSelect={(value) => {
                    setCustomer(
                        value
                            ? {
                                  id: value.id,
                                  name: value.name,
                                  customer_code: value.customer_code ?? null,
                              }
                            : null,
                    );
                    form.setData('customer_id', value ? String(value.id) : '');
                }}
            />
            <InputError id="customer-error" message={form.errors.customer_id} />
        </div>
    );
    const tabs = queue
        ? attentionCategories.map(([key, label, count]) => ({
              key,
              label,
              count: facets[count],
              disabled: false,
          }))
        : [
              { key: 'all', label: 'Semua Resi', count: facets.total },
              {
                  key: 'active',
                  label: 'Pengiriman Aktif',
                  count: facets.active,
              },
              { key: 'DELIVERED', label: 'Terkirim', count: facets.delivered },
              {
                  key: 'CANCELLED',
                  label: 'Dibatalkan',
                  count: facets.cancelled,
              },
              {
                  key: 'UNKNOWN',
                  label: 'Status Belum Dikenali',
                  count: facets.unknown,
              },
          ];
    const selectedTab = queue
        ? applied.attention
        : trackingStatusScope(applied);
    return (
        <PageContainer className="flex min-w-0 flex-col gap-4 space-y-0 py-4 shipment-monitoring-surface">
            <Head title={queue ? 'Resi Perlu Perhatian' : 'Semua Resi'} />
            <MonitoringHeader
                title={queue ? 'Resi Perlu Perhatian' : 'Semua Resi'}
                description={
                    queue
                        ? 'Prioritas SLA dan kendala pengiriman yang memerlukan tindak lanjut.'
                        : 'Cari dan telusuri seluruh resi dari report JNE.'
                }
                observedAt={facets.observed_at}
                calculatedAt={facets.calculated_at}
                timezone={timezone}
                busy={busy}
                refresh={() =>
                    router.reload({
                        ...options,
                        headers: { 'X-Monitoring-Refresh': '1' },
                    })
                }
            >
                <MonitoringPeriod
                    filters={applied}
                    current={queue ? 'attention' : 'shipments'}
                    busy={busy}
                />
            </MonitoringHeader>
            <MonitoringNavigation
                current={queue ? 'attention' : 'shipments'}
                filters={applied}
            />
            <nav
                aria-label={queue ? 'Kategori perhatian' : 'Status resi'}
                className="flex min-w-0 gap-x-3 overflow-x-auto overscroll-x-contain border-b sm:flex-wrap sm:gap-y-1"
            >
                {tabs.map((tab) => (
                    <Button
                        key={tab.key}
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        aria-current={
                            selectedTab === tab.key ? 'page' : undefined
                        }
                        title={
                            'disabled' in tab && tab.disabled
                                ? 'Pilih batas pembaruan dalam Filter terlebih dahulu'
                                : undefined
                        }
                        className={cn(
                            'h-auto min-h-11 shrink-0 rounded-none border-b-2 px-2 text-xs whitespace-nowrap',
                            selectedTab === tab.key
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground',
                        )}
                        onClick={() => {
                            if ('disabled' in tab && tab.disabled) {
                                form.setData('attention', 'stale');
                                setSheetOpen(true);
                                return;
                            }
                            visit(
                                queue
                                    ? { ...applied, attention: tab.key }
                                    : trackingStatusFilters(applied, tab.key),
                            );
                        }}
                    >
                        {tab.label}
                        <span className="tabular-nums">
                            {tab.count === null
                                ? 'Atur batas'
                                : trackingNumber(tab.count)}
                        </span>
                    </Button>
                ))}
            </nav>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                }}
                className="flex min-w-0 flex-col gap-3"
            >
                <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:min-w-40">
                        <Label htmlFor="q">AWB</Label>
                        <div className="relative">
                            <Search
                                aria-hidden="true"
                                className="absolute top-3.5 left-3 size-4 text-muted-foreground"
                            />
                            <Input
                                id="q"
                                name="q"
                                value={form.data.q}
                                onChange={(event) =>
                                    form.setData('q', event.target.value)
                                }
                                placeholder="Cari nomor atau awalan AWB…"
                                spellCheck={false}
                                autoComplete="off"
                                className="min-h-11 pl-9"
                                aria-invalid={!!form.errors.q}
                                aria-describedby={
                                    form.errors.q ? 'q-error' : undefined
                                }
                            />
                            <InputError id="q-error" message={form.errors.q} />
                        </div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:min-w-48">
                        <Label htmlFor="shipper">Pengirim (report)</Label>
                        <Input
                            id="shipper"
                            name="shipper"
                            value={form.data.shipper}
                            onChange={(event) =>
                                form.setData('shipper', event.target.value)
                            }
                            placeholder="Cari sebagian nama pengirim…"
                            autoComplete="off"
                            className="min-h-11"
                            aria-invalid={!!form.errors.shipper}
                            aria-describedby={
                                form.errors.shipper
                                    ? 'shipper-error'
                                    : undefined
                            }
                        />
                        <InputError
                            id="shipper-error"
                            message={form.errors.shipper}
                        />
                    </div>
                    {!mobile && (
                        <div className="w-full lg:w-60">{customerField}</div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                            <SheetTrigger asChild>
                                <Button
                                    id="tracking-filter-trigger"
                                    type="button"
                                    variant="outline"
                                    className="min-h-11"
                                    disabled={busy}
                                >
                                    <SlidersHorizontal aria-hidden="true" />
                                    Filter
                                    {chips.filter(
                                        (chip) =>
                                            !['q', 'shipper'].includes(
                                                chip.key,
                                            ),
                                    ).length > 0 && (
                                        <Badge variant="secondary">
                                            {
                                                chips.filter(
                                                    (chip) =>
                                                        ![
                                                            'q',
                                                            'shipper',
                                                        ].includes(chip.key),
                                                ).length
                                            }
                                        </Badge>
                                    )}
                                </Button>
                            </SheetTrigger>
                            <SheetContent
                                className="w-full sm:max-w-md"
                                onCloseAutoFocus={(event) => {
                                    const invalidOutside = form.errors.q
                                        ? 'q'
                                        : form.errors.shipper
                                          ? 'shipper'
                                          : !mobile && form.errors.customer_id
                                            ? 'tracking-customer'
                                            : null;
                                    if (invalidOutside) {
                                        event.preventDefault();
                                        document
                                            .getElementById(invalidOutside)
                                            ?.focus();
                                    }
                                }}
                            >
                                <SheetHeader>
                                    <SheetTitle>Filter resi</SheetTitle>
                                    <SheetDescription>
                                        Pilih kriteria, lalu terapkan untuk
                                        memperbarui daftar.
                                    </SheetDescription>
                                </SheetHeader>
                                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pb-4">
                                    {mobile && customerField}
                                    <FilterSelect
                                        id="native_sla_grade"
                                        label="Native SLA JNE"
                                        all="Semua native SLA"
                                        value={form.data.native_sla_grade}
                                        options={Object.entries(
                                            nativeSlaLabels,
                                        )}
                                        onChange={(value) =>
                                            form.setData(
                                                'native_sla_grade',
                                                value,
                                            )
                                        }
                                        error={form.errors.native_sla_grade}
                                        disabled={busy}
                                    />
                                    <FilterSelect
                                        id="sla_status"
                                        label="Status SLA"
                                        all="Semua SLA"
                                        value={form.data.sla_status}
                                        options={Object.entries(slaLabels)}
                                        onChange={(value) =>
                                            form.setData('sla_status', value)
                                        }
                                        error={form.errors.sla_status}
                                        disabled={busy}
                                    />
                                    {(
                                        [
                                            'service',
                                            'destination',
                                            'overdue_min',
                                            'overdue_max',
                                        ] as const
                                    ).map((key) => (
                                        <div
                                            key={key}
                                            className="flex flex-col gap-1.5"
                                        >
                                            <Label htmlFor={key}>
                                                {
                                                    {
                                                        service: 'Layanan',
                                                        destination:
                                                            'Destinasi',
                                                        overdue_min:
                                                            'Nilai SLA JNE minimal',
                                                        overdue_max:
                                                            'Nilai SLA JNE maksimal',
                                                    }[key]
                                                }
                                            </Label>
                                            <Input
                                                id={key}
                                                name={key}
                                                autoComplete="off"
                                                type={
                                                    key.startsWith('overdue')
                                                        ? 'number'
                                                        : 'text'
                                                }
                                                min={
                                                    key.startsWith('overdue')
                                                        ? 1
                                                        : undefined
                                                }
                                                value={form.data[key]}
                                                onChange={(event) =>
                                                    form.setData(
                                                        key,
                                                        event.target.value,
                                                    )
                                                }
                                                aria-invalid={
                                                    !!form.errors[key]
                                                }
                                                aria-describedby={
                                                    form.errors[key]
                                                        ? `${key}-error`
                                                        : undefined
                                                }
                                                disabled={busy}
                                            />
                                            <InputError
                                                id={`${key}-error`}
                                                message={form.errors[key]}
                                            />
                                        </div>
                                    ))}
                                    <FilterSelect
                                        id="customer_link"
                                        label="Keterhubungan customer"
                                        all="Semua Customer"
                                        value={form.data.customer_link}
                                        options={[
                                            ['linked', 'Customer Terhubung'],
                                            [
                                                'unlinked',
                                                'Customer Belum Terhubung',
                                            ],
                                        ]}
                                        onChange={(value) =>
                                            form.setData('customer_link', value)
                                        }
                                        error={form.errors.customer_link}
                                        disabled={busy}
                                    />
                                    <FilterSelect
                                        id="status"
                                        label="Status pengiriman"
                                        all="Semua status"
                                        value={form.data.status}
                                        options={Object.entries(trackingLabels)}
                                        onChange={(value) =>
                                            form.setData('status', value)
                                        }
                                        error={form.errors.status}
                                        disabled={busy}
                                    />
                                    <FilterSelect
                                        id="lifecycle"
                                        label="Pemantauan"
                                        all="Semua resi"
                                        value={form.data.lifecycle}
                                        options={[
                                            ['active', 'Masih Dipantau'],
                                            ['terminal', 'Pemantauan selesai'],
                                        ]}
                                        onChange={(value) =>
                                            form.setData('lifecycle', value)
                                        }
                                        error={form.errors.lifecycle}
                                        disabled={busy}
                                    />
                                    <DateRangeFields
                                        type="datetime-local"
                                        id="tracking-period"
                                        label="Periode entry AWB · WIB"
                                        from={monitoringDateInput(
                                            form.data.date_from,
                                        )}
                                        thru={monitoringDateInput(
                                            form.data.date_thru,
                                            true,
                                        )}
                                        onFromChange={(value) =>
                                            form.setData('date_from', value)
                                        }
                                        onThruChange={(value) =>
                                            form.setData('date_thru', value)
                                        }
                                        fromError={form.errors.date_from}
                                        thruError={form.errors.date_thru}
                                        disabled={busy}
                                    />
                                    <div className="flex flex-col gap-3 border-t pt-4">
                                        <h2 className="text-sm font-semibold">
                                            Pembaruan sumber
                                        </h2>
                                        <p className="text-xs text-muted-foreground">
                                            Batas ini mengukur acuan pengamatan
                                            resi yang masih dipantau. Bukan SLA
                                            pengiriman.
                                        </p>
                                        <FilterSelect
                                            id="freshness"
                                            label="Kondisi pembaruan"
                                            all="Semua pembaruan"
                                            value={form.data.freshness}
                                            options={[
                                                [
                                                    'stale',
                                                    'Data belum diperbarui',
                                                ],
                                                [
                                                    'unobserved',
                                                    'Belum pernah diamati',
                                                ],
                                            ]}
                                            onChange={(value) =>
                                                form.setData('freshness', value)
                                            }
                                            error={form.errors.freshness}
                                            disabled={busy}
                                        />
                                        <div className="flex flex-col gap-1.5">
                                            <Label htmlFor="freshness_hours">
                                                Batas pembaruan (jam)
                                            </Label>
                                            <Input
                                                id="freshness_hours"
                                                name="freshness_hours"
                                                type="number"
                                                min={1}
                                                max={8760}
                                                value={
                                                    form.data.freshness_hours
                                                }
                                                onChange={(event) =>
                                                    form.setData(
                                                        'freshness_hours',
                                                        event.target.value,
                                                    )
                                                }
                                                className="min-h-11"
                                                disabled={busy}
                                                aria-invalid={
                                                    !!form.errors
                                                        .freshness_hours
                                                }
                                                aria-describedby={
                                                    form.errors.freshness_hours
                                                        ? 'freshness_hours-error'
                                                        : undefined
                                                }
                                            />
                                            <InputError
                                                id="freshness_hours-error"
                                                message={
                                                    form.errors.freshness_hours
                                                }
                                            />
                                        </div>
                                    </div>
                                </div>
                                <SheetFooter>
                                    <Button
                                        type="button"
                                        onClick={submit}
                                        disabled={busy}
                                        className="min-h-11"
                                    >
                                        {busy ? 'Memuat…' : 'Terapkan filter'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        disabled={busy}
                                        className="min-h-11"
                                        onClick={() => {
                                            form.setData({
                                                ...emptyTrackingFilters,
                                                attention: queue ? 'all' : '',
                                            });
                                            setCustomer(null);
                                        }}
                                    >
                                        Reset isian filter
                                    </Button>
                                </SheetFooter>
                            </SheetContent>
                        </Sheet>
                        <Button
                            type="submit"
                            disabled={busy}
                            className="min-h-11"
                        >
                            {busy ? 'Memuat…' : 'Cari'}
                        </Button>
                        <Button asChild variant="ghost" className="min-h-11">
                            <Link href={endpoint()}>Reset</Link>
                        </Button>
                    </div>
                </div>
                {chips.length > 0 && (
                    <div
                        aria-label="Filter aktif"
                        className="flex flex-wrap gap-2"
                    >
                        {chips.map((chip) => (
                            <Button
                                key={chip.key}
                                type="button"
                                variant="secondary"
                                className="h-auto min-h-9 max-w-full gap-2 text-left text-xs whitespace-normal"
                                disabled={busy}
                                aria-label={`Hapus filter ${chip.label}`}
                                onClick={() =>
                                    visit(
                                        removeTrackingFilter(applied, chip.key),
                                    )
                                }
                            >
                                {chip.label}
                                <X
                                    aria-hidden="true"
                                    className="size-3.5 shrink-0"
                                />
                            </Button>
                        ))}
                    </div>
                )}
            </form>
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {busy && (
                <p role="status" className="text-sm text-muted-foreground">
                    Memuat resi…
                </p>
            )}
            <MonitoringTable
                rows={shipments.data}
                timezone={timezone}
                attention={queue}
                filters={applied}
                page={shipments.current_page}
                busy={busy}
            />
            <DataTablePagination
                meta={shipments}
                page={shipments.current_page}
                perPage={Number(applied.per_page)}
                pageSizes={[20, 50]}
                onPerPage={(value) =>
                    visit({ ...applied, per_page: String(value) })
                }
                onPage={(page) => visit(applied, page)}
                loading={busy}
                itemLabel="resi"
                className="border-t-0 px-0 sm:px-0 [&_button]:min-h-11 [&_button]:min-w-11"
            />
        </PageContainer>
    );
}

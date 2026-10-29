import DataTable, {
    DataTablePagination,
    type DataTablePageMeta,
} from '@/components/data-table';
import { Head, Link, useHttp } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import PageContainer from '@/components/page-container';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/operational-ui';
import * as api from '@/routes/api/schedules';
import * as customers from '@/routes/api/customers';
import { operations } from '@/routes';
import InputError from '@/components/input-error';
import { focusFormError } from '@/lib/utils';

type Customer = { id: number; name: string; pickup_address: string };
type Schedule = {
    id: number;
    customer_id: number;
    customer: Customer;
    pickup_address: string;
    weekdays: number[];
    pickup_time: string;
    starts_on: string;
    ends_on: string | null;
    notes: string | null;
    is_active: boolean;
    version: number;
    tasks_count: number;
    last_generated_at: string | null;
};
const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const initial = {
    customer_id: '',
    pickup_address: '',
    weekdays: [] as number[],
    pickup_time: '09:00',
    starts_on: '',
    ends_on: '',
    notes: '',
    is_active: true,
    expected_version: 1,
};
export default function PickupSchedules({ timezone }: { timezone: string }) {
    const [rows, setRows] = useState<Schedule[]>([]);
    const [customerRows, setCustomerRows] = useState<Customer[]>([]);
    const [q, setQ] = useState('');
    const [customerSearch, setCustomerSearch] = useState('');
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState<DataTablePageMeta>({});
    const [revision, setRevision] = useState(0);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Schedule | null>(null);
    const [policy, setPolicy] = useState<string | null>(null);
    const [error, setError] = useState('');
    const loader = useHttp({});
    const lookup = useHttp({});
    const form = useHttp(initial);
    const originalForm = useRef(JSON.stringify(initial));
    const changeOpen = (value: boolean) => {
        if (form.processing) return;
        if (
            !value &&
            JSON.stringify(form.data) !== originalForm.current &&
            !window.confirm('Perubahan jadwal belum disimpan. Buang perubahan?')
        )
            return;
        setOpen(value);
    };
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
            setError('');
            void loader
                .get(api.index.url({ query: { q, page } }))
                .then((result) => {
                    if (!result || cancelled) return;
                    const data = result as {
                        data: Schedule[];
                        meta: {
                            current_page: number;
                            last_page: number;
                            generation_policy: string | null;
                        };
                    };
                    if (page > data.meta.last_page) {
                        setPage(Math.max(1, data.meta.last_page));
                        return;
                    }
                    setRows(data.data);
                    setMeta(data.meta);
                    setPolicy(data.meta.generation_policy);
                })
                .catch(() => {
                    if (!cancelled)
                        setError('Jadwal gagal dimuat. Coba muat ulang.');
                });
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            loader.cancel();
        };
    }, [q, page, revision]);
    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(() => {
            void lookup
                .get(customers.index.url({ query: { q: customerSearch } }))
                .then((result) => {
                    if (result)
                        setCustomerRows((result as { data: Customer[] }).data);
                })
                .catch(() => setError('Customer gagal dimuat.'));
        }, 250);
        return () => clearTimeout(timer);
    }, [open, customerSearch]);
    const begin = (schedule: Schedule | null) => {
        setEditing(schedule);
        setError('');
        setCustomerSearch('');
        const values = schedule
            ? {
                  customer_id: String(schedule.customer_id),
                  pickup_address: schedule.pickup_address,
                  weekdays: schedule.weekdays,
                  pickup_time: schedule.pickup_time,
                  starts_on: schedule.starts_on.slice(0, 10),
                  ends_on: schedule.ends_on?.slice(0, 10) ?? '',
                  notes: schedule.notes ?? '',
                  is_active: schedule.is_active,
                  expected_version: schedule.version,
              }
            : initial;
        form.setData(values);
        form.clearErrors();
        originalForm.current = JSON.stringify(values);
        setOpen(true);
    };
    const actions = (schedule: Schedule) => (
        <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => begin(schedule)}>
                Ubah Jadwal
            </Button>
            <Button asChild variant="outline">
                <Link
                    href={operations(
                        { screen: 'tasks' },
                        { query: { schedule_id: schedule.id } },
                    )}
                >
                    Lihat Task Jadwal
                </Link>
            </Button>
        </div>
    );
    return (
        <PageContainer variant="fluid">
            <Head title="Jadwal Regular" />
            <div className="flex flex-wrap justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">Jadwal Regular</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {timezone}
                    </p>
                </div>
                <Button onClick={() => begin(null)}>Tambah Jadwal</Button>
            </div>
            <div className="flex gap-3">
                <Input
                    aria-label="Cari jadwal customer"
                    placeholder="Cari nama customer…"
                    value={q}
                    onChange={(event) => {
                        setQ(event.target.value);
                        setPage(1);
                    }}
                />
                <Button
                    variant="outline"
                    onClick={() => {
                        setError('');
                        setRevision((value) => value + 1);
                    }}
                >
                    Muat ulang
                </Button>
            </div>
            {!policy && (
                <p className="rounded-lg border bg-amber-500/10 p-4 text-sm">
                    Generasi otomatis belum aktif. Aturan hari libur dan
                    occurrence yang terlewat masih menunggu keputusan
                    operasional. Jadwal dapat disiapkan tanpa membuat task.
                </p>
            )}
            {policy && (
                <p className="text-sm text-muted-foreground">
                    Generasi:{' '}
                    {policy === 'today'
                        ? 'hari ini saja'
                        : 'hari ini dan enam hari sebelumnya'}
                    . Scheduler server harus berjalan. Jadwal tidak
                    mengecualikan hari libur secara otomatis.
                </p>
            )}
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            )}
            {loader.processing ? (
                <EmptyState loading />
            ) : rows.length === 0 ? (
                <EmptyState
                    title="Belum ada jadwal"
                    description="Tambahkan jadwal customer atau ubah pencarian."
                />
            ) : (
                <>
                    <div className="hidden min-w-0 overflow-x-auto rounded-xl border bg-card shadow-sm lg:block">
                        <DataTable
                            data={rows}
                            getRowId={(schedule) => String(schedule.id)}
                            bordered={false}
                            tableClassName={
                                'w-full min-w-[900px] text-left text-sm'
                            }
                            columns={[
                                {
                                    id: 'customer',
                                    header: 'Customer',
                                    hideable: false,
                                    className: 'p-4 font-medium break-words',
                                    cell: (schedule) => (
                                        <>{schedule.customer.name}</>
                                    ),
                                },
                                {
                                    id: 'alamat_pickup',
                                    header: 'Alamat Pickup',
                                    hideable: true,
                                    className:
                                        'max-w-96 p-4 leading-relaxed break-words',
                                    cell: (schedule) => (
                                        <>{schedule.pickup_address}</>
                                    ),
                                },
                                {
                                    id: 'hari_waktu',
                                    header: 'Hari / Waktu',
                                    hideable: true,
                                    className: 'p-4',
                                    cell: (schedule) => (
                                        <>
                                            <p>
                                                {schedule.weekdays
                                                    .map((day) => days[day - 1])
                                                    .join(', ')}
                                            </p>
                                            <p className="mt-1 text-muted-foreground">
                                                {schedule.pickup_time} ·{' '}
                                                {timezone}
                                            </p>
                                        </>
                                    ),
                                },
                                {
                                    id: 'periode_task',
                                    header: 'Periode / Task',
                                    hideable: true,
                                    className: 'p-4',
                                    cell: (schedule) => (
                                        <>
                                            <p>
                                                {schedule.starts_on.slice(
                                                    0,
                                                    10,
                                                )}{' '}
                                                sampai{' '}
                                                {schedule.ends_on?.slice(
                                                    0,
                                                    10,
                                                ) ?? 'tanpa batas akhir'}
                                            </p>
                                            <p className="mt-1 text-muted-foreground">
                                                {schedule.tasks_count} task
                                            </p>
                                        </>
                                    ),
                                },
                                {
                                    id: 'status',
                                    header: 'Status',
                                    hideable: true,
                                    className: 'p-4',
                                    cell: (schedule) => (
                                        <>
                                            {schedule.is_active
                                                ? 'Aktif'
                                                : 'Nonaktif'}
                                        </>
                                    ),
                                },
                                {
                                    id: 'generasi_terakhir',
                                    header: 'Generasi Terakhir',
                                    hideable: true,
                                    className: 'p-4',
                                    cell: (schedule) => (
                                        <>
                                            {schedule.last_generated_at
                                                ? new Date(
                                                      schedule.last_generated_at,
                                                  ).toLocaleString('id-ID', {
                                                      timeZone: timezone,
                                                  })
                                                : 'Belum pernah'}
                                        </>
                                    ),
                                },
                                {
                                    id: 'aksi',
                                    header: 'Aksi',
                                    hideable: false,
                                    className: 'p-4',
                                    cell: (schedule) => (
                                        <>{actions(schedule)}</>
                                    ),
                                },
                            ]}
                        />
                    </div>
                    <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:hidden">
                        {rows.map((schedule) => (
                            <article
                                key={schedule.id}
                                className="min-w-0 space-y-3 rounded-xl border bg-card p-5 shadow-sm"
                            >
                                <div className="flex flex-wrap justify-between gap-2">
                                    <h2 className="font-semibold break-words">
                                        {schedule.customer.name}
                                    </h2>
                                    <span className="text-sm">
                                        {schedule.is_active
                                            ? 'Aktif'
                                            : 'Nonaktif'}
                                    </span>
                                </div>
                                <p className="text-sm break-words">
                                    {schedule.pickup_address}
                                </p>
                                <p>
                                    {schedule.weekdays
                                        .map((day) => days[day - 1])
                                        .join(', ')}{' '}
                                    · {schedule.pickup_time}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {schedule.starts_on.slice(0, 10)} sampai{' '}
                                    {schedule.ends_on?.slice(0, 10) ??
                                        'tanpa batas akhir'}{' '}
                                    · {schedule.tasks_count} task
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Generasi terakhir:{' '}
                                    {schedule.last_generated_at
                                        ? new Date(
                                              schedule.last_generated_at,
                                          ).toLocaleString('id-ID', {
                                              timeZone: timezone,
                                          })
                                        : 'Belum pernah'}
                                </p>
                                {actions(schedule)}
                            </article>
                        ))}
                    </div>
                </>
            )}
            <DataTablePagination
                meta={meta}
                page={page}
                onPage={setPage}
                loading={loader.processing}
                itemLabel="jadwal"
            />
            <Dialog open={open} onOpenChange={changeOpen}>
                <DialogContent className="max-h-[90dvh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editing ? 'Ubah Jadwal' : 'Tambah Jadwal'}
                        </DialogTitle>
                        <DialogDescription>
                            Perubahan tidak mengubah task yang telah dihasilkan.
                            Nonaktifkan untuk menghentikan occurrence baru.
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="space-y-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const element = event.currentTarget;
                            setError('');
                            form.transform((data) => ({
                                ...data,
                                ends_on: data.ends_on || null,
                            }));
                            void (
                                editing
                                    ? form.patch(api.update.url(editing.id))
                                    : form.post(api.store.url())
                            )
                                .then((result) => {
                                    if (result) {
                                        toast.success('Jadwal tersimpan');
                                        setOpen(false);
                                        setRevision((value) => value + 1);
                                    } else {
                                        setError(
                                            'Periksa field. Jadwal belum tersimpan.',
                                        );
                                        focusFormError(element);
                                    }
                                })
                                .catch(() =>
                                    setError(
                                        'Permintaan gagal atau versi jadwal berubah. Muat ulang sebelum mencoba lagi.',
                                    ),
                                );
                        }}
                    >
                        <Label htmlFor="schedule-search">Cari Customer</Label>
                        <Input
                            id="schedule-search"
                            value={customerSearch}
                            onChange={(event) =>
                                setCustomerSearch(event.target.value)
                            }
                        />
                        <Label htmlFor="schedule-customer">Customer</Label>
                        <Select
                            value={form.data.customer_id}
                            onValueChange={(value) => {
                                form.setData('customer_id', value);
                                const customer = customerRows.find(
                                    (row) => String(row.id) === value,
                                );
                                if (customer)
                                    form.setData(
                                        'pickup_address',
                                        customer.pickup_address,
                                    );
                            }}
                        >
                            <SelectTrigger
                                id="schedule-customer"
                                aria-label="Customer"
                                aria-invalid={!!form.errors.customer_id}
                                aria-describedby={
                                    form.errors.customer_id
                                        ? 'schedule-customer-error'
                                        : undefined
                                }
                            >
                                <SelectValue
                                    placeholder={
                                        editing?.customer.name ??
                                        'Pilih customer'
                                    }
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {customerRows.map((customer) => (
                                    <SelectItem
                                        key={customer.id}
                                        value={String(customer.id)}
                                    >
                                        {customer.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <InputError
                            id="schedule-customer-error"
                            message={form.errors.customer_id}
                        />
                        <Label htmlFor="schedule-address">Alamat Pickup</Label>
                        <Input
                            id="schedule-address"
                            aria-invalid={!!form.errors.pickup_address}
                            aria-describedby={
                                form.errors.pickup_address
                                    ? 'schedule-address-error'
                                    : undefined
                            }
                            required
                            value={form.data.pickup_address}
                            onChange={(event) =>
                                form.setData(
                                    'pickup_address',
                                    event.target.value,
                                )
                            }
                        />
                        <InputError
                            id="schedule-address-error"
                            message={form.errors.pickup_address}
                        />
                        <fieldset
                            tabIndex={form.errors.weekdays ? -1 : undefined}
                            aria-invalid={!!form.errors.weekdays}
                            aria-describedby={
                                form.errors.weekdays
                                    ? 'schedule-weekdays-error'
                                    : undefined
                            }
                            className="space-y-2"
                        >
                            <legend className="text-sm font-medium">
                                Hari Pickup
                            </legend>
                            <div className="flex flex-wrap gap-3">
                                {days.map((day, index) => (
                                    <label
                                        key={day}
                                        className="flex min-h-11 items-center gap-2 text-sm"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={form.data.weekdays.includes(
                                                index + 1,
                                            )}
                                            onChange={(event) =>
                                                form.setData(
                                                    'weekdays',
                                                    event.target.checked
                                                        ? [
                                                              ...form.data
                                                                  .weekdays,
                                                              index + 1,
                                                          ]
                                                        : form.data.weekdays.filter(
                                                              (value) =>
                                                                  value !==
                                                                  index + 1,
                                                          ),
                                                )
                                            }
                                        />
                                        {day}
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                        <InputError
                            id="schedule-weekdays-error"
                            message={form.errors.weekdays}
                        />
                        <div className="grid gap-3 sm:grid-cols-3">
                            {(
                                ['pickup_time', 'starts_on', 'ends_on'] as const
                            ).map((key) => (
                                <div className="space-y-2" key={key}>
                                    <Label htmlFor={`schedule-${key}`}>
                                        {
                                            {
                                                pickup_time: 'Jam',
                                                starts_on: 'Tanggal Mulai',
                                                ends_on: 'Tanggal Akhir',
                                            }[key]
                                        }
                                    </Label>
                                    <Input
                                        id={`schedule-${key}`}
                                        aria-invalid={!!form.errors[key]}
                                        aria-describedby={
                                            form.errors[key]
                                                ? `schedule-${key}-error`
                                                : undefined
                                        }
                                        type={
                                            key === 'pickup_time'
                                                ? 'time'
                                                : 'date'
                                        }
                                        required={key !== 'ends_on'}
                                        value={form.data[key]}
                                        onChange={(event) =>
                                            form.setData(
                                                key,
                                                event.target.value,
                                            )
                                        }
                                    />
                                    <InputError
                                        id={`schedule-${key}-error`}
                                        message={form.errors[key]}
                                    />
                                </div>
                            ))}
                        </div>
                        <Label htmlFor="schedule-notes">Catatan</Label>
                        <Input
                            id="schedule-notes"
                            aria-invalid={!!form.errors.notes}
                            aria-describedby={
                                form.errors.notes
                                    ? 'schedule-notes-error'
                                    : undefined
                            }
                            value={form.data.notes}
                            onChange={(event) =>
                                form.setData('notes', event.target.value)
                            }
                        />
                        <InputError
                            id="schedule-notes-error"
                            message={form.errors.notes}
                        />
                        <label className="flex min-h-11 items-center gap-2">
                            <input
                                type="checkbox"
                                checked={form.data.is_active}
                                onChange={(event) =>
                                    form.setData(
                                        'is_active',
                                        event.target.checked,
                                    )
                                }
                            />
                            Jadwal Aktif
                        </label>
                        <div data-form-errors tabIndex={-1}>
                            {Object.entries(form.errors)
                                .filter(
                                    ([key]) =>
                                        ![
                                            'customer_id',
                                            'pickup_address',
                                            'weekdays',
                                            'pickup_time',
                                            'starts_on',
                                            'ends_on',
                                            'notes',
                                        ].includes(key),
                                )
                                .map(([key, value]) => (
                                    <InputError key={key} message={value} />
                                ))}
                        </div>
                        {error && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {error}
                            </p>
                        )}
                        <Button disabled={form.processing}>
                            {form.processing ? 'Menyimpan…' : 'Simpan Jadwal'}
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
        </PageContainer>
    );
}

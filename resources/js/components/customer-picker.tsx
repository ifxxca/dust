import { useHttp } from '@inertiajs/react';
import { useEffect, useId, useState } from 'react';
import { ChevronsUpDown, Check, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CustomerForm from '@/components/customer-form';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogTrigger,
} from '@/components/ui/dialog';
import * as api from '@/routes/api/customers';
import { cn } from '@/lib/utils';

export type PickupCustomer = {
    id: number;
    name: string;
    contact: string;
    pickup_address: string;
    customer_code?: string | null;
    email?: string | null;
    phone?: string | null;
    is_active?: boolean;
};
export type CustomerSearchResult = {
    data: PickupCustomer[];
    meta: { last_page: number };
};
export default function CustomerPicker({
    selected,
    onSelect,
    allowCreate = false,
    allowClear = false,
    disabled = false,
    triggerId,
    className,
    placeholder,
    invalid = false,
    errorId,
    minSearchLength = 0,
    loadCustomers,
}: {
    selected: Pick<PickupCustomer, 'id' | 'name' | 'customer_code'> | null;
    onSelect: (customer: PickupCustomer | null) => void;
    allowCreate?: boolean;
    allowClear?: boolean;
    disabled?: boolean;
    triggerId?: string;
    className?: string;
    placeholder?: string;
    invalid?: boolean;
    errorId?: string;
    minSearchLength?: number;
    loadCustomers?: (
        query: string,
        page: number,
        signal: AbortSignal,
    ) => Promise<CustomerSearchResult>;
}) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [q, setQ] = useState('');
    const [page, setPage] = useState(1);
    const [last, setLast] = useState(1);
    const [rows, setRows] = useState<PickupCustomer[]>([]);
    const [active, setActive] = useState(0);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const canSearch = q.trim().length >= minSearchLength;
    const search = useHttp({});
    const [createBusy, setCreateBusy] = useState(false);
    const [createDirty, setCreateDirty] = useState(false);
    const discardCreate = () =>
        !createDirty ||
        window.confirm('Perubahan customer belum disimpan. Buang perubahan?');
    useEffect(() => {
        if (!open || creating) return;
        const abort = new AbortController();
        setRows([]);
        setError('');
        if (!canSearch) {
            setLoading(false);
            setLast(1);
            return;
        }
        setLoading(true);
        const timer = setTimeout(() => {
            const request = loadCustomers
                ? loadCustomers(q.trim(), page, abort.signal)
                : search.get(
                      api.index.url({
                          query: { q, page, active_only: allowClear ? 0 : 1 },
                      }),
                  );
            void request
                .then((result) => {
                    if (!result || abort.signal.aborted) return;
                    const response = result as CustomerSearchResult;
                    setRows(response.data);
                    setLast(response.meta.last_page);
                    setActive(0);
                })
                .catch(() => {
                    if (!abort.signal.aborted)
                        setError(
                            'Customer gagal dimuat. Ubah pencarian atau muat ulang.',
                        );
                })
                .finally(() => {
                    if (!abort.signal.aborted) setLoading(false);
                });
        }, 250);
        return () => {
            abort.abort();
            clearTimeout(timer);
            if (!loadCustomers) search.cancel();
        };
    }, [open, creating, q, page, allowClear, canSearch, loadCustomers]);
    const choose = (customer: PickupCustomer | null) => {
        onSelect(customer);
        setOpen(false);
    };
    return (
        <Dialog
            open={open}
            onOpenChange={(value) => {
                if (!createBusy && (value || !creating || discardCreate()))
                    setOpen(value);
            }}
        >
            <DialogTrigger asChild>
                <Button
                    id={triggerId}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? errorId : undefined}
                    aria-expanded={open}
                    aria-controls={open ? `${id}-list` : undefined}
                    disabled={disabled}
                    className={cn(
                        'h-11 w-full justify-between gap-3 font-normal',
                        className,
                    )}
                    onClick={() => {
                        setCreating(false);
                    }}
                >
                    <span className="truncate">
                        {selected?.name ??
                            placeholder ??
                            (allowClear
                                ? 'Semua Customer'
                                : 'Cari dan pilih customer…')}
                    </span>
                    <ChevronsUpDown
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                    />
                </Button>
            </DialogTrigger>
            <DialogContent
                className={
                    creating
                        ? 'flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl'
                        : 'max-h-[85dvh] overflow-y-auto'
                }
                onInteractOutside={(event) => {
                    if (creating) event.preventDefault();
                }}
            >
                <DialogHeader
                    className={
                        creating
                            ? 'shrink-0 border-b px-6 py-5 text-left'
                            : undefined
                    }
                >
                    <DialogTitle>
                        {creating ? 'Tambah Customer' : 'Pilih Customer'}
                    </DialogTitle>
                    <DialogDescription>
                        {creating
                            ? 'Simpan customer baru untuk langsung dipilih pada pickup ini.'
                            : 'Cari customer berdasarkan nama atau kode, lalu pilih hasil yang sesuai.'}
                    </DialogDescription>
                </DialogHeader>
                {creating ? (
                    <CustomerForm
                        inDialog
                        onProcessingChange={setCreateBusy}
                        onDirtyChange={setCreateDirty}
                        onCancel={() => {
                            if (discardCreate()) setCreating(false);
                        }}
                        onSaved={(customer) => {
                            if (customer.is_active) {
                                choose(customer);
                                toast.success('Customer dibuat dan dipilih');
                            } else {
                                setCreating(false);
                                toast.success(
                                    'Customer disimpan sebagai nonaktif dan tidak dipilih untuk pickup.',
                                );
                            }
                        }}
                    />
                ) : (
                    <>
                        <div>
                            <Input
                                aria-label="Cari customer"
                                className="h-11"
                                placeholder="Ketik nama customer…"
                                value={q}
                                role="combobox"
                                aria-autocomplete="list"
                                autoComplete="off"
                                spellCheck={false}
                                aria-expanded="true"
                                aria-controls={`${id}-list`}
                                aria-activedescendant={
                                    rows[active]
                                        ? `${id}-option-${rows[active].id}`
                                        : undefined
                                }
                                onChange={(event) => {
                                    setRows([]);
                                    setQ(event.target.value);
                                    setPage(1);
                                }}
                                onKeyDown={(event) => {
                                    if (
                                        event.key === 'ArrowDown' ||
                                        event.key === 'ArrowUp'
                                    ) {
                                        event.preventDefault();
                                        const next = Math.max(
                                            0,
                                            Math.min(
                                                rows.length - 1,
                                                active +
                                                    (event.key === 'ArrowDown'
                                                        ? 1
                                                        : -1),
                                            ),
                                        );
                                        setActive(next);
                                        if (rows[next])
                                            document
                                                .getElementById(
                                                    `${id}-option-${rows[next].id}`,
                                                )
                                                ?.scrollIntoView({
                                                    block: 'nearest',
                                                });
                                    }
                                    if (
                                        event.key === 'Enter' &&
                                        rows[active] &&
                                        !loading
                                    ) {
                                        event.preventDefault();
                                        choose(rows[active]);
                                    }
                                }}
                            />
                        </div>
                        {loading ? (
                            <p
                                role="status"
                                className="py-6 text-center text-sm text-muted-foreground"
                            >
                                Mencari customer…
                            </p>
                        ) : (
                            <div
                                id={`${id}-list`}
                                role="listbox"
                                aria-label="Hasil pencarian customer"
                                aria-busy={loading}
                                className="flex max-h-[min(20rem,40dvh)] flex-col gap-1 overflow-y-auto overscroll-contain"
                            >
                                {allowClear && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="w-full justify-start"
                                        onClick={() => choose(null)}
                                    >
                                        Semua Customer
                                    </Button>
                                )}
                                {rows.map((customer, index) => (
                                    <button
                                        id={`${id}-option-${customer.id}`}
                                        type="button"
                                        role="option"
                                        aria-selected={
                                            selected?.id === customer.id
                                        }
                                        key={customer.id}
                                        className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-md p-3 text-left text-sm hover:bg-accent ${active === index ? 'bg-accent' : ''}`}
                                        onClick={() => choose(customer)}
                                    >
                                        <span className="min-w-0">
                                            <span className="block font-medium">
                                                {customer.name}
                                                {customer.customer_code && (
                                                    <span className="ml-2 text-xs text-muted-foreground">
                                                        {customer.customer_code}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {customer.contact} ·{' '}
                                                {customer.pickup_address}
                                            </span>
                                        </span>
                                        {selected?.id === customer.id && (
                                            <Check
                                                aria-hidden="true"
                                                className="size-4 shrink-0"
                                            />
                                        )}
                                    </button>
                                ))}
                                {!rows.length && !error && (
                                    <p
                                        role="status"
                                        className="py-5 text-center text-sm text-muted-foreground"
                                    >
                                        {!canSearch
                                            ? `Ketik minimal ${minSearchLength} karakter untuk mencari customer.`
                                            : `Customer tidak ditemukan. Periksa nama${allowCreate ? ' atau tambahkan customer baru.' : '.'}`}
                                    </p>
                                )}
                            </div>
                        )}
                        {last > 1 && canSearch && !error && (
                            <div className="flex items-center justify-between gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={page <= 1 || loading}
                                    onClick={() => setPage(page - 1)}
                                >
                                    Sebelumnya
                                </Button>
                                <span className="text-xs text-muted-foreground">
                                    {page}/{last}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={page >= last || loading}
                                    onClick={() => setPage(page + 1)}
                                >
                                    Berikutnya
                                </Button>
                            </div>
                        )}
                        {allowCreate && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setCreateBusy(false);
                                    setError('');
                                    setCreating(true);
                                }}
                            >
                                <Plus className="size-4" />
                                Tambah Customer
                            </Button>
                        )}
                    </>
                )}
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}

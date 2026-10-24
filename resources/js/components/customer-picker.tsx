import { useHttp } from '@inertiajs/react';
import { useEffect, useId, useState } from 'react';
import { ChevronsUpDown, Check, Plus, Search } from 'lucide-react';
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
export default function CustomerPicker({
    selected,
    onSelect,
    allowCreate = false,
    allowClear = false,
    disabled = false,
    triggerId,
    className,
    placeholder,
}: {
    selected: Pick<PickupCustomer, 'id' | 'name' | 'customer_code'> | null;
    onSelect: (customer: PickupCustomer | null) => void;
    allowCreate?: boolean;
    allowClear?: boolean;
    disabled?: boolean;
    triggerId?: string;
    className?: string;
    placeholder?: string;
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
    const search = useHttp({});
    const [createBusy, setCreateBusy] = useState(false);
    useEffect(() => {
        if (!open || creating) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            setError('');
            void search
                .get(
                    api.index.url({
                        query: { q, page, active_only: allowClear ? 0 : 1 },
                    }),
                )
                .then((result) => {
                    if (!result || cancelled) return;
                    const response = result as {
                        data: PickupCustomer[];
                        meta: { last_page: number };
                    };
                    setRows(response.data);
                    setLast(response.meta.last_page);
                    setActive(0);
                })
                .catch(() => {
                    if (!cancelled)
                        setError(
                            'Customer gagal dimuat. Ubah pencarian atau muat ulang.',
                        );
                });
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            search.cancel();
        };
    }, [open, creating, q, page, allowClear]);
    const choose = (customer: PickupCustomer | null) => {
        onSelect(customer);
        setOpen(false);
    };
    return (
        <>
            <Button
                id={triggerId}
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                aria-controls={`${id}-list`}
                disabled={disabled}
                className={cn(
                    'h-11 w-full justify-between gap-3 font-normal',
                    className,
                )}
                onClick={() => {
                    setCreating(false);
                    setOpen(true);
                }}
            >
                <span className="truncate">
                    {selected?.name ??
                        placeholder ??
                        (allowClear
                            ? 'Semua Customer'
                            : 'Cari dan pilih customer…')}
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </Button>
            <Dialog
                open={open}
                onOpenChange={(value) => {
                    if (!createBusy) setOpen(value);
                }}
            >
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
                            onCancel={() => setCreating(false)}
                            onSaved={(customer) => {
                                if (customer.is_active) {
                                    choose(customer);
                                    toast.success(
                                        'Customer dibuat dan dipilih',
                                    );
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
                            <div className="relative">
                                <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
                                <Input
                                    aria-label="Cari customer"
                                    className="h-11 pl-9"
                                    placeholder="Ketik nama customer…"
                                    value={q}
                                    role="combobox"
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
                                            setActive((value) =>
                                                Math.max(
                                                    0,
                                                    Math.min(
                                                        rows.length - 1,
                                                        value +
                                                            (event.key ===
                                                            'ArrowDown'
                                                                ? 1
                                                                : -1),
                                                    ),
                                                ),
                                            );
                                        }
                                        if (
                                            event.key === 'Enter' &&
                                            rows[active] &&
                                            !search.processing
                                        ) {
                                            event.preventDefault();
                                            choose(rows[active]);
                                        }
                                    }}
                                />
                            </div>
                            {search.processing ? (
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
                                    className="max-h-64 space-y-1 overflow-y-auto"
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
                                                            {
                                                                customer.customer_code
                                                            }
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="block truncate text-xs text-muted-foreground">
                                                    {customer.contact} ·{' '}
                                                    {customer.pickup_address}
                                                </span>
                                            </span>
                                            {selected?.id === customer.id && (
                                                <Check className="size-4 shrink-0" />
                                            )}
                                        </button>
                                    ))}
                                    {!rows.length && (
                                        <p className="py-5 text-center text-sm text-muted-foreground">
                                            Customer tidak ditemukan. Periksa
                                            nama
                                            {allowCreate
                                                ? ' atau tambahkan customer baru.'
                                                : '.'}
                                        </p>
                                    )}
                                </div>
                            )}
                            <div className="flex items-center justify-between gap-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={page <= 1 || search.processing}
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
                                    disabled={page >= last || search.processing}
                                    onClick={() => setPage(page + 1)}
                                >
                                    Berikutnya
                                </Button>
                            </div>
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
        </>
    );
}

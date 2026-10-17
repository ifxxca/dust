import { useMemo } from 'react';
import { Building2, Mail, MapPin, Pencil, Phone } from 'lucide-react';
import type { CustomerDetails } from '@/components/customer-form';
import DataTable, { type DataTableColumn } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
export type CustomerPagination = {
    current_page: number;
    last_page: number;
    total: number;
    from: number | null;
    to: number | null;
    per_page: number;
};
export default function CustomerDataTable({
    customers,
    meta,
    page,
    loading,
    error,
    filtered,
    onPage,
    onEdit,
    onReset,
}: {
    customers: CustomerDetails[];
    meta?: CustomerPagination;
    page: number;
    loading: boolean;
    error: string;
    filtered: boolean;
    onPage: (page: number) => void;
    onEdit: (customer: CustomerDetails) => void;
    onReset: () => void;
}) {
    const columns = useMemo<DataTableColumn<CustomerDetails>[]>(
        () => [
            {
                id: 'name',
                header: 'Customer',
                hideable: false,
                cell: (customer) => (
                    <div className="flex min-w-52 items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                            <Building2 className="size-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="max-w-64 font-medium break-words whitespace-normal">
                                {customer.name}
                            </p>
                            <p className="mt-1 font-mono text-xs text-muted-foreground">
                                {customer.customer_code ?? 'Belum ada kode'}
                            </p>
                        </div>
                    </div>
                ),
            },
            {
                id: 'contacts',
                header: 'Kontak',
                hideable: true,
                cell: (customer) => (
                    <div className="min-w-48 space-y-1.5 text-sm">
                        {customer.email && (
                            <p className="flex items-center gap-2">
                                <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                                <span
                                    className="max-w-56 truncate"
                                    title={customer.email}
                                >
                                    {customer.email}
                                </span>
                            </p>
                        )}
                        {customer.phone && (
                            <p className="flex items-center gap-2">
                                <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                                {customer.phone}
                            </p>
                        )}
                        {customer.contact &&
                            customer.contact !== customer.email &&
                            customer.contact !== customer.phone && (
                                <p className="max-w-56 whitespace-normal text-muted-foreground">
                                    {customer.contact}
                                </p>
                            )}
                        {!customer.email &&
                            !customer.phone &&
                            !customer.contact && (
                                <span className="text-muted-foreground">
                                    Belum diisi
                                </span>
                            )}
                    </div>
                ),
            },
            {
                id: 'pickup_address',
                header: 'Alamat Pickup',
                hideable: true,
                cell: (customer) => (
                    <div className="flex max-w-80 min-w-56 items-start gap-2">
                        <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <p
                            className="line-clamp-2 whitespace-normal text-muted-foreground"
                            title={customer.pickup_address}
                        >
                            {customer.pickup_address}
                        </p>
                    </div>
                ),
            },
            {
                id: 'coordinates',
                header: 'Koordinat',
                hideable: true,
                cell: (customer) =>
                    customer.latitude !== null &&
                    customer.longitude !== null ? (
                        <p className="font-mono text-xs">
                            {customer.latitude}, {customer.longitude}
                        </p>
                    ) : (
                        <span className="text-muted-foreground">
                            Belum diisi
                        </span>
                    ),
            },
            {
                id: 'is_active',
                header: 'Status',
                hideable: false,
                cell: (customer) => (
                    <Badge
                        variant="outline"
                        className={
                            customer.is_active
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-muted text-muted-foreground'
                        }
                    >
                        <span
                            className={`mr-1.5 size-1.5 rounded-full ${customer.is_active ? 'bg-emerald-500' : 'bg-muted-foreground'}`}
                        />
                        {customer.is_active ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                ),
            },
            {
                id: 'actions',
                header: 'Aksi',
                hideable: false,
                cell: (customer) => (
                    <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${customer.name}`}
                        onClick={() => onEdit(customer)}
                    >
                        <Pencil className="mr-1 size-3.5" />
                        Edit
                    </Button>
                ),
            },
        ],
        [onEdit],
    );
    return (
        <DataTable
            data={customers}
            columns={columns}
            getRowId={(customer) => String(customer.id)}
            title={
                <div>
                    <h2 className="font-semibold">
                        Daftar Customer{' '}
                        {meta && (
                            <span className="ml-1 text-sm font-normal text-muted-foreground">
                                ({meta.total})
                            </span>
                        )}
                    </h2>
                    <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                        Diurutkan berdasarkan nama customer.
                    </p>
                </div>
            }
            loading={loading}
            error={error}
            initialHiddenColumns={['coordinates']}
            emptyTitle={
                filtered ? 'Customer tidak ditemukan' : 'Belum ada customer'
            }
            emptyDescription={
                filtered
                    ? 'Coba kata kunci lain atau hapus filter yang sedang digunakan.'
                    : 'Tambahkan customer pertama untuk mulai membuat pickup.'
            }
            emptyAction={
                filtered ? (
                    <Button variant="outline" size="sm" onClick={onReset}>
                        Reset Filter
                    </Button>
                ) : undefined
            }
            pagination={{ meta, page, onPage, itemLabel: 'customer' }}
        />
    );
}

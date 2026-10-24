import { Head, Link, router, useHttp, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { AlertCircle, Plus, RefreshCw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import PageContainer from '@/components/page-container';
import CustomerDataTable, {
    type CustomerPagination,
} from '@/components/customer-data-table';
import CustomerDialog from '@/components/customer-dialog';
import type { CustomerDetails } from '@/components/customer-form';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { index } from '@/routes/api/customers';
import { operations } from '@/routes';
import { index as shipperNames } from '@/routes/jne-shipper-aliases';
import {
    customerListFilters,
    customerListUrl,
    type CustomerListFilters,
} from '@/lib/customer-list-navigation';

export default function Customers() {
    const { auth } = usePage().props;
    const { url } = usePage();
    const filters = customerListFilters(url);
    const { q: query, status, page } = filters;
    const [search, setSearch] = useState(query);
    const [revision, setRevision] = useState(0);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<CustomerDetails | null>(null);
    const [error, setError] = useState('');
    const [data, setData] = useState<{
        data: CustomerDetails[];
        meta: CustomerPagination;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const loader = useHttp({});
    const navigate = (next: CustomerListFilters) => {
        router.push({
            url: customerListUrl(next),
            preserveState: true,
            preserveScroll: true,
        });
    };
    useEffect(() => {
        setSearch(query);
    }, [url, query]);
    useEffect(() => {
        if (search.trim() === query) return;
        const timer = setTimeout(() => {
            router.replace({
                url: customerListUrl({ q: search.trim(), status, page: 1 }),
                preserveState: true,
                preserveScroll: true,
            });
        }, 300);
        return () => clearTimeout(timer);
    }, [search, query, status, url]);
    useEffect(() => {
        let cancelled = false;
        setError('');
        setLoading(true);
        void loader
            .get(
                index.url({
                    query: {
                        q: query,
                        page,
                        ...(status !== 'all'
                            ? { is_active: status === 'active' ? 1 : 0 }
                            : {}),
                    },
                }),
            )
            .then((response) => {
                if (cancelled) return;
                if (response) {
                    const next = response as {
                        data: CustomerDetails[];
                        meta: CustomerPagination;
                    };
                    if (page > next.meta.last_page) {
                        router.replace({
                            url: customerListUrl({
                                q: query,
                                status,
                                page: Math.max(1, next.meta.last_page),
                            }),
                            preserveState: true,
                            preserveScroll: true,
                        });
                        return;
                    }
                    setData(next);
                } else
                    setError(
                        'Periksa pencarian dan filter, lalu coba kembali.',
                    );
            })
            .catch(() => {
                if (!cancelled)
                    setError(
                        'Customer belum dapat dimuat. Periksa koneksi dan sesi login Anda, lalu muat ulang.',
                    );
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
            loader.cancel();
        };
        // Each query/page/status/revision is a fresh server read.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, page, status, revision]);
    const reset = () => {
        setSearch('');
        navigate({ q: '', status: 'all', page: 1 });
    };
    const searching = search.trim() !== query;
    return (
        <PageContainer>
            <Head title="Customer" />
            <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                            Customer
                        </h1>
                        <Badge variant="secondary">Master Data</Badge>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        Kelola identitas, kontak, alamat pickup, dan status
                        customer.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {auth.user.role === 'admin_supervisor' && (
                        <Button variant="outline" asChild>
                            <Link href={shipperNames.url()}>
                                Nama pengirim JNE
                            </Link>
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        disabled={loading}
                        onClick={() => setRevision((value) => value + 1)}
                    >
                        <RefreshCw
                            className={`size-4 ${loading ? 'animate-spin' : ''}`}
                        />
                        <span className="hidden sm:inline">Muat Ulang</span>
                        <span className="sr-only sm:hidden">Muat Ulang</span>
                    </Button>
                    <Button
                        onClick={() => {
                            setEditing(null);
                            setOpen(true);
                        }}
                    >
                        <Plus className="size-4" />
                        Tambah Customer
                    </Button>
                </div>
            </header>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1 sm:max-w-md">
                    <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
                    <Input
                        aria-label="Cari customer"
                        className="pr-10 pl-9"
                        placeholder="Cari nama, kode, email, telepon, atau alamat…"
                        maxLength={100}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    {search && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-0.5 right-0.5 size-8"
                            aria-label="Hapus pencarian"
                            onClick={() => setSearch('')}
                        >
                            <X className="size-3.5" />
                        </Button>
                    )}
                </div>
                <Select
                    value={status}
                    onValueChange={(value) => {
                        navigate({
                            q: search.trim(),
                            status: value as CustomerListFilters['status'],
                            page: 1,
                        });
                    }}
                >
                    <SelectTrigger
                        className="w-full sm:w-44"
                        aria-label="Filter status customer"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Semua Status</SelectItem>
                        <SelectItem value="active">Aktif</SelectItem>
                        <SelectItem value="inactive">Nonaktif</SelectItem>
                    </SelectContent>
                </Select>
                {(search || status !== 'all') && (
                    <Button variant="ghost" size="sm" onClick={reset}>
                        <X className="size-3.5" />
                        Reset Filter
                    </Button>
                )}
            </div>
            {error && (
                <Alert className="border-destructive/40">
                    <AlertCircle className="text-destructive" />
                    <AlertTitle>Customer belum dapat dimuat</AlertTitle>
                    <AlertDescription>
                        {error}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRevision((value) => value + 1)}
                        >
                            Coba Lagi
                        </Button>
                    </AlertDescription>
                </Alert>
            )}
            <CustomerDataTable
                customers={data?.data ?? []}
                meta={data?.meta}
                page={page}
                loading={loading || searching}
                error={error}
                filtered={!!query || status !== 'all'}
                onPage={(next) => navigate({ q: query, status, page: next })}
                onEdit={(customer) => {
                    setEditing(customer);
                    setOpen(true);
                }}
                onReset={reset}
            />
            <CustomerDialog
                open={open}
                customer={editing}
                onOpenChange={setOpen}
                onSaved={() => {
                    setOpen(false);
                    toast.success(
                        editing
                            ? 'Perubahan customer berhasil disimpan.'
                            : 'Customer berhasil ditambahkan.',
                    );
                    setRevision((value) => value + 1);
                }}
            />
        </PageContainer>
    );
}

Customers.layout = {
    breadcrumbs: [
        { title: 'Customer', href: operations({ screen: 'customers' }) },
    ],
};

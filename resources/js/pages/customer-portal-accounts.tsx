import { Head, Link, router, useForm } from '@inertiajs/react';
import { useState, type FormEvent } from 'react';
import { PortalFrame } from '@/components/customer-portal';
import CustomerPicker from '@/components/customer-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Table,
    TableHeader,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
} from '@/components/ui/table';
import * as portal from '@/routes/portal';
import * as accounts from '@/routes/portal/accounts';
import type { PortalCustomer } from '@/types/customer-portal';

type Account = {
    id: number;
    name: string;
    email: string;
    is_active: boolean;
    email_verified_at: string | null;
};
export default function CustomerPortalAccounts({
    customer,
    ready,
    accounts: rows,
}: {
    customer: PortalCustomer | null;
    ready: boolean;
    accounts: Account[];
}) {
    const [showForm, setShowForm] = useState(false);
    const [message, setMessage] = useState('');
    const form = useForm({
        customer_id: customer?.id ?? 0,
        name: '',
        email: '',
        password: '',
        password_confirmation: '',
    });
    function submit(event: FormEvent) {
        event.preventDefault();
        form.post(accounts.store.url(), {
            onSuccess: () => {
                form.reset(
                    'name',
                    'email',
                    'password',
                    'password_confirmation',
                );
                setShowForm(false);
                setMessage(
                    'Akun dibuat. Customer perlu memverifikasi email setelah login.',
                );
            },
            onError: () => {
                requestAnimationFrame(() =>
                    document
                        .querySelector<HTMLElement>('[aria-invalid="true"]')
                        ?.focus(),
                );
            },
        });
    }
    return (
        <PortalFrame customer={customer}>
            <Head title="Akses Customer" />
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold">Akses Customer</h1>
                <div className="w-72">
                    <CustomerPicker
                        selected={customer}
                        onSelect={(row) =>
                            router.get(
                                portal.accounts.url(),
                                row ? { customer_id: row.id } : {},
                            )
                        }
                    />
                </div>
            </div>
            {!ready && (
                <Alert>
                    <AlertDescription>
                        Akses customer belum diaktifkan. Hubungi pengelola
                        sistem.
                    </AlertDescription>
                </Alert>
            )}
            {message && (
                <p role="status" className="text-sm">
                    {message}
                </p>
            )}
            {customer && ready && (
                <>
                    <div className="flex flex-wrap justify-between gap-3">
                        <Button variant="outline" asChild>
                            <Link
                                href={portal.dashboard({
                                    query: { customer_id: customer.id },
                                })}
                            >
                                Lihat portal customer
                            </Link>
                        </Button>
                        <Button onClick={() => setShowForm(!showForm)}>
                            {showForm ? 'Tutup formulir' : 'Tambah akun'}
                        </Button>
                    </div>
                    {showForm && (
                        <form
                            onSubmit={submit}
                            className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2"
                        >
                            {(
                                [
                                    {
                                        key: 'name',
                                        label: 'Nama pengguna',
                                        type: 'text',
                                        autoComplete: 'name',
                                    },
                                    {
                                        key: 'email',
                                        label: 'Email login',
                                        type: 'email',
                                        autoComplete: 'off',
                                    },
                                    {
                                        key: 'password',
                                        label: 'Password awal',
                                        type: 'password',
                                        autoComplete: 'new-password',
                                    },
                                    {
                                        key: 'password_confirmation',
                                        label: 'Ulangi password',
                                        type: 'password',
                                        autoComplete: 'new-password',
                                    },
                                ] as const
                            ).map((field) => (
                                <div
                                    key={field.key}
                                    className="flex flex-col gap-1"
                                >
                                    <Label htmlFor={`account-${field.key}`}>
                                        {field.label}
                                    </Label>
                                    <Input
                                        id={`account-${field.key}`}
                                        name={field.key}
                                        type={field.type}
                                        autoComplete={field.autoComplete}
                                        required
                                        value={form.data[field.key]}
                                        onChange={(e) =>
                                            form.setData(
                                                field.key,
                                                e.target.value,
                                            )
                                        }
                                        aria-invalid={!!form.errors[field.key]}
                                        aria-describedby={
                                            form.errors[field.key]
                                                ? `account-${field.key}-error`
                                                : undefined
                                        }
                                    />
                                    {form.errors[field.key] && (
                                        <p
                                            id={`account-${field.key}-error`}
                                            className="text-sm text-destructive"
                                        >
                                            {form.errors[field.key]}
                                        </p>
                                    )}
                                </div>
                            ))}
                            {form.errors.customer_id && (
                                <p className="text-sm text-destructive">
                                    {form.errors.customer_id}
                                </p>
                            )}
                            <div className="flex gap-2 sm:col-span-2">
                                <Button
                                    type="submit"
                                    disabled={form.processing}
                                >
                                    Simpan akun
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        form.reset();
                                        setShowForm(false);
                                    }}
                                >
                                    Batal
                                </Button>
                            </div>
                        </form>
                    )}
                    <section className="overflow-hidden rounded-lg border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Pengguna</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Aksi</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 && (
                                    <TableRow>
                                        <TableCell
                                            colSpan={4}
                                            className="h-24 text-center text-muted-foreground"
                                        >
                                            Belum ada akun untuk customer ini.
                                        </TableCell>
                                    </TableRow>
                                )}
                                {rows.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell>
                                            {row.name}
                                            <p className="text-sm text-muted-foreground">
                                                {row.email}
                                            </p>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={
                                                    row.is_active
                                                        ? 'success'
                                                        : 'outline'
                                                }
                                            >
                                                {row.is_active
                                                    ? 'Aktif'
                                                    : 'Nonaktif'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {row.email_verified_at
                                                ? 'Terverifikasi'
                                                : 'Belum diverifikasi'}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="outline"
                                                onClick={() =>
                                                    router.patch(
                                                        accounts.update.url(
                                                            row.id,
                                                        ),
                                                        {
                                                            is_active:
                                                                !row.is_active,
                                                        },
                                                        {
                                                            preserveScroll: true,
                                                        },
                                                    )
                                                }
                                            >
                                                {row.is_active
                                                    ? 'Nonaktifkan'
                                                    : 'Aktifkan'}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </section>
                </>
            )}
        </PortalFrame>
    );
}

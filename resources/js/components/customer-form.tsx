import { useHttp } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { AlertCircle, ChevronDown, LoaderCircle, Save } from 'lucide-react';
import { store, update } from '@/routes/api/customers';

export type CustomerDetails = {
    id: number;
    name: string;
    pickup_address: string;
    contact: string;
    customer_code: string | null;
    email: string | null;
    phone: string | null;
    latitude: string | null;
    longitude: string | null;
    is_active: boolean;
    version: number;
};

export default function CustomerForm({
    customer = null,
    onSaved,
    onProcessingChange,
    onCancel,
    inDialog = false,
}: {
    customer?: CustomerDetails | null;
    onSaved: (customer: CustomerDetails) => void;
    onProcessingChange?: (busy: boolean) => void;
    onCancel?: () => void;
    inDialog?: boolean;
}) {
    const form = useHttp({
        name: customer?.name ?? '',
        customer_code: customer?.customer_code ?? '',
        pickup_address: customer?.pickup_address ?? '',
        contact: customer?.contact ?? '',
        email: customer?.email ?? '',
        phone: customer?.phone ?? '',
        latitude: customer?.latitude ?? '',
        longitude: customer?.longitude ?? '',
        is_active: customer?.is_active ?? true,
    });
    const [message, setMessage] = useState('');
    const [contactOpen, setContactOpen] = useState(false);
    useEffect(() => {
        onProcessingChange?.(form.processing);
    }, [form.processing, onProcessingChange]);
    useEffect(() => () => onProcessingChange?.(false), [onProcessingChange]);
    return (
        <form
            className={
                inDialog
                    ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                    : 'space-y-5'
            }
            onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMessage('');
                form.transform((data) => ({
                    ...data,
                    customer_code: data.customer_code || null,
                    email: data.email || null,
                    phone: data.phone || null,
                    contact: data.contact || null,
                    latitude: data.latitude === '' ? null : data.latitude,
                    longitude: data.longitude === '' ? null : data.longitude,
                    ...(customer ? { expected_version: customer.version } : {}),
                }));
                const save = customer
                    ? form.patch(update.url(customer.id))
                    : form.post(store.url());
                void save
                    .then((result) => {
                        if (result)
                            onSaved((result as { data: CustomerDetails }).data);
                    })
                    .catch((error: unknown) => {
                        const response = (
                            error as {
                                response?: {
                                    status?: number;
                                    data?: { message?: string };
                                };
                            }
                        )?.response;
                        setMessage(
                            response?.status === 409
                                ? 'Data customer berubah. Tutup form dan muat ulang daftar sebelum mengedit kembali.'
                                : 'Hasil belum dapat dipastikan. Muat ulang daftar sebelum mencoba menyimpan kembali.',
                        );
                    });
            }}
        >
            <div
                className={
                    inDialog
                        ? 'min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5'
                        : 'space-y-6'
                }
            >
                <section
                    className="space-y-4"
                    aria-label="Identitas dan kontak customer"
                >
                    <div>
                        <h3 className="text-sm font-semibold">
                            Identitas & Kontak
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Isi nama customer dan minimal satu email, telepon,
                            atau kontak utama pickup.
                        </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {(
                            [
                                ['name', 'Nama Customer', 'text', true],
                                [
                                    'customer_code',
                                    'Kode Customer',
                                    'text',
                                    false,
                                ],
                                ['email', 'Email', 'email', false],
                                ['phone', 'Nomor Telepon', 'tel', false],
                            ] as const
                        ).map(([key, label, type, required]) => (
                            <div key={key} className="space-y-2">
                                <Label htmlFor={`customer-${key}`}>
                                    {label}
                                    {required ? ' *' : ''}
                                </Label>
                                <Input
                                    id={`customer-${key}`}
                                    type={type}
                                    required={required}
                                    maxLength={
                                        key === 'customer_code'
                                            ? 64
                                            : key === 'phone'
                                              ? 32
                                              : 255
                                    }
                                    disabled={form.processing}
                                    autoFocus={key === 'name'}
                                    autoComplete={
                                        key === 'name'
                                            ? 'organization'
                                            : key === 'email'
                                              ? 'email'
                                              : key === 'phone'
                                                ? 'tel'
                                                : 'off'
                                    }
                                    placeholder={
                                        key === 'name'
                                            ? 'Contoh: PT Maju Bersama'
                                            : key === 'customer_code'
                                              ? 'Otomatis jika dikosongkan'
                                              : key === 'email'
                                                ? 'nama@perusahaan.com'
                                                : '08xxxxxxxxxx'
                                    }
                                    aria-invalid={!!form.errors[key]}
                                    value={form.data[key]}
                                    onChange={(event) =>
                                        form.setData(key, event.target.value)
                                    }
                                />
                                {key === 'customer_code' && (
                                    <p className="text-xs text-muted-foreground">
                                        Kode unik. Pada customer baru, kosongkan
                                        untuk kode otomatis.
                                    </p>
                                )}
                                {form.errors[key] && (
                                    <p
                                        role="alert"
                                        className="text-sm text-destructive"
                                    >
                                        {form.errors[key]}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
                <Separator />
                <section
                    className="space-y-4"
                    aria-label="Alamat dan lokasi customer"
                >
                    <div>
                        <h3 className="text-sm font-semibold">
                            Alamat & Lokasi
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Alamat digunakan sebagai acuan saat membuat pickup
                            baru.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="customer-pickup_address">
                            Alamat Pickup *
                        </Label>
                        <Textarea
                            id="customer-pickup_address"
                            className="min-h-24 resize-y"
                            placeholder="Jalan, nomor bangunan, kelurahan, kecamatan, dan kota"
                            autoComplete="street-address"
                            aria-invalid={!!form.errors.pickup_address}
                            required
                            maxLength={2000}
                            disabled={form.processing}
                            value={form.data.pickup_address}
                            onChange={(event) =>
                                form.setData(
                                    'pickup_address',
                                    event.target.value,
                                )
                            }
                        />
                        {form.errors.pickup_address && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {form.errors.pickup_address}
                            </p>
                        )}
                    </div>
                    <fieldset
                        className="space-y-3 rounded-lg border bg-muted/20 p-4"
                        disabled={form.processing}
                    >
                        <legend className="px-1 text-sm font-medium">
                            Lokasi Customer (opsional)
                        </legend>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {(
                                [
                                    ['latitude', 'Latitude', -90, 90],
                                    ['longitude', 'Longitude', -180, 180],
                                ] as const
                            ).map(([key, label, min, max]) => (
                                <div key={key} className="space-y-2">
                                    <Label htmlFor={`customer-${key}`}>
                                        {label}
                                    </Label>
                                    <Input
                                        id={`customer-${key}`}
                                        type="number"
                                        min={min}
                                        max={max}
                                        step="any"
                                        inputMode="decimal"
                                        placeholder={
                                            key === 'latitude'
                                                ? '-6.2000000'
                                                : '106.8166667'
                                        }
                                        aria-invalid={!!form.errors[key]}
                                        value={form.data[key]}
                                        onChange={(event) =>
                                            form.setData(
                                                key,
                                                event.target.value,
                                            )
                                        }
                                    />
                                    {form.errors[key] && (
                                        <p
                                            role="alert"
                                            className="text-sm text-destructive"
                                        >
                                            {form.errors[key]}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Isi kedua koordinat, atau kosongkan keduanya.
                            Latitude −90 sampai 90; longitude −180 sampai 180.
                        </p>
                    </fieldset>
                </section>
                <Collapsible
                    className="rounded-lg border"
                    open={contactOpen || !!form.errors.contact}
                    onOpenChange={setContactOpen}
                >
                    <CollapsibleTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-auto w-full justify-between rounded-lg p-4 text-left"
                        >
                            <span>
                                Kontak Utama Pickup{' '}
                                <span className="ml-1 font-normal text-muted-foreground">
                                    (opsional)
                                </span>
                            </span>
                            <ChevronDown
                                className={`size-4 transition-transform ${contactOpen || form.errors.contact ? 'rotate-180' : ''}`}
                            />
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 px-4 pb-4">
                        <p className="text-xs text-muted-foreground">
                            Kontak pickup lama tetap dipertahankan. Kosongkan
                            untuk memakai email, atau telepon jika email tidak
                            tersedia.
                        </p>
                        <Label htmlFor="customer-contact">
                            Kontak utama (opsional)
                        </Label>
                        <Input
                            id="customer-contact"
                            maxLength={255}
                            disabled={form.processing}
                            aria-invalid={!!form.errors.contact}
                            value={form.data.contact}
                            onChange={(event) =>
                                form.setData('contact', event.target.value)
                            }
                        />
                        {form.errors.contact && (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {form.errors.contact}
                            </p>
                        )}
                    </CollapsibleContent>
                </Collapsible>
                <Separator />
                <div className="space-y-2">
                    <Label htmlFor="customer-is_active">Status Customer</Label>
                    <Select
                        disabled={form.processing}
                        value={form.data.is_active ? 'active' : 'inactive'}
                        onValueChange={(value) =>
                            form.setData('is_active', value === 'active')
                        }
                    >
                        <SelectTrigger
                            id="customer-is_active"
                            className="w-full sm:w-56"
                            aria-invalid={!!form.errors.is_active}
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="active">Aktif</SelectItem>
                            <SelectItem value="inactive">Nonaktif</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        Customer nonaktif tidak dapat dipilih untuk pickup baru.
                        Task dan riwayat sebelumnya tetap tersimpan.
                    </p>
                    {form.errors.is_active && (
                        <p role="alert" className="text-sm text-destructive">
                            {form.errors.is_active}
                        </p>
                    )}
                </div>
                {message && (
                    <Alert className="border-destructive/40 text-destructive">
                        <AlertCircle />
                        <AlertDescription className="text-destructive">
                            {message}
                        </AlertDescription>
                    </Alert>
                )}
            </div>
            <DialogFooter
                className={
                    inDialog
                        ? 'shrink-0 border-t bg-muted/20 px-6 py-4'
                        : 'border-t pt-4'
                }
            >
                {onCancel && (
                    <Button
                        type="button"
                        variant="outline"
                        disabled={form.processing}
                        onClick={onCancel}
                    >
                        Batal
                    </Button>
                )}
                <Button disabled={form.processing}>
                    {form.processing ? (
                        <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                        <Save className="size-4" />
                    )}
                    {form.processing
                        ? 'Menyimpan…'
                        : customer
                          ? 'Simpan Perubahan'
                          : 'Simpan Customer'}
                </Button>
            </DialogFooter>
        </form>
    );
}

import { useHttp, usePage } from '@inertiajs/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeCheckbox } from '@/components/ui/native-checkbox';
import { NativeSelect } from '@/components/ui/native-select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import * as routes from '@/routes/document-delivery';

export type DocumentDeliveryOptions = {
    receipt_email: boolean;
    recap_email: boolean;
    receipt_whatsapp: boolean;
    recap_whatsapp: boolean;
    whatsapp_type: 'contact' | 'group';
    whatsapp_target: string;
    whatsapp_label: string;
    whatsapp_consent_confirmed: boolean;
};
export const defaultDocumentDelivery: DocumentDeliveryOptions = {
    receipt_email: true,
    recap_email: true,
    receipt_whatsapp: false,
    recap_whatsapp: false,
    whatsapp_type: 'contact',
    whatsapp_target: '',
    whatsapp_label: '',
    whatsapp_consent_confirmed: false,
};

export function CustomerDocumentDelivery({
    value,
    onChange,
    disabled,
    errors,
}: {
    value: DocumentDeliveryOptions;
    onChange: (value: DocumentDeliveryOptions) => void;
    disabled: boolean;
    errors: Record<string, string | undefined>;
}) {
    const http = useHttp({});
    const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
    const [page, setPage] = useState(0);
    const [more, setMore] = useState(false);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const targetError =
        value.whatsapp_type === 'contact' &&
        value.whatsapp_target.trim().endsWith('@g.us')
            ? 'Ini ID grup. Ubah tujuan menjadi Grup lalu tempel ID grupnya.'
            : errors['document_delivery_settings.whatsapp_target'];
    async function loadGroups(next: number) {
        setError('');
        try {
            const response = (await http.get(
                routes.groups.url({ query: { page: next } }),
            )) as { data: typeof groups; has_more: boolean };
            setGroups((current) =>
                next === 1
                    ? response.data
                    : [
                          ...current,
                          ...response.data.filter(
                              (row) =>
                                  !current.some((old) => old.id === row.id),
                          ),
                      ],
            );
            setMore(response.has_more);
            setPage(next);
        } catch {
            setError(
                'Grup belum dapat dimuat. Pastikan session pengiriman sudah dipilih dan terhubung.',
            );
        }
    }
    const wa = value.receipt_whatsapp || value.recap_whatsapp;
    return (
        <section
            aria-labelledby="customer-document-heading"
            className="flex flex-col gap-3 border-t pt-4"
        >
            <h3
                id="customer-document-heading"
                className="text-sm font-semibold"
            >
                Pengiriman dokumen
            </h3>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Dokumen</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>WhatsApp</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {(['receipt', 'recap'] as const).map((kind) => (
                        <TableRow key={kind}>
                            <TableCell>
                                {kind === 'receipt'
                                    ? 'Bukti pickup'
                                    : 'Rekap resi'}
                            </TableCell>
                            {(['email', 'whatsapp'] as const).map((channel) => {
                                const key = `${kind}_${channel}` as const;
                                return (
                                    <TableCell key={channel}>
                                        <label className="flex min-h-11 cursor-pointer items-center gap-2">
                                            <NativeCheckbox
                                                disabled={disabled}
                                                checked={value[key]}
                                                onChange={(e) =>
                                                    onChange({
                                                        ...value,
                                                        [key]: e.target.checked,
                                                    })
                                                }
                                                aria-label={`${kind === 'receipt' ? 'Bukti pickup' : 'Rekap resi'} melalui ${channel === 'email' ? 'email' : 'WhatsApp'}`}
                                            />
                                            <span className="sr-only">
                                                Aktifkan
                                            </span>
                                        </label>
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {wa && (
                <>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="customer-wa-type">
                            Tujuan WhatsApp
                        </Label>
                        <NativeSelect
                            id="customer-wa-type"
                            value={value.whatsapp_type}
                            disabled={disabled}
                            onChange={(e) =>
                                onChange({
                                    ...value,
                                    whatsapp_type: e.target.value as
                                        | 'contact'
                                        | 'group',
                                    whatsapp_target: '',
                                    whatsapp_label: '',
                                    whatsapp_consent_confirmed: false,
                                })
                            }
                        >
                            <option value="contact">Kontak</option>
                            <option value="group">Grup</option>
                        </NativeSelect>
                    </div>
                    {value.whatsapp_type === 'contact' ? (
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="customer-wa-target">
                                Nomor WhatsApp
                            </Label>
                            <Input
                                id="customer-wa-target"
                                name="whatsapp_target"
                                type="tel"
                                autoComplete="tel"
                                disabled={disabled}
                                value={value.whatsapp_target.replace(
                                    /@c\.us$/,
                                    '',
                                )}
                                placeholder="08xxxxxxxxxx atau 628xxxxxxxxxx"
                                aria-invalid={!!targetError}
                                aria-describedby={
                                    targetError
                                        ? 'customer-wa-target-error'
                                        : undefined
                                }
                                onChange={(e) =>
                                    onChange({
                                        ...value,
                                        whatsapp_target: e.target.value,
                                        whatsapp_label: '',
                                        whatsapp_consent_confirmed: false,
                                    })
                                }
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="customer-wa-group">
                                ID grup WhatsApp
                            </Label>
                            <Input
                                id="customer-wa-group"
                                name="whatsapp_target"
                                type="text"
                                autoComplete="off"
                                spellCheck={false}
                                disabled={disabled}
                                value={value.whatsapp_target}
                                placeholder="120363046678445460@g.us"
                                aria-invalid={!!targetError}
                                aria-describedby={
                                    targetError
                                        ? 'customer-wa-target-error'
                                        : undefined
                                }
                                onChange={(e) =>
                                    onChange({
                                        ...value,
                                        whatsapp_target: e.target.value,
                                        whatsapp_label: '',
                                        whatsapp_consent_confirmed: false,
                                    })
                                }
                            />
                            {value.whatsapp_target && (
                                <p className="text-sm">
                                    Grup terpilih:{' '}
                                    <strong>
                                        {value.whatsapp_label ||
                                            value.whatsapp_target}
                                    </strong>
                                </p>
                            )}
                            <Button
                                type="button"
                                variant="outline"
                                disabled={disabled || http.processing}
                                aria-invalid={
                                    !!errors[
                                        'document_delivery_settings.whatsapp_target'
                                    ]
                                }
                                aria-describedby={
                                    errors[
                                        'document_delivery_settings.whatsapp_target'
                                    ]
                                        ? 'customer-wa-target-error'
                                        : undefined
                                }
                                onClick={() => loadGroups(1)}
                            >
                                {http.processing
                                    ? 'Memuat…'
                                    : 'Pilih dari daftar grup (opsional)'}
                            </Button>
                            {groups.length > 0 && (
                                <>
                                    <Label htmlFor="customer-wa-search">
                                        Cari grup yang dimuat
                                    </Label>
                                    <Input
                                        id="customer-wa-search"
                                        value={search}
                                        onChange={(e) =>
                                            setSearch(e.target.value)
                                        }
                                        placeholder="Nama grup…"
                                    />
                                    <div className="max-h-60 overflow-y-auto rounded-md border">
                                        {groups
                                            .filter((group) =>
                                                group.name
                                                    .toLocaleLowerCase('id')
                                                    .includes(
                                                        search.toLocaleLowerCase(
                                                            'id',
                                                        ),
                                                    ),
                                            )
                                            .map((group) => (
                                                <Button
                                                    key={group.id}
                                                    type="button"
                                                    variant={
                                                        value.whatsapp_target ===
                                                        group.id
                                                            ? 'secondary'
                                                            : 'ghost'
                                                    }
                                                    className="min-h-11 w-full justify-start overflow-hidden"
                                                    disabled={disabled}
                                                    onClick={() =>
                                                        onChange({
                                                            ...value,
                                                            whatsapp_target:
                                                                group.id,
                                                            whatsapp_label:
                                                                group.name,
                                                            whatsapp_consent_confirmed:
                                                                value.whatsapp_target ===
                                                                    group.id &&
                                                                value.whatsapp_consent_confirmed,
                                                        })
                                                    }
                                                >
                                                    <span className="truncate">
                                                        {group.name}
                                                    </span>
                                                </Button>
                                            ))}
                                    </div>
                                </>
                            )}
                            {page > 0 && groups.length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                    Belum ada grup pada session ini.
                                </p>
                            )}
                            {more && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={http.processing || disabled}
                                    onClick={() => loadGroups(page + 1)}
                                >
                                    Muat grup berikutnya
                                </Button>
                            )}
                        </div>
                    )}
                    {targetError && (
                        <p
                            id="customer-wa-target-error"
                            role="alert"
                            className="text-sm text-destructive dark:text-red-400"
                        >
                            {targetError}
                        </p>
                    )}
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
                        <NativeCheckbox
                            id="customer-wa-consent"
                            disabled={disabled}
                            checked={value.whatsapp_consent_confirmed}
                            aria-invalid={
                                !!errors[
                                    'document_delivery_settings.whatsapp_consent_confirmed'
                                ]
                            }
                            aria-describedby={
                                errors[
                                    'document_delivery_settings.whatsapp_consent_confirmed'
                                ]
                                    ? 'customer-wa-consent-error'
                                    : undefined
                            }
                            onChange={(e) =>
                                onChange({
                                    ...value,
                                    whatsapp_consent_confirmed:
                                        e.target.checked,
                                })
                            }
                        />
                        Customer atau pengelola grup telah menyetujui menerima
                        bukti pickup dan/atau rekap resi di tujuan ini.
                    </label>
                    {errors[
                        'document_delivery_settings.whatsapp_consent_confirmed'
                    ] && (
                        <p
                            id="customer-wa-consent-error"
                            role="alert"
                            className="text-sm text-destructive-foreground"
                        >
                            {
                                errors[
                                    'document_delivery_settings.whatsapp_consent_confirmed'
                                ]
                            }
                        </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Dikirim memakai session yang dipilih pada Pengaturan →
                        Pengiriman dokumen.
                    </p>
                </>
            )}
            {(error ||
                Object.entries(errors).some(
                    ([key]) =>
                        key.startsWith('document_delivery_settings') &&
                        key !== 'document_delivery_settings.whatsapp_target' &&
                        key !==
                            'document_delivery_settings.whatsapp_consent_confirmed',
                )) && (
                <Alert variant="destructive">
                    <AlertDescription>
                        {error ||
                            Object.entries(errors)
                                .filter(
                                    ([key]) =>
                                        key !==
                                            'document_delivery_settings.whatsapp_target' &&
                                        key !==
                                            'document_delivery_settings.whatsapp_consent_confirmed' &&
                                        key.startsWith(
                                            'document_delivery_settings',
                                        ),
                                )
                                .map(([, message]) => message)
                                .join(' ')}
                    </AlertDescription>
                </Alert>
            )}
        </section>
    );
}

type Delivery = {
    id: number;
    pickup_task_id: number;
    pickup_receipt_id: number | null;
    session: string;
    target: string;
    target_label: string | null;
    status: string;
    last_error: string | null;
    parts: { type: string; filename?: string; status: string }[];
};
type History = {
    can_send: boolean;
    deliveries: { data: Delivery[]; current_page: number; last_page: number };
    receipt: { status: string } | null;
    email_recap: { recipient: string; status: string }[] | null;
};
const labels: Record<string, string> = {
    READY: 'Dalam antrean',
    WAITING: 'Menunggu jadwal / giliran',
    SENDING: 'Sedang dikirim',
    ACCEPTED: 'Diterima WAHA',
    FAILED: 'Gagal',
    UNKNOWN: 'Perlu diperiksa',
    CANCELLED: 'Dibatalkan',
    PENDING: 'Belum dikirim',
    SKIPPED: 'Tidak dipilih',
    ACCEPTED_BY_PROVIDER: 'Diterima server email',
    PENDING_CONFIGURATION: 'Menunggu konfigurasi email',
    DELIVERED: 'Terkirim',
};

function emailStatus(status: string): string {
    return status === 'ACCEPTED'
        ? 'Diterima server email'
        : (labels[status] ?? status);
}

export function DocumentDeliveryPanel({ taskId }: { taskId: number }) {
    const ready = Boolean(usePage().props.document_delivery_ready);
    const http = useHttp({});
    const [data, setData] = useState<History | null>(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    async function load(page = 1) {
        setError('');
        try {
            setData(
                (await http.get(
                    routes.history.url(taskId, { query: { page } }),
                )) as History,
            );
        } catch {
            setError(
                'Status pengiriman belum dapat dimuat. Coba segarkan kembali.',
            );
        }
    }
    async function send(document: 'receipt' | 'recap') {
        setError('');
        setMessage('');
        try {
            http.transform(() => ({ document }));
            const result = (await http.post(routes.send.url(taskId))) as {
                message: string;
            };
            setMessage(result.message);
            await load();
        } catch {
            setError(
                'Pengiriman belum dapat diproses. Periksa POP/rekap dan pengaturan customer.',
            );
        } finally {
            http.transform((data) => data);
        }
    }
    async function retry(row: Delivery) {
        setError('');
        try {
            await http.post(
                routes.retry.url({
                    task: row.pickup_task_id,
                    delivery: row.id,
                }),
            );
            await load(data?.deliveries.current_page);
        } catch {
            setError(
                'Pengiriman ini belum aman diulang. Segarkan dan periksa hasilnya.',
            );
        }
    }
    if (!ready) return null;
    return (
        <section className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Pengiriman dokumen</h3>
                <Button
                    type="button"
                    variant="outline"
                    disabled={http.processing}
                    onClick={() => load()}
                >
                    {http.processing
                        ? 'Memuat…'
                        : data
                          ? 'Segarkan status'
                          : 'Lihat status & pengiriman'}
                </Button>
            </div>
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}
            {message && (
                <p role="status" className="text-sm">
                    {message}
                </p>
            )}
            {data && (
                <>
                    {data.can_send && (
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                disabled={http.processing}
                                onClick={() => send('receipt')}
                            >
                                Kirim bukti pickup
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={http.processing}
                                onClick={() => send('recap')}
                            >
                                Kirim rekap resi
                            </Button>
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Mengikuti pilihan channel dan tujuan pada customer.
                        Pesan yang sudah diterima provider tidak dikirim ulang.
                    </p>
                    {data.receipt && (
                        <p className="text-sm">
                            Email bukti pickup:{' '}
                            {emailStatus(data.receipt.status)}
                        </p>
                    )}
                    {data.email_recap?.map((row, i) => (
                        <p className="text-sm break-all" key={i}>
                            Email rekap · {row.recipient}:{' '}
                            {emailStatus(row.status)}
                        </p>
                    ))}
                    <div className="overflow-hidden rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>WhatsApp / Tujuan</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>
                                        <span className="sr-only">Aksi</span>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.deliveries.data.length === 0 && (
                                    <TableRow>
                                        <TableCell
                                            colSpan={3}
                                            className="text-muted-foreground"
                                        >
                                            Belum ada pengiriman WhatsApp untuk
                                            buku ini.
                                        </TableCell>
                                    </TableRow>
                                )}
                                {data.deliveries.data.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="max-w-64 whitespace-normal">
                                            <p className="font-medium">
                                                {row.pickup_receipt_id
                                                    ? 'Bukti pickup'
                                                    : 'Rekap resi'}
                                            </p>
                                            <p className="text-sm break-all">
                                                {row.target_label || row.target}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                Session: {row.session}
                                            </p>
                                        </TableCell>
                                        <TableCell className="max-w-64 whitespace-normal">
                                            <Badge
                                                variant={
                                                    row.status === 'ACCEPTED'
                                                        ? 'success'
                                                        : [
                                                                'FAILED',
                                                                'UNKNOWN',
                                                            ].includes(
                                                                row.status,
                                                            )
                                                          ? 'warning'
                                                          : 'outline'
                                                }
                                            >
                                                {labels[row.status] ??
                                                    row.status}
                                            </Badge>
                                            {row.last_error && (
                                                <p className="mt-1 text-xs">
                                                    {row.last_error}
                                                </p>
                                            )}
                                            <details className="mt-2 text-xs">
                                                <summary className="cursor-pointer">
                                                    Rincian pesan / lampiran
                                                </summary>
                                                {row.parts.map((part, i) => (
                                                    <p
                                                        key={i}
                                                        className="mt-1 break-words"
                                                    >
                                                        {part.filename ||
                                                            'Ringkasan'}{' '}
                                                        ·{' '}
                                                        {labels[part.status] ??
                                                            part.status}
                                                    </p>
                                                ))}
                                            </details>
                                        </TableCell>
                                        <TableCell>
                                            {data.can_send &&
                                                row.status === 'FAILED' && (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        disabled={
                                                            http.processing
                                                        }
                                                        onClick={() =>
                                                            retry(row)
                                                        }
                                                    >
                                                        Coba ulang
                                                    </Button>
                                                )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    {data.deliveries.last_page > 1 && (
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                disabled={
                                    http.processing ||
                                    data.deliveries.current_page <= 1
                                }
                                onClick={() =>
                                    load(data.deliveries.current_page - 1)
                                }
                            >
                                Sebelumnya
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={
                                    http.processing ||
                                    data.deliveries.current_page >=
                                        data.deliveries.last_page
                                }
                                onClick={() =>
                                    load(data.deliveries.current_page + 1)
                                }
                            >
                                Berikutnya
                            </Button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

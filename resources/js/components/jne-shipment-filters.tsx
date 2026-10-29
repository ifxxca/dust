import { RotateCcw, Save, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePage } from '@inertiajs/react';
import { toast } from 'sonner';
import InputError from '@/components/input-error';
import CustomerPicker from '@/components/customer-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import {
    matchLabels,
    categoryLabels,
    normalizeJneFilters,
    emptyJneFilters,
    trackingLabels,
} from '@/lib/jne-monitoring';
import type { JneCustomer, JneFilters } from '@/types/jne';

const customerMatchLabels: Record<string, string> = {
    MATCHED: 'Customer dikenali',
    UNMATCHED: 'Belum dipetakan',
    AMBIGUOUS: 'Perlu pemeriksaan',
    CANDIDATE: 'Kandidat customer',
    CONFLICT: 'Bukti bertentangan',
};

function FilterSelect({
    id,
    label,
    value,
    all,
    options,
    disabled,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    all: string;
    options: [string, string][];
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor={id}>{label}</Label>
            <Select
                value={value || 'all'}
                onValueChange={(value) =>
                    onChange(value === 'all' ? '' : value)
                }
                disabled={disabled}
            >
                <SelectTrigger id={id} className="min-h-11 w-full">
                    <SelectValue>
                        {value
                            ? options.find(([key]) => key === value)?.[1] ||
                              value
                            : all}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        <SelectItem value="all">{all}</SelectItem>
                        {options.map(([key, text]) => (
                            <SelectItem key={key} value={key}>
                                {text}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
        </div>
    );
}

export default function ShipmentFilters({
    applied,
    accounts,
    customers,
    loading,
    errors,
    onApply,
    onReset,
    onRemove,
    onRestore,
    onEditingChange,
}: {
    applied: JneFilters;
    accounts: string[];
    customers: JneCustomer[];
    loading: boolean;
    errors: Partial<Record<keyof JneFilters, string>>;
    onApply: (filters: JneFilters) => void;
    onReset: () => void;
    onRemove: (key: keyof JneFilters) => void;
    onRestore?: (filters: JneFilters) => void;
    onEditingChange?: (editing: boolean) => void;
}) {
    const appliedKey = JSON.stringify(applied);
    const [draft, setDraft] = useState(applied);
    useEffect(() => {
        setDraft(JSON.parse(appliedKey));
    }, [appliedKey]);
    const onChange = (key: keyof JneFilters, value: string) =>
        setDraft((current) => ({ ...current, [key]: value }));
    const apply = () => {
        const next = { ...draft, q: draft.q.trim() };
        setDraft(next);
        onApply(next);
    };
    const pendingChanges = JSON.stringify(draft) !== appliedKey;
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [saved, setSaved] = useState<JneFilters | null>(null);
    const page = usePage();
    const storageKey = `jne-shipment-filters:${page.props?.auth?.user?.id ?? 'current'}`;
    useEffect(() => {
        try {
            const value = localStorage.getItem(storageKey);
            setSaved(value ? normalizeJneFilters(JSON.parse(value)) : null);
        } catch {
            setSaved(null);
        }
    }, [storageKey]);
    const advancedCount = [
        applied.account,
        applied.match,
        applied.customer_match,
    ].filter(Boolean).length;
    const active = (Object.keys(applied) as (keyof JneFilters)[]).filter(
        (key) => !['status', 'per_page'].includes(key) && applied[key],
    );
    const selectedCustomer = customers.find(
        (customer) => String(customer.id) === draft.customer_id,
    );
    const labels: Record<keyof JneFilters, string> = {
        q: `Pencarian: ${applied.q}`,
        status: trackingLabels[applied.status] || applied.status,
        customer_id: `Customer: ${customers.find((customer) => String(customer.id) === applied.customer_id)?.name || applied.customer_id}`,
        account: `Sumber: ${applied.account}`,
        match: `Pickup: ${matchLabels[applied.match] || applied.match}`,
        category: `Kategori: ${categoryLabels[applied.category] || applied.category}`,
        customer_match: `Pemetaan: ${customerMatchLabels[applied.customer_match] || applied.customer_match}`,
        date_from: `AWB mulai: ${applied.date_from}`,
        date_thru: `AWB sampai: ${applied.date_thru}`,
        per_page: '',
    };
    return (
        <form
            className="flex min-w-0 flex-col gap-3"
            onFocusCapture={() => onEditingChange?.(true)}
            onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    onEditingChange?.(false);
                }
            }}
            onSubmit={(event) => {
                event.preventDefault();
                if (!loading) apply();
            }}
        >
            <div className="flex flex-col gap-1">
                <Label htmlFor="jne-awb-search" className="sr-only">
                    Cari AWB, customer, pengirim, atau penerima
                </Label>
                <div className="relative">
                    <Search
                        className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <Input
                        id="jne-awb-search"
                        name="q"
                        autoComplete="off"
                        spellCheck={false}
                        className="min-h-11 pl-9"
                        placeholder="Cari AWB, customer, pengirim, penerima lalu tekan Enter…"
                        maxLength={100}
                        value={draft.q}
                        disabled={loading}
                        onChange={(event) => onChange('q', event.target.value)}
                        aria-invalid={!!errors.q}
                        aria-describedby={
                            errors.q ? 'jne-awb-error' : undefined
                        }
                    />
                </div>
                <InputError id="jne-awb-error" message={errors.q} />
            </div>
            <fieldset className="flex min-w-0 flex-col gap-2">
                <legend id="jne-category-label" className="text-sm font-medium">
                    Kategori resi
                </legend>
                <ToggleGroup
                    type="single"
                    variant="outline"
                    value={draft.category || 'all'}
                    onValueChange={(value) => {
                        if (value)
                            onChange('category', value === 'all' ? '' : value);
                    }}
                    aria-labelledby="jne-category-label"
                    disabled={loading}
                    className="w-fit max-w-full flex-wrap justify-start"
                >
                    <ToggleGroupItem value="all" className="min-h-11">
                        Semua
                    </ToggleGroupItem>
                    {Object.entries(categoryLabels).map(([value, label]) => (
                        <ToggleGroupItem
                            key={value}
                            value={value}
                            className="min-h-11"
                        >
                            {label}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
                <InputError message={errors.category} />
            </fieldset>
            <div className="grid grid-cols-2 items-start gap-3 xl:grid-cols-[minmax(9rem,1fr)_minmax(9rem,1fr)_minmax(16rem,1.6fr)_auto]">
                <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="jne-customer-filter">Customer</Label>
                    <CustomerPicker
                        triggerId="jne-customer-filter"
                        className="h-11 min-w-0"
                        placeholder="Semua customer"
                        allowClear
                        disabled={loading}
                        selected={
                            selectedCustomer
                                ? {
                                      ...selectedCustomer,
                                      name: `${selectedCustomer.customer_code || '—'} · ${selectedCustomer.name}`,
                                  }
                                : null
                        }
                        onSelect={(customer) =>
                            onChange(
                                'customer_id',
                                customer ? String(customer.id) : '',
                            )
                        }
                    />
                    <InputError message={errors.customer_id} />
                </div>
                <div>
                    <FilterSelect
                        id="jne-status-filter"
                        label="Status pengiriman"
                        all="Semua status"
                        value={draft.status}
                        options={Object.entries(trackingLabels)}
                        disabled={loading}
                        onChange={(value) => onChange('status', value)}
                    />
                    <InputError message={errors.status} />
                </div>
                <fieldset className="col-span-2 min-w-0 xl:col-span-1">
                    <legend className="mb-2 text-sm font-medium">
                        Tanggal AWB (WIB)
                    </legend>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                        <div className="min-w-0">
                            <Label htmlFor="jne-date-from" className="sr-only">
                                Tanggal AWB mulai
                            </Label>
                            <Input
                                id="jne-date-from"
                                name="date_from"
                                type="date"
                                className="min-h-11 min-w-0 px-2 text-sm"
                                value={draft.date_from}
                                disabled={loading}
                                aria-invalid={!!errors.date_from}
                                aria-describedby={
                                    errors.date_from
                                        ? 'jne-date-from-error'
                                        : undefined
                                }
                                onChange={(event) =>
                                    onChange('date_from', event.target.value)
                                }
                            />
                        </div>
                        <span className="text-xs text-muted-foreground">
                            s/d
                        </span>
                        <div className="min-w-0">
                            <Label htmlFor="jne-date-thru" className="sr-only">
                                Tanggal AWB sampai
                            </Label>
                            <Input
                                id="jne-date-thru"
                                name="date_thru"
                                type="date"
                                className="min-h-11 min-w-0 px-2 text-sm"
                                min={draft.date_from || undefined}
                                value={draft.date_thru}
                                disabled={loading}
                                aria-invalid={!!errors.date_thru}
                                aria-describedby={
                                    errors.date_thru
                                        ? 'jne-date-thru-error'
                                        : undefined
                                }
                                onChange={(event) =>
                                    onChange('date_thru', event.target.value)
                                }
                            />
                        </div>
                    </div>
                    <InputError
                        id="jne-date-from-error"
                        message={errors.date_from}
                    />
                    <InputError
                        id="jne-date-thru-error"
                        message={errors.date_thru}
                    />
                </fieldset>
                <div className="col-span-2 xl:col-span-1 xl:pt-7">
                    <Sheet open={advancedOpen} onOpenChange={setAdvancedOpen}>
                        <SheetTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                className="min-h-11 w-full"
                                disabled={loading}
                            >
                                <SlidersHorizontal data-icon="inline-start" />
                                Filter lanjutan
                                {advancedCount > 0 && (
                                    <Badge variant="secondary">
                                        {advancedCount}
                                    </Badge>
                                )}
                            </Button>
                        </SheetTrigger>
                        <SheetContent className="w-full sm:max-w-md">
                            <SheetHeader className="border-b">
                                <SheetTitle>Filter lanjutan</SheetTitle>
                                <SheetDescription>
                                    Persempit sumber report, pemetaan customer,
                                    atau hubungan pickup.
                                </SheetDescription>
                            </SheetHeader>
                            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
                                <FilterSelect
                                    id="jne-source-filter"
                                    label="Sumber report"
                                    all="Semua sumber"
                                    value={draft.account}
                                    options={accounts.map((account) => [
                                        account,
                                        account,
                                    ])}
                                    disabled={loading}
                                    onChange={(value) =>
                                        onChange('account', value)
                                    }
                                />
                                <FilterSelect
                                    id="jne-pickup-filter"
                                    label="Hubungan pickup"
                                    all="Semua hubungan"
                                    value={draft.match}
                                    options={Object.entries(matchLabels)}
                                    disabled={loading}
                                    onChange={(value) =>
                                        onChange('match', value)
                                    }
                                />
                                <FilterSelect
                                    id="jne-mapping-filter"
                                    label="Pemetaan customer"
                                    all="Semua pemetaan"
                                    value={draft.customer_match}
                                    options={Object.entries(
                                        customerMatchLabels,
                                    )}
                                    disabled={loading}
                                    onChange={(value) =>
                                        onChange('customer_match', value)
                                    }
                                />
                            </div>
                            <SheetFooter className="border-t">
                                <Button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => {
                                        setAdvancedOpen(false);
                                        apply();
                                    }}
                                >
                                    Terapkan filter lanjutan
                                </Button>
                            </SheetFooter>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                        Filter aktif:
                    </span>
                    {!active.length && !applied.status && (
                        <Badge variant="secondary">Semua data</Badge>
                    )}
                    {[
                        ...(applied.status ? ['status' as const] : []),
                        ...active,
                    ].map((key) => (
                        <Button
                            key={key}
                            variant="secondary"
                            type="button"
                            size="sm"
                            className="h-auto min-h-9 max-w-full text-xs"
                            disabled={loading}
                            onClick={() => onRemove(key)}
                            aria-label={`Hapus filter ${labels[key]}`}
                        >
                            <span className="truncate">{labels[key]}</span>
                            <X data-icon="inline-end" />
                        </Button>
                    ))}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={loading}
                        onClick={() => {
                            setDraft(emptyJneFilters);
                            onReset();
                        }}
                    >
                        <RotateCcw data-icon="inline-start" />
                        Reset filter
                    </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {pendingChanges && (
                        <span
                            role="status"
                            className="self-center text-xs text-muted-foreground"
                        >
                            Perubahan belum diterapkan
                        </span>
                    )}
                    {saved && onRestore && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={loading}
                            onClick={() => {
                                setDraft(saved);
                                onRestore(saved);
                            }}
                        >
                            Gunakan filter tersimpan
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        disabled={loading}
                        onClick={() => {
                            try {
                                localStorage.setItem(
                                    storageKey,
                                    JSON.stringify(draft),
                                );
                                setSaved(draft);
                                toast.success(
                                    'Filter disimpan di browser ini.',
                                );
                            } catch {
                                toast.error(
                                    'Filter tidak dapat disimpan di browser ini.',
                                );
                            }
                        }}
                    >
                        <Save data-icon="inline-start" />
                        Simpan filter
                    </Button>
                    <Button type="submit" disabled={loading}>
                        {loading ? 'Memuat…' : 'Terapkan filter'}
                    </Button>
                </div>
            </div>
        </form>
    );
}

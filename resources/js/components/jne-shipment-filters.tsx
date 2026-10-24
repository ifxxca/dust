import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import InputError from '@/components/input-error';
import CustomerPicker from '@/components/customer-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { matchLabels, trackingLabels } from '@/lib/jne-monitoring';
import type { JneCustomer, JneFilters } from '@/types/jne';

const customerMatchLabels = {
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
                    <SelectValue placeholder={all} />
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
    draft,
    applied,
    accounts,
    customers,
    loading,
    errors,
    onChange,
    onApply,
    onReset,
    onRemove,
}: {
    draft: JneFilters;
    applied: JneFilters;
    accounts: string[];
    customers: JneCustomer[];
    loading: boolean;
    errors: Partial<Record<keyof JneFilters, string>>;
    onChange: (key: keyof JneFilters, value: string) => void;
    onApply: () => void;
    onReset: () => void;
    onRemove: (key: keyof JneFilters) => void;
}) {
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const advancedCount = [
        applied.account,
        applied.match,
        applied.customer_match,
    ].filter(Boolean).length;
    const active = (Object.keys(applied) as (keyof JneFilters)[]).filter(
        (key) => key !== 'status' && applied[key],
    );
    const selectedCustomer = customers.find(
        (customer) => String(customer.id) === draft.customer_id,
    );
    const activeLabels: Record<keyof JneFilters, string> = {
        q: `Awalan AWB: ${applied.q}`,
        status: trackingLabels[applied.status] || applied.status,
        customer_id: `Customer: ${customers.find((customer) => String(customer.id) === applied.customer_id)?.name || applied.customer_id}`,
        account: `Sumber: ${applied.account}`,
        match: `Pickup: ${matchLabels[applied.match] || applied.match}`,
        customer_match: `Pemetaan: ${customerMatchLabels[applied.customer_match as keyof typeof customerMatchLabels] || applied.customer_match}`,
    };
    return (
        <div className="flex min-w-0 flex-col gap-3">
            <form
                className="grid items-start gap-2 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,0.8fr)] xl:grid-cols-[minmax(14rem,1fr)_minmax(13rem,0.8fr)_auto]"
                onSubmit={(event) => {
                    event.preventDefault();
                    onApply();
                }}
            >
                <div className="flex min-w-0 flex-col gap-1">
                    <Label htmlFor="jne-awb-search" className="sr-only">
                        Cari AWB
                    </Label>
                    <div className="relative">
                        <Search
                            className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            id="jne-awb-search"
                            className="min-h-11 pl-9"
                            placeholder="Masukkan awalan AWB"
                            maxLength={100}
                            value={draft.q}
                            disabled={loading}
                            onChange={(event) =>
                                onChange('q', event.target.value)
                            }
                            aria-invalid={!!errors.q}
                            aria-describedby={
                                errors.q ? 'jne-awb-error' : undefined
                            }
                        />
                    </div>
                    <InputError id="jne-awb-error" message={errors.q} />
                </div>
                <div className="min-w-0">
                    <Label htmlFor="jne-customer-filter" className="sr-only">
                        Customer
                    </Label>
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
                </div>
                <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-1">
                    <Sheet open={advancedOpen} onOpenChange={setAdvancedOpen}>
                        <SheetTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                className="min-h-11"
                                disabled={loading}
                            >
                                <SlidersHorizontal />
                                Filter lanjutan
                                {advancedCount > 0 && (
                                    <Badge
                                        variant="secondary"
                                        className="px-1.5"
                                    >
                                        {advancedCount}
                                    </Badge>
                                )}
                            </Button>
                        </SheetTrigger>
                        <SheetContent className="w-full sm:max-w-md">
                            <SheetHeader className="border-b">
                                <SheetTitle>Filter lanjutan</SheetTitle>
                                <SheetDescription>
                                    Persempit daftar berdasarkan sumber report,
                                    pemetaan customer, atau hubungan pickup.
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
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                    Belum terhubung ke pickup tidak berarti
                                    pengiriman bermasalah. Rekonsiliasi pickup
                                    merupakan proses terpisah.
                                </p>
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
                                    className="min-h-11"
                                    disabled={loading}
                                    onClick={() => {
                                        onApply();
                                        setAdvancedOpen(false);
                                    }}
                                >
                                    Terapkan filter
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="min-h-11"
                                    onClick={() => setAdvancedOpen(false)}
                                >
                                    Kembali
                                </Button>
                            </SheetFooter>
                        </SheetContent>
                    </Sheet>
                    <Button
                        className="min-h-11"
                        type="submit"
                        disabled={loading}
                    >
                        {loading ? 'Memuat…' : 'Terapkan'}
                    </Button>
                </div>
            </form>
            {(active.length > 0 || applied.status) && (
                <div
                    className="flex flex-wrap items-center gap-2"
                    aria-label="Filter aktif"
                >
                    {active.map((key) => (
                        <Button
                            key={key}
                            variant="secondary"
                            size="sm"
                            className="h-auto min-h-11 max-w-full py-1 text-xs"
                            disabled={loading}
                            onClick={() => onRemove(key)}
                            aria-label={`Hapus filter ${activeLabels[key]}`}
                        >
                            <span className="min-w-0 truncate">
                                {activeLabels[key]}
                            </span>
                            <X className="size-3 shrink-0" />
                        </Button>
                    ))}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
                        disabled={loading}
                        onClick={onReset}
                    >
                        Reset filter
                    </Button>
                </div>
            )}
            {Object.entries(errors)
                .filter(([key]) => key !== 'q')
                .map(([key, message]) => (
                    <InputError key={key} message={message} />
                ))}
        </div>
    );
}

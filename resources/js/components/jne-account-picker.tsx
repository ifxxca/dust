import { useId, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type JneAccountSource = {
    id: number;
    customer_account: string;
    label: string | null;
    national_account?: string;
};

export default function JneAccountPicker({
    sources,
    value,
    nationalAccount,
    onSelect,
    invalid,
    disabled,
}: {
    sources: JneAccountSource[];
    value: string;
    nationalAccount: string;
    onSelect: (account: string, national: string) => void;
    invalid?: boolean;
    disabled?: boolean;
}) {
    const id = useId();
    const input = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const selected = sources.find(
        (source) =>
            source.customer_account === value &&
            (source.national_account || 'N') === nationalAccount,
    );
    const terms = query
        .trim()
        .toLocaleLowerCase('id-ID')
        .split(/\s+/)
        .filter(Boolean);
    const matches = sources.filter((source) =>
        terms.every((term) =>
            `${source.customer_account} ${source.label || ''}`
                .toLocaleLowerCase('id-ID')
                .includes(term),
        ),
    );
    const custom = query.trim().toUpperCase();
    const canUseCustom =
        matches.length === 0 &&
        /^[\p{L}\p{N}._\- ]{1,100}$/u.test(custom) &&
        !sources.some(
            (source) => source.customer_account.toUpperCase() === custom,
        );
    const options = [
        ...matches,
        ...(canUseCustom
            ? [
                  {
                      id: -1,
                      customer_account: custom,
                      national_account: nationalAccount,
                      label: 'Nomor baru',
                  },
              ]
            : []),
    ];
    const choose = (source: JneAccountSource) => {
        onSelect(source.customer_account, source.national_account || 'N');
        setOpen(false);
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) {
                    setQuery('');
                    setActive(0);
                }
            }}
        >
            <DialogTrigger asChild>
                <Button
                    id="customer_account"
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    aria-haspopup="dialog"
                    aria-invalid={invalid || undefined}
                    aria-describedby={
                        invalid ? 'report-customer_account-error' : undefined
                    }
                    className="min-h-11 w-full justify-between gap-3"
                >
                    <span className="min-w-0 truncate">
                        {value
                            ? `${value}${selected?.label ? ` · ${selected.label}` : ''}`
                            : 'Cari nomor atau nama penarikan…'}
                    </span>
                    <ChevronsUpDown aria-hidden="true" data-icon="inline-end" />
                </Button>
            </DialogTrigger>
            <DialogContent
                className="gap-4"
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    input.current?.focus();
                }}
            >
                <DialogHeader>
                    <DialogTitle>Pilih nomor penarikan JNE</DialogTitle>
                    <DialogDescription>
                        Cari berdasarkan nomor account atau nama sumber report.
                    </DialogDescription>
                </DialogHeader>
                <Input
                    ref={input}
                    role="combobox"
                    aria-label="Cari nomor atau nama penarikan"
                    aria-expanded="true"
                    aria-autocomplete="list"
                    aria-controls={`${id}-list`}
                    aria-activedescendant={
                        options[active] ? `${id}-option-${active}` : undefined
                    }
                    autoComplete="off"
                    spellCheck={false}
                    value={query}
                    placeholder="Cari nomor atau nama…"
                    className="min-h-11"
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setActive(0);
                    }}
                    onKeyDown={(event) => {
                        if (
                            event.key === 'ArrowDown' ||
                            event.key === 'ArrowUp'
                        ) {
                            event.preventDefault();
                            const next = options.length
                                ? (active +
                                      (event.key === 'ArrowDown'
                                          ? 1
                                          : options.length - 1)) %
                                  options.length
                                : 0;
                            setActive(next);
                            document
                                .getElementById(`${id}-option-${next}`)
                                ?.scrollIntoView({ block: 'nearest' });
                        } else if (event.key === 'Enter') {
                            event.preventDefault();
                            if (options[active]) choose(options[active]);
                        }
                    }}
                />
                <div
                    id={`${id}-list`}
                    role="listbox"
                    aria-label="Nomor penarikan JNE"
                    className="max-h-[min(22rem,45dvh)] overflow-y-auto overscroll-contain"
                >
                    {options.map((source, index) => (
                        <button
                            key={source.id}
                            id={`${id}-option-${index}`}
                            type="button"
                            role="option"
                            aria-selected={
                                source.customer_account === value &&
                                (source.national_account || 'N') ===
                                    nationalAccount
                            }
                            tabIndex={-1}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseMove={() => setActive(index)}
                            onClick={() => choose(source)}
                            className={cn(
                                'flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                active === index &&
                                    'bg-accent text-accent-foreground',
                            )}
                        >
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                                <span className="truncate font-medium">
                                    {source.id === -1
                                        ? `Gunakan nomor ${source.customer_account}`
                                        : source.customer_account}
                                </span>
                                <span className="truncate text-xs text-muted-foreground">
                                    {source.label || 'Sumber report'} · National{' '}
                                    {source.national_account === 'Y'
                                        ? 'YES'
                                        : 'NO'}
                                </span>
                            </span>
                            {source.customer_account === value &&
                                (source.national_account || 'N') ===
                                    nationalAccount && (
                                    <Check
                                        aria-hidden="true"
                                        className="size-4 shrink-0"
                                    />
                                )}
                        </button>
                    ))}
                    {options.length === 0 && (
                        <p
                            role="status"
                            className="p-4 text-sm text-muted-foreground"
                        >
                            Nomor penarikan tidak ditemukan.
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

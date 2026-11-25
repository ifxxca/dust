import InputError from '@/components/input-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export default function DateRangeFields({
    id,
    from,
    thru,
    onFromChange,
    onThruChange,
    label = 'Periode',
    fromLabel = 'Dari',
    thruLabel = 'Sampai',
    fromError,
    thruError,
    disabled = false,
    required = false,
    className,
    type = 'date',
}: {
    id: string;
    from: string;
    thru: string;
    onFromChange: (value: string) => void;
    onThruChange: (value: string) => void;
    label?: string;
    fromLabel?: string;
    thruLabel?: string;
    fromError?: string;
    thruError?: string;
    disabled?: boolean;
    required?: boolean;
    className?: string;
    type?: 'date' | 'datetime-local';
}) {
    return (
        <fieldset className={cn('min-w-0', className)} disabled={disabled}>
            <legend className="mb-1.5 text-sm font-medium">{label}</legend>
            <div
                className={cn(
                    'grid min-w-0 gap-2',
                    type === 'date' ? 'grid-cols-2' : 'sm:grid-cols-2',
                )}
            >
                <div className="flex min-w-0 flex-col gap-1">
                    <Label
                        htmlFor={`${id}-from`}
                        className="text-xs text-muted-foreground"
                    >
                        {fromLabel}
                    </Label>
                    <Input
                        id={`${id}-from`}
                        name="date_from"
                        type={type}
                        className="min-h-11 w-full min-w-0 px-2 text-sm"
                        value={from}
                        onChange={(event) => onFromChange(event.target.value)}
                        required={required}
                        aria-invalid={!!fromError}
                        aria-describedby={
                            fromError ? `${id}-from-error` : undefined
                        }
                    />
                    <InputError id={`${id}-from-error`} message={fromError} />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                    <Label
                        htmlFor={`${id}-thru`}
                        className="text-xs text-muted-foreground"
                    >
                        {thruLabel}
                    </Label>
                    <Input
                        id={`${id}-thru`}
                        name="date_thru"
                        type={type}
                        className="min-h-11 w-full min-w-0 px-2 text-sm"
                        value={thru}
                        min={from || undefined}
                        onChange={(event) => onThruChange(event.target.value)}
                        required={required}
                        aria-invalid={!!thruError}
                        aria-describedby={
                            thruError ? `${id}-thru-error` : undefined
                        }
                    />
                    <InputError id={`${id}-thru-error`} message={thruError} />
                </div>
            </div>
        </fieldset>
    );
}

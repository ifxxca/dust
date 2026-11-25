import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EmailRecipientsInput({
    id,
    value,
    onChange,
    limit = 5,
    disabled = false,
    errors = {},
    label = 'Penerima email',
}: {
    id: string;
    value: string[];
    onChange: (value: string[]) => void;
    limit?: number;
    disabled?: boolean;
    errors?: Record<string, string | undefined>;
    label?: string;
}) {
    const addresses = value.length ? value : [''];
    return (
        <fieldset className="min-w-0 space-y-3" disabled={disabled}>
            <legend className="text-sm font-medium">
                {label}{' '}
                <span className="font-normal text-muted-foreground">
                    ({addresses.filter(Boolean).length}/{limit})
                </span>
            </legend>
            {addresses.map((email, index) => (
                <div key={index} className="space-y-1.5">
                    <Label
                        htmlFor={`${id}-${index}`}
                        className="text-xs text-muted-foreground"
                    >
                        {index === 0 ? 'Email utama' : `Email ${index + 1}`}
                    </Label>
                    <div className="flex min-w-0 gap-2">
                        <Input
                            id={`${id}-${index}`}
                            name={`${id}[${index}]`}
                            type="email"
                            inputMode="email"
                            spellCheck={false}
                            autoCapitalize="none"
                            autoComplete="email"
                            maxLength={255}
                            value={email}
                            placeholder="nama@perusahaan.com"
                            className="min-h-11 min-w-0 flex-1"
                            aria-invalid={
                                !!errors[index] ||
                                (index === 0 && !!errors.list)
                            }
                            aria-describedby={
                                errors[index]
                                    ? `${id}-${index}-error`
                                    : index === 0 && errors.list
                                      ? `${id}-list-error`
                                      : undefined
                            }
                            onChange={(event) =>
                                onChange(
                                    addresses.map((address, position) =>
                                        position === index
                                            ? event.target.value
                                            : address,
                                    ),
                                )
                            }
                        />
                        {addresses.length > 1 && (
                            <Button
                                type="button"
                                variant="ghost"
                                className="size-11 shrink-0"
                                aria-label={`Hapus email ${index + 1}`}
                                onClick={() =>
                                    onChange(
                                        addresses.filter(
                                            (_, position) => position !== index,
                                        ),
                                    )
                                }
                            >
                                <X className="size-4" aria-hidden="true" />
                            </Button>
                        )}
                    </div>
                    {errors[index] && (
                        <p
                            id={`${id}-${index}-error`}
                            role="alert"
                            className="text-sm text-destructive"
                        >
                            {errors[index]}
                        </p>
                    )}
                </div>
            ))}
            {errors.list && (
                <p
                    id={`${id}-list-error`}
                    role="alert"
                    className="text-sm text-destructive"
                >
                    {errors.list}
                </p>
            )}
            {addresses.length < limit && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onChange([...addresses, ''])}
                >
                    <Plus className="size-4" aria-hidden="true" />
                    Tambah email
                </Button>
            )}
        </fieldset>
    );
}

import InputError from '@/components/input-error';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

export default function FilterSelect({
    id,
    label,
    value,
    all,
    options,
    disabled = false,
    error,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    all: string;
    options: [string, string][];
    disabled?: boolean;
    error?: string;
    onChange: (value: string) => void;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Select
                value={value || '__all__'}
                onValueChange={(next) =>
                    onChange(next === '__all__' ? '' : next)
                }
                disabled={disabled}
            >
                <SelectTrigger
                    id={id}
                    className="min-h-11 w-full min-w-0"
                    aria-invalid={!!error}
                    aria-describedby={error ? `${id}-error` : undefined}
                >
                    <SelectValue>
                        {options.find(([key]) => key === value)?.[1] ??
                            (value || all)}
                    </SelectValue>
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        <SelectItem value="__all__">{all}</SelectItem>
                        {options.map(([key, text]) => (
                            <SelectItem key={key} value={key}>
                                {text}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
            <InputError id={`${id}-error`} message={error} />
        </div>
    );
}

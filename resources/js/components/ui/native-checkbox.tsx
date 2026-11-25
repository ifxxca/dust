import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function NativeCheckbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
    return (
        <input
            {...props}
            type="checkbox"
            data-slot="native-checkbox"
            className={cn(
                'size-4 shrink-0 cursor-pointer rounded border-input accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
        />
    );
}

export { NativeCheckbox };

import type { ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

function NativeSelect({
    className,
    wrapperClassName,
    ...props
}: ComponentProps<'select'> & { wrapperClassName?: string }) {
    return (
        <div
            data-slot="native-select-wrapper"
            className={cn('relative inline-flex w-full min-w-0', wrapperClassName)}
        >
            <select
                data-slot="native-select"
                className={cn(
                    'min-h-11 w-full min-w-0 appearance-none rounded-md border border-input bg-card py-2 pr-10 pl-3 text-base text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm',
                    className,
                    'pr-10',
                )}
                {...props}
            />
            <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
        </div>
    );
}

export { NativeSelect };

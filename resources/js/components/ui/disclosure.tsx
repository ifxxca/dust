import { Children, isValidElement, type ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Styled native disclosure; retains DOM refs, open, and onToggle contracts. */
function Disclosure({
    children,
    className,
    variant = 'default',
    ...props
}: ComponentProps<'details'> & { variant?: 'default' | 'plain' }) {
    const items = Children.toArray(children);
    const isSummary = (child: (typeof items)[number]) =>
        isValidElement(child) && child.type === DisclosureSummary;

    return (
        <details
            data-slot="disclosure"
            className={cn(
                'group/native-disclosure min-w-0 text-sm',
                variant === 'default' && 'rounded-lg border bg-card',
                className,
            )}
            {...props}
        >
            {items.filter(isSummary)}
            <div
                data-slot="disclosure-content"
                className={cn(
                    'flex min-w-0 flex-col gap-3',
                    variant === 'default' && 'border-t px-4 pt-3 pb-4',
                )}
            >
                {items.filter((child) => !isSummary(child))}
            </div>
        </details>
    );
}

function DisclosureSummary({
    className,
    children,
    indicator = true,
    ...props
}: ComponentProps<'summary'> & { indicator?: boolean }) {
    return (
        <summary
            data-slot="disclosure-summary"
            className={cn(
                'flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden',
                className,
            )}
            {...props}
        >
            {indicator ? (
                <>
                    <span className="min-w-0 flex-1 break-words">{children}</span>
                    <ChevronDown
                        aria-hidden="true"
                        className="size-4 shrink-0 transition-transform group-open/native-disclosure:rotate-180 motion-reduce:transition-none"
                    />
                </>
            ) : children}
        </summary>
    );
}

export { Disclosure, DisclosureSummary };

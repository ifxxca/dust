import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const widths = {
    fluid: '',
    wide: 'mx-auto max-w-[1440px]',
    form: 'mx-auto max-w-3xl',
};

export default function PageContainer({
    variant = 'fluid',
    className,
    ...props
}: ComponentProps<'div'> & { variant?: keyof typeof widths }) {
    return (
        <div
            data-page-container={variant}
            className={cn(
                'w-full min-w-0 space-y-6 px-4 py-6 md:px-6 xl:px-8',
                widths[variant],
                className,
            )}
            {...props}
        />
    );
}

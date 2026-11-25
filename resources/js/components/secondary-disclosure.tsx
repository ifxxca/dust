import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export default function SecondaryDisclosure({
    title,
    children,
    className,
}: {
    title: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <Collapsible
            className={cn(
                'group/disclosure min-w-0 rounded-lg border bg-card',
                className,
            )}
        >
            <CollapsibleTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 w-full justify-between gap-3 rounded-lg px-4 text-left whitespace-normal"
                >
                    <span className="min-w-0">{title}</span>
                    <ChevronDown
                        aria-hidden="true"
                        className="shrink-0 transition-transform group-data-[state=open]/disclosure:rotate-180 motion-reduce:transition-none"
                    />
                </Button>
            </CollapsibleTrigger>
            <CollapsibleContent
                forceMount
                className="data-[state=closed]:hidden"
            >
                <div className="flex min-w-0 flex-col gap-3 px-4 pt-1 pb-4 text-sm">
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

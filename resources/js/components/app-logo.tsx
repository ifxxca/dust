import { PackageCheck } from 'lucide-react';

export default function AppLogo() {
    return (
        <>
            <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                <PackageCheck className="size-5" />
            </div>
            <div className="ml-1 grid flex-1 text-left text-sm">
                <span className="mb-0.5 truncate leading-tight font-semibold">
                    Retail Pickup
                </span>
                <span className="text-xs text-muted-foreground">
                    Operasional Retail
                </span>
            </div>
        </>
    );
}

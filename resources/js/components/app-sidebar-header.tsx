import { Breadcrumbs } from '@/components/breadcrumbs';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/types';
import { usePage } from '@inertiajs/react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppearance } from '@/hooks/use-appearance';
import { PickupNotifications } from '@/components/pickup-notifications';

export function AppSidebarHeader({
    breadcrumbs = [],
}: {
    breadcrumbs?: BreadcrumbItemType[];
}) {
    const { resolvedAppearance, updateAppearance } = useAppearance();
    const user = usePage().props.auth.user;
    const role = user.role;
    return (
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-card/95 px-4 backdrop-blur-sm sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
                <SidebarTrigger
                    className="-ml-1"
                    aria-label="Buka atau tutup navigasi"
                />
                <Breadcrumbs breadcrumbs={breadcrumbs} />
                {breadcrumbs.length === 0 && (
                    <span className="text-sm font-semibold">Retail Pickup</span>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
                {user.is_active &&
                    ['cs', 'admin_supervisor'].includes(role) && (
                        <PickupNotifications key={user.id} />
                    )}
                <span className="hidden text-xs text-muted-foreground sm:block">
                    {
                        {
                            cs: 'Customer Service',
                            pickup_staff: 'Petugas Pickup',
                            retail_staff: 'Petugas Retail',
                            admin_supervisor: 'Admin / Supervisor',
                        }[role]
                    }
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={
                        resolvedAppearance === 'dark'
                            ? 'Gunakan tema terang'
                            : 'Gunakan tema gelap'
                    }
                    onClick={() =>
                        updateAppearance(
                            resolvedAppearance === 'dark' ? 'light' : 'dark',
                        )
                    }
                >
                    {resolvedAppearance === 'dark' ? (
                        <Sun className="size-4" />
                    ) : (
                        <Moon className="size-4" />
                    )}
                </Button>
            </div>
        </header>
    );
}

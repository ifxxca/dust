import { Link } from '@inertiajs/react';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import type { NavItem } from '@/types';
import { useMobileNavigation } from '@/hooks/use-mobile-navigation';

export function NavMain({
    items,
    label = 'Operasional',
}: {
    items: (NavItem & { active?: boolean })[];
    label?: string;
}) {
    const { isCurrentUrl } = useCurrentUrl();
    const closeMobile = useMobileNavigation();
    const { setOpenMobile } = useSidebar();

    return (
        <SidebarGroup className="px-2 py-0">
            <SidebarGroupLabel>{label}</SidebarGroupLabel>
            <SidebarMenu>
                {items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                            asChild
                            isActive={item.active ?? isCurrentUrl(item.href)}
                            className="my-0.5 min-h-10 rounded-lg data-[active=true]:bg-primary/10 data-[active=true]:font-semibold data-[active=true]:text-primary"
                            tooltip={{ children: item.title }}
                        >
                            <Link
                                href={item.href}
                                prefetch
                                onClick={() => {
                                    setOpenMobile(false);
                                    closeMobile();
                                }}
                            >
                                {item.icon && <item.icon />}
                                <span>{item.title}</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ))}
            </SidebarMenu>
        </SidebarGroup>
    );
}

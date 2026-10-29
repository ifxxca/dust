import { Link } from '@inertiajs/react';
import { ChevronDown } from 'lucide-react';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubItem,
    SidebarMenuSubButton,
    useSidebar,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import type { NavItem } from '@/types';
import { useMobileNavigation } from '@/hooks/use-mobile-navigation';

export function NavMain({
    items,
    label = 'Operasional',
}: {
    items: (NavItem & {
        active?: boolean;
        children?: (NavItem & { active?: boolean })[];
    })[];
    label?: string;
}) {
    const { isCurrentUrl } = useCurrentUrl();
    const closeMobile = useMobileNavigation();
    const { setOpenMobile } = useSidebar();

    return (
        <SidebarGroup className="px-2 py-0">
            <SidebarGroupLabel>{label}</SidebarGroupLabel>
            <SidebarMenu>
                {items.map((item) =>
                    item.children ? (
                        <Collapsible
                            key={item.title}
                            defaultOpen={item.active}
                            asChild
                        >
                            <SidebarMenuItem>
                                <CollapsibleTrigger asChild>
                                    <SidebarMenuButton
                                        tooltip={item.title}
                                        isActive={item.active}
                                        className="my-0.5 h-11 rounded-lg data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                                    >
                                        {item.icon && <item.icon />}
                                        <span>{item.title}</span>
                                        <ChevronDown className="ml-auto size-3.5" />
                                    </SidebarMenuButton>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <SidebarMenuSub className="mx-0 border-0 px-0">
                                        {item.children.map((child) => (
                                            <SidebarMenuSubItem
                                                key={child.title}
                                            >
                                                <SidebarMenuSubButton
                                                    asChild
                                                    size="md"
                                                    isActive={child.active}
                                                    className="h-11 rounded-lg pl-4 data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                                                >
                                                    <Link
                                                        href={child.href}
                                                        aria-current={
                                                            child.active
                                                                ? 'page'
                                                                : undefined
                                                        }
                                                        onClick={() => {
                                                            setOpenMobile(
                                                                false,
                                                            );
                                                            closeMobile();
                                                        }}
                                                    >
                                                        {child.icon && (
                                                            <child.icon />
                                                        )}
                                                        <span>
                                                            {child.title}
                                                        </span>
                                                    </Link>
                                                </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                        ))}
                                    </SidebarMenuSub>
                                </CollapsibleContent>
                            </SidebarMenuItem>
                        </Collapsible>
                    ) : (
                        <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                                asChild
                                isActive={
                                    item.active ?? isCurrentUrl(item.href)
                                }
                                className="my-0.5 h-11 rounded-lg data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                                tooltip={{ children: item.title }}
                            >
                                <Link
                                    href={item.href}
                                    aria-current={
                                        (item.active ?? isCurrentUrl(item.href))
                                            ? 'page'
                                            : undefined
                                    }
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
                    ),
                )}
            </SidebarMenu>
        </SidebarGroup>
    );
}

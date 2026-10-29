import { usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { AppVariant } from '@/types';

type Props = {
    children: ReactNode;
    variant?: AppVariant;
};

export function AppShell({ children, variant = 'sidebar' }: Props) {
    const isOpen = usePage().props.sidebarOpen;
    const content = (
        <>
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
            >
                Lewati navigasi ke konten utama
            </a>
            {children}
        </>
    );

    if (variant === 'header') {
        return (
            <div className="flex min-h-screen w-full flex-col">{content}</div>
        );
    }

    return <SidebarProvider defaultOpen={isOpen}>{content}</SidebarProvider>;
}

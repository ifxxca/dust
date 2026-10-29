import { Link } from '@inertiajs/react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import AppLogo from '@/components/app-logo';
import PickupPreview from '@/components/pickup-preview';
import { home } from '@/routes';
import type { AuthLayoutProps } from '@/types';

export default function AuthSimpleLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    return (
        <div className="grid min-h-svh bg-white text-slate-900 lg:grid-cols-2 dark:bg-slate-950 dark:text-slate-100">
            <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-slate-200 bg-slate-50 p-8 lg:flex xl:p-10 dark:border-slate-800 dark:bg-slate-900/50">
                <Link
                    href={home()}
                    aria-label="Retail Pickup — Beranda"
                    className="relative flex w-fit items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                >
                    <AppLogo />
                </Link>
                <div className="relative mx-auto flex w-full max-w-lg flex-col gap-7 py-8">
                    <div className="space-y-4">
                        <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                            Satu workspace. Satu tim.
                        </p>
                        <h2 className="text-4xl leading-tight font-semibold tracking-[-0.035em]">
                            Pickup lebih teratur.
                            <br />
                            <span className="text-primary">
                                Hari lebih produktif.
                            </span>
                        </h2>
                        <p className="max-w-sm text-sm leading-7 text-slate-500 dark:text-slate-400">
                            Hubungkan setiap langkah, dari permintaan customer
                            hingga paket diterima tim retail.
                        </p>
                    </div>
                    <PickupPreview compact />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Retail Pickup · Workspace Operasional
                </p>
            </aside>
            <div className="flex min-h-svh flex-col px-6 sm:px-12 lg:px-14">
                <header className="flex min-h-24 items-center justify-between gap-5 py-6">
                    <Link
                        href={home()}
                        aria-label="Retail Pickup — Beranda"
                        className="flex items-center gap-2 lg:hidden"
                    >
                        <AppLogo />
                    </Link>
                    <Link
                        href={home()}
                        className="ml-auto inline-flex min-h-10 items-center gap-2 text-xs text-slate-500 transition-colors hover:text-primary dark:text-slate-400"
                    >
                        <ArrowLeft className="size-3.5" />
                        <span className="hidden sm:inline">
                            Kembali ke beranda
                        </span>
                        <span className="sm:hidden">Beranda</span>
                    </Link>
                </header>
                <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 py-10 sm:py-14">
                    <div className="space-y-3">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold tracking-wider text-blue-700 uppercase dark:bg-blue-950 dark:text-blue-300">
                            <ShieldCheck className="size-3.5" />
                            Akses tim operasional
                        </span>
                        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                            {title}
                        </h1>
                        <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                            {description}
                        </p>
                    </div>
                    {children}
                </main>
                <footer className="flex min-h-20 items-center justify-center border-t border-slate-100 py-5 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    Retail Pickup · Khusus tim operasional
                </footer>
            </div>
        </div>
    );
}

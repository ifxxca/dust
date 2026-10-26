import {
    ChartNoAxesCombined,
    FileDown,
    History,
    PackageSearch,
    SlidersHorizontal,
} from 'lucide-react';
import * as monitoring from '@/routes/jne-monitoring';
import * as reports from '@/routes/jne-reports';
import * as runs from '@/routes/report-runs';
import * as exceptions from '@/routes/jne-exceptions';
import * as evidence from '@/routes/jne-evidence';
import * as refresh from '@/routes/jne-refresh';
import type { BreadcrumbItem, NavItem } from '@/types';

export function jneNavigation(url: string): (NavItem & { active: boolean })[] {
    const path = url.split(/[?#]/)[0];
    return [
        {
            title: 'Dashboard customer',
            href: monitoring.customerDashboard.url(),
            icon: ChartNoAxesCombined,
            active: path === monitoring.customerDashboard.url(),
        },
        {
            title: 'Daftar pengiriman',
            href: monitoring.index.url(),
            icon: PackageSearch,
            active:
                path === monitoring.index.url() ||
                /^\/admin\/jne-monitoring\/\d+$/.test(path) ||
                path === monitoring.reconciliation.url() ||
                path === exceptions.index.url() ||
                /^\/admin\/jne-monitoring\/collections\/\d+$/.test(path),
        },
        {
            title: 'Tarik report',
            href: reports.index.url(),
            icon: FileDown,
            active:
                path === reports.index.url() ||
                /^\/admin\/jne-reports\/\d+\/awbs$/.test(path),
        },
        {
            title: 'Pengaturan penarikan',
            href: monitoring.profiles.url(),
            icon: SlidersHorizontal,
            active:
                path === monitoring.profiles.url() ||
                path === evidence.index.url() ||
                path === refresh.index.url(),
        },
        {
            title: 'Riwayat run',
            href: runs.index.url(),
            icon: History,
            active: path === runs.index.url(),
        },
    ];
}

export function jneBreadcrumbs(url: string): BreadcrumbItem[] {
    const active = jneNavigation(url).find((item) => item.active);
    if (!active) return [];
    const path = url.split(/[?#]/)[0];
    const secondary = new Map([
        [exceptions.index.url(), 'Pemeriksaan exception'],
        [evidence.index.url(), 'Aturan bukti'],
        [refresh.index.url(), 'Kebijakan tracking'],
    ]);
    const detail =
        secondary.get(path) ??
        (/^\/admin\/jne-monitoring\/collections\/\d+$/.test(path)
            ? 'Koleksi eksternal'
            : /^\/admin\/jne-monitoring\/\d+$/.test(path)
              ? 'Detail resi'
              : /^\/admin\/jne-reports\/\d+\/awbs$/.test(path)
                ? 'Detail report'
                : path === monitoring.reconciliation.url()
                  ? 'Rekonsiliasi pickup'
                  : null);
    return [
        { title: 'Pengiriman JNE', href: monitoring.index.url() },
        { title: active.title, href: active.href },
        ...(detail ? [{ title: detail, href: path }] : []),
    ];
}

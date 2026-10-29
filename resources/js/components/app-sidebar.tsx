import { Link, usePage } from '@inertiajs/react';
import {
    ClipboardList,
    History,
    LayoutDashboard,
    PackageCheck,
    Truck,
    Users,
    ContactRound,
    CalendarDays,
    BellRing,
    ListChecks,
    AlertTriangle,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar';
import {
    dashboard,
    discrepancies,
    handover,
    operations,
    pickupSchedules,
    pushTest,
} from '@/routes';
import type { NavItem } from '@/types';
import { index as pickupResults } from '@/routes/pickup-results';
import { index as pickupReconciliation } from '@/routes/pickup-automation';
import { jneNavigation } from '@/lib/jne-navigation';
import { index as cashlessHandover } from '@/routes/cashless-handover';

export function AppSidebar() {
    const { setOpenMobile } = useSidebar();
    const { auth } = usePage().props;
    const url = usePage().url;
    const history =
        new URL(url, 'http://localhost').searchParams.get('history') === '1';
    const path = url.split('?')[0];
    const physicalHandover =
        path === '/handover' || path.startsWith('/handover/');
    const role = auth.user.role;
    const pickup =
        path.startsWith('/operations') &&
        !path.includes('/customers') &&
        !path.includes('/users');
    const item = (
        title: string,
        href: NavItem['href'],
        icon: NavItem['icon'],
        active: boolean,
    ) => ({ title, href, icon, active });
    const overview = item(
        'Dashboard',
        dashboard(),
        LayoutDashboard,
        path === '/dashboard',
    );
    const customer = item(
        'Customer',
        operations({ screen: 'customers' }),
        ContactRound,
        path.includes('/customers') ||
            path.startsWith('/admin/jne-shipper-aliases'),
    );
    const reception = item(
        role === 'admin_supervisor'
            ? 'Handover & Verifikasi'
            : 'Penerimaan Paket',
        handover(),
        PackageCheck,
        path === '/discrepancies' ||
            ((physicalHandover ||
                (role === 'admin_supervisor' &&
                    path === cashlessHandover.url())) &&
                (!history || role === 'admin_supervisor')),
    );
    const groups =
        role === 'cs'
            ? [
                  {
                      label: 'Operasional',
                      items: [
                          overview,
                          item(
                              'Pickup',
                              operations({ screen: 'tasks' }),
                              Truck,
                              pickup,
                          ),
                          customer,
                          item(
                              'Jadwal Regular',
                              pickupSchedules(),
                              CalendarDays,
                              path === '/pickup-schedules',
                          ),
                      ],
                  },
              ]
            : role === 'pickup_staff'
              ? [
                    {
                        label: 'Pickup',
                        items: [
                            item(
                                'Tugas Saya',
                                operations({ screen: 'mine' }),
                                ClipboardList,
                                (pickup && !history) || path === '/dashboard',
                            ),
                            item(
                                'Riwayat Pickup',
                                operations(
                                    { screen: 'mine' },
                                    { query: { history: 1 } },
                                ),
                                History,
                                pickup && history,
                            ),
                        ],
                    },
                ]
              : role === 'retail_staff'
                ? [
                      {
                          label: 'Operasional Retail',
                          items: [
                              overview,
                              reception,
                              item(
                                  'Riwayat Handover',
                                  handover({}, { query: { history: 1 } }),
                                  History,
                                  physicalHandover && history,
                              ),
                          ],
                      },
                  ]
                : [
                      {
                          label: 'Retail Operations',
                          items: [
                              overview,
                              {
                                  ...item(
                                      'Hasil Pickup',
                                      pickupResults(),
                                      ClipboardList,
                                      path.startsWith('/hasil-pickup') ||
                                          path === pickupReconciliation.url(),
                                  ),
                                  children: [
                                      item(
                                          'Monitoring Pickup',
                                          pickupResults(),
                                          ClipboardList,
                                          path.startsWith('/hasil-pickup'),
                                      ),
                                      item(
                                          'Rekonsiliasi Paket',
                                          pickupReconciliation(),
                                          ListChecks,
                                          path === pickupReconciliation.url(),
                                      ),
                                  ],
                              },
                              item(
                                  'Operasional Pickup',
                                  operations({ screen: 'tasks' }),
                                  Truck,
                                  pickup,
                              ),
                              {
                                  ...reception,
                                  children: [
                                      item(
                                          'Menunggu Penerimaan',
                                          handover(),
                                          PackageCheck,
                                          physicalHandover && !history,
                                      ),
                                      item(
                                          'Riwayat Handover',
                                          handover(
                                              {},
                                              { query: { history: 1 } },
                                          ),
                                          History,
                                          physicalHandover && history,
                                      ),
                                      item(
                                          'Monitoring Selisih',
                                          discrepancies(),
                                          AlertTriangle,
                                          path === '/discrepancies',
                                      ),
                                  ],
                              },
                              item(
                                  'Jadwal Regular',
                                  pickupSchedules(),
                                  CalendarDays,
                                  path === '/pickup-schedules',
                              ),
                          ],
                      },
                      {
                          label: 'Pengiriman JNE',
                          items: jneNavigation(url),
                      },
                      {
                          label: 'Administrasi',
                          items: [
                              customer,
                              item(
                                  'Pengguna',
                                  operations({ screen: 'users' }),
                                  Users,
                                  path.includes('/users'),
                              ),
                              item(
                                  'Tes Notifikasi',
                                  pushTest(),
                                  BellRing,
                                  path === '/admin/push-test',
                              ),
                          ],
                      },
                  ];
    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader className="mb-4 p-3 pr-14 md:pr-3">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link
                                onClick={() => setOpenMobile(false)}
                                href={
                                    role === 'pickup_staff'
                                        ? operations({ screen: 'mine' })
                                        : dashboard()
                                }
                            >
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent className="gap-5">
                {groups.map((group) => (
                    <NavMain
                        key={group.label}
                        label={group.label}
                        items={group.items}
                    />
                ))}
            </SidebarContent>
            <SidebarFooter className="border-t p-3">
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}

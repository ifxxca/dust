import {
    ArrowUpRight,
    Check,
    ChevronRight,
    ClipboardList,
    MapPin,
    PackageCheck,
    Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function PickupPreview({
    className,
    compact = false,
}: {
    className?: string;
    compact?: boolean;
}) {
    return (
        <figure
            className={cn(
                'relative rounded-[1.75rem] border border-blue-100 bg-blue-50/60 p-4 sm:p-6 dark:border-blue-900/60 dark:bg-blue-950/30',
                className,
            )}
        >
            <figcaption className="mb-4 flex items-center justify-between gap-3 px-1 text-[10px] font-medium tracking-[0.14em] text-slate-600 uppercase dark:text-slate-400">
                <span>Workspace preview</span>
                <span className="rounded-full border border-blue-200 bg-white/70 px-2.5 py-1 text-[9px] tracking-wider dark:border-blue-800 dark:bg-slate-900">
                    Ilustrasi alur pickup
                </span>
            </figcaption>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-blue-950/5 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                    <div aria-hidden="true" className="flex gap-1.5">
                        <span className="size-2 rounded-full bg-slate-200 dark:bg-slate-700" />
                        <span className="size-2 rounded-full bg-slate-200 dark:bg-slate-700" />
                        <span className="size-2 rounded-full bg-slate-200 dark:bg-slate-700" />
                    </div>
                    <span className="flex-1 text-center text-[10px] text-slate-500 dark:text-slate-400">
                        Retail Pickup / Overview
                    </span>
                    <PackageCheck className="size-3 text-primary" />
                </div>
                <div className="p-5 sm:p-6">
                    <div className="mb-5 flex items-start justify-between gap-3">
                        <div className="space-y-1">
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                WORKSPACE TIM
                            </p>
                            <p className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
                                Setiap pickup, terpantau.
                            </p>
                        </div>
                        <span
                            aria-hidden="true"
                            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary dark:bg-blue-950"
                        >
                            <ArrowUpRight className="size-4" />
                        </span>
                    </div>
                    <div className="mb-5 grid grid-cols-3 gap-2">
                        {[
                            {
                                icon: ClipboardList,
                                label: 'Penugasan',
                                value: 'Terjadwal',
                            },
                            {
                                icon: Truck,
                                label: 'Pickup',
                                value: 'Dalam proses',
                            },
                            {
                                icon: PackageCheck,
                                label: 'Serah terima',
                                value: 'Diterima',
                            },
                        ].map(({ icon: Icon, label, value }) => (
                            <div
                                key={label}
                                className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 sm:p-3 dark:border-slate-800 dark:bg-slate-800/60"
                            >
                                <Icon className="mb-3 size-4 text-primary" />
                                <p className="text-[9px] text-slate-500 sm:text-[10px] dark:text-slate-400">
                                    {label}
                                </p>
                                <p className="mt-1 text-[10px] leading-4 font-semibold text-slate-800 sm:text-xs dark:text-slate-200">
                                    {value}
                                </p>
                            </div>
                        ))}
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300">
                                PICKUP CUSTOMER
                            </span>
                            <span className="rounded-full bg-blue-100 px-2 py-1 text-[9px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                                Dalam proses
                            </span>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
                            Penjemputan paket retail
                        </p>
                        <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                            <MapPin className="size-3" />
                            Alamat & detail customer dalam satu tugas
                        </p>
                        <div
                            className="mt-5 flex items-center gap-2"
                            role="img"
                            aria-label="Progres pickup: sudah ditugaskan, sedang dijemput, menunggu serah terima"
                        >
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                                <Check className="size-3" />
                            </span>
                            <span className="h-px flex-1 bg-primary" />
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-[5px] border-blue-100 bg-primary dark:border-blue-900">
                                <span className="sr-only">Sedang dijemput</span>
                            </span>
                            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                                <PackageCheck className="size-3 text-slate-400" />
                            </span>
                        </div>
                        <div className="mt-2 flex justify-between text-[9px] text-slate-500 dark:text-slate-400">
                            <span>Ditugaskan</span>
                            <span className="text-blue-700 dark:text-blue-300">
                                Dijemput
                            </span>
                            <span>Serah terima</span>
                        </div>
                    </div>
                    {!compact && (
                        <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-3 dark:border-slate-800">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                                <Check className="size-4" />
                            </span>
                            <div className="flex-1">
                                <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                                    Tim selaras, proses jelas
                                </p>
                                <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                    Dari customer service hingga staf retail.
                                </p>
                            </div>
                            <ChevronRight className="size-4 shrink-0 text-slate-400" />
                        </div>
                    )}
                </div>
            </div>
        </figure>
    );
}

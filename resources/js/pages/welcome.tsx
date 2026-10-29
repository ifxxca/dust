import { Head, Link } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowRight,
    Check,
    ClipboardList,
    MapPin,
    PackageCheck,
    ShieldCheck,
    UsersRound,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import PickupPreview from '@/components/pickup-preview';
import { Button } from '@/components/ui/button';
import { home, login } from '@/routes';

const features = [
    {
        icon: UsersRound,
        number: '01',
        title: 'Customer lebih terorganisir',
        description:
            'Simpan data customer dan alamat penjemputan agar tim punya informasi yang sama.',
    },
    {
        icon: ClipboardList,
        number: '02',
        title: 'Pembagian tugas lebih jelas',
        description:
            'Buat task on-demand, atur jadwal, dan tentukan petugas yang bertanggung jawab.',
    },
    {
        icon: PackageCheck,
        number: '03',
        title: 'Proses tercatat sampai akhir',
        description:
            'Ikuti progres pickup, simpan bukti penjemputan, dan lanjutkan ke serah terima retail.',
    },
];

export default function Welcome() {
    return (
        <div className="min-h-screen bg-[#f8fafc] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
            <Head title="Retail Pickup — Operasional lebih terarah">
                <meta
                    name="description"
                    content="Kelola customer, jadwal pickup, penugasan petugas, dan serah terima retail dalam satu workspace operasional."
                />
            </Head>
            <a
                href="#main-content"
                className="sr-only fixed top-3 left-3 z-50 rounded-lg bg-primary px-4 py-3 text-white focus:not-sr-only"
            >
                Lewati ke konten
            </a>
            <header className="border-b border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-950">
                <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
                    <Link
                        href={home()}
                        aria-label="Retail Pickup — Beranda"
                        className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                    >
                        <AppLogo />
                    </Link>
                    <nav
                        aria-label="Navigasi utama"
                        className="flex items-center gap-8"
                    >
                        <a
                            href="#fitur"
                            className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-primary sm:block dark:text-slate-300"
                        >
                            Fitur
                        </a>
                        <a
                            href="#alur-kerja"
                            className="hidden text-sm font-medium text-slate-600 transition-colors hover:text-primary sm:block dark:text-slate-300"
                        >
                            Alur kerja
                        </a>
                        <Button
                            asChild
                            className="h-10 rounded-lg px-5 dark:bg-blue-600 dark:hover:bg-blue-700"
                        >
                            <Link href={login()}>
                                Masuk <ArrowRight className="size-4" />
                            </Link>
                        </Button>
                    </nav>
                </div>
            </header>
            <main id="main-content">
                <section className="relative overflow-hidden border-b border-slate-200/80 dark:border-slate-800">
                    <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:px-12 lg:py-24">
                        <div className="flex flex-col items-start gap-7">
                            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                <span className="size-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                                WORKSPACE OPERASIONAL RETAIL
                            </span>
                            <h1 className="max-w-xl text-5xl leading-[1.08] font-semibold tracking-[-0.045em] sm:text-6xl lg:text-[4.1rem]">
                                Pickup teratur.
                                <br />
                                Tim terhubung.
                                <br />
                                <span className="text-primary">
                                    Kerja lebih tenang.
                                </span>
                            </h1>
                            <p className="max-w-md text-base leading-7 text-slate-600 sm:text-lg sm:leading-8 dark:text-slate-400">
                                Dari permintaan customer hingga serah terima
                                paket. Kelola seluruh proses pickup dalam satu
                                workspace yang jelas dan terarah.
                            </p>
                            <div className="flex flex-wrap items-center gap-5">
                                <Button
                                    asChild
                                    size="lg"
                                    className="h-12 rounded-xl px-6 shadow-lg shadow-blue-600/15 dark:bg-blue-600 dark:hover:bg-blue-700"
                                >
                                    <Link href={login()}>
                                        Masuk ke workspace{' '}
                                        <ArrowRight className="size-4" />
                                    </Link>
                                </Button>
                                <a
                                    href="#alur-kerja"
                                    className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-600 hover:text-primary dark:text-slate-300"
                                >
                                    Lihat alur kerja{' '}
                                    <ArrowDown className="size-4" />
                                </a>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                <ShieldCheck className="size-4 shrink-0 text-primary" />
                                Khusus tim operasional. Akun disediakan oleh
                                Admin.
                            </div>
                        </div>
                        <div className="min-w-0">
                            <PickupPreview />
                        </div>
                    </div>
                    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 pb-8 text-sm text-slate-500 sm:px-8 lg:px-12 dark:text-slate-400">
                        <span className="text-xs font-medium tracking-widest uppercase">
                            Satu alur. Seluruh tim.
                        </span>
                        <div className="flex flex-wrap gap-x-6 gap-y-3 sm:gap-x-8">
                            {[
                                'Customer Service',
                                'Petugas Pickup',
                                'Staf Retail',
                                'Supervisor',
                            ].map((role) => (
                                <span
                                    key={role}
                                    className="inline-flex items-center gap-2"
                                >
                                    <Check className="size-3.5 text-primary" />
                                    {role}
                                </span>
                            ))}
                        </div>
                    </div>
                </section>
                <section
                    id="fitur"
                    className="scroll-mt-8 bg-white px-5 py-16 sm:px-8 sm:py-20 lg:px-12 dark:bg-slate-950"
                >
                    <div className="mx-auto max-w-6xl">
                        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                            <div className="space-y-3">
                                <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                                    Lebih rapi, dari awal
                                </p>
                                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                                    Semua yang tim butuhkan.
                                    <br />
                                    Dalam satu tempat.
                                </h2>
                            </div>
                            <p className="max-w-sm text-sm leading-7 text-slate-500 dark:text-slate-400">
                                Informasi yang terpusat membantu setiap peran
                                melanjutkan pekerjaan dengan konteks yang tepat.
                            </p>
                        </div>
                        <div className="mt-10 grid gap-5 md:grid-cols-3">
                            {features.map(
                                ({
                                    icon: Icon,
                                    number,
                                    title,
                                    description,
                                }) => (
                                    <article
                                        key={number}
                                        className="rounded-2xl border border-slate-200 bg-slate-50/70 p-7 dark:border-slate-800 dark:bg-slate-900/60"
                                    >
                                        <div className="mb-8 flex items-center justify-between">
                                            <span className="flex size-11 items-center justify-center rounded-xl border border-blue-100 bg-white text-primary dark:border-slate-700 dark:bg-slate-800">
                                                <Icon className="size-5" />
                                            </span>
                                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                                                /{number}
                                            </span>
                                        </div>
                                        <h3 className="mb-3 text-lg font-semibold tracking-tight">
                                            {title}
                                        </h3>
                                        <p className="text-sm leading-7 text-slate-500 dark:text-slate-400">
                                            {description}
                                        </p>
                                    </article>
                                ),
                            )}
                        </div>
                    </div>
                </section>
                <section
                    id="alur-kerja"
                    className="scroll-mt-8 border-y border-slate-200 px-5 py-16 sm:px-8 sm:py-20 lg:px-12 dark:border-slate-800"
                >
                    <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.85fr_1.5fr] lg:gap-20">
                        <div className="space-y-4">
                            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                                Alur kerja
                            </p>
                            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                                Dari permintaan
                                <br />
                                ke penyelesaian.
                            </h2>
                            <p className="max-w-sm text-sm leading-7 text-slate-500 dark:text-slate-400">
                                Setiap langkah punya penanggung jawab. Setiap
                                progres punya catatan.
                            </p>
                        </div>
                        <ol className="grid gap-7">
                            {[
                                {
                                    icon: ClipboardList,
                                    title: 'Buat & atur penugasan',
                                    description:
                                        'Catat permintaan pickup, pilih customer, lalu jadwalkan dan tugaskan petugas.',
                                },
                                {
                                    icon: MapPin,
                                    title: 'Jalankan penjemputan',
                                    description:
                                        'Petugas membuka tugas, mencatat paket, dan melengkapi bukti pickup di lapangan.',
                                },
                                {
                                    icon: PackageCheck,
                                    title: 'Selesaikan serah terima',
                                    description:
                                        'Serahkan paket ke retail untuk diverifikasi dan ditindaklanjuti oleh tim.',
                                },
                            ].map(
                                ({ icon: Icon, title, description }, index) => (
                                    <li key={title} className="flex gap-5">
                                        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-primary dark:border-slate-700 dark:bg-slate-900">
                                            <Icon className="size-5" />
                                        </span>
                                        <div className="space-y-2 pt-0.5">
                                            <h3 className="text-base font-semibold">
                                                <span className="mr-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                                                    0{index + 1}
                                                </span>
                                                {title}
                                            </h3>
                                            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                                                {description}
                                            </p>
                                        </div>
                                    </li>
                                ),
                            )}
                        </ol>
                    </div>
                </section>
                <section className="bg-white px-5 py-12 sm:px-8 lg:px-12 dark:bg-slate-950">
                    <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-2xl bg-slate-900 p-8 text-white sm:p-10 md:flex-row md:items-center dark:bg-slate-800">
                        <div className="space-y-2">
                            <h2 className="text-2xl font-semibold tracking-tight">
                                Siap untuk pickup berikutnya?
                            </h2>
                            <p className="text-sm leading-6 text-slate-300">
                                Masuk dengan akun Anda dan lanjutkan pekerjaan
                                hari ini.
                            </p>
                        </div>
                        <Button
                            asChild
                            size="lg"
                            className="h-12 shrink-0 rounded-xl bg-white px-6 text-slate-900 hover:bg-blue-50"
                        >
                            <Link href={login()}>
                                Buka workspace <ArrowRight className="size-4" />
                            </Link>
                        </Button>
                    </div>
                </section>
            </main>
            <footer className="bg-white px-5 pb-8 sm:px-8 lg:px-12 dark:bg-slate-950">
                <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row dark:border-slate-800 dark:text-slate-400">
                    <span>Retail Pickup · Workspace Operasional</span>
                    <span>Menghubungkan tim, merapikan setiap pickup.</span>
                </div>
            </footer>
        </div>
    );
}

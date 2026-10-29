import { Head, Link } from '@inertiajs/react';
import { Home, LayoutDashboard, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dashboard, home } from '@/routes';

export default function NotFound() {
    return (
        <main
            id="main-content"
            className="grid min-h-svh place-items-center bg-background px-4 py-12 text-foreground"
        >
            <section
                aria-labelledby="not-found-title"
                className="flex w-full max-w-lg flex-col items-start gap-5 rounded-xl border bg-card p-6 shadow-sm sm:p-8"
            >
                <SearchX aria-hidden="true" className="size-10 text-primary" />
                <p className="text-sm font-medium text-muted-foreground">
                    Error 404
                </p>
                <h1
                    id="not-found-title"
                    className="text-2xl font-semibold tracking-tight"
                >
                    Halaman tidak ditemukan
                </h1>
                <p className="text-sm leading-6 text-muted-foreground">
                    Tautan mungkin sudah berubah atau alamat halaman tidak
                    tepat. Kembali ke dashboard untuk melanjutkan pekerjaan.
                </p>
                <div className="flex flex-wrap gap-3">
                    <Button asChild>
                        <Link href={dashboard()}>
                            <LayoutDashboard aria-hidden="true" />
                            Kembali ke dashboard
                        </Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href={home()}>
                            <Home aria-hidden="true" />
                            Halaman utama
                        </Link>
                    </Button>
                </div>
            </section>
            <Head title="Halaman tidak ditemukan" />
        </main>
    );
}

import { Head, Link } from '@inertiajs/react';
import { login } from '@/routes';
import { Button } from '@/components/ui/button';
export default function Welcome() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
            <Head title="Retail Pickup" />
            <div className="max-w-lg space-y-5">
                <p className="text-sm font-medium text-muted-foreground">
                    OPERASIONAL RETAIL
                </p>
                <h1 className="text-4xl font-semibold tracking-tight">
                    Retail Pickup Management
                </h1>
                <p className="text-muted-foreground">
                    Customer, task on-demand, assignment, dan workspace petugas
                    dalam satu aplikasi.
                </p>
                <Button asChild>
                    <Link href={login()}>Masuk</Link>
                </Button>
                <p className="text-sm text-muted-foreground">
                    Akun dibuat oleh Admin. Tidak ada registrasi publik.
                </p>
            </div>
        </main>
    );
}

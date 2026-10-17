import { Head, Link } from '@inertiajs/react';
import { login } from '@/routes';
export default function RegistrationDisabled() {
    return (
        <>
            <Head title="Registrasi tidak tersedia" />
            <p>Akun operasional dibuat oleh Admin.</p>
            <Link href={login()}>Kembali ke login</Link>
        </>
    );
}

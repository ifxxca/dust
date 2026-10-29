import { Form, Head } from '@inertiajs/react';
import { ArrowRight, CheckCircle2, Mail, ShieldCheck } from 'lucide-react';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { store } from '@/routes/login';
import { request } from '@/routes/password';

type Props = {
    status?: string;
    canResetPassword: boolean;
};

export default function Login({ status, canResetPassword }: Props) {
    return (
        <>
            <Head title="Masuk" />

            {status && (
                <div
                    role="status"
                    className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                >
                    <CheckCircle2 className="mt-1 size-4 shrink-0" />
                    {status}
                </div>
            )}

            <Form
                {...store.form()}
                resetOnSuccess={['password']}
                className="flex flex-col gap-6"
            >
                {({ processing, errors }) => (
                    <>
                        <div className="grid gap-6">
                            <div className="grid gap-2">
                                <Label htmlFor="email">Alamat email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    name="email"
                                    required
                                    autoFocus
                                    autoComplete="email"
                                    placeholder="nama@perusahaan.com"
                                    className="h-12 rounded-lg bg-slate-50/60 px-4 dark:bg-slate-900"
                                    aria-invalid={Boolean(errors.email)}
                                    aria-describedby={
                                        errors.email ? 'email-error' : undefined
                                    }
                                />
                                <InputError
                                    id="email-error"
                                    role="alert"
                                    message={errors.email}
                                />
                            </div>

                            <div className="grid gap-2">
                                <div className="flex items-center">
                                    <Label htmlFor="password">Kata sandi</Label>
                                    {canResetPassword && (
                                        <TextLink
                                            href={request()}
                                            className="ml-auto text-sm"
                                        >
                                            Lupa kata sandi?
                                        </TextLink>
                                    )}
                                </div>
                                <PasswordInput
                                    id="password"
                                    name="password"
                                    required
                                    autoComplete="current-password"
                                    placeholder="Masukkan kata sandi Anda"
                                    className="h-12 rounded-lg bg-slate-50/60 pl-4 dark:bg-slate-900"
                                    aria-invalid={Boolean(errors.password)}
                                    aria-describedby={
                                        errors.password
                                            ? 'password-error'
                                            : undefined
                                    }
                                />
                                <InputError
                                    id="password-error"
                                    role="alert"
                                    message={errors.password}
                                />
                            </div>

                            <div className="flex min-h-6 items-center gap-3">
                                <Checkbox id="remember" name="remember" />
                                <Label
                                    htmlFor="remember"
                                    className="font-normal text-slate-600 dark:text-slate-300"
                                >
                                    Ingat saya di perangkat ini
                                </Label>
                            </div>

                            <Button
                                type="submit"
                                className="h-12 w-full rounded-lg shadow-lg shadow-blue-600/10 dark:bg-blue-600 dark:hover:bg-blue-700"
                                disabled={processing}
                                data-test="login-button"
                            >
                                {processing && <Spinner />}
                                {processing
                                    ? 'Sedang masuk...'
                                    : 'Masuk ke workspace'}
                                {!processing && (
                                    <ArrowRight className="size-4" />
                                )}
                            </Button>
                        </div>

                        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                            <Mail className="mt-0.5 size-4 shrink-0 text-slate-500 dark:text-slate-400" />
                            <div className="space-y-1">
                                <p className="text-xs font-medium">
                                    Belum memiliki akses?
                                </p>
                                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                                    Hubungi Admin retail untuk mendapatkan akun
                                    atau bantuan akses workspace.
                                </p>
                            </div>
                        </div>
                        <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <ShieldCheck className="size-3.5" />
                            Gunakan akun dan perangkat kerja Anda.
                        </p>
                    </>
                )}
            </Form>
        </>
    );
}

Login.layout = {
    title: 'Selamat datang kembali.',
    description:
        'Masuk ke Retail Pickup untuk melanjutkan pekerjaan Anda hari ini.',
};

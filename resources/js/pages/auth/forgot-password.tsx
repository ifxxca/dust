// Components
import { Form, Head } from '@inertiajs/react';
import { useRef } from 'react';
import { LoaderCircle } from 'lucide-react';
import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { login } from '@/routes';
import { email } from '@/routes/password';

export default function ForgotPassword({ status }: { status?: string }) {
    const emailInput = useRef<HTMLInputElement>(null);
    return (
        <>
            <Head title="Lupa kata sandi" />

            {status && (
                <div
                    role="status"
                    className="mb-4 text-center text-sm font-medium text-green-600"
                >
                    {status}
                </div>
            )}

            <div className="space-y-6">
                <Form
                    {...email.form()}
                    onError={() => emailInput.current?.focus()}
                >
                    {({ processing, errors }) => (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="email">Alamat email</Label>
                                <Input
                                    id="email"
                                    ref={emailInput}
                                    type="email"
                                    name="email"
                                    autoComplete="email"
                                    aria-invalid={!!errors.email}
                                    aria-describedby={
                                        errors.email ? 'email-error' : undefined
                                    }
                                    placeholder="email@example.com"
                                />

                                <InputError
                                    id="email-error"
                                    message={errors.email}
                                />
                            </div>

                            <div className="my-6 flex items-center justify-start">
                                <Button
                                    className="w-full"
                                    disabled={processing}
                                    data-test="email-password-reset-link-button"
                                >
                                    {processing && (
                                        <LoaderCircle className="h-4 w-4 animate-spin" />
                                    )}
                                    Kirim tautan atur ulang
                                </Button>
                            </div>
                        </>
                    )}
                </Form>

                <div className="space-x-1 text-center text-sm text-muted-foreground">
                    <span>Atau, kembali ke</span>
                    <TextLink href={login()}>halaman masuk</TextLink>
                </div>
            </div>
        </>
    );
}

ForgotPassword.layout = {
    title: 'Lupa kata sandi',
    description: 'Masukkan email untuk menerima tautan atur ulang kata sandi',
};

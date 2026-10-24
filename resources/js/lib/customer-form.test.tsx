import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import CustomerForm from '../components/customer-form';

vi.mock('@inertiajs/react', () => ({
    useHttp: (data: Record<string, unknown>) => ({
        data,
        errors: {
            name: 'Nama wajib diisi.',
            pickup_address: 'Alamat wajib diisi.',
            latitude: 'Koordinat tidak valid.',
            contact: 'Isi salah satu kontak.',
            is_active: 'Status tidak valid.',
        },
        hasErrors: true,
        isDirty: false,
        processing: false,
        setData: vi.fn(),
    }),
}));

test('customer validation messages are associated with their invalid inputs including expanded contact', () => {
    const html = renderToStaticMarkup(<CustomerForm onSaved={vi.fn()} />);

    for (const field of [
        'name',
        'pickup_address',
        'latitude',
        'contact',
        'is_active',
    ]) {
        expect(html).toContain(`aria-describedby="customer-${field}-error"`);
        expect(html).toContain(`id="customer-${field}-error"`);
    }
    expect(html).toContain('Isi salah satu kontak.');
    expect(html).toContain('aria-invalid="true"');
});

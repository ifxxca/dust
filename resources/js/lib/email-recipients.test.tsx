import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { EmailRecipientsInput } from '@/components/email-recipients-input';
import { ReceiptRecipientStatus } from '@/components/receipt-recipient-status';

test('email editor stops adding at the configured limit and exposes removal controls', () => {
    const html = renderToStaticMarkup(
        <EmailRecipientsInput
            id="customer-email"
            value={[
                'one@example.test',
                'two@example.test',
                'three@example.test',
                'four@example.test',
                'five@example.test',
            ]}
            onChange={vi.fn()}
            limit={5}
        />,
    );
    expect(html).not.toContain('Tambah email');
    expect(html).toContain('(5/5)');
    expect(html).toContain('aria-label="Hapus email 5"');
});

test('invalid email feedback is associated with the correct recipient and supports a smaller limit', () => {
    const html = renderToStaticMarkup(
        <EmailRecipientsInput
            id="recipients"
            value={['one@example.test', 'invalid']}
            onChange={vi.fn()}
            limit={3}
            errors={{ 1: 'Alamat email tidak valid.' }}
        />,
    );
    expect(html).toContain('Tambah email');
    expect(html).toContain('aria-describedby="recipients-1-error"');
    expect(html).toContain('id="recipients-1-error"');
    expect(html).toContain('Alamat email tidak valid.');
});

test('recipient delivery status separates accepted failed and uncertain outcomes', () => {
    const html = renderToStaticMarkup(
        <ReceiptRecipientStatus
            recipients={{
                'one@example.test': { status: 'ACCEPTED_BY_PROVIDER' },
                'two@example.test': {
                    status: 'FAILED',
                    last_error: 'Server menolak alamat.',
                },
                'three@example.test': { status: 'UNKNOWN' },
            }}
        />,
    );
    expect(html).toContain('Diterima server email');
    expect(html).toContain('Gagal');
    expect(html).toContain('Perlu diperiksa');
    expect(html).toContain('Server menolak alamat.');
    expect(html).not.toContain('ACCEPTED_BY_PROVIDER');
});

test('empty recipient status does not create a redundant panel', () => {
    expect(
        renderToStaticMarkup(<ReceiptRecipientStatus recipients={null} />),
    ).toBe('');
});

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import {
    CustomerDocumentDelivery,
    defaultDocumentDelivery,
} from '../components/document-delivery';

vi.mock('@inertiajs/react', () => ({
    useHttp: () => ({ processing: false }),
}));

test('customer can independently choose four document channels without a WhatsApp target until selected', () => {
    const html = renderToStaticMarkup(
        <CustomerDocumentDelivery
            value={defaultDocumentDelivery}
            disabled={false}
            errors={{}}
            onChange={vi.fn()}
        />,
    );
    expect(html.match(/type="checkbox"/g)).toHaveLength(4);
    expect(html).toContain('Bukti pickup melalui email');
    expect(html).toContain('Rekap resi melalui WhatsApp');
    expect(html).not.toContain('Nomor WhatsApp');
});

test('contact validation is associated with its focusable phone control', () => {
    const html = renderToStaticMarkup(
        <CustomerDocumentDelivery
            value={{
                ...defaultDocumentDelivery,
                receipt_whatsapp: true,
                whatsapp_target: '628123456789@c.us',
            }}
            disabled={false}
            errors={{
                'document_delivery_settings.whatsapp_target':
                    'Nomor tidak valid.',
            }}
            onChange={vi.fn()}
        />,
    );
    expect(html).toContain('value="628123456789"');
    expect(html).toContain('aria-describedby="customer-wa-target-error"');
    expect(html).toContain('id="customer-wa-target-error"');
    expect(html).toContain('aria-invalid="true"');
});

test('group selection uses loaded groups and does not offer free-text chat identifiers', () => {
    const html = renderToStaticMarkup(
        <CustomerDocumentDelivery
            value={{
                ...defaultDocumentDelivery,
                recap_whatsapp: true,
                whatsapp_type: 'group',
                whatsapp_target: '120363000000@g.us',
                whatsapp_label: 'Gudang Customer',
            }}
            disabled={false}
            errors={{}}
            onChange={vi.fn()}
        />,
    );
    expect(html).toContain('Gudang Customer');
    expect(html).toContain('Muat / segarkan grup');
    expect(html).not.toContain('type="tel"');
});

test('WhatsApp consent remains explicit and its validation links to the checkbox', () => {
    const html = renderToStaticMarkup(
        <CustomerDocumentDelivery
            value={{ ...defaultDocumentDelivery, receipt_whatsapp: true }}
            disabled={false}
            errors={{
                'document_delivery_settings.whatsapp_consent_confirmed':
                    'Persetujuan diperlukan.',
            }}
            onChange={vi.fn()}
        />,
    );
    expect(html).toContain('id="customer-wa-consent"');
    expect(html).toContain('aria-describedby="customer-wa-consent-error"');
    expect(html).toContain('id="customer-wa-consent-error"');
    expect(html.match(/Persetujuan diperlukan\./g)).toHaveLength(1);
    expect(html).toContain('Customer atau pengelola grup telah menyetujui');
});

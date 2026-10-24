import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import JneCustomerCandidates from '@/components/jne-customer-candidates';

test('sender suggestions show registered evidence without a confirmation action and escape names', () => {
    const html = renderToStaticMarkup(
        <JneCustomerCandidates
            candidates={[
                {
                    customer_id: 1,
                    customer_code: '4000',
                    customer_name: 'Vanny Songket',
                    registered_name: '<script>Vanny Songket</script>',
                    distance: 1,
                },
            ]}
        />,
    );
    expect(html).toContain('4000');
    expect(html).toContain(
        'Kemiripan nama belum menetapkan pemilik atau pickup.',
    );
    expect(html).toContain('&lt;script&gt;Vanny Songket&lt;/script&gt;');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<script>');
});

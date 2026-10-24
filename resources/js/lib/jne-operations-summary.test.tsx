import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import JneOperationsSummary from '@/components/jne-operations-summary';

test('operational evidence distinguishes report rows confidence and global follow-up without inventing category totals', () => {
    const html = renderToStaticMarkup(
        <JneOperationsSummary
            data={{
                source_observations: 103,
                pickup_conflicts: 2,
                category_confirmed: null,
                unclassified: null,
                last_report_received_at: null,
                global_collection_failures: 3,
                global_sertim_awaiting_source: 4,
                gates: { categories: false },
            }}
        />,
    );
    expect(html).toContain('103 baris report');
    expect(html).toContain('Klasifikasi belum diaktifkan');
    expect(html).toContain('Seluruh operasi Admin');
    expect(html).toContain('3 kegagalan report belum ditinjau');
    expect(html).toContain('4 AWB Sertim menunggu sumber');
    expect(html).toContain('Nonaktif; siapkan dan validasi pada UAT');
});

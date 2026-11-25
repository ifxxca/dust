import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CashlessScanProgress } from '@/types/cashless-handover';
import {
    CashlessScanHistory,
    CashlessScanSummary,
    newScanMilestones,
} from './cashless-scan-progress';

const progress: CashlessScanProgress = {
    registered_awbs: ['TG1234567890'],
    summary: {
        total: 3,
        success: 1,
        pending: 1,
        retrying: 0,
        failed: 1,
        attention: 0,
    },
    confirmed_ids: [1],
    failed_attempts: ['3:4:failed'],
    recent: [],
};

test('only new backend milestones trigger feedback and repeated polling does not replay it', () => {
    expect(newScanMilestones(progress, { success: [], failure: [] })).toEqual({
        success: [1],
        failure: ['3:4:failed'],
    });
    expect(
        newScanMilestones(progress, { success: [1], failure: ['3:4:failed'] }),
    ).toEqual({ success: [], failure: [] });
    expect(
        newScanMilestones(
            { ...progress, failed_attempts: ['3:5:failed'] },
            { success: [1], failure: ['3:4:failed'] },
        ),
    ).toEqual({ success: [], failure: ['3:5:failed'] });
});

test('local drafts and uncertain submissions never inflate backend success counters', () => {
    const html = renderToStaticMarkup(
        <CashlessScanSummary
            progress={progress}
            draftCount={7}
            pending
            counts={{ total: 9, duplicate: 1, invalid: 1 }}
        />,
    );
    expect(html).toContain('Konfirmasi pengiriman tertunda');
    expect(html).toMatch(/<dt>Berhasil<\/dt><dd>1<\/dd>/);
    expect(html).toContain('Duplikat: 1');
    expect(html).toContain('Gagal: 1');
    expect(html).not.toMatch(/<dt>Berhasil<\/dt><dd>8<\/dd>/);
    const unavailable = renderToStaticMarkup(
        <CashlessScanSummary progress={null} draftCount={7} />,
    );
    expect(unavailable).toContain('Status server belum tersedia.');
    expect(unavailable).not.toContain('<dt>Berhasil</dt>');
});

test('preexisting permanent failures remain actionable without replaying their sound', () => {
    const html = renderToStaticMarkup(
        <CashlessScanHistory
            progress={progress}
            notice=""
            error=""
            tone="success"
        />,
    );
    expect(html).toContain('1 resi perlu tindakan');
    expect(html).toContain('Periksa riwayat resi');
    expect(html).toContain('tidak dijadwalkan');
});

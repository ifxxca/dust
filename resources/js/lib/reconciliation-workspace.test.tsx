import { HttpResponseError } from '@inertiajs/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { workspaceError } from '@/components/reconciliation-investigation';
import {
    WorkspaceSummary,
    WorkspaceBucketSummary,
} from '@/components/reconciliation-workspace';
import {
    AllocationStatus,
    AllocationSummary,
    AllocationCards,
} from '@/components/pickup-automation-monitoring';

const response = (data: string) =>
    new HttpResponseError('Request failed', {
        data,
        status: 409,
        headers: {},
    });

test('an explained closed reconciliation is clearly completed while its physical shortfall remains recorded', () => {
    const markup = renderToStaticMarkup(
        <AllocationStatus
            row={{
                automation_status: 'DONE',
                finalization_status: 'LOCKED',
                closure_mode: 'EXCEPTION',
                quantity_status: 'SHORTAGE',
            }}
        />,
    );
    expect(markup).toContain('Selesai dengan selisih');
    expect(markup).not.toContain('Belum difinalisasi');
});

test('open books show a deadline and flag overdue retail closure', () => {
    const row = {
        automation_status: 'PARTIAL',
        finalization_status: 'PENDING',
        quantity_status: 'SHORTAGE',
        closure_due_at: '2026-11-20T20:00:00Z',
    };
    expect(renderToStaticMarkup(<AllocationStatus row={row} />)).toContain(
        'Tutup sebelum',
    );
    expect(
        renderToStaticMarkup(
            <AllocationStatus row={{ ...row, closure_overdue: true }} />,
        ),
    ).toContain('Lewat tenggat');
});

test('server JSON text preserves the actionable conflict reason', () => {
    expect(
        workspaceError(
            response(
                JSON.stringify({
                    message: 'Bukti berubah. Muat ulang preview.',
                }),
            ),
        ),
    ).toBe('Bukti berubah. Muat ulang preview.');
});
test('validation objects expose field errors instead of a generic failure', () => {
    expect(
        workspaceError(
            response(
                JSON.stringify({
                    message: 'Invalid',
                    errors: {
                        reason: ['Alasan wajib diisi.'],
                        items: ['Pilihan berubah.'],
                    },
                }),
            ),
        ),
    ).toBe('Alasan wajib diisi. Pilihan berubah.');
});
test('unreadable and network responses offer recovery without exposing HTML', () => {
    expect(workspaceError(response('<html>internal page</html>'))).toContain(
        'coba lagi',
    );
    expect(workspaceError(new Error('Network disconnected'))).toContain(
        'Muat ulang',
    );
});
test('summary distinguishes unknown quantities from established zero', () => {
    const html = renderToStaticMarkup(
        <WorkspaceSummary
            workspace={{
                metrics: {
                    expected: null,
                    observed: null,
                    matched: 0,
                    missing: null,
                    excess: 0,
                },
            }}
        />,
    );
    expect(html).toMatch(/Target gudang<\/dt><dd[^>]*>—<\/dd>/);
    expect(html).toMatch(/Cocok<\/dt><dd[^>]*>0<\/dd>/);
});

const bucketCategory = (
    expected: number | null,
    confirmed: number,
    observed = confirmed,
) => ({
    pop: expected,
    received: expected,
    expected,
    confirmed,
    observed,
    shortfall: expected == null ? null : Math.max(0, expected - confirmed),
    excess: expected == null ? null : Math.max(0, confirmed - expected),
    status: 'MATCHED',
});

test('bucket totals distinguish category shortages, excess and unknown targets', () => {
    const html = renderToStaticMarkup(
        <WorkspaceBucketSummary
            workspace={{
                approval: null,
                categories: {
                    manual_hybrid: bucketCategory(5, 4),
                    cashless_hybrid: bucketCategory(2, 3),
                    css_orion: bucketCategory(null, 0),
                },
            }}
        />,
    );
    expect(html).toContain('4/5');
    expect(html).toContain('Kurang 1');
    expect(html).toContain('3/2');
    expect(html).toContain('Lebih 1');
    expect(html).toContain('Target belum tersedia');
});

test('locked bucket totals use the immutable snapshot when late evidence changes live counts', () => {
    const html = renderToStaticMarkup(
        <WorkspaceBucketSummary
            workspace={{
                approval: {
                    categories: { manual_hybrid: bucketCategory(5, 5) },
                    reviewer: { id: null, name: 'Sistem' },
                    locked_at: '2026-11-02T12:00:00Z',
                    reason: 'Seluruh kategori cocok',
                    version: 1,
                    fingerprint: 'snapshot-v1',
                    included_count: 5,
                },
                categories: { manual_hybrid: bucketCategory(5, 6) },
            }}
        />,
    );
    expect(html).toContain('5/5');
    expect(html).not.toContain('6/5');
    expect(html).not.toContain('Lebih 1');
});

test('an equal raw count with unresolved attribution is not presented as matched', () => {
    const html = renderToStaticMarkup(
        <WorkspaceBucketSummary
            workspace={{
                approval: null,
                categories: {
                    manual_hybrid: bucketCategory(5, 4, 5),
                },
            }}
        />,
    );
    expect(html).toContain('5/5');
    expect(html).toContain('Periksa pencocokan');
    expect(html).not.toContain('Cocok');
});

test('stale and unverified quantities do not claim that a bucket matches', () => {
    const html = renderToStaticMarkup(
        <WorkspaceBucketSummary
            workspace={{
                approval: null,
                categories: {
                    manual_hybrid: {
                        ...bucketCategory(5, 5),
                        status: 'NOT_EVALUATED',
                    },
                    cashless_hybrid: {
                        ...bucketCategory(0, 0),
                        status: 'UNKNOWN',
                    },
                },
            }}
        />,
    );
    expect(html).toContain('Perlu hitung ulang');
    expect(html).toContain('Belum diverifikasi');
    expect(html).not.toContain('Cocok');
});

test('matched quantities remain visually distinct from an immutable finalization', () => {
    const pending = renderToStaticMarkup(
        <AllocationStatus
            row={{
                quantity_status: 'MATCHED',
                finalization_status: 'PENDING',
                automation_status: 'WAITING_DATA',
            }}
        />,
    );
    expect(pending).toContain('Cocok');
    expect(pending).toContain('Finalisasi: menunggu sumber');
    expect(pending).not.toContain('Final: terkunci');
    const locked = renderToStaticMarkup(
        <AllocationStatus
            row={{
                quantity_status: 'MATCHED',
                finalization_status: 'LOCKED',
                automation_status: 'DONE',
            }}
        />,
    );
    expect(locked).toContain('Final: terkunci');
});

test('global pool and filtered book counts retain their separate scopes', () => {
    const html = renderToStaticMarkup(
        <AllocationSummary
            data={{
                pool_summary: {
                    total: 1000,
                    allocated: 930,
                    unassigned: 70,
                    date_from: '2026-10-26',
                    date_to: '2026-10-26',
                    category: null,
                },
                allocation_summary: {
                    total: 1,
                    pickup_books: 2,
                    matched: 1,
                    shortage: 0,
                    excess: 0,
                    conflict: 0,
                },
            }}
        />,
    );
    expect(html).toContain('Pool global');
    expect(html).toContain('lintas customer');
    expect(html).toContain('sesuai filter tabel');
    expect(html).toContain('1.000');
    expect(html).toContain('930');
    expect(html).toContain('70');
});

test('category labels expose simultaneous shortages and excess even when the total balances', () => {
    const count = (expected: number, confirmed: number) => ({
        pop: expected,
        received: expected,
        expected,
        confirmed,
        shortfall: Math.max(0, expected - confirmed),
        excess: Math.max(0, confirmed - expected),
    });
    const row = {
        quantity_status: 'CONFLICT',
        finalization_status: 'PENDING',
        automation_status: 'REVIEW',
        categories: {
            manual_hybrid: count(4, 2),
            cashless_hybrid: count(2, 3),
            css_orion: count(1, 2),
        },
    };
    const html = renderToStaticMarkup(<AllocationStatus row={row} />);
    expect(html).toContain('Manual kurang 2');
    expect(html).toContain('Cashless lebih 1');
    expect(html).toContain('CSS/Orion lebih 1');
    expect(html).not.toContain('Final: terkunci');
    const stale = renderToStaticMarkup(
        <AllocationStatus row={{ ...row, dirty: true }} />,
    );
    expect(stale).toContain('Menunggu pemeriksaan');
    expect(stale).not.toContain('kurang 2');
});

test('summary cards distinguish missing data from zero and never divide by zero', () => {
    const unavailable = renderToStaticMarkup(<AllocationCards data={{}} />);
    expect(unavailable.match(/>—<\/p>/g)).toHaveLength(5);
    const empty = renderToStaticMarkup(
        <AllocationCards
            data={{
                pool_summary: {
                    total: 0,
                    allocated: 0,
                    unassigned: 0,
                    date_from: '2026-11-14',
                    date_to: '2026-11-14',
                    category: null,
                },
            }}
        />,
    );
    expect(empty).not.toMatch(/NaN|Infinity/);
    expect(empty).toContain('lintas customer');
});

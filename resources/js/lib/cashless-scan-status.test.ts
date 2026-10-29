import { expect, test } from 'vitest';
import { cashlessScanStatus } from './cashless-scan-status';
import type { ScannedCashlessEntry } from '@/types/cashless-handover';

const entry = (
    patch: Partial<ScannedCashlessEntry> = {},
): ScannedCashlessEntry => ({
    status: 'PENDING',
    message: null,
    updated_at: '2026-10-28T16:00:00Z',
    batch_id: 1,
    batch_status: 'QUEUED',
    ho_number: null,
    approved_at: null,
    batch_message: null,
    ...patch,
});

test('recorded scans without a job are distinct from queued and active processing', () => {
    expect(cashlessScanStatus(null).label).toBe('Tercatat');
    expect(cashlessScanStatus(entry()).label).toBe('Dalam antrean');
    expect(cashlessScanStatus(entry({ status: 'IN_FLIGHT' })).label).toBe(
        'Sedang diproses',
    );
});

test('an accepted scan is complete only after batch approval is proven', () => {
    expect(
        cashlessScanStatus(
            entry({
                status: 'ACCEPTED',
                batch_status: 'UNKNOWN',
                batch_message: 'Respons approve belum pasti',
            }),
        ),
    ).toMatchObject({
        label: 'Perlu diperiksa',
        complete: false,
        detail: 'Respons approve belum pasti',
    });
    expect(
        cashlessScanStatus(
            entry({ status: 'ACCEPTED', batch_status: 'APPROVING' }),
        ),
    ).toMatchObject({ label: 'Menunggu approve', complete: false });
    expect(
        cashlessScanStatus(entry({ status: 'ACCEPTED', batch_status: 'DONE' }))
            .complete,
    ).toBe(false);
    for (const batch_status of ['DONE', 'PARTIAL']) {
        expect(
            cashlessScanStatus(
                entry({
                    status: 'ACCEPTED',
                    batch_status,
                    approved_at: '2026-10-28T16:10:00Z',
                }),
            ),
        ).toMatchObject({ label: 'Selesai', complete: true });
    }
});

test('failed items show their reason and pending items in stopped batches require attention', () => {
    expect(
        cashlessScanStatus(
            entry({ status: 'NOT_FOUND', message: 'Connote tidak ditemukan' }),
        ),
    ).toMatchObject({
        label: 'Resi tidak ditemukan',
        detail: 'Connote tidak ditemukan',
        variant: 'destructive',
    });
    expect(
        cashlessScanStatus(
            entry({
                batch_status: 'FAILED',
                batch_message: 'Login server gagal',
            }),
        ),
    ).toMatchObject({ label: 'Perlu diperiksa', detail: 'Login server gagal' });
    expect(
        cashlessScanStatus(entry({ status: 'PREVIOUSLY_ENTERED' })).label,
    ).toBe('Sudah pernah diproses');
    expect(cashlessScanStatus(entry({ status: 'UNRECOGNIZED' })).label).toBe(
        'Perlu diperiksa',
    );
});

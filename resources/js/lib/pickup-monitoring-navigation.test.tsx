import { expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    monitoringBackUrl,
    processingDetailUrl,
    quickPickupId,
} from './pickup-monitoring-navigation';
import { ProcessingDrawerState } from '../components/pickup-processing-drawer';

vi.mock('@inertiajs/react', () => ({ Link: () => null }));
test('full detail links retain filtered monitoring and drawer context', () => {
    const context =
        '/hasil-pickup?monitoring=processing&date_from=2026-10-18&date_to=2026-10-18&q=Toko&page=3&quick_pickup=9';
    const detail = processingDetailUrl(9, context, true);
    expect(detail).toContain('/hasil-pickup/9?');
    expect(
        new URL(detail, 'http://local').searchParams.get('record_processing'),
    ).toBe('1');
    expect(monitoringBackUrl(detail)).toBe(context);
    expect(quickPickupId(context)).toBe(9);
});
test('invalid drawer IDs and external return targets cannot create unsafe navigation', () => {
    for (const value of ['-1', 'abc', '0', '1.5', '999999999999999999999'])
        expect(quickPickupId(`/hasil-pickup?quick_pickup=${value}`)).toBeNull();
    for (const target of [
        'https://evil.test/hasil-pickup?token=secret',
        '//evil.test/path',
        '/operations/users',
        'javascript:alert(1)',
    ])
        expect(
            monitoringBackUrl(
                `/hasil-pickup/1?return_to=${encodeURIComponent(target)}`,
            ),
        ).toBe('/hasil-pickup?monitoring=processing');
});
test('drawer loading and retry states are accessible and do not claim successful data', () => {
    const loading = renderToStaticMarkup(
        <ProcessingDrawerState retry={() => {}} />,
    );
    expect(loading).toContain('role="status"');
    expect(loading).toContain('Memuat detail pickup');
    const error = renderToStaticMarkup(
        <ProcessingDrawerState
            error="Pickup tidak ditemukan atau tidak dapat diakses."
            retry={() => {}}
        />,
    );
    expect(error).toContain('role="alert"');
    expect(error).toContain('Coba lagi');
    expect(error).not.toContain('Berhasil');
});

import { show } from '@/routes/jne-monitoring';
import type { JneDetail } from '@/types/jne';

export async function loadJneShipmentDetail(
    id: number,
    version: string | null,
    signal: AbortSignal,
): Promise<JneDetail> {
    const response = await fetch(show.url(id), {
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
        headers: {
            Accept: 'application/json',
            'X-Inertia': 'true',
            ...(version ? { 'X-Inertia-Version': version } : {}),
            'X-Inertia-Partial-Component': 'jne-shipment',
            'X-Inertia-Partial-Data': 'shipment,history,timezone',
            'X-Requested-With': 'XMLHttpRequest',
        },
    });
    if (!response.ok) {
        throw new Error(
            response.status === 401 || response.status === 403
                ? 'Sesi atau izin akses tidak tersedia. Buka halaman AWB untuk melanjutkan.'
                : response.status === 404
                  ? 'AWB ini tidak ditemukan.'
                  : response.status === 409
                    ? 'Aplikasi telah diperbarui. Muat ulang halaman untuk melihat detail.'
                    : 'Detail belum dapat dimuat. Silakan coba lagi.',
        );
    }
    if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error(
            'Sesi tidak tersedia atau respons tidak sesuai. Buka halaman AWB untuk melanjutkan.',
        );
    }
    const page = await response.json().catch(() => {
        throw new Error(
            'Respons detail tidak dapat dibaca. Silakan coba lagi.',
        );
    });
    if (
        page.component !== 'jne-shipment' ||
        page.props?.shipment?.id !== id ||
        !Array.isArray(page.props?.history?.data) ||
        typeof page.props?.timezone !== 'string'
    ) {
        throw new Error(
            'Detail yang diterima tidak sesuai dengan AWB yang dipilih.',
        );
    }
    return page.props as JneDetail;
}

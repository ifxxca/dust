import { usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { loadJneShipmentDetail } from '@/lib/jne-shipment-detail';
import type { JneDetail } from '@/types/jne';

export function useJneShipmentDetail(
    id: number | null,
    snapshot: string | null,
) {
    const { version } = usePage();
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<{
        key: string;
        detail?: JneDetail;
        error?: string;
    }>({ key: '' });
    const key = `${id}:${snapshot}:${attempt}`;

    useEffect(() => {
        if (id === null) return;
        const controller = new AbortController();
        let disposed = false;
        const timeout = setTimeout(() => controller.abort(), 30000);
        loadJneShipmentDetail(id, version, controller.signal)
            .then((detail) => {
                if (!disposed) setState({ key, detail });
            })
            .catch((error: unknown) => {
                if (!disposed)
                    setState({
                        key,
                        error: controller.signal.aborted
                            ? 'Permintaan detail melewati batas waktu. Silakan coba lagi.'
                            : error instanceof Error
                              ? error.message
                              : 'Detail belum dapat dimuat. Silakan coba lagi.',
                    });
            })
            .finally(() => clearTimeout(timeout));
        return () => {
            disposed = true;
            clearTimeout(timeout);
            controller.abort();
        };
    }, [id, key, version]);

    return {
        detail: state.key === key ? state.detail : undefined,
        error: state.key === key ? state.error : undefined,
        retry: () => setAttempt((value) => value + 1),
    };
}

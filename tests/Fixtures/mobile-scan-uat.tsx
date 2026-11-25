import { registerPlugin } from '@capacitor/core';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '../../resources/mobile/src/types';
import '../../resources/mobile/src/styles.css';

if (location.hostname !== '127.0.0.1')
    throw new Error('Fixture UAT hanya tersedia lokal.');
const origin = 'http://127.0.0.1:8000';
const session: Session = {
    token: 'fixture-only',
    environment: origin,
    user: {
        id: 17,
        name: 'Petugas UAT',
        role: 'pickup_staff',
        is_active: true,
    },
    timezone: 'Asia/Jakarta',
    expiresAt: '2099-01-01',
    locked: false,
};
const storageKey = (scope: { name: string }) => `scan-uat:${scope.name}`;
registerPlugin('MobileLocal', {
    web: async () => ({
        read: async (scope: { name: string }) => ({
            value: localStorage.getItem(storageKey(scope)),
        }),
        write: async (scope: { name: string; value: string }) =>
            localStorage.setItem(storageKey(scope), scope.value),
        remove: async (scope: { name: string }) =>
            localStorage.removeItem(storageKey(scope)),
    }),
});
const store = {
    awbs: [] as string[],
    state: 'pending',
    attempts: [] as Record<string, unknown>[],
    loseReply: false,
};
(window as unknown as { scanUat: typeof store }).scanUat = store;
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== origin) return realFetch(input, init);
    if (localStorage.getItem('scan-uat:offline') === 'true')
        throw new TypeError('Fixture: perangkat offline.');
    if (!url.pathname.startsWith('/api/mobile/v1/cashless-handover'))
        throw new Error('Permintaan fixture tidak dikenali.');
    if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        store.attempts.push(body);
        store.awbs = [...new Set([...store.awbs, ...body.awbs])];
        if (store.loseReply) {
            store.loseReply = false;
            throw new TypeError('Fixture: respons terputus setelah tersimpan.');
        }
        return Response.json({
            data: {
                pickup_task_id: 41,
                saved: body.awbs.length,
                stored_count: store.awbs.length,
            },
        });
    }
    const success = store.state === 'success' ? store.awbs.length : 0;
    const failed = store.state === 'failed' ? store.awbs.length : 0;
    const task = {
        id: 41,
        reference: 'UAT-041',
        customer: 'Buku Pickup UAT',
        scheduled_at: '2026-11-11T01:00:00Z',
        status: 'PICKED_UP',
        target: 500,
        saved_count: store.awbs.length,
        can_record: true,
    };
    return Response.json({
        tasks: { data: [task], current_page: 1, last_page: 1, total: 1 },
        selected: {
            ...task,
            awbs: {
                data: store.awbs.map((awb, index) => ({
                    id: index + 1,
                    awb,
                    created_at: task.scheduled_at,
                })),
                current_page: 1,
                last_page: 1,
                total: store.awbs.length,
            },
            entry_batches: [],
            entry_enabled: true,
            scan_progress: {
                registered_awbs: store.awbs,
                summary: {
                    total: store.awbs.length,
                    success,
                    failed,
                    pending: store.awbs.length - success - failed,
                    retrying: 0,
                    attention: 0,
                },
                confirmed_ids: success
                    ? store.awbs.map((_, index) => index + 1)
                    : [],
                failed_attempts: failed
                    ? store.awbs.map((_, index) => `${index + 1}:1:failed`)
                    : [],
                recent: store.awbs.map((awb, index) => ({
                    id: index + 1,
                    awb,
                    state: store.state,
                    status: success
                        ? 'ACCEPTED'
                        : failed
                          ? 'NOT_FOUND'
                          : 'PENDING',
                    batch_status: success
                        ? 'DONE'
                        : failed
                          ? 'FAILED'
                          : 'QUEUED',
                    batch_id: 1,
                    message: failed
                        ? 'Resi tidak ditemukan pada server.'
                        : null,
                    attempts: 1,
                })),
            },
        },
    });
};
const { default: CashlessHandoverPanel } =
    await import('../../resources/mobile/src/cashless-handover-panel');
const { default: ScannerFeedbackSettings } =
    await import('../../resources/mobile/src/scanner-feedback-settings');
function Harness() {
    const [online, setOnline] = useState(
        () => localStorage.getItem('scan-uat:offline') !== 'true',
    );
    return (
        <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-3 bg-background p-4 text-foreground">
            <h1 className="text-lg font-semibold">Pemindai Cashless</h1>
            <details>
                <summary>Kontrol simulasi UAT lokal</summary>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => {
                            localStorage.setItem(
                                'scan-uat:offline',
                                String(online),
                            );
                            setOnline(!online);
                        }}
                    >
                        {online ? 'Simulasikan offline' : 'Pulihkan jaringan'}
                    </button>
                    <button
                        onClick={() => {
                            store.state = 'success';
                        }}
                    >
                        Konfirmasi approval
                    </button>
                    <button
                        onClick={() => {
                            store.state = 'failed';
                        }}
                    >
                        Simulasikan gagal
                    </button>
                    <button
                        onClick={() => {
                            store.loseReply = true;
                        }}
                    >
                        Putus respons berikutnya
                    </button>
                </div>
            </details>
            <CashlessHandoverPanel
                session={session}
                online={online}
                onBusyChange={() => {}}
                onFocusChange={() => {}}
                onFailure={async () => {}}
                initialPickupId={41}
            />
            <ScannerFeedbackSettings />
        </main>
    );
}
createRoot(document.getElementById('root')!).render(<Harness />);

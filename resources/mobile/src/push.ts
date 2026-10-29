import { PushNotifications } from '@capacitor/push-notifications';
import type { PluginListenerHandle } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import { store } from '@/routes/mobile/push';
import { request } from './api';
import { installationId, pushConfigured } from './secure-session';
import type { Session } from './types';

export type AssignmentLink = {
    taskId: number;
    recipientId: number;
    eventId: number;
    batchId?: number;
};
export function registrationFailure(error: unknown): string {
    const value = typeof error === 'string' ? error : '';
    const codes = [
        'SERVICE_NOT_AVAILABLE',
        'FIS_AUTH_ERROR',
        'BAD_CONFIG',
        'AUTHENTICATION_FAILED',
        'TOO_MANY_REGISTRATIONS',
        'MISSING_INSTANCEID_SERVICE',
        'API_KEY_INVALID',
        'API_KEY_SERVICE_BLOCKED',
        'PERMISSION_DENIED',
    ];
    const code =
        codes.find((candidate) =>
            new RegExp(`\\b${candidate}\\b`).test(value),
        ) || 'UNKNOWN_FCM_ERROR';
    if (code === 'PERMISSION_DENIED')
        return 'Izin notifikasi belum diberikan. Aktifkan melalui pengaturan perangkat.';
    if (code === 'SERVICE_NOT_AVAILABLE' || code === 'UNKNOWN_FCM_ERROR')
        return 'Notifikasi belum aktif. Periksa koneksi internet dan Layanan Google Play, lalu coba lagi.';
    return 'Notifikasi belum tersedia pada perangkat ini. Hubungi Admin untuk bantuan.';
}
export function assignmentLink(data: unknown): AssignmentLink | null {
    if (!data || typeof data !== 'object') return null;
    const value = data as Record<string, unknown>;
    if (
        !['pickup_assigned', 'cashless_entry_attention'].includes(
            String(value.type),
        )
    )
        return null;
    const values = [
        value.task_id,
        value.recipient_id,
        value.event_id,
        ...(value.type === 'cashless_entry_attention' ? [value.batch_id] : []),
    ];
    if (
        values.some(
            (id) =>
                typeof id !== 'string' ||
                !/^[1-9]\d*$/.test(id) ||
                !Number.isSafeInteger(Number(id)),
        )
    )
        return null;
    return {
        taskId: Number(value.task_id),
        recipientId: Number(value.recipient_id),
        eventId: Number(value.event_id),
        ...(value.type === 'cashless_entry_attention'
            ? { batchId: Number(value.batch_id) }
            : {}),
    };
}

function isCurrentTest(data: unknown, session: Session | null): boolean {
    if (
        !data ||
        typeof data !== 'object' ||
        !session ||
        session.locked ||
        Date.parse(session.expiresAt) <= Date.now()
    )
        return false;
    const value = data as Record<string, unknown>;
    return (
        value.type === 'push_test' &&
        value.recipient_id === String(session.user.id) &&
        typeof value.test_id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            value.test_id,
        )
    );
}

export async function listenPush(
    current: () => { session: Session | null; signal: AbortSignal },
    tap: (link: AssignmentLink) => void,
    notice: (message: string) => void,
    received?: (link: AssignmentLink) => void,
    testReceived?: () => void,
): Promise<() => Promise<void>> {
    if (!Capacitor.isNativePlatform()) return async () => {};
    const handles: PluginListenerHandle[] = [];
    handles.push(
        await PushNotifications.addListener(
            'pushNotificationActionPerformed',
            ({ notification }) => {
                if (isCurrentTest(notification.data, current().session)) {
                    testReceived?.();
                    notice(
                        'Tes notifikasi dari Admin diterima. Tidak ada perubahan pada tugas pickup.',
                    );
                    return;
                }
                const link = assignmentLink(notification.data);
                if (link) tap(link);
            },
        ),
    );
    handles.push(
        await PushNotifications.addListener('registration', ({ value }) => {
            const { session, signal } = current();
            if (
                !session ||
                session.locked ||
                Date.parse(session.expiresAt) <= Date.now()
            )
                return;
            void (async () => {
                const installation = await installationId();
                if (signal.aborted) return;
                await request(store(), session, signal, {
                    installation_id: installation,
                    fcm_token: value,
                });
                if (!signal.aborted)
                    notice(
                        'Notifikasi tugas sudah diaktifkan pada perangkat ini.',
                    );
            })().catch(() => {
                if (!signal.aborted)
                    notice(
                        'Notifikasi belum aktif. Periksa koneksi lalu pilih Aktifkan Notifikasi untuk mencoba lagi.',
                    );
            });
        }),
    );
    handles.push(
        await PushNotifications.addListener(
            'registrationError',
            ({ error }) => {
                const { session } = current();
                if (session && !session.locked)
                    notice(registrationFailure(error));
            },
        ),
    );
    handles.push(
        await PushNotifications.addListener(
            'pushNotificationReceived',
            ({ data }) => {
                if (isCurrentTest(data, current().session)) {
                    testReceived?.();
                    notice(
                        'Tes notifikasi dari Admin diterima. Tidak ada perubahan pada tugas pickup.',
                    );
                    return;
                }
                const link = assignmentLink(data);
                const { session } = current();
                if (
                    link &&
                    session &&
                    !session.locked &&
                    session.user.id === link.recipientId &&
                    Date.parse(session.expiresAt) > Date.now()
                ) {
                    received?.(link);
                    notice(
                        link.batchId
                            ? 'Cashless perlu diperiksa. Buka notifikasi untuk melihat hasil batch.'
                            : 'Pickup baru ditugaskan. Ketuk notifikasi untuk melihat detail tugas.',
                    );
                }
            },
        ),
    );
    return async () => {
        await Promise.all(handles.map((handle) => handle.remove()));
    };
}

export async function registerPush(
    shouldContinue: () => boolean = () => true,
): Promise<string | null> {
    if (!(await pushConfigured()))
        return 'Notifikasi belum tersedia. Hubungi Admin untuk bantuan.';
    if (!shouldContinue()) return null;
    let permission = await PushNotifications.checkPermissions();
    if (
        permission.receive === 'prompt' ||
        permission.receive === 'prompt-with-rationale'
    )
        permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted')
        return 'Izin notifikasi belum diberikan. Aktifkan melalui pengaturan Android.';
    if (!shouldContinue()) return null;
    await PushNotifications.createChannel({
        id: 'pickup_assignments',
        name: 'Assignment Pickup',
        importance: 4,
        visibility: 0,
    });
    if (shouldContinue()) await PushNotifications.register();
    return null;
}

export async function stopPush(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await PushNotifications.removeAllDeliveredNotifications().catch(
        () => undefined,
    );
    if (await pushConfigured())
        await PushNotifications.unregister().catch(() => undefined);
}

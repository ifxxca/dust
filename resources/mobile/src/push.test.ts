import { beforeEach, expect, test, vi } from 'vitest';
import type { Session } from './types';
import {
    assignmentLink,
    listenPush,
    registerPush,
    stopPush,
    registrationFailure,
} from './push';

const mocks = vi.hoisted(() => ({
    callbacks: new Map<string, (value: any) => void>(),
    request: vi.fn().mockResolvedValue({}),
    configured: vi.fn().mockResolvedValue(true),
    permissions: vi.fn().mockResolvedValue({ receive: 'granted' }),
    ask: vi.fn().mockResolvedValue({ receive: 'granted' }),
    register: vi.fn().mockResolvedValue(undefined),
    unregister: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    channel: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true },
}));
vi.mock('./api', () => ({ request: mocks.request }));
vi.mock('./secure-session', () => ({
    installationId: async () => 'test-installation',
    pushConfigured: mocks.configured,
}));
vi.mock('@capacitor/push-notifications', () => ({
    PushNotifications: {
        addListener: async (
            event: string,
            callback: (value: unknown) => void,
        ) => {
            mocks.callbacks.set(event, callback);
            return {
                remove: async () => {
                    mocks.callbacks.delete(event);
                },
            };
        },
        checkPermissions: mocks.permissions,
        requestPermissions: mocks.ask,
        register: mocks.register,
        unregister: mocks.unregister,
        createChannel: mocks.channel,
        removeAllDeliveredNotifications: mocks.remove,
    },
}));
const session: Session = {
    token: 'sanctum-test',
    user: { id: 7, name: 'Staff', role: 'pickup_staff', is_active: true },
    environment: 'http://10.20.10.13:8000',
    timezone: 'Asia/Jakarta',
    expiresAt: '2099-01-01',
    locked: false,
};

test('test push is shown in foreground and on tap only to its active recipient without opening a task', async () => {
    let current: Session | null = session;
    const tap = vi.fn();
    const notice = vi.fn();
    const received = vi.fn();
    const testReceived = vi.fn();
    const dispose = await listenPush(
        () => ({ session: current, signal: new AbortController().signal }),
        tap,
        notice,
        received,
        testReceived,
    );
    const notification = {
        data: {
            type: 'push_test',
            test_id: '11111111-1111-4111-8111-111111111111',
            recipient_id: '7',
            task_id: '12',
            event_id: '13',
        },
    };
    mocks.callbacks.get('pushNotificationReceived')!(notification);
    mocks.callbacks.get('pushNotificationActionPerformed')!({ notification });
    expect(notice).toHaveBeenCalledTimes(2);
    expect(testReceived).toHaveBeenCalledTimes(2);
    expect(notice).toHaveBeenCalledWith(
        expect.stringContaining('Tes notifikasi'),
    );
    for (const invalid of [
        null,
        { ...session, locked: true },
        { ...session, expiresAt: '2000-01-01' },
        { ...session, user: { ...session.user, id: 8 } },
    ]) {
        current = invalid;
        mocks.callbacks.get('pushNotificationReceived')!(notification);
        mocks.callbacks.get('pushNotificationActionPerformed')!({
            notification,
        });
    }
    current = session;
    mocks.callbacks.get('pushNotificationReceived')!({
        data: { ...notification.data, test_id: '../task' },
    });
    expect(notice).toHaveBeenCalledTimes(2);
    expect(testReceived).toHaveBeenCalledTimes(2);
    expect(tap).not.toHaveBeenCalled();
    expect(received).not.toHaveBeenCalled();
    await dispose();
});
beforeEach(() => {
    vi.clearAllMocks();
    mocks.callbacks.clear();
});
test('registration errors give recovery guidance without exposing technical codes or credentials', () => {
    expect(
        registrationFailure('java.io.IOException: SERVICE_NOT_AVAILABLE'),
    ).toContain('Periksa koneksi');
    expect(
        registrationFailure(
            'Firebase error FIS_AUTH_ERROR token=secret API key=hidden',
        ),
    ).toContain('Hubungi Admin');
    expect(
        registrationFailure('secret-token-value https://private.example'),
    ).toContain('Periksa koneksi');
    expect(
        registrationFailure('secret-token-value https://private.example'),
    ).not.toContain('secret-token-value');
    expect(
        registrationFailure('NOT_SERVICE_NOT_AVAILABLE_SUFFIX'),
    ).not.toContain('SERVICE_NOT_AVAILABLE');
    expect(registrationFailure('PERMISSION_DENIED')).toContain(
        'pengaturan perangkat',
    );
    expect(registrationFailure('FIS_AUTH_ERROR')).not.toContain(
        'FIS_AUTH_ERROR',
    );
});

test('tap accepts only validated assignment identifiers', () => {
    expect(
        assignmentLink({
            type: 'pickup_assigned',
            task_id: '12',
            recipient_id: '7',
            event_id: '13',
        }),
    ).toEqual({ taskId: 12, recipientId: 7, eventId: 13 });
    for (const task_id of [
        '../task',
        '-1',
        '0',
        '9007199254740993',
        'https://evil.test',
    ])
        expect(
            assignmentLink({
                type: 'pickup_assigned',
                task_id,
                recipient_id: '7',
                event_id: '13',
            }),
        ).toBeNull();
    expect(
        assignmentLink({
            type: 'other',
            task_id: '12',
            recipient_id: '7',
            event_id: '13',
        }),
    ).toBeNull();
});

test('registration and refresh send FCM token with current session and installation only', async () => {
    const signal = new AbortController().signal;
    const dispose = await listenPush(
        () => ({ session, signal }),
        vi.fn(),
        vi.fn(),
    );
    mocks.callbacks.get('registration')!({ value: 'fcm-first' });
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    mocks.callbacks.get('registration')!({ value: 'fcm-refreshed' });
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
    expect(mocks.request).toHaveBeenLastCalledWith(
        expect.objectContaining({ method: 'post' }),
        session,
        signal,
        { installation_id: 'test-installation', fcm_token: 'fcm-refreshed' },
    );
    await dispose();
    expect(mocks.callbacks.size).toBe(0);
});

test('registration while locked expired or logged out cannot bind a device', async () => {
    for (const current of [
        null,
        { ...session, locked: true },
        { ...session, expiresAt: '2000-01-01' },
    ]) {
        const dispose = await listenPush(
            () => ({ session: current, signal: new AbortController().signal }),
            vi.fn(),
            vi.fn(),
        );
        mocks.callbacks.get('registration')!({ value: 'fcm-token' });
        await dispose();
    }
    expect(mocks.request).not.toHaveBeenCalled();
});

test('notification tap is retained for login while foreground notice respects account', async () => {
    let current: Session | null = null;
    const tap = vi.fn();
    const notice = vi.fn();
    const received = vi.fn();
    const dispose = await listenPush(
        () => ({ session: current, signal: new AbortController().signal }),
        tap,
        notice,
        received,
    );
    const notification = {
        data: {
            type: 'pickup_assigned',
            task_id: '12',
            recipient_id: '7',
            event_id: '13',
        },
    };
    mocks.callbacks.get('pushNotificationActionPerformed')!({ notification });
    expect(tap).toHaveBeenCalledWith({
        taskId: 12,
        recipientId: 7,
        eventId: 13,
    });
    mocks.callbacks.get('pushNotificationReceived')!(notification);
    expect(notice).not.toHaveBeenCalled();
    current = session;
    mocks.callbacks.get('pushNotificationReceived')!(notification);
    expect(notice).toHaveBeenCalledTimes(1);
    current = { ...session, user: { ...session.user, id: 8 } };
    mocks.callbacks.get('pushNotificationReceived')!(notification);
    expect(notice).toHaveBeenCalledTimes(1);
    current = { ...session, expiresAt: '2000-01-01' };
    mocks.callbacks.get('pushNotificationReceived')!(notification);
    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith({
        taskId: 12,
        recipientId: 7,
        eventId: 13,
    });
    expect(notice).toHaveBeenCalledTimes(1);
    await dispose();
});

test('missing Firebase and denied permission leave task workspace usable without registration', async () => {
    mocks.configured.mockResolvedValueOnce(false);
    expect(await registerPush()).toContain('belum tersedia');
    mocks.permissions.mockResolvedValueOnce({ receive: 'denied' });
    expect(await registerPush()).toContain('Izin');
    expect(await registerPush(() => false)).toBeNull();
    expect(mocks.register).not.toHaveBeenCalled();
});

test('Android permission precedes channel and FCM registration; local lock unregisters', async () => {
    mocks.permissions.mockResolvedValueOnce({ receive: 'prompt' });
    expect(await registerPush()).toBeNull();
    expect(mocks.ask).toHaveBeenCalledTimes(1);
    expect(mocks.channel).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pickup_assignments' }),
    );
    expect(mocks.register).toHaveBeenCalledTimes(1);
    await stopPush();
    expect(mocks.unregister).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
});

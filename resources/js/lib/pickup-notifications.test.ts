import { expect, test } from 'vitest';
import {
    newPickupNotifications,
    type PickupNotification,
} from './pickup-notifications';

const notice = (id: number, read = false): PickupNotification => ({
    id,
    read,
    type: 'pickup_finalized',
    title: 'Pickup selesai',
    task_id: 12,
    reference: 'PCK-12',
    customer_name: 'Customer',
    staff_name: 'Staff',
    occurred_at: '2026-10-15T07:00:00Z',
});

test('initial history loads silently rather than showing old notifications as new', () => {
    expect(newPickupNotifications(null, [notice(1), notice(2)])).toEqual([]);
});
test('polling toasts only unseen unread events including a later commit with a lower id', () => {
    expect(
        newPickupNotifications(new Set([10]), [
            notice(11),
            notice(10),
            notice(9),
            notice(8, true),
        ]).map((item) => item.id),
    ).toEqual([11, 9]);
});
test('replayed polls do not repeat previously displayed events', () => {
    expect(
        newPickupNotifications(new Set([1, 2]), [notice(2), notice(1)]),
    ).toEqual([]);
});

test('cashless and pickup events with the same numeric id remain distinct', () => {
    const cashless: PickupNotification = {
        ...notice(1),
        type: 'cashless_entry_attention',
        batch_id: 2,
    };
    expect(newPickupNotifications(new Set([1]), [notice(1), cashless])).toEqual(
        [cashless],
    );
    expect(
        newPickupNotifications(new Set([1, 'cashless:1']), [cashless]),
    ).toEqual([]);
});

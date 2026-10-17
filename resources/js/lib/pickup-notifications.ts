export type PickupNotification = {
    id: number;
    type: 'pickup_finalized';
    title: string;
    task_id: number;
    reference: string;
    customer_name: string;
    staff_name: string | null;
    occurred_at: string;
    read: boolean;
};

export function newPickupNotifications(
    seen: Set<number> | null,
    items: PickupNotification[],
): PickupNotification[] {
    if (!seen) return [];
    return items.filter((item) => !item.read && !seen.has(item.id));
}

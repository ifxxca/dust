export type PickupNotification = {
    id: number;
    type: 'pickup_finalized' | 'cashless_entry_attention';
    title: string;
    task_id: number;
    reference: string;
    customer_name: string;
    staff_name: string | null;
    occurred_at: string;
    read: boolean;
    batch_id?: number;
    message?: string;
};

export function notificationKey(item: PickupNotification): number | string {
    return item.type === 'cashless_entry_attention'
        ? `cashless:${item.id}`
        : item.id;
}

export function newPickupNotifications(
    seen: Set<number | string> | null,
    items: PickupNotification[],
): PickupNotification[] {
    if (!seen) return [];
    return items.filter(
        (item) => !item.read && !seen.has(notificationKey(item)),
    );
}

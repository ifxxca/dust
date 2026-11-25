import type { HandoverQuantities } from '@/types/handover';

type CategoryQuantities = Omit<HandoverQuantities, 'total'>;
type QuantityInputs = { [Key in keyof CategoryQuantities]: string };

export function initialReceivedQuantities(
    pickup: CategoryQuantities,
): QuantityInputs {
    return {
        manual_hybrid: pickup.manual_hybrid === 0 ? '0' : '',
        cashless_hybrid: pickup.cashless_hybrid === 0 ? '0' : '',
        css_orion: pickup.css_orion === 0 ? '0' : '',
    };
}

export function matchingReceivedQuantities(
    pickup: CategoryQuantities,
): QuantityInputs {
    return {
        manual_hybrid: String(pickup.manual_hybrid),
        cashless_hybrid: String(pickup.cashless_hybrid),
        css_orion: String(pickup.css_orion),
    };
}

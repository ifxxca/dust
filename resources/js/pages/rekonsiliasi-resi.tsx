import PageContainer from '@/components/page-container';
import PickupAutomationMonitoring from '@/components/pickup-automation-monitoring';
import type { AutomationMonitor } from '@/components/pickup-automation-monitoring';
import { index } from '@/routes/pickup-automation';
import { index as pickupIndex } from '@/routes/pickup-results';

export default function ReconciliationReceipts({
    automation,
    filters,
    timezone,
    staffOptions,
}: {
    automation: AutomationMonitor;
    filters: Record<string, string>;
    timezone: string;
    staffOptions: { id: number; name: string }[];
}) {
    return (
        <PageContainer className="py-4">
            <PickupAutomationMonitoring
                data={automation}
                filters={filters}
                timezone={timezone}
                staffOptions={staffOptions}
            />
        </PageContainer>
    );
}

ReconciliationReceipts.layout = {
    breadcrumbs: [
        { title: 'Hasil Pickup', href: pickupIndex() },
        { title: 'Rekonsiliasi Paket', href: index() },
    ],
};

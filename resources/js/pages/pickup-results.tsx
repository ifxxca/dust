import { setLayoutProps } from '@inertiajs/react';
import PageContainer from '@/components/page-container';
import PackageProcessingMonitoring from '@/components/package-processing-monitoring';
import PickupMonitoring from '@/components/pickup-monitoring';
import type { PickupReportPage } from '@/components/pickup-monitoring';
import type { ProcessingMonitor } from '@/types/package-processing';
import type { MonitoringOperations } from '@/components/pickup-monitoring-period';
import type { ResultPage } from '@/types/pickup-result';
import * as routes from '@/routes/pickup-results';

export default function PickupResults(props: {
    pickups: ResultPage | null;
    report: PickupReportPage | null;
    summary: Record<string, number>;
    overview: Record<string, number>;
    queues: Record<string, number>;
    filters: Record<string, string>;
    timezone: string;
    processing?: ProcessingMonitor;
    operations: MonitoringOperations;
    staffOptions?: { id: number; name: string }[];
}) {
    setLayoutProps({
        breadcrumbs: [
            { title: 'Hasil Pickup', href: routes.index() },
            {
                title: props.processing
                    ? 'Catatan pemrosesan manual'
                    : 'Monitoring Pickup',
                href: routes.index({
                    query: {
                        monitoring: props.processing ? 'processing' : 'pickup',
                    },
                }),
            },
        ],
    });
    return (
        <PageContainer className="py-4">
            {props.processing ? (
                <PackageProcessingMonitoring
                    data={props.processing}
                    filters={props.filters}
                    timezone={props.timezone}
                    operations={props.operations}
                />
            ) : (
                <PickupMonitoring {...props} />
            )}
        </PageContainer>
    );
}

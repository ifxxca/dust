import MonitoringExplorer, {
    type MonitoringExplorerProps,
} from '@/components/shipment-monitoring-explorer';

export default function ShipmentAttention(props: MonitoringExplorerProps) {
    return <MonitoringExplorer {...props} queue />;
}

import OperationalOverview from '@/components/operational-dashboard-overview';
import RoleDashboard, {
    type RoleDashboardProps,
} from '@/components/operational-role-dashboard';
import type { OperationalOverviewData } from '@/types/operational-dashboard';
import { dashboard } from '@/routes';

export default function Dashboard({
    overview,
    ...props
}: RoleDashboardProps & { overview: OperationalOverviewData | null }) {
    return overview ? (
        <OperationalOverview data={overview} timezone={props.timezone} />
    ) : (
        <RoleDashboard {...props} />
    );
}

Dashboard.layout = { breadcrumbs: [{ title: 'Dashboard', href: dashboard() }] };

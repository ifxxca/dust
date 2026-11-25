import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import JneApexAccounts from '../components/jne-apex-accounts';
import type { PullProfile } from '../components/jne-pull-settings';

vi.mock('@inertiajs/react', () => ({
    useForm: (data: unknown) => ({ data, errors: {}, processing: false }),
}));

test('account schedule shows daily time and calendar scope instead of an ambiguous day count', () => {
    const profile: PullProfile = {
        id: 1,
        source: 'apex',
        report_type: 'apex',
        customer_account: '10561800',
        national_account: 'N',
        enabled: true,
        mode: 'rolling',
        lookback_days: 2,
        interval_minutes: 1440,
        daily_collection_time: '01:00',
        date_from: null,
        date_thru: null,
        last_error: null,
        version: 1,
        next_run_at: null,
        last_run_at: null,
    };
    const html = renderToStaticMarkup(
        <JneApexAccounts
            profiles={[profile]}
            onEdit={vi.fn()}
            onToggle={vi.fn()}
            busy={null}
        />,
    );
    expect(html).toContain('Setiap hari 01:00 WIB');
    expect(html).toContain('Kemarin &amp; hari ini');
    expect(html).not.toContain('1440 menit');
});

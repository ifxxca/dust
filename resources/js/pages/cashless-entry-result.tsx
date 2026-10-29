import { Head, Link, router, setLayoutProps } from '@inertiajs/react';
import CashlessResultView, {
    type CashlessResult,
} from '@/components/cashless-result-view';
import PageContainer from '@/components/page-container';
import { operations } from '@/routes';
import { show } from '@/routes/cashless-results';

export default function CashlessEntryResult({
    result,
}: {
    result: CashlessResult;
}) {
    setLayoutProps({
        breadcrumbs: [
            { title: 'Hasil pemrosesan cashless', href: show.url(result.id) },
        ],
    });
    return (
        <PageContainer>
            <Head title="Hasil pemrosesan cashless" />
            <Link
                className="mb-4 inline-block text-sm text-primary"
                href={operations.url({
                    screen: 'detail',
                    task: result.task_id,
                })}
            >
                Lihat pickup
            </Link>
            <CashlessResultView
                result={result}
                onPage={(page) =>
                    router.get(
                        show.url(result.id),
                        { page },
                        { preserveScroll: true },
                    )
                }
            />
        </PageContainer>
    );
}

import { Head, Link, router, setLayoutProps, useHttp } from '@inertiajs/react';
import CashlessResultView, {
    type CashlessResult,
} from '@/components/cashless-result-view';
import PageContainer from '@/components/page-container';
import { operations } from '@/routes';
import { show, correct } from '@/routes/cashless-results';
import type { CashlessCorrection } from '@/types/cashless-handover';

export default function CashlessEntryResult({
    result,
}: {
    result: CashlessResult;
}) {
    const correction = useHttp<CashlessCorrection, { batch_id: number }>({
        awb: '',
        submission_key: '',
        expected_version: 1,
    });
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
                busy={correction.processing}
                onCorrect={async (item, data) => {
                    let message =
                        'Koreksi belum tersimpan. Periksa resi lalu coba lagi.';
                    correction.transform(() => data);
                    const response = await correction.post(
                        correct.url([result.id, item.id]),
                        {
                            onError: (errors) => {
                                message = String(
                                    Object.values(errors)[0] ?? message,
                                );
                            },
                            onHttpException: (response) => {
                                message =
                                    (response.data as { message?: string })
                                        ?.message ?? message;
                                return false;
                            },
                        },
                    );
                    if (!response) throw new Error(message);
                    router.reload({ only: ['result'] });
                    return response.batch_id;
                }}
                onOpenBatch={(id) => router.get(show.url(id))}
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

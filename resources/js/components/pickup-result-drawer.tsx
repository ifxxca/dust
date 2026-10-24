import { Link } from '@inertiajs/react';
import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ArrowLeft, ArrowUpRight, Camera, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from '@/components/ui/sheet';
import {
    MonitoringDetailSheet,
    MonitoringDrawerState,
    useQuickPickupDetail,
} from '@/components/monitoring-detail-sheet';
import {
    ResultStatus,
    categories,
    resultDate,
    OperationalPickupContext,
} from '@/components/pickup-result-ui';
import { pickupDetailUrl } from '@/lib/pickup-monitoring-navigation';
import type { PickupQuickDetail } from '@/types/pickup-result';

export default function PickupResultDrawer({
    id,
    context,
    origin,
    close,
}: {
    id: number | null;
    context: string;
    origin: RefObject<HTMLElement | null>;
    close: () => void;
}) {
    const { data, error, retry } = useQuickPickupDetail<PickupQuickDetail>(
        id,
        'pickup',
    );
    const [preview, setPreview] = useState<{
        url: string;
        kind: string;
        id: number;
    } | null>(null);
    const [imageError, setImageError] = useState(false);
    const back = useRef<HTMLButtonElement | null>(null);
    const detail = (tab = 'summary', operation?: string) =>
        pickupDetailUrl(id!, context, tab, operation);
    return (
        <MonitoringDetailSheet
            open={id !== null}
            close={close}
            origin={origin}
            searchId="pickup-search"
        >
            <SheetHeader className="shrink-0 border-b pr-12">
                <SheetTitle>
                    {preview
                        ? preview.kind === 'signature'
                            ? 'Tanda tangan customer'
                            : 'Foto bukti POP'
                        : (data?.result.customer_name ?? 'Detail cepat pickup')}
                </SheetTitle>
                <SheetDescription className="break-all">
                    {data?.result.reference ??
                        'Memuat data pickup dari server.'}
                </SheetDescription>
                {data && !preview && (
                    <p className="text-xs text-muted-foreground">
                        {resultDate(data.result.scheduled_at, data.timezone)} ·{' '}
                        {data.result.staff_name ?? 'Belum ditugaskan'}
                    </p>
                )}
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                {!data && <MonitoringDrawerState error={error} retry={retry} />}
                {data && preview && (
                    <section
                        aria-label="Pratinjau bukti POP"
                        className="space-y-3"
                    >
                        <Button
                            ref={back}
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setPreview(null);
                                setImageError(false);
                                requestAnimationFrame(() =>
                                    document
                                        .getElementById(
                                            `pickup-evidence-${preview.id}`,
                                        )
                                        ?.focus(),
                                );
                            }}
                        >
                            <ArrowLeft className="size-4" />
                            Kembali ke ringkasan
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            Bukti diakses melalui sesi terautentikasi.
                        </p>
                        {imageError ? (
                            <p
                                role="alert"
                                className="rounded-lg border p-4 text-sm"
                            >
                                Bukti belum dapat dimuat. Kembali ke ringkasan
                                lalu coba lagi, atau buka detail lengkap.
                            </p>
                        ) : (
                            <img
                                src={preview.url}
                                alt={
                                    preview.kind === 'signature'
                                        ? 'Tanda tangan customer'
                                        : 'Foto bukti pickup'
                                }
                                onError={() => setImageError(true)}
                                className="max-h-[65dvh] w-full rounded-lg border bg-white object-contain"
                            />
                        )}
                    </section>
                )}
                {data && !preview && (
                    <>
                        <section className="rounded-lg border border-primary/15 bg-primary/5 p-3">
                            <OperationalPickupContext
                                result={data.result}
                                timezone={data.timezone}
                            />
                            <h3 className="text-xs font-medium text-muted-foreground">
                                Tindak lanjut operasional
                            </h3>
                            <p className="mt-1 text-sm font-medium">
                                {data.result.next_action}
                            </p>
                        </section>
                        <section className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold">
                                    Kunjungan
                                </h3>
                                <ResultStatus
                                    result={data.result}
                                    dimension="visit"
                                />
                            </div>
                            <dl className="space-y-2 text-sm">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">
                                        Mulai
                                    </dt>
                                    <dd>
                                        {resultDate(
                                            data.visit?.started_at,
                                            data.timezone,
                                        )}
                                    </dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-muted-foreground">
                                        Hasil dicatat
                                    </dt>
                                    <dd>
                                        {resultDate(
                                            data.visit?.recorded_at,
                                            data.timezone,
                                        )}
                                    </dd>
                                </div>
                            </dl>
                            {data.visit?.reason && (
                                <p className="rounded-md bg-muted/50 p-2 text-sm">
                                    Alasan: {data.visit.reason}
                                </p>
                            )}
                            {data.visit?.notes && (
                                <p className="text-sm break-words">
                                    {data.visit.notes}
                                </p>
                            )}
                        </section>
                        <section className="space-y-3 border-t pt-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold">
                                    Proof of Pickup
                                </h3>
                                <ResultStatus
                                    result={data.result}
                                    dimension="pop"
                                />
                            </div>
                            {data.proof ? (
                                <>
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>
                                            Revisi efektif #
                                            {data.proof.revision}
                                        </span>
                                        <span>
                                            {resultDate(
                                                data.proof.finalized_at,
                                                data.timezone,
                                            )}
                                        </span>
                                    </div>
                                    <dl className="space-y-2 rounded-lg bg-muted/30 p-3 text-sm">
                                        {categories.map(([key, label]) => (
                                            <div
                                                key={key}
                                                className="flex justify-between gap-3"
                                            >
                                                <dt>{label}</dt>
                                                <dd className="font-medium tabular-nums">
                                                    {data.proof![
                                                        key
                                                    ].toLocaleString('id-ID')}
                                                </dd>
                                            </div>
                                        ))}
                                        <div className="flex justify-between border-t pt-2 font-semibold">
                                            <dt>Total POP</dt>
                                            <dd>
                                                {data.result.total_packages.toLocaleString(
                                                    'id-ID',
                                                )}
                                            </dd>
                                        </div>
                                    </dl>
                                    {data.proof.notes && (
                                        <p className="text-sm break-words">
                                            {data.proof.notes}
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        {
                                            data.proof.attachments.filter(
                                                (file) =>
                                                    file.kind !== 'signature',
                                            ).length
                                        }{' '}
                                        foto · Tanda tangan{' '}
                                        {data.proof.attachments.some(
                                            (file) => file.kind === 'signature',
                                        )
                                            ? 'tersedia'
                                            : 'belum tersedia'}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {data.proof.attachments.map(
                                            (file, index) => (
                                                <Button
                                                    key={file.id}
                                                    id={`pickup-evidence-${file.id}`}
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setPreview(file);
                                                        setImageError(false);
                                                        requestAnimationFrame(
                                                            () =>
                                                                back.current?.focus(),
                                                        );
                                                    }}
                                                >
                                                    {file.kind ===
                                                    'signature' ? (
                                                        <FileSignature className="size-4" />
                                                    ) : (
                                                        <Camera className="size-4" />
                                                    )}
                                                    {file.kind === 'signature'
                                                        ? 'Tanda tangan'
                                                        : `Foto ${index + 1}`}
                                                </Button>
                                            ),
                                        )}
                                    </div>
                                </>
                            ) : (
                                <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                                    {data.result.task_status === 'NO_PACKAGES'
                                        ? 'Kunjungan selesai tanpa paket. Tidak ada POP.'
                                        : 'Belum ada bukti POP tersimpan.'}
                                </p>
                            )}
                        </section>
                        <section className="space-y-3 border-t pt-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold">
                                    Handover & Retail
                                </h3>
                                <ResultStatus
                                    result={data.result}
                                    dimension="handover"
                                />
                            </div>
                            {data.handover ? (
                                <>
                                    <p className="text-xs break-all text-muted-foreground">
                                        {data.handover.reference}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <ResultStatus
                                            result={data.result}
                                            dimension="verification"
                                        />
                                        <ResultStatus
                                            result={data.result}
                                            dimension="discrepancy"
                                        />
                                    </div>
                                    <dl className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <dt className="text-muted-foreground">
                                                Diterima Retail
                                            </dt>
                                            <dd className="font-semibold">
                                                {data.handover
                                                    .total_received === null
                                                    ? 'Belum diperiksa'
                                                    : data.handover.total_received.toLocaleString(
                                                          'id-ID',
                                                      )}
                                            </dd>
                                        </div>
                                        <div className="flex justify-between gap-3">
                                            <dt className="text-muted-foreground">
                                                Diverifikasi oleh
                                            </dt>
                                            <dd>
                                                {data.handover.verified_by ??
                                                    '—'}
                                            </dd>
                                        </div>
                                        <div className="flex justify-between gap-3">
                                            <dt className="text-muted-foreground">
                                                Waktu verifikasi
                                            </dt>
                                            <dd>
                                                {resultDate(
                                                    data.handover.verified_at,
                                                    data.timezone,
                                                )}
                                            </dd>
                                        </div>
                                    </dl>
                                    {data.handover.differences && (
                                        <div className="space-y-1 rounded-lg border p-3 text-sm">
                                            <p className="mb-2 text-xs text-muted-foreground">
                                                Selisih fisik terhadap POP
                                                revisi #
                                                {
                                                    data.handover
                                                        .verified_pickup_revision
                                                }
                                            </p>
                                            {categories.map(([key, label]) => {
                                                const delta =
                                                    data.handover!.differences![
                                                        key
                                                    ];
                                                return (
                                                    <p
                                                        key={key}
                                                        className={`flex justify-between gap-2 ${delta ? 'text-amber-800 dark:text-amber-300' : ''}`}
                                                    >
                                                        <span>{label}</span>
                                                        <strong>
                                                            {delta > 0
                                                                ? '+'
                                                                : ''}
                                                            {delta}{' '}
                                                            {delta > 0
                                                                ? 'LEBIH'
                                                                : delta < 0
                                                                  ? 'KURANG'
                                                                  : 'SESUAI'}
                                                        </strong>
                                                    </p>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {data.result.needs_review && (
                                        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                                            Revisi POP berubah setelah
                                            verifikasi. Tinjau ulang sebelum
                                            melanjutkan.
                                        </p>
                                    )}
                                    {data.handover.discrepancy_notes && (
                                        <p className="text-sm break-words">
                                            {data.handover.discrepancy_notes}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                                    Pickup belum masuk sesi handover.
                                </p>
                            )}
                        </section>
                    </>
                )}
            </div>
            {data && (
                <SheetFooter className="shrink-0 border-t bg-background">
                    <Button asChild>
                        <Link href={detail()}>
                            Lihat Detail Lengkap
                            <ArrowUpRight className="size-4" />
                        </Link>
                    </Button>
                    {!preview && (
                        <div className="flex flex-wrap gap-2">
                            {data.proof && (
                                <Button asChild size="sm" variant="outline">
                                    <Link href={detail('proof')}>
                                        Lihat POP
                                    </Link>
                                </Button>
                            )}
                            {data.handover && (
                                <Button asChild size="sm" variant="outline">
                                    <Link href={detail('handover')}>
                                        {data.result.verification_status ===
                                        'DISCREPANCY'
                                            ? 'Tinjau Selisih'
                                            : 'Lihat Handover'}
                                    </Link>
                                </Button>
                            )}
                            {data.capabilities.verify && (
                                <Button asChild size="sm" variant="outline">
                                    <Link href={detail('handover', 'verify')}>
                                        Verifikasi Handover
                                    </Link>
                                </Button>
                            )}
                            {data.capabilities.correct_pop && (
                                <Button asChild size="sm" variant="outline">
                                    <Link href={detail('proof', 'correct_pop')}>
                                        Koreksi POP
                                    </Link>
                                </Button>
                            )}
                            {data.capabilities.correct_verification && (
                                <Button asChild size="sm" variant="outline">
                                    <Link
                                        href={detail(
                                            'handover',
                                            'correct_verification',
                                        )}
                                    >
                                        Koreksi Verifikasi
                                    </Link>
                                </Button>
                            )}
                        </div>
                    )}
                </SheetFooter>
            )}
        </MonitoringDetailSheet>
    );
}

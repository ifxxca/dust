export type ReportProcessing = {
    status: string;

    import_status: string;

    projection_status?: string;
};

export function reportStage(report: ReportProcessing) {
    if (
        ['FAILED', 'NEEDS_ATTENTION'].includes(report.status) ||
        report.import_status === 'FAILED' ||
        report.projection_status === 'FAILED'
    )
        return { label: 'Perlu tindakan', issue: true };

    if (report.status === 'COMPLETED') {
        if (
            report.import_status === 'IMPORTED' &&
            report.projection_status === 'PROJECTED'
        )
            return { label: 'Siap dimonitor', issue: false };

        if (['QUEUED', 'IMPORTED'].includes(report.import_status))
            return { label: 'Memproses data CSV', issue: false };

        return { label: 'CSV tersimpan · belum diproses', issue: false };
    }

    const labels: Record<string, string> = {
        QUEUED: 'Menunggu worker',
        RUNNING: 'Mengambil report',
        WAITING_REPORT: 'Menunggu JNE',
        DOWNLOADING: 'Mengunduh CSV',
    };

    return { label: labels[report.status] ?? report.status, issue: false };
}

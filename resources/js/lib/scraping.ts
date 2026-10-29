export const scrapingSources = {
    hybrid: 'Hybrid → APEX',
    apex: 'APEX JNE CCC',
    roberto: 'Server PM · ROBERTO',
    nuralamt: 'Server Puman · NURALAMT',
};
export const scrapingReports = {
    combined: 'Cashless + manual',
    apex: 'Report customer',
    unresolved: 'Pembaruan resi aktif',
    cashless: 'Handover cashless',
    manual: 'Report manual',
};
export const runStatuses: Record<string, string> = {
    QUEUED: 'Antrean',
    RUNNING: 'Dimulai',
    WAITING_REPORT: 'Menyiapkan report',
    WAITING_APEX: 'Menunggu konversi APEX',
    COLLECTING_SOURCES: 'Mengumpulkan report sumber',
    SOURCE_SAVED: 'Sumber tersimpan',
    NO_DATA: 'Tidak ada AWB',
    DOWNLOADING: 'Mengunduh CSV',
    COMPLETED: 'Selesai',
    FAILED: 'Gagal',
    NEEDS_ATTENTION: 'Perlu diperiksa',
};
export function sourceLabel(source: string, account?: string) {
    if (source === 'hybrid') {
        if (account === 'HYBRID_PM') return 'Hybrid Server PM';
        if (account === 'HYBRID_PUMAN') return 'Hybrid Server Puman';
        if (account === 'HYBRID_GABUNGAN') return 'Hybrid gabungan (lama)';
    }
    return scrapingSources[source as keyof typeof scrapingSources] || source;
}
export function reportLabel(report: string) {
    return scrapingReports[report as keyof typeof scrapingReports] || report;
}

export function runStatusLabel(status: string, reportType?: string) {
    if (status === 'NO_DATA' && reportType === 'unresolved') {
        return 'Tidak ada AWB jatuh tempo';
    }
    return runStatuses[status] || status;
}

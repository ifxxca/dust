export const scrapingSources = {
    hybrid: 'Hybrid gabungan',
    apex: 'APEX JNE CCC',
    roberto: 'Hybrid ROBERTO',
    nuralamt: 'Hybrid NURALAMT',
};
export const scrapingReports = {
    combined: 'Cashless + manual · 2 akun',
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
    COLLECTING_SOURCES: 'Mengumpulkan 4 report',
    SOURCE_SAVED: 'Sumber tersimpan',
    NO_DATA: 'Tidak ada AWB',
    DOWNLOADING: 'Mengunduh CSV',
    COMPLETED: 'Selesai',
    FAILED: 'Gagal',
    NEEDS_ATTENTION: 'Perlu diperiksa',
};
export function sourceLabel(source: string) {
    return scrapingSources[source as keyof typeof scrapingSources] || source;
}
export function reportLabel(report: string) {
    return scrapingReports[report as keyof typeof scrapingReports] || report;
}

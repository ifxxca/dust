import { ReportError } from './errors.mjs';

export const MAX_REPORT_DAYS = 5;
export const MAX_AWBS = 6000;

export function validateReportPeriod(job) {
    const dates = [job.date_from, job.date_thru].map((value) => {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
            return NaN;
        const time = Date.parse(value + 'T00:00:00Z');
        return Number.isFinite(time) &&
            new Date(time).toISOString().slice(0, 10) === value
            ? time
            : NaN;
    });
    const days = (dates[1] - dates[0]) / 86400000 + 1;
    if (!Number.isInteger(days) || days < 1 || days > MAX_REPORT_DAYS)
        throw new ReportError(
            'REPORT_PERIOD_LIMIT',
            `Periode report harus valid dan maksimal ${MAX_REPORT_DAYS} hari, termasuk tanggal awal dan akhir. Pecah permintaan menjadi periode yang lebih pendek.`,
            'FAILED',
        );
}

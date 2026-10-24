export function reportPeriodEnd(dateFrom: string, maxDays: number): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) return '';
    const date = new Date(`${dateFrom}T00:00:00Z`);
    if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== dateFrom
    )
        return '';
    date.setUTCDate(date.getUTCDate() + maxDays - 1);
    return date.toISOString().slice(0, 10);
}

export function reportPeriods(
    dateFrom: string,
    dateThru: string,
    maxDays: number,
    maxRequestDays: number,
): { from: string; thru: string }[] {
    if (
        !Number.isInteger(maxDays) ||
        maxDays < 1 ||
        !Number.isInteger(maxRequestDays) ||
        maxRequestDays < 1 ||
        !reportPeriodEnd(dateFrom, 1) ||
        !reportPeriodEnd(dateThru, 1) ||
        dateFrom > dateThru ||
        dateThru > reportPeriodEnd(dateFrom, maxRequestDays)
    )
        return [];
    const periods = [];
    for (let from = dateFrom; from <= dateThru;) {
        const end = reportPeriodEnd(from, maxDays);
        const thru = end < dateThru ? end : dateThru;
        periods.push({ from, thru });
        from = reportPeriodEnd(thru, 2);
    }
    return periods;
}

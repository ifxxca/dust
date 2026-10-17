export function utcFromLocal(value: string, timezone: string): string {
    const base = Date.parse(`${value}:00Z`);
    let result = base;
    for (let attempt = 0; attempt < 2; attempt++) {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(new Date(result));
        const get = (key: string) =>
            parts.find((part) => part.type === key)?.value;
        const displayed = Date.parse(
            `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`,
        );
        result += base - displayed;
    }
    return new Date(result).toISOString();
}

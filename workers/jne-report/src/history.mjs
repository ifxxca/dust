import { ReportError } from './errors.mjs';

export function extractHistory(table) {
    const normalize = (value) =>
        value
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
    const columns = {};
    for (const header of table.querySelectorAll('th')) {
        if (header.id) {
            const key = normalize(header.id);
            const known = [
                'FILENAME',
                'STATUS',
                'CREATEDDATE',
                'CREATEDUSER',
                'DOWNLOAD',
                'ERROR',
                'IDACCOUNT',
                'CUSTOMERACCOUNT',
                'CUST',
                'DATEFROM',
                'DATETHRU',
            ];
            const label =
                header.querySelector('.a-IRR-headerLink, .a-IRR-headerLabel')
                    ?.textContent || header.textContent;
            columns[header.id] = known.includes(key) ? key : normalize(label);
        }
    }
    const rows = [];
    for (const [rowIndex, tr] of [...table.querySelectorAll('tr')].entries()) {
        const cells = [...tr.querySelectorAll('td[headers]')];
        if (!cells.length) continue;
        const row = {
            id: tr.querySelector('input[name="f01"]')?.value || '',
            rowIndex,
            columns: {},
        };
        for (const cell of cells) {
            const ids = cell.getAttribute('headers').split(/\s+/);
            for (const id of ids) {
                const key = columns[id] || normalize(id);
                row.columns[key] = cell.textContent.trim();
                if (key === 'DOWNLOAD') {
                    row.download =
                        cell.querySelector('a[href]')?.getAttribute('href') ||
                        null;
                }
            }
        }
        row.filename = row.columns.FILENAME || '';
        row.status = row.columns.STATUS || '';
        row.created = row.columns.CREATEDDATE || '';
        row.error = row.columns.ERROR || '';
        if (!row.id && row.filename && row.created) {
            row.id =
                'metadata:' +
                JSON.stringify([
                    row.filename,
                    row.created,
                    row.columns.CREATEDUSER || '',
                ]);
        }
        if (
            !row.id ||
            !('STATUS' in row.columns) ||
            !('FILENAME' in row.columns) ||
            !('CREATEDDATE' in row.columns) ||
            !('DOWNLOAD' in row.columns) ||
            !('ERROR' in row.columns)
        ) {
            return { error: 'HISTORY_STRUCTURE' };
        }
        rows.push(row);
    }
    return { rows, columns: Object.values(columns) };
}

export async function readHistory(page) {
    const tables = page.locator('table.a-IRR-table:visible');
    if (
        (await tables.count()) === 0 &&
        (await page.locator('.a-IRR-noDataMsg:visible').count()) === 1
    )
        return [];
    if ((await tables.count()) !== 1)
        throw new ReportError(
            'HISTORY_STRUCTURE',
            'Tabel History JNE tidak ditemukan atau ambigu. Periksa akses dan struktur halaman 46.',
        );
    const result = await tables.evaluate(extractHistory);
    if (result.error)
        throw new ReportError(
            result.error,
            'Kolom atau ID History JNE berubah. Verifikasi struktur halaman 46.',
        );
    const required = ['FILENAME', 'STATUS', 'CREATEDDATE', 'DOWNLOAD', 'ERROR'];
    if (!required.every((column) => result.columns.includes(column)))
        throw new ReportError(
            'HISTORY_STRUCTURE',
            'Kolom History wajib tidak lengkap.',
        );
    if (new Set(result.rows.map((row) => row.id)).size !== result.rows.length)
        throw new ReportError('HISTORY_STRUCTURE', 'ID History tidak unik.');
    return result.rows;
}

const months = [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
];

export function parseCreated(value, format, timezone) {
    if (format === 'ISO8601') {
        if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
        return Date.parse(value);
    }
    const formats = {
        'YYYY-MM-DD HH:mm:ss':
            /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
        'DD-MON-YYYY HH:mm:ss':
            /^(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/,
        'DD/MM/YYYY HH:mm:ss':
            /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/,
        'YYYY-MM-DD HH:mm': /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/,
        'DD-MON-YYYY HH:mm': /^(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2})$/,
        'DD/MM/YYYY HH:mm': /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/,
    };
    const match = formats[format]?.exec(value.trim());
    if (!match) return NaN;
    const [, a, b, c, hour, minute, second = '0'] = match;
    const year = Number(format.startsWith('YYYY') ? a : c);
    const month = format.includes('MON')
        ? months.indexOf(b.toUpperCase()) + 1
        : Number(b);
    const day = Number(format.startsWith('YYYY') ? c : a);
    const expected = Date.UTC(
        year,
        month - 1,
        day,
        Number(hour),
        Number(minute),
        Number(second),
    );
    const check = new Date(expected);
    if (
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day ||
        Number(hour) > 23 ||
        Number(minute) > 59 ||
        Number(second) > 59
    )
        return NaN;
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });
    let utc = expected;
    for (let attempt = 0; attempt < 2; attempt++) {
        const parts = Object.fromEntries(
            formatter
                .formatToParts(utc)
                .map(({ type, value: part }) => [type, part]),
        );
        const local = Date.UTC(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day),
            Number(parts.hour),
            Number(parts.minute),
            Number(parts.second),
        );
        utc += expected - local;
    }
    return utc;
}

export function correlateHistory(
    before,
    current,
    job,
    submittedAt,
    config,
    pinnedId = null,
    accepted = true,
    now = Date.now(),
) {
    const baseline = new Set(before.map((row) => row.id));
    const fresh = current.filter((row) => !baseline.has(row.id));
    const candidates = [];
    for (const row of fresh) {
        const created = parseCreated(
            row.created,
            config.historyDateFormat,
            config.timezone,
        );
        if (!Number.isFinite(created))
            throw new ReportError(
                'HISTORY_DATE',
                'Tanggal History tidak dapat diverifikasi. Atur format tanggal dan zona waktu sesuai halaman 46.',
            );
        if (
            created < submittedAt - config.clockSkew ||
            created > now + config.clockSkew
        )
            continue;
        const account =
            row.columns.CUSTOMERACCOUNT ??
            row.columns.IDACCOUNT ??
            row.columns.CUST;
        if (job.report_mode === 'A') {
            const creator = (row.columns.CREATEDUSER || '')
                .trim()
                .toLowerCase();
            if (
                row.filename !== job.upload_filename ||
                creator !== config.username.trim().toLowerCase()
            )
                continue;
            candidates.push(row);
            continue;
        }
        const from = row.columns.DATEFROM;
        const thru = row.columns.DATETHRU;
        if (account !== undefined && account.trim() !== job.customer_account)
            continue;
        if (from !== undefined && from !== job.date_from) continue;
        if (thru !== undefined && thru !== job.date_thru) continue;
        const echoedParametersMatch =
            account === job.customer_account &&
            from === job.date_from &&
            thru === job.date_thru;
        const filenameAccountMatches = (row.filename || '')
            .split(/[^A-Za-z0-9]+/)
            .includes(job.customer_account);
        const creatorMatches =
            typeof config.username === 'string' &&
            config.username.trim() !== '' &&
            (row.columns.CREATEDUSER || '').trim().toLowerCase() ===
                config.username.trim().toLowerCase();
        const tokens = (row.filename || '').split(/[^A-Za-z0-9]+/);
        const accountIndex = tokens.indexOf(job.customer_account);
        const filenamePeriodMatches =
            accountIndex >= 0 &&
            tokens[accountIndex + 1] ===
                job.date_from.replaceAll('-', '').slice(2) &&
            tokens[accountIndex + 2] ===
                job.date_thru.replaceAll('-', '').slice(2);
        if (
            config.strictHistoryIdentity &&
            !(
                echoedParametersMatch ||
                (filenameAccountMatches &&
                    filenamePeriodMatches &&
                    creatorMatches)
            )
        ) {
            continue;
        }
        if (
            !accepted &&
            !echoedParametersMatch &&
            !(filenameAccountMatches && creatorMatches)
        ) {
            throw new ReportError(
                'SUBMISSION_UNCERTAIN',
                'Hasil Process belum pasti dan identitas akun/pembuat atau parameter History tidak cukup untuk korelasi. Periksa History; jangan kirim ulang otomatis.',
            );
        }
        candidates.push(row);
    }
    if (candidates.length > 1)
        throw new ReportError(
            'HISTORY_AMBIGUOUS',
            'Lebih dari satu report baru cocok. Periksa History JNE; worker tidak memilih report secara acak.',
        );
    const row = candidates[0] || null;
    if (pinnedId && (!row || row.id !== pinnedId))
        throw new ReportError(
            'HISTORY_CHANGED',
            'Report yang sedang ditunggu hilang atau identitasnya berubah. Periksa History JNE.',
        );
    return row;
}

export function csvReady(row) {
    // History status can lag behind the downloadable CSV, including Error/Failed.
    return Boolean(row?.download);
}

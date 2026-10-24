import { readFile, stat } from 'node:fs/promises';
import { isUtf8 } from 'node:buffer';
import { ReportError } from './errors.mjs';
import { MAX_AWBS } from './limits.mjs';

export function parseCsv(text, delimiter) {
    const rows = [];
    let row = [],
        field = '',
        quoted = false,
        closed = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (char === '"') {
                quoted = false;
                closed = true;
            } else field += char;
        } else if (char === '"' && !field && !closed) quoted = true;
        else if (char === delimiter) {
            row.push(field);
            field = '';
            closed = false;
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            if (row.some((value) => value !== '')) rows.push(row);
            row = [];
            field = '';
            closed = false;
        } else {
            if (closed || char === '"') return null;
            field += char;
        }
    }
    if (quoted) return null;
    row.push(field);
    if (row.some((value) => value !== '')) rows.push(row);
    return rows;
}

export function parseCsvBytes(bytes, delimiter) {
    const text = bytes.toString('latin1').replace(/^\xEF\xBB\xBF/, '');
    const legacy = new TextDecoder('windows-1252');
    return (
        parseCsv(text, delimiter)?.map((row) =>
            row.map((field) => {
                const value = Buffer.from(field, 'latin1');
                return isUtf8(value)
                    ? value.toString('utf8')
                    : legacy.decode(value);
            }),
        ) ?? null
    );
}

export async function validateCsv(filePath, maxBytes) {
    const info = await stat(filePath);
    if (!info.isFile() || info.size < 1 || info.size > maxBytes)
        throw new ReportError(
            'CSV_SIZE',
            'CSV kosong atau melebihi batas ukuran.',
        );
    const bytes = await readFile(filePath);
    const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
    if (text.includes('\0') || /^\s*(<!doctype|<html|<\?xml|[{[])/i.test(text))
        throw new ReportError('CSV_INVALID', 'Unduhan bukan CSV yang valid.');
    for (const delimiter of [',', ';', '\t']) {
        const rows = parseCsv(text, delimiter);
        if (!rows?.length || rows[0].length < 2) continue;
        const headers = rows[0].map((value) => value.trim());
        if (
            headers.some((value) => !value) ||
            new Set(headers).size !== headers.length
        )
            continue;
        if (rows.every((row) => row.length === headers.length)) {
            if (rows.length - 1 > MAX_AWBS)
                throw new ReportError(
                    'CSV_AWB_LIMIT',
                    'CSV melebihi batas 6.000 AWB per proses. Persempit periode lalu buat permintaan baru.',
                );
            return { size: info.size };
        }
    }
    throw new ReportError(
        'CSV_INVALID',
        'Header atau struktur kolom CSV tidak valid.',
    );
}

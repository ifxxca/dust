import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseCsvBytes } from './csv.mjs';
import { ReportError } from './errors.mjs';
import { MAX_AWBS } from './limits.mjs';

export async function retrieveHybridApex(
    job,
    apex,
    tempDir,
    progress,
    signal,
    maxBytes,
) {
    const awbs = job.parameters?.awbs;
    if (
        !Array.isArray(awbs) ||
        !awbs.length ||
        awbs.some(
            (awb) =>
                typeof awb !== 'string' || !/^[A-Z0-9_-]{1,100}$/.test(awb),
        ) ||
        new Set(awbs).size !== awbs.length
    ) {
        throw new ReportError(
            'HYBRID_AWBS',
            'Daftar AWB Hybrid untuk APEX tidak valid.',
            'FAILED',
        );
    }
    await progress('WAITING_REPORT');
    let headers;
    let delimiter;
    const output = [];
    let bytes = 0;
    const quote = (cell) => '"' + cell.replaceAll('"', '""') + '"';
    const append = (row) => {
        const line = row.map(quote).join(delimiter) + '\r\n';
        bytes += Buffer.byteLength(line);
        if (bytes > maxBytes)
            throw new ReportError(
                'CSV_SIZE',
                'Gabungan hasil APEX melebihi batas ukuran CSV.',
            );
        output.push(line);
    };
    for (let offset = 0; offset < awbs.length; offset += MAX_AWBS) {
        signal.throwIfAborted();
        const batch = offset / MAX_AWBS + 1;
        const directory = path.join(tempDir, 'batch-' + batch);
        await mkdir(directory);
        const file = await apex.retrieve(
            {
                ...job,
                awbs: awbs.slice(offset, offset + MAX_AWBS),
                upload_filename:
                    job.report_type === 'unresolved'
                        ? `active-awbs-${job.id}-${batch}.csv`
                        : `hybrid-${job.source}-${job.id}-${batch}.csv`,
            },
            directory,
            async () => {},
            signal,
        );
        if (awbs.length <= MAX_AWBS) {
            return file;
        }
        const content = await readFile(file);
        let rows;
        for (const candidate of [',', ';', '\t']) {
            const parsed = parseCsvBytes(content, candidate);
            if (
                parsed?.[0]?.includes('AWB') &&
                parsed[0].includes('ID_ACCOUNT') &&
                parsed.every((row) => row.length === parsed[0].length)
            ) {
                if (delimiter && delimiter !== candidate)
                    throw new ReportError(
                        'APEX_CSV_FORMAT',
                        'Pemisah CSV APEX berubah antar batch.',
                    );
                delimiter = candidate;
                rows = parsed;
                break;
            }
        }
        if (!rows)
            throw new ReportError(
                'APEX_CSV_FORMAT',
                'Hasil upload AWB bukan format CSV APEX.',
            );
        if (!headers) {
            headers = rows[0];
            append(headers);
        } else if (JSON.stringify(headers) !== JSON.stringify(rows[0]))
            throw new ReportError(
                'APEX_CSV_FORMAT',
                'Kolom CSV APEX berubah antar batch.',
            );
        for (const row of rows.slice(1)) append(row);
    }
    const file = path.join(tempDir, 'hybrid-apex.csv');
    await writeFile(file, output.join(''), { mode: 0o600 });
    return file;
}

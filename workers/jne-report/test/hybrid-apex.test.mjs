import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApexClient } from '../src/apex.mjs';
import { retrieveHybridApex } from '../src/hybrid-apex.mjs';
import { parseCsv, parseCsvBytes } from '../src/csv.mjs';
import { correlateHistory } from '../src/history.mjs';
import { apexUploadFixture } from './apex-upload-fixture.mjs';
import { runJob } from '../src/worker.mjs';

test('durable saved batches are reused after a restart without another APEX Process call', async (t) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'apex-checkpoint-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const awbs = Array.from({ length: 6001 }, (_, index) =>
        String(index + 1).padStart(8, '0'),
    );
    const first = Buffer.from(
        'AWB,ID_ACCOUNT\n' +
            awbs
                .slice(0, 6000)
                .map((awb) => awb + ',SHARED')
                .join('\n') +
            '\n',
    );
    const calls = [];
    const saved = [];
    const checkpoints = {
        begin: async (number) =>
            number === 1
                ? {
                      status: 'SAVED',
                      content_base64: first.toString('base64'),
                      checksum: createHash('sha256')
                          .update(first)
                          .digest('hex'),
                  }
                : { status: 'STARTED' },
        save: async (number, file) =>
            saved.push([number, await readFile(file, 'utf8')]),
    };
    const apex = {
        retrieve: async (job, folder) => {
            calls.push(job.awbs);
            const file = path.join(folder, 'download.csv');
            await writeFile(
                file,
                'AWB,ID_ACCOUNT\n' + job.awbs[0] + ',OTHER\n',
            );
            return file;
        },
    };
    const file = await retrieveHybridApex(
        { id: 80, source: 'hybrid', parameters: { awbs } },
        apex,
        directory,
        async () => {},
        new AbortController().signal,
        20971520,
        checkpoints,
    );
    assert.deepEqual(calls, [[awbs[6000]]]);
    assert.equal(saved.length, 1);
    assert.equal(saved[0][0], 2);
    assert.equal(parseCsv(await readFile(file, 'utf8'), ',').length, 6002);
});

test('CSV byte parsing preserves UTF8 cells and legacy Windows names without replacement characters', () => {
    const bytes = Buffer.concat([
        Buffer.from(
            '\uFEFFAWB,ID_ACCOUNT,NAME,COURIER\n001,ACCOUNT,"Café 東京","O',
        ),
        Buffer.from([0x92]),
        Buffer.from('Brien'),
        Buffer.from([0xa0]),
        Buffer.from('Courier"\n'),
    ]);
    assert.deepEqual(parseCsvBytes(bytes, ','), [
        ['AWB', 'ID_ACCOUNT', 'NAME', 'COURIER'],
        ['001', 'ACCOUNT', 'Café 東京', 'O’Brien\u00A0Courier'],
    ]);
});

test('merged APEX batches keep legacy courier names and UTF8 text while retaining original batch files', async (t) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'apex-encoding-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const awbs = Array.from({ length: 6001 }, (_, i) =>
        String(i + 1).padStart(8, '0'),
    );
    const originals = [];
    const apex = {
        retrieve: async (job, folder) => {
            const rows = job.awbs.map((awb) =>
                Buffer.concat([
                    Buffer.from(`${awb},ACCOUNT,"Café 東京","O`),
                    Buffer.from([0x92]),
                    Buffer.from('Brien'),
                    Buffer.from([0xa0]),
                    Buffer.from('Courier"\n'),
                ]),
            );
            const bytes = Buffer.concat([
                Buffer.from('AWB,ID_ACCOUNT,SHIPPER_NAME,COURIER\n'),
                ...rows,
            ]);
            const filename = path.join(folder, 'native.csv');
            await writeFile(filename, bytes);
            originals.push({ filename, bytes });
            return filename;
        },
    };
    const file = await retrieveHybridApex(
        { id: 50, source: 'hybrid', report_mode: 'A', parameters: { awbs } },
        apex,
        directory,
        async () => {},
        new AbortController().signal,
        20971520,
    );
    const result = parseCsv(await readFile(file, 'utf8'), ',');
    assert.equal(result.length, 6002);
    assert.deepEqual(result[6001], [
        '00006001',
        'ACCOUNT',
        'Café 東京',
        'O’Brien\u00A0Courier',
    ]);
    for (const original of originals)
        assert.deepEqual(await readFile(original.filename), original.bytes);
});

test('APEX active AWB jobs use Upload Connote and publish the original APEX CSV', async (t) => {
    const site = await apexUploadFixture();
    const directory = await mkdtemp(path.join(os.tmpdir(), 'active-apex-'));
    const config = {
        ...site.config(directory),
        dataDir: directory,
        jobTimeout: 15000,
    };
    const apex = new ApexClient(config);
    t.after(async () => {
        await apex.close();
        await site.close();
        await rm(directory, { recursive: true, force: true });
    });
    let uploaded;
    let failure;
    const api = {
        progress: async () => {},
        upload: async (_job, file) => {
            uploaded = await readFile(file, 'utf8');
            return { status: 'COMPLETED' };
        },
        fail: async (_job, error) => {
            failure = error;
        },
    };
    const completed = await runJob(
        {
            id: 21,
            source: 'apex',
            report_type: 'unresolved',
            report_mode: 'A',
            status: 'RUNNING',
            lease_seconds: 300,
            date_from: '2026-10-23',
            date_thru: '2026-10-23',
            parameters: { awbs: ['00001', '00002'] },
            max_file_kb: 20480,
        },
        api,
        apex,
        config,
        new AbortController().signal,
    );

    assert.equal(completed, true, failure?.message);
    assert.equal(site.state.uploads.length, 1);
    assert.equal(site.state.uploads[0].name, 'active-awbs-21-1.csv');
    assert.deepEqual(site.state.uploads[0].awbs, ['00001', '00002']);
    assert.equal(
        uploaded,
        'AWB,ID_ACCOUNT,STATUS_WEB\n00001,ACCOUNT1,Delivered\n00002,ACCOUNT2,Delivered\n',
    );
});

test('Combined Hybrid waits through an APEX Error and a delayed Download after one upload', async (t) => {
    const site = await apexUploadFixture({ delayedDownload: true });
    const directory = await mkdtemp(
        path.join(os.tmpdir(), 'hybrid-delayed-apex-'),
    );
    const apex = new ApexClient(site.config(directory));
    t.after(async () => {
        await apex.close();
        await site.close();
        await rm(directory, { recursive: true, force: true });
    });
    const awbs = ['00000001', '00000002'];
    const file = await retrieveHybridApex(
        {
            id: 20,
            source: 'hybrid',
            report_mode: 'A',
            date_from: '2026-10-23',
            date_thru: '2026-10-23',
            parameters: { awbs },
            max_file_kb: 20480,
        },
        apex,
        directory,
        async () => {},
        new AbortController().signal,
        20971520,
    );
    assert.equal(site.state.uploads.length, 1);
    assert.deepEqual(site.state.uploads[0].awbs, awbs);
    assert.ok(site.state.uploads[0].historyReads >= 3);
    assert.deepEqual(site.state.downloads, ['hybrid-hybrid-20-1.csv']);
    assert.equal(
        await readFile(file, 'utf8'),
        'AWB,ID_ACCOUNT,STATUS_WEB\n00000001,ACCOUNT1,Delivered\n00000002,ACCOUNT2,Delivered\n',
    );
});

test('Hybrid sends 6001 AWBs as headerless batches and preserves the APEX columns in one result', async (t) => {
    const site = await apexUploadFixture();
    const directory = await mkdtemp(path.join(os.tmpdir(), 'hybrid-apex-'));
    const apex = new ApexClient(site.config(directory));
    t.after(async () => {
        await apex.close();
        await site.close();
        await rm(directory, { recursive: true, force: true });
    });
    const awbs = Array.from({ length: 6001 }, (_, i) =>
        String(i + 1).padStart(8, '0'),
    );
    const progress = [];
    const file = await retrieveHybridApex(
        {
            id: 19,
            source: 'roberto',
            report_mode: 'A',
            date_from: '2026-10-23',
            date_thru: '2026-10-23',
            parameters: { awbs },
            max_file_kb: 20480,
        },
        apex,
        directory,
        async (status) => progress.push(status),
        new AbortController().signal,
        20971520,
    );
    assert.deepEqual(
        site.state.uploads.map((upload) => upload.awbs.length),
        [6000, 1],
    );
    assert.deepEqual(
        site.state.uploads.flatMap((upload) => upload.awbs),
        awbs,
    );
    assert.equal(site.state.logins, 1);
    assert.deepEqual(progress, ['WAITING_REPORT']);
    const result = parseCsv(await readFile(file, 'utf8'), ',');
    assert.deepEqual(result[0], ['AWB', 'ID_ACCOUNT', 'STATUS_WEB']);
    assert.equal(result.length, 6002);
    assert.deepEqual(
        result.slice(1).map((row) => row[0]),
        awbs,
    );
});

test('upload history requires the exact filename and authenticated creator even when the response was accepted', () => {
    const now = Date.now();
    const job = {
        report_mode: 'A',
        upload_filename: 'hybrid-roberto-19-1.csv',
    };
    const row = {
        id: '1',
        filename: job.upload_filename,
        created: new Date(now).toISOString(),
        columns: { CREATEDUSER: 'fixture-user' },
    };
    const config = {
        username: 'fixture-user',
        historyDateFormat: 'ISO8601',
        timezone: 'Asia/Jakarta',
        clockSkew: 1000,
    };
    assert.equal(
        correlateHistory(
            [],
            [{ ...row, filename: 'other.csv' }],
            job,
            now,
            config,
        ),
        null,
    );
    assert.equal(
        correlateHistory(
            [],
            [{ ...row, columns: { CREATEDUSER: 'other-user' } }],
            job,
            now,
            config,
        ),
        null,
    );
    assert.equal(
        correlateHistory([], [row], job, now, config, null, false).id,
        '1',
    );
});

test('Hybrid rejects inconsistent APEX batch columns without publishing a combined result', async (t) => {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), 'hybrid-apex-format-'),
    );
    t.after(() => rm(directory, { recursive: true, force: true }));
    let calls = 0;
    const apex = {
        retrieve: async (_job, dir) => {
            const file = path.join(dir, 'report.csv');
            await writeFile(
                file,
                calls++ === 0
                    ? 'AWB,ID_ACCOUNT\n001,ACCOUNT1\n'
                    : 'AWB,ID_ACCOUNT,STATUS_WEB\n002,ACCOUNT1,Delivered\n',
            );
            return file;
        },
    };
    const awbs = Array.from({ length: 6001 }, (_, i) => String(i));
    await assert.rejects(
        () =>
            retrieveHybridApex(
                { id: 1, source: 'roberto', parameters: { awbs } },
                apex,
                directory,
                async () => {},
                new AbortController().signal,
                20971520,
            ),
        { code: 'APEX_CSV_FORMAT' },
    );
    assert.equal(calls, 2);
});

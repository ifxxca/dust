import test from 'node:test';
import assert from 'node:assert/strict';
import { runHybridReportJob } from '../src/hybrid-jobs.mjs';
import { ReportError } from '../src/errors.mjs';

function jobFixture(overrides = {}) {
    const state = { downloads: 0, uploads: 0, failures: [], progress: [] };
    const job = {
        id: 1,
        source: 'roberto',
        report_type: 'cashless',
        status: 'RUNNING',
        date_from: '2026-10-22',
        date_thru: '2026-10-22',
        lease_seconds: 300,
        ...overrides,
    };
    const client = {
        phase: 'download_csv',
        retrieve: async () => {
            state.downloads++;
            return { file: 'fixture.csv', rows: 2 };
        },
    };
    const api = {
        progress: async (_job, status) => {
            state.progress.push(status);
        },
        uploadSource: async () => {
            state.uploads++;
            return { status: 'WAITING_APEX', source_saved: true, awb_count: 2 };
        },
        fail: async (_job, error) => {
            state.failures.push(error);
        },
    };
    return { job, client, api, state };
}

test('Hybrid worker records CSV validation failures with the stage and keeps the browser available', async () => {
    const { job, client, api, state } = jobFixture();
    client.retrieve = async () => {
        throw new ReportError('HYBRID_CSV_DATE', 'Tanggal tidak sesuai.');
    };

    assert.equal(
        await runHybridReportJob(job, api, client, 'roberto', () => {}),
        false,
    );

    assert.equal(state.uploads, 0);
    assert.equal(state.failures[0].code, 'HYBRID_CSV_DATE');
    assert.equal(
        state.failures[0].message,
        '[download_csv] Tanggal tidak sesuai.',
    );
    assert.equal(state.failures[0].status, 'NEEDS_ATTENTION');
});

test('Hybrid worker leaves an unconfirmed upload for review without fetching the report again', async () => {
    const { job, client, api, state } = jobFixture();
    api.uploadSource = async () => ({ status: 'DOWNLOADING' });

    assert.equal(
        await runHybridReportJob(job, api, client, 'roberto', () => {}),
        false,
    );

    assert.equal(state.downloads, 1);
    assert.equal(state.failures[0].code, 'UPLOAD_UNCONFIRMED');
    assert.deepEqual(state.progress, ['WAITING_REPORT', 'DOWNLOADING']);
});

test('Hybrid worker rejects a job for another account before accessing the browser', async () => {
    const { job, client, api, state } = jobFixture({ source: 'nuralamt' });

    assert.equal(
        await runHybridReportJob(job, api, client, 'roberto', () => {}),
        false,
    );

    assert.equal(state.downloads, 0);
    assert.equal(state.uploads, 0);
    assert.equal(state.failures[0].code, 'HYBRID_JOB');
});

test('Hybrid worker reports a lost lease without uploading and never exposes raw errors', async () => {
    const { job, client, api, state } = jobFixture();
    api.progress = async () => {
        throw new Error('private credentials must not appear');
    };

    assert.equal(
        await runHybridReportJob(job, api, client, 'roberto', () => {}),
        false,
    );

    assert.equal(state.downloads, 0);
    assert.equal(state.uploads, 0);
    assert.equal(state.failures[0].code, 'HYBRID_ERROR');
    assert.ok(!state.failures[0].message.includes('private credentials'));
});

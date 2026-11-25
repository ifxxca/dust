import test from 'node:test';
import assert from 'node:assert/strict';
import { runHybridReportJob } from '../src/hybrid-jobs.mjs';
import { ReportError } from '../src/errors.mjs';
import { WorkerApi } from '../src/api.mjs';

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

test('Hybrid worker returns one CSV timeout to queue retry without retrying or uploading internally', async () => {
    const { job, client, api, state } = jobFixture({ automatic_retry: true });
    client.phase = 'prepare_csv';
    client.retrieve = async (_kind, _date, options) => {
        state.downloads++;
        assert.equal(options.automaticRetry, true);
        throw new ReportError(
            'HYBRID_DOWNLOAD_TIMEOUT',
            'Batas waktu menunggu tautan CSV Hybrid terlampaui.',
        );
    };
    assert.equal(
        await runHybridReportJob(job, api, client, 'roberto', () => {}),
        false,
    );
    assert.equal(state.downloads, 1);
    assert.equal(state.uploads, 0);
    assert.equal(state.failures.length, 1);
    assert.equal(state.failures[0].code, 'HYBRID_DOWNLOAD_TIMEOUT');
    assert.match(state.failures[0].message, /^\[prepare_csv\]/);
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

test('unknown prepare CSV errors retain a safe category without pretending to be network errors', async () => {
    const { job, client, api, state } = jobFixture({
        automatic_retry: true,
        attempt_count: 1,
    });
    client.phase = 'prepare_csv';
    client.retrieve = async () => {
        throw new Error(
            'password=secret cookie=private http://private/apex?session=123',
        );
    };
    const events = [];
    await runHybridReportJob(job, api, client, 'roberto', (_name, value) =>
        events.push(value),
    );
    assert.equal(state.failures[0].code, 'HYBRID_ERROR');
    assert.equal(state.failures[0].errorStage, 'prepare_csv');
    assert.equal(state.failures[0].rootCause, 'UNCLASSIFIED');
    assert.doesNotMatch(
        JSON.stringify([events, state.failures]),
        /secret|private|session=123/,
    );
});

test('confirmed locator ambiguity is permanent while timeout and reset remain transient', async () => {
    for (const [name, message, code, cause] of [
        [
            'Error',
            'strict mode violation: matched 2 elements password=secret',
            'HYBRID_STRUCTURE',
            'AMBIGUOUS_LOCATOR',
        ],
        [
            'TimeoutError',
            'private locator timed out',
            'NETWORK_TIMEOUT',
            'TIMEOUT',
        ],
        [
            'Error',
            'ECONNRESET http://private/session=123',
            'NETWORK_CONNECTION',
            'CONNECTION_FAILURE',
        ],
        [
            'Error',
            'Execution context was destroyed due to navigation',
            'HYBRID_PAGE_TRANSIENT',
            'PAGE_LOADING',
        ],
    ]) {
        const { job, client, api, state } = jobFixture({
            automatic_retry: true,
        });
        client.phase = 'prepare_csv';
        client.retrieve = async () => {
            const error = new Error(message);
            error.name = name;
            throw error;
        };
        await runHybridReportJob(job, api, client, 'roberto', () => {});
        assert.equal(state.failures[0].code, code);
        assert.equal(state.failures[0].rootCause, cause);
        assert.doesNotMatch(
            state.failures[0].message,
            /private|password|session=123/,
        );
        assert.equal(state.uploads, 0);
    }
});

test('a stale browser phase cannot turn a queue failure into a conservative source retry', async () => {
    const { job, client, api, state } = jobFixture({ automatic_retry: true });
    client.phase = 'prepare_csv';
    api.progress = async () => {
        throw new Error('private queue failure');
    };
    await runHybridReportJob(job, api, client, 'roberto', () => {});
    assert.equal(state.failures[0].errorStage, 'queue_progress');
    assert.doesNotMatch(state.failures[0].message, /prepare_csv|private/);
    assert.equal(state.downloads, 0);
});

test('worker API forwards safe Hybrid retry evidence and Retry-After using the original ownership token', async () => {
    const api = new WorkerApi({});
    api.request = async (endpoint, makeBody, token) => {
        assert.equal(endpoint, '134/fail');
        assert.equal(token, 'owned-claim');
        assert.deepEqual(await makeBody(), {
            status: 'NEEDS_ATTENTION',
            error_message: 'HYBRID_ERROR: [prepare_csv] gagal',
            http_status: 503,
            retry_after: '600',
            error_stage: 'prepare_csv',
            root_cause: 'UNCLASSIFIED',
        });
    };
    const error = new ReportError('HYBRID_ERROR', '[prepare_csv] gagal');
    Object.assign(error, {
        httpStatus: 503,
        retryAfter: '600',
        errorStage: 'prepare_csv',
        rootCause: 'UNCLASSIFIED',
    });
    await api.fail(
        { id: 134, automatic_retry: true, claim_token: 'owned-claim' },
        error,
    );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WorkerApi } from '../src/api.mjs';
import { ApexClient, formatDate } from '../src/apex.mjs';
import { runJob } from '../src/worker.mjs';
import { correlateHistory, csvReady, parseCreated } from '../src/history.mjs';
import { validateCsv } from '../src/csv.mjs';
import { validateReportPeriod } from '../src/limits.mjs';
import { loadConfig } from '../src/config.mjs';
import { apexFixture } from './apex-fixture.mjs';

const historyConfig = {
    historyDateFormat: 'ISO8601',
    timezone: 'Asia/Jakarta',
    clockSkew: 1000,
};
const baseTime = Date.parse('2026-10-20T08:00:00Z');
const job = {
    customer_account: 'TEST001',
    date_from: '2026-10-01',
    date_thru: '2026-10-02',
};
const row = (id, changes = {}) => ({
    id,
    filename: 'same-name.csv',
    status: 'Done',
    created: '2026-10-20T08:00:00Z',
    download: '/csv',
    error: '',
    columns: {},
    ...changes,
});

test('correlation ignores old Done rows and matches stable ID rather than filename or order', () => {
    const old = row('1');
    const current = row('2');
    assert.equal(
        correlateHistory(
            [old],
            [old, current],
            job,
            baseTime,
            historyConfig,
            null,
            true,
            baseTime,
        ).id,
        '2',
    );
    assert.equal(
        correlateHistory(
            [old],
            [old],
            job,
            baseTime,
            historyConfig,
            null,
            true,
            baseTime,
        ),
        null,
    );
});

test('correlation rejects ambiguous rows, malformed dates, and changed pinned IDs', () => {
    assert.throws(
        () =>
            correlateHistory(
                [],
                [row('2'), row('3')],
                job,
                baseTime,
                historyConfig,
                null,
                true,
                baseTime,
            ),
        { code: 'HISTORY_AMBIGUOUS' },
    );
    assert.throws(
        () =>
            correlateHistory(
                [],
                [row('2', { created: 'unknown' })],
                job,
                baseTime,
                historyConfig,
                null,
                true,
                baseTime,
            ),
        { code: 'HISTORY_DATE' },
    );
    assert.throws(
        () =>
            correlateHistory(
                [],
                [row('3')],
                job,
                baseTime,
                historyConfig,
                '2',
                true,
                baseTime,
            ),
        { code: 'HISTORY_CHANGED' },
    );
});

test('correlation rejects stale timestamps and mismatched accounts or periods', () => {
    for (const changes of [
        { created: '2026-10-01T08:00:00Z' },
        { columns: { IDACCOUNT: 'OTHER' } },
        { columns: { DATEFROM: '2026-01-01' } },
        { columns: { DATETHRU: '2026-01-01' } },
    ]) {
        assert.equal(
            correlateHistory(
                [],
                [row('2', changes)],
                job,
                baseTime,
                historyConfig,
                null,
                true,
                baseTime,
            ),
            null,
        );
    }
});

test('uncertain submissions require echoed account and period before correlating', () => {
    assert.throws(
        () =>
            correlateHistory(
                [],
                [row('2')],
                job,
                baseTime,
                historyConfig,
                null,
                false,
                baseTime,
            ),
        { code: 'SUBMISSION_UNCERTAIN' },
    );
    assert.equal(
        correlateHistory(
            [],
            [
                row('2', {
                    columns: {
                        IDACCOUNT: 'TEST001',
                        DATEFROM: job.date_from,
                        DATETHRU: job.date_thru,
                    },
                }),
            ],
            job,
            baseTime,
            historyConfig,
            null,
            false,
            baseTime,
        ).id,
        '2',
    );
});

test('Done with Error On Push is retrievable only when CSV exists', () => {
    assert.equal(csvReady(row('2', { error: 'Error On Push' })), true);
    assert.equal(
        csvReady(row('2', { error: 'Error On Push', download: null })),
        false,
    );
    assert.equal(
        csvReady(row('2', { status: 'Failed', download: null })),
        false,
    );
    assert.equal(csvReady(row('2', { status: 'Error' })), true);
});

test('uncertain submission correlates an exact filename account and authenticated creator but rejects partial or foreign matches', () => {
    const config = { ...historyConfig, username: 'fixture-user' };
    const created = row('2', {
        filename: 'report-TEST001-20261020.csv',
        columns: { CREATEDUSER: 'FIXTURE-USER' },
    });
    assert.equal(
        correlateHistory(
            [],
            [created],
            job,
            baseTime,
            config,
            null,
            false,
            baseTime,
        ).id,
        '2',
    );
    assert.throws(
        () =>
            correlateHistory(
                [],
                [{ ...created, columns: { CREATEDUSER: 'other-user' } }],
                job,
                baseTime,
                config,
                null,
                false,
                baseTime,
            ),
        { code: 'SUBMISSION_UNCERTAIN' },
    );
    assert.throws(
        () =>
            correlateHistory(
                [],
                [{ ...created, filename: 'report-XTEST001Y.csv' }],
                job,
                baseTime,
                config,
                null,
                false,
                baseTime,
            ),
        { code: 'SUBMISSION_UNCERTAIN' },
    );
    assert.throws(
        () =>
            correlateHistory(
                [],
                [created, { ...created, id: '3' }],
                job,
                baseTime,
                config,
                null,
                false,
                baseTime,
            ),
        { code: 'HISTORY_AMBIGUOUS' },
    );
});

test('history timestamp parsing uses configured timezone and rejects invalid dates', () => {
    assert.equal(
        parseCreated(
            '2026-10-20 15:00:00',
            'YYYY-MM-DD HH:mm:ss',
            'Asia/Jakarta',
        ),
        baseTime,
    );
    assert.equal(
        parseCreated(
            '20-OCT-2026 15:00:00',
            'DD-MON-YYYY HH:mm:ss',
            'Asia/Jakarta',
        ),
        baseTime,
    );
    assert.equal(
        parseCreated(
            '20/10/2026 15:00:00',
            'DD/MM/YYYY HH:mm:ss',
            'Asia/Jakarta',
        ),
        baseTime,
    );
    assert.equal(
        parseCreated('20-OCT-2026 15:00', 'DD-MON-YYYY HH:mm', 'Asia/Jakarta'),
        baseTime,
    );
    assert.ok(
        Number.isNaN(
            parseCreated(
                '31/02/2026 15:00:00',
                'DD/MM/YYYY HH:mm:ss',
                'Asia/Jakarta',
            ),
        ),
    );
    assert.ok(
        Number.isNaN(
            parseCreated('2026-10-20T15:00:00', 'ISO8601', 'Asia/Jakarta'),
        ),
    );
    assert.equal(formatDate('2026-10-20', 'DD-MON-YYYY'), '20-OCT-2026');
    assert.throws(() => formatDate('2026-10-20', ''), {
        code: 'FORM_DATE_FORMAT',
    });
});

test('CSV validation accepts quoted multiline CSV and rejects empty binary HTML broken or oversized files', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'jne-csv-'));
    try {
        const file = path.join(dir, 'report.csv');
        await writeFile(
            file,
            '\uFEFFAWB,ID_ACCOUNT,SHIPPER_NAME\r\n123,TEST,"Quoted,\nname"\r\n',
        );
        assert.ok((await validateCsv(file, 1024)).size > 0);
        for (const content of [
            '',
            '<html>Login</html>',
            '{"message":"error"}',
            'AWB,ID_ACCOUNT\n123,TEST,EXTRA\n',
            'AWB,AWB\n123,TEST',
            'AWB,ID_ACCOUNT\n"unclosed,TEST',
            'AWB,ID_ACCOUNT\n123,\0',
        ]) {
            await writeFile(file, content);
            await assert.rejects(validateCsv(file, 1024));
        }
        await writeFile(file, 'AWB,ID_ACCOUNT\n123,TEST');
        await assert.rejects(validateCsv(file, 1), { code: 'CSV_SIZE' });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('report periods allow five inclusive days and reject longer reversed and invalid calendar dates', () => {
    for (const [from, thru] of [
        ['2026-10-13', '2026-10-13'],
        ['2026-10-13', '2026-10-17'],
        ['2026-10-30', '2026-11-03'],
        ['2024-02-27', '2024-03-02'],
    ])
        assert.doesNotThrow(() =>
            validateReportPeriod({ date_from: from, date_thru: thru }),
        );
    for (const [from, thru] of [
        ['2026-10-13', '2026-10-18'],
        ['2026-10-14', '2026-10-13'],
        ['2026-02-30', '2026-03-01'],
        ['', '2026-10-13'],
        ['2026-10-13', 'invalid'],
    ])
        assert.throws(
            () => validateReportPeriod({ date_from: from, date_thru: thru }),
            {
                code: 'REPORT_PERIOD_LIMIT',
                status: 'FAILED',
            },
        );
});

test('CSV limit counts records rather than physical lines and rejects record 6001', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'jne-csv-limit-'));
    try {
        const file = path.join(dir, 'report.csv');
        const csv =
            'AWB,SHIPPER_NAME\n\n' + '123,"Name\ncontinued"\n'.repeat(6000);
        await writeFile(file, csv);
        assert.ok((await validateCsv(file, 1048576)).size > 0);
        await writeFile(file, csv + '123,Other\n');
        await assert.rejects(validateCsv(file, 1048576), {
            code: 'CSV_AWB_LIMIT',
            status: 'NEEDS_ATTENTION',
        });
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('configuration rejects missing secrets, remote plaintext URLs and public session directories', () => {
    assert.throws(() => loadConfig({}), { code: 'CONFIG_REQUIRED' });
    assert.throws(
        () =>
            loadConfig({
                RETAIL_OPERATIONS_URL: 'http://remote.example',
                APEX_LOGIN_URL: 'https://example.test',
            }),
        { code: 'CONFIG_INVALID' },
    );
});

async function browserRun(t, options = {}) {
    const fixture = await apexFixture(options);
    const dir = await mkdtemp(path.join(os.tmpdir(), 'jne-browser-'));
    const config = {
        ...historyConfig,
        ...(options.historyMinutes
            ? { historyDateFormat: 'DD-MON-YYYY HH:mm', clockSkew: 120000 }
            : {}),
        apiUrl: fixture.url,
        token: 'x'.repeat(40),
        workerId: 'jne-report-1',
        apiTimeout: 5000,
        loginUrl: fixture.url + '/login',
        username: 'fixture-user',
        password: 'fixture-password',
        dataDir: dir,
        sessionPath: path.join(dir, 'apex-session.json'),
        appId: '',
        baseUrl: '',
        navigationTimeout: 3000,
        downloadTimeout: options.downloadUnavailable
            ? 150
            : options.retryDownload
              ? 1000
              : 3000,
        reportTimeout: options.neverReady ? 250 : 10000,
        jobTimeout: 15000,
        pollInterval: 20,
        maxFileBytes: 1048576,
        extraFields: {
            ...(options.configuredBranch ? { '#branch': 'BR' } : {}),
            ...(options.globalNational
                ? { '#P45_NA': options.globalNational }
                : {}),
        },
        processSelector: '',
        successSelector: '.t-Alert--success',
    };
    const apex = new ApexClient(config);
    t.after(async () => {
        await apex.close();
        await fixture.close();
        await rm(dir, { recursive: true, force: true });
    });
    const api = new WorkerApi(config);
    const claimed = await api.claim('fixture-key');
    const completed = await runJob(
        claimed,
        api,
        apex,
        config,
        new AbortController().signal,
    );
    assert.equal(
        (await readdir(dir)).some((name) => name.startsWith('job-')),
        false,
    );
    return { fixture, completed, apex, config, dir };
}

for (const nationalAccount of ['Y', 'N']) {
    test(`APEX applies National Acc/Cust ${nationalAccount} before customer and dates after navigation`, async (t) => {
        const { fixture, completed } = await browserRun(t, {
            nationalAccount,
            globalNational: nationalAccount === 'Y' ? 'N' : 'Y',
        });
        assert.equal(completed, true);
        assert.equal(fixture.state.submitted.get('national'), nationalAccount);
        assert.equal(fixture.state.submitted.get('customer'), 'TEST001');
        assert.equal(fixture.state.submitted.get('from'), '2026-10-01');
        assert.equal(fixture.state.submissions, 1);
    });
}

test('APEX restores its saved session after restart without opening Login', async (t) => {
    const { fixture, apex, config } = await browserRun(t);
    const visits = fixture.state.loginVisits;
    await apex.close();
    const restored = new ApexClient(config);
    t.after(() => restored.close());

    await restored.open(45);

    assert.equal(fixture.state.loginVisits, visits);
    assert.equal(fixture.state.logins, 1);
    assert.equal(fixture.state.submissions, 1);
    assert.equal(
        await restored.page.locator('#P45_PARAM_TYPE').isVisible(),
        true,
    );
});

test('APEX reauthenticates an expired saved session without submitting another report', async (t) => {
    const { fixture, apex, config } = await browserRun(t);
    await apex.close();
    fixture.state.authenticated = false;
    const restored = new ApexClient(config);
    t.after(() => restored.close());

    await restored.open(45);

    assert.equal(fixture.state.logins, 2);
    assert.equal(fixture.state.submissions, 1);
});

test('APEX failure artifacts retain diagnostics with inputs scripts and navigation URLs removed', async (t) => {
    const { completed, dir } = await browserRun(t, { invalidCsv: true });
    assert.equal(completed, false);
    const directory = path.join(dir, 'failures');
    const artifacts = await readdir(directory);
    assert.equal(artifacts.length, 3);
    const metadata = JSON.parse(
        await readFile(
            path.join(
                directory,
                artifacts.find((name) => name.endsWith('.json')),
            ),
            'utf8',
        ),
    );
    assert.equal(metadata.code, 'CSV_INVALID');
    assert.equal(metadata.phase, 'DOWNLOADING');
    const html = await readFile(
        path.join(
            directory,
            artifacts.find((name) => name.endsWith('.html')),
        ),
        'utf8',
    );
    assert.doesNotMatch(
        html,
        /<input|<script|href=|pInstance|fixture-password|fixture-claim/i,
    );
});

test('Chromium logs in submits once polls correct row downloads and uploads CSV', async (t) => {
    const { fixture, completed } = await browserRun(t, { pushError: true });
    assert.equal(completed, true);
    assert.equal(fixture.state.logins, 1);
    assert.equal(fixture.state.submissions, 1);
    assert.equal(fixture.state.submitted.get('customer'), 'TEST001');
    assert.equal(fixture.state.submitted.get('from'), '2026-10-01');
    assert.equal(fixture.state.submitted.get('thru'), '2026-10-02');
    assert.equal(fixture.state.submitted.get('mode'), 'P');
    assert.deepEqual(fixture.state.downloads, ['2']);
    assert.equal(fixture.state.uploaded, true);
    assert.ok(fixture.state.progress.includes('WAITING_REPORT'));
    assert.ok(fixture.state.progress.includes('DOWNLOADING'));
});

test('Chromium recovers an expired session during polling without resubmitting', async (t) => {
    const { fixture, completed } = await browserRun(t, { expire: true });
    assert.equal(completed, true);
    assert.equal(fixture.state.logins, 2);
    assert.equal(fixture.state.submissions, 1);
});

test('Chromium refreshes the same report through Error, Failed and Done until Download appears', async (t) => {
    const { fixture, completed } = await browserRun(t, {
        historyStates: [
            { status: 'Error', error: 'API 500', download: false },
            { status: 'Failed', download: false },
            { status: 'Done', download: false },
            { status: 'Done', download: true },
        ],
    });
    assert.equal(completed, true);
    assert.equal(fixture.state.pollReads, 4);
    assert.equal(fixture.state.submissions, 1);
    assert.deepEqual(fixture.state.downloads, ['2']);
    assert.equal(fixture.state.uploaded, true);
});

test('Chromium downloads an available CSV even when History still says Error', async (t) => {
    const { fixture, completed } = await browserRun(t, {
        historyStates: [{ status: 'Error', download: true }],
    });
    assert.equal(completed, true);
    assert.equal(fixture.state.submissions, 1);
    assert.deepEqual(fixture.state.downloads, ['2']);
});

test('Chromium refreshes and retries an unavailable Download without repeating Process', async (t) => {
    const { fixture, completed } = await browserRun(t, { retryDownload: true });
    assert.equal(completed, true);
    assert.equal(fixture.state.submissions, 1);
    assert.deepEqual(fixture.state.downloads, ['2', '2']);
    assert.ok(fixture.state.pollReads >= 3);
    assert.equal(fixture.state.uploaded, true);
});

test('Chromium keeps polling after a temporary History outage without repeating Process', async (t) => {
    const { fixture, completed } = await browserRun(t, {
        historyNavigationFailures: 3,
    });
    assert.equal(completed, true);
    assert.equal(fixture.state.navigationFailures, 3);
    assert.equal(fixture.state.submissions, 1);
    assert.deepEqual(fixture.state.downloads, ['2']);
    assert.equal(fixture.state.uploaded, true);
});

test('Chromium verifies login in upload mode and waits for dynamically rendered parameter fields', async (t) => {
    const { fixture, completed } = await browserRun(t, {
        dynamicParameters: true,
    });
    assert.equal(completed, true);
    assert.equal(fixture.state.logins, 1);
    assert.equal(fixture.state.submissions, 1);
    assert.equal(fixture.state.submitted.get('mode'), 'P');
    assert.equal(fixture.state.submitted.get('customer'), 'TEST001');
    assert.deepEqual(fixture.state.downloads, ['2']);
});

test('Chromium selects dependent branch controls before filling account and dates', async (t) => {
    const { fixture, completed } = await browserRun(t, {
        branch: true,
        configuredBranch: true,
    });
    assert.equal(completed, true);
    assert.equal(fixture.state.submissions, 1);
    assert.equal(fixture.state.submitted.get('customer'), 'TEST001');
    assert.equal(fixture.state.submitted.get('from'), '2026-10-01');
    assert.equal(fixture.state.submitted.get('thru'), '2026-10-02');
});

test('Chromium does not retrigger change navigation for an already selected option', async (t) => {
    const { fixture, completed } = await browserRun(t, {
        branch: true,
        configuredBranch: true,
        branchDefault: true,
    });
    assert.equal(completed, true);
    assert.equal(fixture.state.submissions, 1);
    assert.equal(fixture.state.submitted.get('mode'), 'P');
    assert.equal(fixture.state.submitted.get('customer'), 'TEST001');
});

test('Chromium waits for full navigation after changing parameter mode', async (t) => {
    const { fixture, completed } = await browserRun(t, {
        branch: true,
        configuredBranch: true,
        navigationParameters: true,
    });
    assert.equal(completed, true);
    assert.equal(fixture.state.submissions, 1);
    assert.equal(fixture.state.submitted.get('mode'), 'P');
    assert.equal(fixture.state.submitted.get('customer'), 'TEST001');
});

test('Chromium correlates and downloads history without f01 using minute precision timestamps', async (t) => {
    const { fixture, completed } = await browserRun(t, {
        dynamicParameters: true,
        noSelection: true,
        historyMinutes: true,
    });
    assert.equal(completed, true);
    assert.equal(fixture.state.submissions, 1);
    assert.deepEqual(fixture.state.downloads, ['2']);
    assert.equal(fixture.state.uploaded, true);
});

/** @type {Array<[string, object, string, number]>} */
const failureCases = [
    [
        'duplicate history identity',
        { noSelection: true, ambiguous: true, duplicateMetadata: true },
        'HISTORY_STRUCTURE',
        1,
    ],
    ['inaccessible report page', { deniedReport: true }, 'LOGIN_UNVERIFIED', 0],
    ['ambiguous history', { ambiguous: true }, 'HISTORY_AMBIGUOUS', 1],
    ['required branch', { branch: true }, 'FORM_REQUIRED', 0],
    ['invalid mode', { badMode: true }, 'FORM_OPTION', 0],
    [
        'uncertain submission',
        { uncertain: true, noMetadata: true },
        'SUBMISSION_UNCERTAIN',
        1,
    ],
    ['invalid downloaded CSV', { invalidCsv: true }, 'CSV_INVALID', 1],
    ['excessive AWB count', { awbCount: 6001 }, 'CSV_AWB_LIMIT', 1],
    [
        'excessive date range',
        { dateThru: '2026-10-06' },
        'REPORT_PERIOD_LIMIT',
        0,
    ],
    ['generation timeout', { neverReady: true }, 'REPORT_TIMEOUT', 1],
    [
        'persistent Error timeout',
        {
            neverReady: true,
            historyStates: [{ status: 'Error', download: false }],
        },
        'REPORT_TIMEOUT',
        1,
    ],
    [
        'unavailable Download timeout',
        {
            neverReady: true,
            historyStates: [{ status: 'Done', download: true }],
            downloadUnavailable: true,
        },
        'REPORT_TIMEOUT',
        1,
    ],
];
for (const [name, options, code, submissions] of failureCases) {
    test(
        'Chromium reports ' + name + ' and never repeats Process',
        async (t) => {
            const { fixture, completed } = await browserRun(t, options);
            assert.equal(completed, false);
            assert.equal(fixture.state.submissions, submissions);
            assert.ok(
                fixture.state.failed?.error_message.startsWith(code + ':'),
                fixture.state.failed?.error_message,
            );
            assert.equal(fixture.state.uploaded, false);
        },
    );
}

test('Chromium handles empty history and correlates an uncertain response with echoed parameters', async (t) => {
    const { fixture, completed } = await browserRun(t, {
        emptyHistory: true,
        uncertain: true,
    });
    assert.equal(completed, true);
    assert.equal(fixture.state.submissions, 1);
});

test('persistent upstream API 500 remains polled and is explained in the timeout and private diagnostics', async (t) => {
    const { fixture, completed, dir } = await browserRun(t, {
        neverReady: true,
        historyStates: [
            { status: 'Error', download: false, error: 'Error API 500.' },
        ],
    });
    assert.equal(completed, false);
    assert.equal(fixture.state.submissions, 1);
    assert.ok(fixture.state.pollReads > 1);
    assert.match(fixture.state.failed.error_message, /Error API 500/);
    const failures = path.join(dir, 'failures');
    const metadata = (await readdir(failures)).find((name) =>
        name.endsWith('.json'),
    );
    const diagnostic = JSON.parse(
        await readFile(path.join(failures, metadata), 'utf8'),
    );
    assert.deepEqual(diagnostic.page.last_history, {
        status: 'Error',
        download_available: false,
        api_error_code: '500',
    });
});

test('lost upload response retries upload without generating a second report', async (t) => {
    const { fixture, completed } = await browserRun(t, {
        lostUploadResponse: true,
    });
    assert.equal(completed, true);
    assert.equal(fixture.state.uploadAttempts, 2);
    assert.equal(fixture.state.submissions, 1);
});

test('repeated upload failure reports attention and never generates a second report', async (t) => {
    const { fixture, completed } = await browserRun(t, { uploadFailure: true });
    assert.equal(completed, false);
    assert.equal(fixture.state.uploadAttempts, 3);
    assert.equal(fixture.state.submissions, 1);
    assert.equal(fixture.state.failed.status, 'NEEDS_ATTENTION');
});

test('graceful shutdown reports uncertainty and cleans the job directory and browser', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'jne-stop-'));
    const stop = new AbortController();
    let failure;
    let closed = false;
    const apex = {
        retrieve: async (claimed, tempDir, progress, signal) => {
            stop.abort();
            signal.throwIfAborted();
        },
        close: async () => {
            closed = true;
        },
    };
    const api = {
        fail: async (claimed, error) => {
            failure = error;
        },
    };
    try {
        assert.equal(
            await runJob(
                { id: 1, status: 'RUNNING', lease_seconds: 300 },
                api,
                apex,
                { dataDir: dir, jobTimeout: 1000 },
                stop.signal,
            ),
            false,
        );
        assert.equal(failure.code, 'WORKER_STOPPED');
        assert.equal(failure.status, 'NEEDS_ATTENTION');
        assert.equal(closed, true);
        assert.deepEqual(await readdir(dir), []);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

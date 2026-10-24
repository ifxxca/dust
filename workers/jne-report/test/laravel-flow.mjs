import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { WorkerApi } from '../src/api.mjs';
import { ApexClient } from '../src/apex.mjs';
import { runJob } from '../src/worker.mjs';
import { apexFixture } from './apex-fixture.mjs';

const fixture = await apexFixture({ expire: true, pushError: true });
const dataDir = path.resolve(process.env.JNE_E2E_DATA_DIR);
await mkdir(dataDir, { recursive: true, mode: 0o700 });
const config = {
    apiUrl: process.env.RETAIL_OPERATIONS_URL,
    token: process.env.JNE_REPORT_WORKER_TOKEN,
    workerId: 'jne-report-1',
    apiTimeout: 10000,
    loginUrl: fixture.url + '/login',
    username: 'fixture-user',
    password: 'fixture-password',
    dataDir,
    sessionPath: path.join(dataDir, 'apex-session.json'),
    appId: '',
    baseUrl: '',
    historyDateFormat: 'ISO8601',
    timezone: 'Asia/Jakarta',
    clockSkew: 1000,
    navigationTimeout: 3000,
    downloadTimeout: 3000,
    reportTimeout: 10000,
    jobTimeout: 15000,
    pollInterval: 20,
    maxFileBytes: 1048576,
    extraFields: {},
    processSelector: '',
    successSelector: '.t-Alert--success',
};
const api = new WorkerApi(config);
const apex = new ApexClient(config);
try {
    const job = await api.claim(crypto.randomUUID());
    assert.equal(job?.status, 'RUNNING');
    assert.equal(
        await runJob(job, api, apex, config, new AbortController().signal),
        true,
    );
    assert.equal(fixture.state.submissions, 1);
    assert.equal(fixture.state.logins, 2);
    assert.deepEqual(fixture.state.downloads, ['2']);
    assert.equal(fixture.state.submitted.get('customer'), 'TEST001');
    assert.equal(fixture.state.submitted.get('national'), 'Y');
    process.stdout.write('LARAVEL_CHROMIUM_FIXTURE_OK\n');
} finally {
    await apex.close();
    await fixture.close();
}

import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApexClient } from '../src/apex.mjs';
import { loadConfig } from '../src/config.mjs';

const base = process.env.APEX_SIMULATION_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const headers = { 'x-mock-slug': 'apex' };
class SimulationClient extends ApexClient {
    async start() {
        await super.start();
        await this.context.setExtraHTTPHeaders(headers);
    }
}
const directory = await mkdtemp(path.join(os.tmpdir(), 'apex-postman-'));
const config = loadConfig({
    RETAIL_OPERATIONS_URL: base,
    JNE_REPORT_WORKER_TOKEN: 'x'.repeat(40),
    APEX_USERNAME: 'fixture-user',
    APEX_PASSWORD: 'fixture-password',
    APEX_LOGIN_URL: base + '/login?node=01',
    APEX_LOGIN_URLS: base + '/login?node=02',
    JNE_WORKER_DATA_DIR: directory,
    APEX_HISTORY_DATE_FORMAT: 'ISO8601',
    JNE_HISTORY_RENDER_WAIT_MS: '0',
    JNE_POLL_INTERVAL_MS: '20',
    JNE_NAVIGATION_TIMEOUT_MS: '2500',
});
const client = new SimulationClient(config);
try {
    const file = await client.retrieve(
        {
            id: 17,
            customer_account: 'TEST001',
            date_from: '2026-10-01',
            date_thru: '2026-10-02',
            report_mode: 'P',
            national_account: 'N',
            max_file_kb: 1024,
        },
        directory,
        async () => {},
        new AbortController().signal,
    );
    assert.match(await readFile(file, 'utf8'), /AWB,ID_ACCOUNT/);
    await client.open(45);
    const response = await fetch(base + '/fixture-state', { headers });
    assert(response.ok);
    const state = await response.json();
    const { pollReads, ...counts } = state;
    assert.deepEqual(counts, {
        primaryRequests: 1,
        logins: 1,
        submissions: 1,
        downloads: 1,
    });
    assert.ok(
        pollReads >=
            (process.env.APEX_SIMULATION_DELAYED_REPORT === '1' ? 9 : 1),
    );
    assert.equal(client.endpointIndex, 1);
    console.log(
        JSON.stringify({
            result: 'passed',
            scenario:
                'primary HTTP 503, backup login and report download, sticky endpoint, exactly one Process',
        }),
    );
} finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
}

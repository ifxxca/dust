import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { ApexClient } from '../src/apex.mjs';
import { apexFixture } from './apex-fixture.mjs';

const environment = {
    RETAIL_OPERATIONS_URL: 'http://localhost:8000',
    JNE_REPORT_WORKER_TOKEN: 'x'.repeat(40),
    APEX_USERNAME: 'fixture-user',
    APEX_PASSWORD: 'fixture-password',
};

test('report and job waiting are unlimited by default and reject negative limits', () => {
    const input = {
        ...environment,
        APEX_LOGIN_URL: 'https://one.test/apex/f?p=105',
    };
    assert.equal(loadConfig(input).reportTimeout, 0);
    assert.equal(loadConfig(input).jobTimeout, 0);
    assert.equal(
        loadConfig({
            ...input,
            JNE_REPORT_TIMEOUT_MS: '0',
            JNE_JOB_TIMEOUT_MS: '0',
        }).jobTimeout,
        0,
    );
    assert.throws(() => loadConfig({ ...input, JNE_REPORT_TIMEOUT_MS: '-1' }), {
        code: 'CONFIG_INVALID',
    });
});

test('multiple login URLs preserve order, deduplicate, and retain the single URL configuration', () => {
    const primary = 'https://dash-ccc01.jne.co.id/apex/f?p=105';
    const backup = 'https://dash-ccc02.jne.co.id/apex/f?p=105';
    assert.deepEqual(
        loadConfig({ ...environment, APEX_LOGIN_URL: primary }).loginUrls,
        [primary],
    );
    assert.deepEqual(
        loadConfig({
            ...environment,
            APEX_LOGIN_URL: primary,
            APEX_LOGIN_URLS: `${primary}, ${backup}`,
        }).loginUrls,
        [primary, backup],
    );
    assert.deepEqual(
        loadConfig({
            ...environment,
            APEX_LOGIN_URLS: JSON.stringify([primary, backup]),
        }).loginUrls,
        [primary, backup],
    );
});

for (const invalid of [
    '[null]',
    '{}',
    '["not-a-url"]',
    'https://user:password@example.test',
    'http://remote.example',
    JSON.stringify(
        Array.from({ length: 9 }, (_, i) => `https://example${i}.test`),
    ),
]) {
    test(
        'invalid alternate URL configuration is rejected: ' +
            invalid.replace(/password/g, 'redacted'),
        () => {
            assert.throws(
                () => loadConfig({ ...environment, APEX_LOGIN_URLS: invalid }),
                { code: 'CONFIG_INVALID' },
            );
        },
    );
}

test('an explicit APEX base endpoint must belong to the primary server', () => {
    assert.throws(
        () =>
            loadConfig({
                ...environment,
                APEX_LOGIN_URL: 'https://one.test/apex/f?p=105',
                APEX_BASE_URL: 'https://other.test/apex/f',
            }),
        { code: 'CONFIG_INVALID' },
    );
});

async function setup(t, primaryOptions = {}, count = 2) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'apex-failover-'));
    const nodes = [];
    const config = {
        ...loadConfig({
            ...environment,
            APEX_LOGIN_URL: 'http://localhost/login',
        }),
        dataDir: directory,
        sessionPath: path.join(directory, 'apex-session.json'),
        navigationTimeout: 400,
        downloadTimeout: 1000,
        reportTimeout: 5000,
        pollInterval: 10,
        historyRenderWait: 0,
        historyDateFormat: 'ISO8601',
        clockSkew: 1000,
    };
    for (let i = 0; i < count; i++)
        nodes.push(await apexFixture(i === 0 ? primaryOptions : {}));
    config.loginUrls = nodes.map((node) => node.url + '/login');
    config.loginUrl = config.loginUrls[0];
    config.baseUrl = nodes[0].url + '/f';
    const client = new ApexClient(config);
    t.after(async () => {
        await client.close();
        await Promise.all(nodes.map((node) => node.close()));
        await rm(directory, { recursive: true, force: true });
    });
    return { directory, nodes, client };
}

test('503 on the primary moves to the backup, isolates its session, and keeps the healthy server', async (t) => {
    const { directory, nodes, client } = await setup(t);
    nodes[0].state.available = false;
    const file = await client.retrieve(
        nodes[1].job,
        directory,
        async () => {},
        new AbortController().signal,
    );
    assert.match(await readFile(file, 'utf8'), /AWB,ID_ACCOUNT/);
    assert.equal(nodes[0].state.endpointRequests, 1);
    assert.equal(nodes[0].state.logins, 0);
    assert.equal(nodes[1].state.submissions, 1);
    assert.equal(client.config.loginUrl, nodes[1].url + '/login');
    assert.equal(new URL(client.endpoint).origin, nodes[1].url);
    assert.notEqual(
        client.config.sessionPath,
        path.join(directory, 'apex-session.json'),
    );
    assert.equal(
        JSON.parse(await readFile(client.config.sessionPath + '.apex.json'))
            .origin,
        nodes[1].url,
    );
    assert.equal(
        JSON.parse(await readFile(path.join(directory, 'submission.json')))
            .apex_origin,
        nodes[1].url,
    );
    await client.open(45);
    assert.equal(nodes[0].state.endpointRequests, 1);
});

test('authentication can rotate nodes before a report is started', async (t) => {
    const { nodes, client } = await setup(t);
    nodes[0].state.available = false;
    await client.authenticate();
    assert.equal(client.endpointIndex, 1);
    assert.equal(nodes[1].state.logins, 1);
});

test('failure while reading the pre-submission history starts a fresh snapshot on the backup', async (t) => {
    const { directory, nodes, client } = await setup(t, {
        historyUnavailable: true,
    });
    await client.retrieve(
        nodes[1].job,
        directory,
        async () => {},
        new AbortController().signal,
    );
    assert.equal(nodes[0].state.logins, 1);
    assert.equal(nodes[0].state.submissions, 0);
    assert.equal(nodes[1].state.submissions, 1);
    assert.equal(client.endpointIndex, 1);
});

test('switching servers does not carry cookies from the previous browser context', async (t) => {
    const { nodes, client } = await setup(t);
    await client.open(45);
    await client.context.addCookies([
        { name: 'primary-only', value: 'fixture', url: nodes[0].url },
    ]);
    nodes[0].state.available = false;
    await client.open(45);
    assert.equal(client.endpointIndex, 1);
    assert.equal(
        (await client.context.cookies()).some(
            (cookie) => cookie.name === 'primary-only',
        ),
        false,
    );
});

test('a refused connection moves to the next server', async (t) => {
    const { nodes, client } = await setup(t);
    await nodes[0].close();
    nodes[0].close = async () => {};
    await client.open(45);
    assert.equal(client.endpointIndex, 1);
});

test('the next job can move again after a previously healthy backup goes down', async (t) => {
    const { directory, nodes, client } = await setup(t, {}, 3);
    nodes[0].state.available = false;
    await client.retrieve(
        nodes[1].job,
        directory,
        async () => {},
        new AbortController().signal,
    );
    nodes[1].state.available = false;
    await client.retrieve(
        nodes[2].job,
        directory,
        async () => {},
        new AbortController().signal,
    );
    assert.equal(client.endpointIndex, 2);
    assert.equal(nodes[1].state.submissions, 1);
    assert.equal(nodes[2].state.submissions, 1);
});

test('four unavailable servers terminate without submitting any report', async (t) => {
    const { directory, nodes, client } = await setup(t, {}, 4);
    nodes.forEach((node) => {
        node.state.available = false;
    });
    await assert.rejects(
        client.retrieve(
            nodes[0].job,
            directory,
            async () => {},
            new AbortController().signal,
        ),
        { code: 'APEX_ENDPOINTS_UNAVAILABLE' },
    );
    assert.deepEqual(
        nodes.map((node) => node.state.submissions),
        [0, 0, 0, 0],
    );
    assert.deepEqual(
        nodes.map((node) => node.state.endpointRequests),
        [1, 1, 1, 1],
    );
});

test('rejected credentials do not get retried against another server', async (t) => {
    const { nodes, client } = await setup(t, { loginRefused: true });
    await assert.rejects(client.open(45), { code: 'LOGIN_REQUIRED' });
    assert.equal(nodes[0].state.logins, 1);
    assert.equal(nodes[1].state.endpointRequests, 0);
});

test('losing the original server after Process never submits the report to a backup', async (t) => {
    const { directory, nodes, client } = await setup(t, {
        failAfterSubmission: true,
    });
    client.config.reportTimeout = 300;
    await assert.rejects(
        client.retrieve(
            nodes[0].job,
            directory,
            async () => {},
            new AbortController().signal,
        ),
        { code: 'REPORT_TIMEOUT' },
    );
    assert.equal(nodes[0].state.submissions, 1);
    assert.equal(nodes[1].state.endpointRequests, 0);
    assert.equal(client.endpointIndex, 0);
});

test('an aborted job never opens another endpoint', async (t) => {
    const { directory, nodes, client } = await setup(t);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        client.retrieve(
            nodes[0].job,
            directory,
            async () => {},
            controller.signal,
        ),
        { name: 'AbortError' },
    );
    assert.equal(nodes[0].state.endpointRequests, 0);
    assert.equal(nodes[1].state.endpointRequests, 0);
});

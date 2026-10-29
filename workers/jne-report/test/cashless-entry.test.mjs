import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { HybridClient } from '../src/hybrid.mjs';
import {
    HybridCashlessPage,
    cashlessOutcome,
    processCashlessBatch,
} from '../src/cashless-entry.mjs';
const require = createRequire(import.meta.url);
const { cashlessFixture } = require('./cashless-fixture.cjs');

async function fixture(t, settings = {}) {
    const mock = cashlessFixture();
    mock.state.settings = settings;
    const server = http.createServer(mock.handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const directory = await mkdtemp(path.join(os.tmpdir(), 'cashless-entry-'));
    const profile = {
        name: 'roberto',
        loginUrl: `http://127.0.0.1:${server.address().port}/apex/f?p=113:LOGIN_DESKTOP::::::`,
        username: 'fixture',
        password: 'fixture',
    };
    const client = new HybridClient(profile, {
        outputDir: directory,
        navigationTimeout: settings.timeout || 1000,
        downloadTimeout: 2000,
        clock: () => new Date('2026-10-28T08:00:00Z'),
    });
    await client.start();
    t.after(async () => {
        await client.close();
        await new Promise((resolve) => server.close(resolve));
        await rm(directory, { recursive: true, force: true });
    });
    return { client, state: mock.state };
}
function batch(awbs, id = 1) {
    return {
        id,
        status: 'CLAIMED',
        ho_number: null,
        claim_token: 'test',
        lease_seconds: 300,
        items: awbs.map((awb, i) => ({ id: i + 1, awb, status: 'PENDING' })),
    };
}
function api(options = {}) {
    const events = [];
    return {
        events,
        async checkpoint(batch, type, evidence) {
            events.push({ batch: batch.id, type, ...evidence });
            if (type === options.failAt)
                throw new Error('Lost Laravel acknowledgment');
            return {
                status:
                    type === 'approved'
                        ? 'DONE'
                        : type === 'empty'
                          ? 'FAILED'
                          : type === 'hold'
                            ? 'UNKNOWN'
                            : 'ENTERING',
            };
        },
    };
}

test('two batches always create and approve distinct HOs with sequential fresh results', async (t) => {
    const { client, state } = await fixture(t);
    const log = api();
    for (const [index, awbs] of [['SLOW1', 'SLOW2'], ['TG3']].entries()) {
        const result = await client.exclusive(() =>
            processCashlessBatch(
                batch(awbs, index + 1),
                log,
                new HybridCashlessPage(client),
            ),
        );
        assert.equal(result.status, 'DONE');
    }
    assert.equal(state.news, 2);
    assert.deepEqual(state.approvals, ['HO-015-TEST-1', 'HO-015-TEST-2']);
    assert.deepEqual(state.scans, [
        { awb: 'SLOW1', ho: 'HO-015-TEST-1' },
        { awb: 'SLOW2', ho: 'HO-015-TEST-1' },
        { awb: 'TG3', ho: 'HO-015-TEST-2' },
    ]);
    assert(
        log.events
            .filter((e) => e.type === 'scan-result')
            .every((e) => e.outcome === 'ACCEPTED'),
    );
});

test('an uncertain batch does not stop the next batch which logs in afresh and never resubmits its predecessor', async (t) => {
    const { client, state } = await fixture(t);
    const first = await client.exclusive(() =>
        processCashlessBatch(
            batch(['UNKNOWN1', 'UNTRIED']),
            api(),
            new HybridCashlessPage(client),
        ),
    );
    assert.equal(first.status, 'UNKNOWN');
    const next = { ...batch(['TGNEW'], 2), fresh_session_required: true };
    const log = api();

    const result = await client.exclusive(() =>
        processCashlessBatch(next, log, new HybridCashlessPage(client)),
    );

    assert.equal(result.status, 'DONE');
    assert.equal(state.logins, 2);
    assert.equal(state.news, 2);
    assert.deepEqual(state.scans, [
        { awb: 'UNKNOWN1', ho: 'HO-015-TEST-1' },
        { awb: 'TGNEW', ho: 'HO-015-TEST-2' },
    ]);
    assert.deepEqual(state.approvals, ['HO-015-TEST-2']);
});

test('the live APEX Actions icon CSV request and text-prefixed AWB export can be verified before approval', async (t) => {
    const { client, state } = await fixture(t, {
        plainCsv: true,
        textPrefix: true,
    });
    const log = api();
    const result = await client.exclusive(() =>
        processCashlessBatch(
            batch(['CM64041400789']),
            log,
            new HybridCashlessPage(client),
        ),
    );

    assert.equal(result.status, 'DONE');
    assert.deepEqual(
        log.events.find((event) => event.type === 'approval-start')
            .verified_awbs,
        ['CM64041400789'],
    );
    assert.deepEqual(state.approvals, ['HO-015-TEST-1']);
});

test('verification recovery uses the same HO without creating or scanning again and checks every AWB', async (t) => {
    const { client, state } = await fixture(t, { extraCsv: true });
    const first = api();
    const original = batch(['CMRECOVER']);
    const held = await client.exclusive(() =>
        processCashlessBatch(original, first, new HybridCashlessPage(client)),
    );
    assert.equal(held.status, 'UNKNOWN');
    state.settings.extraCsv = false;
    const resumed = {
        ...original,
        status: 'VERIFYING',
        ho_number: 'HO-015-TEST-1',
        items: [{ id: 1, awb: 'CMRECOVER', status: 'ACCEPTED' }],
    };
    const log = api();

    const result = await client.exclusive(() =>
        processCashlessBatch(resumed, log, new HybridCashlessPage(client)),
    );

    assert.equal(result.status, 'DONE');
    assert.equal(state.news, 1);
    assert.equal(state.scans.length, 1);
    assert.deepEqual(state.approvals, ['HO-015-TEST-1']);
    assert.deepEqual(
        log.events.map((event) => event.type),
        ['approval-start', 'approved'],
    );
});

test('verification recovery refuses a different active HO without creating scanning or approving', async (t) => {
    const { client, state } = await fixture(t);
    const log = api();
    await client.authenticate();

    const result = await client.exclusive(() =>
        processCashlessBatch(
            {
                ...batch(['CMRECOVER']),
                status: 'VERIFYING',
                ho_number: 'HO-015-OTHER',
                items: [{ id: 1, awb: 'CMRECOVER', status: 'ACCEPTED' }],
            },
            log,
            new HybridCashlessPage(client),
        ),
    );

    assert.equal(result.status, 'UNKNOWN');
    assert.equal(state.news, 0);
    assert.deepEqual(state.scans, []);
    assert.deepEqual(state.approvals, []);
    assert.deepEqual(
        log.events.map((event) => event.type),
        ['hold'],
    );
});

test('a lost approval acknowledgment can be confirmed by reading the same HO without another Approve request', async (t) => {
    const { client, state } = await fixture(t);
    const original = batch(['CMCONFIRM']);
    const held = await client.exclusive(() =>
        processCashlessBatch(
            original,
            api({ failAt: 'approved' }),
            new HybridCashlessPage(client),
        ),
    );
    assert.equal(held.status, 'UNKNOWN');
    const log = api();

    const result = await client.exclusive(() =>
        processCashlessBatch(
            {
                ...original,
                status: 'CONFIRMING',
                ho_number: 'HO-015-TEST-1',
                items: [{ id: 1, awb: 'CMCONFIRM', status: 'ACCEPTED' }],
            },
            log,
            new HybridCashlessPage(client),
        ),
    );

    assert.equal(result.status, 'DONE');
    assert.equal(state.news, 1);
    assert.equal(state.scans.length, 1);
    assert.deepEqual(state.approvals, ['HO-015-TEST-1']);
    assert.deepEqual(
        log.events.map((event) => event.type),
        ['approved'],
    );
});

test('confirmation never clicks Approve when the remote HO is still unapproved', async (t) => {
    const { client, state } = await fixture(t, { unconfirmedApproval: true });
    const original = batch(['CMCONFIRM']);
    await client.exclusive(() =>
        processCashlessBatch(original, api(), new HybridCashlessPage(client)),
    );
    const log = api();

    const result = await client.exclusive(() =>
        processCashlessBatch(
            {
                ...original,
                status: 'CONFIRMING',
                ho_number: 'HO-015-TEST-1',
                items: [{ id: 1, awb: 'CMCONFIRM', status: 'ACCEPTED' }],
            },
            log,
            new HybridCashlessPage(client),
        ),
    );

    assert.equal(result.status, 'UNKNOWN');
    assert.deepEqual(state.approvals, ['HO-015-TEST-1']);
    assert.deepEqual(
        log.events.map((event) => event.type),
        ['hold'],
    );
});
test('duplicate missing and incomplete resi get their own results and zero accepted skips approval', async (t) => {
    const { client, state } = await fixture(t);
    const log = api();
    const result = await processCashlessBatch(
        batch(['DUP1', 'DUP2', 'MISSING1', 'DATA1']),
        log,
        new HybridCashlessPage(client),
    );
    assert.equal(result.status, 'FAILED');
    assert.equal(state.approvals.length, 0);
    assert.deepEqual(
        log.events
            .filter((e) => e.type === 'scan-result')
            .map((e) => e.outcome),
        ['PREVIOUSLY_ENTERED', 'PREVIOUSLY_ENTERED', 'NOT_FOUND', 'NEEDS_DATA'],
    );
});
for (const awb of ['LOST1', 'FAIL1', 'UNKNOWN1'])
    test(`uncertain ${awb} holds the batch and prevents later AWBs or approval`, async (t) => {
        const { client, state } = await fixture(t);
        const log = api();
        const result = await processCashlessBatch(
            batch([awb, 'TGNEVER']),
            log,
            new HybridCashlessPage(client),
        );
        assert.equal(result.status, 'UNKNOWN');
        assert.equal(state.scans.length, 1);
        assert.equal(state.approvals.length, 0);
    });
test('a slow reply exceeding timeout is unknown even when the server accepted the AWB', async (t) => {
    const { client, state } = await fixture(t, { delay: 600, timeout: 300 });
    const log = api();
    const result = await processCashlessBatch(
        batch(['SLOW1', 'TGNEVER']),
        log,
        new HybridCashlessPage(client),
    );
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(state.scans.length, 1);
    assert.equal(state.approvals.length, 0);
});
test('more than fifty accepted resi are verified through the full HO export', async (t) => {
    const { client, state } = await fixture(t);
    const log = api();
    const result = await processCashlessBatch(
        batch(Array.from({ length: 60 }, (_, i) => 'TG' + i)),
        log,
        new HybridCashlessPage(client),
    );
    assert.equal(result.status, 'DONE');
    assert.equal(state.scans.length, 60);
    assert.equal(state.approvals.length, 1);
});
for (const settings of [
    { extraCsv: true },
    { unconfirmedApproval: true },
    { lostApproval: true },
])
    test(`unverified contents or approval cannot finish: ${JSON.stringify(settings)}`, async (t) => {
        const { client, state } = await fixture(t, settings);
        const log = api();
        const result = await processCashlessBatch(
            batch(['TG1']),
            log,
            new HybridCashlessPage(client),
        );
        assert.equal(result.status, 'UNKNOWN');
        assert(!log.events.some((e) => e.type === 'approved'));
        if (settings.extraCsv) assert.equal(state.approvals.length, 0);
        else assert.equal(state.approvals.length, 1);
    });
test('a missing durable checkpoint prevents the next external side effect', async (t) => {
    const { client, state } = await fixture(t);
    const log = api({ failAt: 'scan-start' });
    const result = await processCashlessBatch(
        batch(['TG1']),
        log,
        new HybridCashlessPage(client),
    );
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(state.scans.length, 0);
    assert.equal(state.approvals.length, 0);
});
test('an exact Orion refusal is an exception without asserting the AWB exists', () => {
    assert.equal(
        cashlessOutcome('Connote ABCD sudah dientry di orion', 'ABCD'),
        'ORION_REJECTED',
    );
    assert.equal(
        cashlessOutcome('Connote OTHER sudah dientry di orion', 'ABCD'),
        'UNKNOWN',
    );
});

test('Orion refusals do not prevent later scans and only accepted resi reach approval', async (t) => {
    const { client, state } = await fixture(t);
    const log = api();
    const result = await processCashlessBatch(
        batch(['ORION1', 'DUP1', 'TG2']),
        log,
        new HybridCashlessPage(client),
    );
    assert.equal(result.status, 'DONE');
    assert.deepEqual(
        state.scans.map((scan) => scan.awb),
        ['ORION1', 'DUP1', 'TG2'],
    );
    assert.deepEqual(state.hos['HO-015-TEST-1'], ['TG2']);
    assert.equal(state.approvals.length, 1);
    assert.deepEqual(
        log.events
            .filter((event) => event.type === 'scan-result')
            .map((event) => event.outcome),
        ['ORION_REJECTED', 'PREVIOUSLY_ENTERED', 'ACCEPTED'],
    );
});

test('a batch of Orion refusals tries every resi without approval', async (t) => {
    const { client, state } = await fixture(t);
    const result = await processCashlessBatch(
        batch(['ORION1', 'ORION2']),
        api(),
        new HybridCashlessPage(client),
    );
    assert.equal(result.status, 'FAILED');
    assert.deepEqual(
        state.scans.map((scan) => scan.awb),
        ['ORION1', 'ORION2'],
    );
    assert.equal(state.approvals.length, 0);
});

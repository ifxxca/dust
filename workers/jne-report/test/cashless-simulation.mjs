import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HybridClient } from '../src/hybrid.mjs';
import {
    HybridCashlessPage,
    processCashlessBatch,
} from '../src/cashless-entry.mjs';

const base = process.env.CASHLESS_SIMULATION_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const headers = { 'x-mock-slug': 'hybrid' };
const directory = await mkdtemp(path.join(os.tmpdir(), 'cashless-postman-'));
const client = new HybridClient(
    {
        name: 'roberto',
        loginUrl: base + '/apex/f?p=113:LOGIN_DESKTOP::::::',
        username: 'fixture',
        password: 'fixture',
    },
    {
        outputDir: directory,
        navigationTimeout: 2000,
        downloadTimeout: 2000,
        clock: () => new Date('2026-10-28T08:00:00Z'),
    },
);
try {
    await client.start();
    await client.context.setExtraHTTPHeaders(headers);
    await fetch(base + '/fixture/reset', {
        method: 'POST',
        headers,
        body: '{}',
    });
    const events = [];
    const api = {
        async checkpoint(batch, type, evidence) {
            events.push({ batch: batch.id, type, ...evidence });
            return {
                status:
                    type === 'approved'
                        ? 'DONE'
                        : type === 'empty'
                          ? 'FAILED'
                          : 'ENTERING',
            };
        },
    };
    for (const [index, awbs] of [
        ['ORION1', 'SLOW1', 'DUP1', 'MISSING1', 'DATA1'],
        ['TG2'],
        ['UNKNOWN1', 'UNTRIED'],
        ['TGAFTER'],
    ].entries()) {
        const result = await client.exclusive(() =>
            processCashlessBatch(
                {
                    id: index + 1,
                    status: 'CLAIMED',
                    ho_number: null,
                    fresh_session_required: index === 3,
                    lease_seconds: 300,
                    items: awbs.map((awb, id) => ({
                        id: id + 1,
                        awb,
                        status: 'PENDING',
                    })),
                },
                api,
                new HybridCashlessPage(client),
            ),
        );
        assert.equal(result.status, index === 2 ? 'UNKNOWN' : 'DONE');
    }
    const state = await (
        await fetch(base + '/fixture/state', { headers })
    ).json();
    assert.equal(state.news, 4);
    assert.equal(state.approvals.length, 3);
    assert.equal(state.logins, 2);
    assert(!state.scans.some((entry) => entry.awb === 'UNTRIED'));
    assert.deepEqual(
        events.filter((e) => e.type === 'scan-result').map((e) => e.outcome),
        [
            'ORION_REJECTED',
            'ACCEPTED',
            'PREVIOUSLY_ENTERED',
            'NOT_FOUND',
            'NEEDS_DATA',
            'ACCEPTED',
            'UNKNOWN',
            'ACCEPTED',
        ],
    );
    console.log(
        JSON.stringify({
            simulation: 'postman',
            batches: 4,
            new_hos: state.news,
            approvals: state.approvals.length,
            outcomes: events
                .filter((e) => e.type === 'scan-result')
                .map((e) => e.outcome),
        }),
    );
} finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
}

import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { CashlessEntryApi, runCashlessEntry } from '../src/cashless-entry.mjs';

async function apiServer(t, handler) {
    const server = http.createServer(async (request, response) => {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        await handler(
            request,
            response,
            JSON.parse(Buffer.concat(chunks).toString()),
        );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return {
        apiUrl: `http://127.0.0.1:${server.address().port}`,
        token: 'fixture-token',
        apiTimeout: 1000,
        workerId: 'hybrid-roberto',
    };
}

test('checkpoint retries keep the same event and ownership after a lost Laravel acknowledgment', async (t) => {
    const received = [];
    const config = await apiServer(t, (request, response, body) => {
        received.push(body);
        assert.equal(
            request.url,
            '/api/internal/cashless-entries/1/checkpoint',
        );
        assert.equal(request.headers['x-cashless-claim'], 'ownership');
        assert.equal(request.headers['x-worker-id'], 'hybrid-roberto');
        if (received.length === 1) return response.destroy();
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ data: { status: 'ENTERING' } }));
    });
    const result = await new CashlessEntryApi(config).checkpoint(
        { id: 1, claim_token: 'ownership' },
        'creating',
    );
    assert.equal(result.status, 'ENTERING');
    assert(received.length >= 2);
    assert(
        received.every(
            (body) => JSON.stringify(body) === JSON.stringify(received[0]),
        ),
    );
});

test('the worker claims only after acquiring its browser operation slot', async (t) => {
    let calls = 0;
    const config = await apiServer(t, (request, response) => {
        calls++;
        assert.equal(request.url, '/api/internal/cashless-entries/claim');
        response.writeHead(204);
        response.end();
    });
    const client = {
        profile: { name: 'roberto' },
        async exclusive(callback) {
            assert.equal(calls, 0);
            return callback();
        },
    };
    assert.equal(
        await runCashlessEntry(client, { api: config }, 'roberto'),
        false,
    );
    assert.equal(calls, 1);
    await assert.rejects(
        runCashlessEntry(client, { api: config }, 'nuralamt'),
        (error) => error.code === 'CASHLESS_SOURCE',
    );
    assert.equal(calls, 1);
});

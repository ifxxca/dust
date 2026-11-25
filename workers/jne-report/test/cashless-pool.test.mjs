import test from 'node:test';
import assert from 'node:assert/strict';
import { createCashlessPool } from '../src/cashless-pool.mjs';
import { fixture } from './hybrid-fixture.mjs';

test('the pool opens at most five browsers and scrubs credentials after all batches finish', async () => {
    let opens = 0;
    let maximum = 0;
    let claims = 0;
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    const batches = [];
    class Api {
        constructor(config) {
            assert.match(config.workerId, /^cashless-roberto-[1-5]$/);
        }
        async claim() {
            claims++;
            const batch = {
                id: claims,
                source: 'roberto',
                hybrid_account: {
                    user_id: claims,
                    version: 1,
                    username: `staff-${claims}`,
                    password: 'secret',
                },
            };
            batches.push(batch);
            return batch;
        }
    }
    class Client {
        constructor(profile, config) {
            assert.equal(profile.name, 'roberto');
            this.profile = profile;
            this.config = config;
        }
        async start() {
            maximum = Math.max(maximum, ++opens);
        }
        exclusive(operation) {
            return operation();
        }
        async close() {
            opens--;
        }
    }
    const pool = createCashlessPool(
        {
            profiles: [{ name: 'nuralamt', loginUrl: 'https://puman.test' }, { name: 'roberto', loginUrl: 'https://hybrid.test' }],
            api: {},
            outputDir: '/temporary',
        },
        new Map(),
        () => {},
        {
            Api,
            Client,
            processBatch: async () => {
                await gate;
                return { status: 'DONE' };
            },
        },
    );
    pool.poll();
    await new Promise(setImmediate);
    pool.poll();
    assert.equal(claims, 5);
    assert.equal(maximum, 5);
    release();
    await pool.close();
    assert.equal(opens, 0);
    assert(batches.every((batch) => batch.hybrid_account.password === ''));
    pool.poll();
    assert.equal(claims, 5);
});

test(
    'two staff authenticate concurrently on one Hybrid origin with separate cookies and session directories',
    { timeout: 30000 },
    async (t) => {
        const site = await fixture(t);
        const sessions = new Map();
        const paths = [];
        let finish;
        const completed = new Promise((resolve) => {
            finish = resolve;
        });
        let claims = 0;
        class Api {
            async claim() {
                const index = claims++;
                if (index > 1) return null;
                return {
                    id: index + 1,
                    source: 'roberto',
                    hybrid_account: {
                        user_id: index + 1,
                        version: 1,
                        username: index === 0 ? 'fixture-user' : 'other-user',
                        password: 'fixture-secret',
                    },
                };
            }
            async checkpoint() {
                finish();
                assert.fail('Both account logins must succeed');
            }
        }
        const pool = createCashlessPool(
            {
                ...site.config,
                api: {},
                profiles: [{ ...site.profile, name: 'roberto' }],
            },
            new Map(),
            () => {},
            {
                Api,
                processBatch: async (batch, api, adapter) => {
                    await adapter.client.authenticate();
                    const cookies = await adapter.client.context.cookies();
                    sessions.set(
                        batch.id,
                        cookies.find(
                            (cookie) => cookie.name === 'authenticated',
                        ).value,
                    );
                    paths.push(adapter.client.config.sessionDir);
                    if (sessions.size === 2) finish();
                    await completed;
                    assert.equal(
                        (await adapter.client.context.cookies()).find(
                            (cookie) => cookie.name === 'authenticated',
                        ).value,
                        sessions.get(batch.id),
                    );
                    return { status: 'DONE' };
                },
            },
        );
        pool.poll();
        await completed;
        await pool.close();
        assert.equal(site.state.logins, 2);
        assert.equal(new Set(sessions.values()).size, 2);
        assert.equal(new Set(paths).size, 2);
    },
);

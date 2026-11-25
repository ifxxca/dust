import { fixture } from './hybrid-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
    loadHybridConfig,
    operationalDate,
    validateHybridCsv,
    validateHybridDate,
} from '../src/hybrid.mjs';
import { sessionClock, sessionDirectory } from '../src/hybrid-session.mjs';
import {
    requestHybridService,
    startHybridService,
} from '../src/hybrid-service.mjs';

test('Hybrid captures upstream totals independently of CSV rows and visible pagination size', async (t) => {
    const { client } = await fixture(t, { collectionTotal: 2, separateLabels: true });
    const result = await client.retrieve('manual', '2026-10-22');
    assert.equal(result.rows, 2);
    assert.deepEqual(result.collectionEvidence.before, {
        date_from: '2026-10-22', date_thru: '2026-10-22', scope: 'ALL_USERS',
        filters_clear: true, total_label: '1 - 1 of 2', empty: false,
    });
    assert.deepEqual(result.collectionEvidence.after, result.collectionEvidence.before);
    assert.equal(result.collectionEvidence.synthesized, false);
});

test('Hybrid preserves missing totals and remaining filters as incomplete evidence', async (t) => {
    const { client } = await fixture(t, { collectionTotal: 3, collectionFilter: true });
    const result = await client.retrieve('cashless', '2026-10-22');
    assert.equal(result.rows, 2);
    assert.equal(result.collectionEvidence.before.filters_clear, false);
    assert.equal(result.collectionEvidence.before.total_label, '1 - 1 of 3');
});

test('real Hybrid range-only pagination and aggregate cells do not become an upstream total', async (t) => {
    const { client } = await fixture(t, {
        collectionTotal: 2,
        collectionLabel: '1 - 2',
        separateLabels: true,
    });
    const result = await client.retrieve('manual', '2026-10-22');
    assert.equal(result.rows, 2);
    assert.equal(result.collectionEvidence.before.total_label, '1 - 2');
    assert.equal(result.collectionEvidence.after.total_label, '1 - 2');
    assert.equal(result.collectionEvidence.before.filters_clear, true);
});

test('Hybrid rereads dates after IR reset before downloading', async (t) => {
    const { client, state } = await fixture(t, { resetDatesAfterApply: true });
    await assert.rejects(client.retrieve('manual', '2026-10-22'), { code: 'HYBRID_FILTER' });
    assert.deepEqual(state.downloads, []);
});

test('cashless collection recognizes the live User ID label without losing all-users scope', async (t) => {
    const { client } = await fixture(t, {
        userLabel: 'User ID (Value Required)',
        separateLabels: true,
        collectionTotal: 2,
    });
    const result = await client.retrieve('cashless', '2026-10-22');
    assert.equal(result.rows, 2);
    for (const scope of [result.collectionEvidence.before, result.collectionEvidence.after]) {
        assert.equal(scope.scope, 'ALL_USERS');
        assert.equal(scope.date_from, '2026-10-22');
        assert.equal(scope.date_thru, '2026-10-22');
        assert.equal(scope.filters_clear, true);
    }
});

test('uppercase cashless labels do not bypass a date changed by report reset', async (t) => {
    const { client, state } = await fixture(t, {
        userLabel: 'User ID (Value Required)',
        separateLabels: true,
        resetDatesAfterApply: true,
    });
    await assert.rejects(client.retrieve('cashless', '2026-10-22'), { code: 'HYBRID_FILTER' });
    assert.deepEqual(state.downloads, []);
});

test('uppercase cashless labels still reject a report restricted to one user', async (t) => {
    const { client, state } = await fixture(t, {
        userLabel: 'User ID (Value Required)',
        separateLabels: true,
        resetUserAfterApply: true,
    });
    await assert.rejects(client.retrieve('cashless', '2026-10-22'), { code: 'HYBRID_FILTER' });
    assert.deepEqual(state.downloads, []);
});

test('Hybrid captures a genuinely empty export without manufacturing a total from its CSV', async (t) => {
    const { client } = await fixture(t, { emptyReport: true, emptyCsv: true });
    const result = await client.retrieve('cashless', '2026-10-22');
    assert.equal(result.rows, 0);
    assert.equal(result.collectionEvidence.before.total_label, 'No data found.');
    assert.equal(result.collectionEvidence.before.empty, true);
    assert.equal(result.collectionEvidence.synthesized, false);
});

test('Hybrid configuration supports both accounts and selects credentials without exposing them in errors', () => {
    const env = {
        HYBRID_ROBERTO_LOGIN_URL:
            'https://roberto.test/apex/f?p=113:LOGIN_DESKTOP',
        HYBRID_ROBERTO_USERNAME: 'operator-one',
        HYBRID_ROBERTO_PASSWORD: 'one-secret',
        HYBRID_NURALAMT_LOGIN_URL:
            'https://nuralamt.test/apex/f?p=113:LOGIN_DESKTOP',
        HYBRID_NURALAMT_USERNAME: 'operator-two',
        HYBRID_NURALAMT_PASSWORD: 'two-secret',
    };

    assert.deepEqual(
        loadHybridConfig(env).profiles.map(
            (profile) => new URL(profile.loginUrl).hostname,
        ),
        ['roberto.test', 'nuralamt.test'],
    );
    assert.deepEqual(
        loadHybridConfig(env, 'nuralamt').profiles.map(
            (profile) => profile.username,
        ),
        ['operator-two'],
    );
    assert.throws(() => loadHybridConfig(env, '../other'), {
        code: 'HYBRID_SOURCE',
    });
    assert.throws(
        () =>
            loadHybridConfig(
                { HYBRID_ROBERTO_PASSWORD: 'do-not-log' },
                'roberto',
            ),
        (error) =>
            error.code === 'HYBRID_CONFIG' &&
            !error.message.includes('do-not-log'),
    );
    for (const url of [
        '',
        'private-invalid-url',
        'file:///private',
        'https://user:do-not-log@private.test',
    ]) {
        assert.throws(
            () =>
                loadHybridConfig(
                    { ...env, HYBRID_ROBERTO_LOGIN_URL: url },
                    'roberto',
                ),
            (error) =>
                error.code === 'HYBRID_CONFIG' &&
                !error.message.includes('do-not-log') &&
                !error.message.includes(url || 'private.test'),
        );
    }
});

test('Hybrid uses the Jakarta operational day and rejects invalid calendar dates', () => {
    assert.equal(
        operationalDate(new Date('2026-10-21T17:00:00Z')),
        '2026-10-22',
    );
    assert.equal(
        operationalDate(new Date('2026-10-21T16:59:59Z')),
        '2026-10-21',
    );
    for (const date of [
        '2026-02-29',
        '2026-13-01',
        '../../report',
        '22-10-2026',
    ]) {
        assert.throws(() => validateHybridDate(date), { code: 'HYBRID_DATE' });
    }
});

test('Hybrid CSV validation accepts empty reports and rejects wrong reports, dates, AWBs and malformed exports', () => {
    assert.equal(
        validateHybridCsv(
            Buffer.from('"Cnote no","Date"\n'),
            'manual',
            '2026-10-22',
        ).rows,
        0,
    );
    assert.equal(
        validateHybridCsv(
            Buffer.from('"Cnote no","Date"\n"001","22-OCT-2026 23:59"\n'),
            'manual',
            '2026-10-22',
        ).rows,
        1,
    );
    for (const csv of [
        '<html>Login</html>',
        '"Cnote No","HO Date"\n',
        '"Cnote no","Date"\n"001","22-OCT-2026 12:00","extra"',
        '"Cnote no","Date"\n"001,"22-OCT-2026 12:00"',
    ]) {
        assert.throws(
            () => validateHybridCsv(Buffer.from(csv), 'manual', '2026-10-22'),
            { code: 'HYBRID_CSV' },
        );
    }
    for (const csv of [
        '"Cnote no","Date"\n"001","21-OCT-2026 12:00"',
        '"Cnote no","Date"\n"","22-OCT-2026 12:00"',
    ]) {
        assert.throws(
            () => validateHybridCsv(Buffer.from(csv), 'manual', '2026-10-22'),
            { code: 'HYBRID_CSV_DATE' },
        );
    }
    assert.throws(
        () =>
            validateHybridCsv(
                Buffer.from('too big'),
                'manual',
                '2026-10-22',
                3,
            ),
        { code: 'HYBRID_CSV' },
    );
});

test('Hybrid preserves a historical date when manual report choices reset the date fields', async (t) => {
    const { client } = await fixture(t, { resetManualDates: true });

    const report = await client.retrieve('manual', '2026-10-22');

    assert.equal(report.rows, 2);
    assert.equal(report.date, '2026-10-22');
    assert.equal(
        await client.page
            .getByRole('textbox', { name: /^Date From/ })
            .inputValue(),
        '22-OCT-2026',
    );
    assert.equal(
        await client.page
            .getByRole('textbox', { name: /^Date Thru/ })
            .inputValue(),
        '22-OCT-2026',
    );
});

test('Hybrid compares rendered dates without case or surrounding whitespace differences', async (t) => {
    const { client } = await fixture(t, { paddedDates: true });
    const report = await client.retrieve('manual', '2026-10-22');
    assert.equal(report.rows, 2);
    assert.equal(report.date, '2026-10-22');
});

test('Hybrid commits the calendar value before submitting View', async (t) => {
    const { client } = await fixture(t, { datepickerClearsFocusedThru: true });

    const report = await client.retrieve('manual', '2026-10-22');

    assert.equal(report.rows, 2);
});

test('Hybrid refills both dates when the source drops Date Thru once', async (t) => {
    const { client, state } = await fixture(t, { dropDateThruOnce: true });

    const report = await client.retrieve('manual', '2026-10-22');

    assert.equal(report.rows, 2);
    assert.equal(state.views, 2);
    assert.deepEqual(state.downloads, ['40']);
});

test('Hybrid stops after three rejected date filters without downloading', async (t) => {
    const { client, state, outputDir } = await fixture(t, {
        dropDateThruAlways: true,
    });

    await assert.rejects(client.retrieve('manual', '2026-10-22'), {
        code: 'HYBRID_FILTER',
    });

    assert.equal(state.views, 3);
    assert.deepEqual(state.downloads, []);
    assert.deepEqual(await readdir(outputDir), []);
});

test('Hybrid records an empty report with source evidence when Oracle cannot export zero rows', async (t) => {
    const { client } = await fixture(t, {
        oracleExportError: true,
        emptyReport: true,
    });

    const report = await client.retrieve('manual', '2026-10-22');

    assert.equal(report.rows, 0);
    assert.equal(await readFile(report.file, 'utf8'), 'Cnote no,Date\r\n');
    const evidence = JSON.parse(
        await readFile(
            path.join(path.dirname(report.file), 'empty-report-evidence.json'),
            'utf8',
        ),
    );
    assert.equal(evidence.date, '2026-10-22');
    assert.equal(evidence.reason, 'ORA-22275');
    assert.match(evidence.reportHtml, /No data found/);
    assert.match(evidence.exportResponse, /invalid LOB locator/);
});

for (const options of [
    {},
    { emptyReport: true, reportRows: true },
    { emptyReport: true, reportFilter: true },
    { emptyReport: true, hiddenEmptyMarker: true },
    { emptyReport: true, reportError: true },
    { emptyReport: true, oracleCode: 'ORA-01013' },
]) {
    test(`Hybrid never turns an Oracle export failure into empty data without an unfiltered empty report ${JSON.stringify(options)}`, async (t) => {
        const { client, outputDir } = await fixture(t, {
            ...options,
            oracleExportError: true,
        });

        await assert.rejects(client.retrieve('cashless', '2026-10-22'), {
            code: 'HYBRID_SOURCE_ORACLE',
        });

        assert.deepEqual(await readdir(outputDir), []);
    });
}

test('Hybrid retries a temporary download failure in the same session', async (t) => {
    const { client, state } = await fixture(t, { download503Once: true });
    const report = await client.retrieve('cashless', '2026-10-22');
    assert.equal(report.rows, 2);
    assert.equal(state.logins, 1);
    assert.deepEqual(state.downloads, ['57', '57']);
});

test('queue-managed Hybrid attempts do not multiply internal retries and preserve Retry-After', async (t) => {
    const { client, state } = await fixture(t, {
        download503Always: true,
        retryAfter: '180',
    });
    await assert.rejects(
        client.retrieve('cashless', '2026-10-22', { automaticRetry: true }),
        (error) => {
            assert.equal(error.code, 'HYBRID_DOWNLOAD_TRANSIENT');
            assert.equal(error.httpStatus, 503);
            assert.equal(error.retryAfter, '180');
            return true;
        },
    );
    assert.equal(state.downloads.length, 1);
});

test('Hybrid recovers from a download timeout without another login', async (t) => {
    const { client, state } = await fixture(t, { downloadTimeoutOnce: true });
    client.config.downloadTimeout = 150;
    const report = await client.retrieve('cashless', '2026-10-22');
    assert.equal(report.rows, 2);
    assert.equal(state.logins, 1);
    assert.equal(state.downloads.length, 2);
});

test('queue-managed Hybrid waits for slow CSV preparation using the download deadline', async (t) => {
    const { client, state } = await fixture(t, { downloadDialogDelay: 1200 });
    client.page.setDefaultTimeout(700);
    const result = await client.retrieve('cashless', '2026-10-22', { automaticRetry: true });
    assert.equal(result.rows, 2);
    assert.equal(state.downloads.length, 1);
    assert.equal(state.logins, 1);
});

test('missing CSV preparation returns one retryable failure without downloading or saving a partial file', async (t) => {
    const { client, state, outputDir } = await fixture(t, { omitCsvLink: true });
    client.config.downloadTimeout = 200;
    await assert.rejects(client.retrieve('cashless', '2026-10-22', { automaticRetry: true }), (error) => {
        assert.equal(error.code, 'HYBRID_DOWNLOAD_TIMEOUT');
        assert.equal(client.phase, 'prepare_csv');
        assert.match(error.message, /tautan CSV/);
        return true;
    });
    assert.deepEqual(state.downloads, []);
    assert.deepEqual(await readdir(outputDir), []);
});

test('Hybrid stops after three temporary failures and never publishes a partial CSV', async (t) => {
    const { client, state, outputDir } = await fixture(t, {
        download503Always: true,
    });
    await assert.rejects(client.retrieve('cashless', '2026-10-22'), {
        code: 'HYBRID_DOWNLOAD_TIMEOUT',
    });
    assert.equal(state.downloads.length, 3);
    assert.equal(state.logins, 1);
    assert.deepEqual(await readdir(outputDir), []);
});

test('Hybrid downloads both full CSV reports with fresh sessions after expiry and separate output files', async (t) => {
    const { client, state } = await fixture(t, { expire: true });

    const cashless = await client.retrieve('cashless', '2026-10-22');
    const manual = await client.retrieve('manual', '2026-10-22');

    assert.equal(cashless.rows, 2);
    assert.equal(manual.rows, 2);
    assert.notEqual(cashless.file, manual.file);
    assert.match(
        await readFile(cashless.file, 'utf8'),
        /"002","22-OCT-2026 23:59"/,
    );
    assert.match(await readFile(manual.file, 'utf8'), /"Cnote no","Date"/);
    assert.equal(state.logins, 2);
    assert.equal(state.resets, 2);
    assert.deepEqual(state.downloads, ['57', '40']);
});

for (const scenario of [
    {
        name: 'wrong-date export',
        options: { wrongDate: true },
        code: 'HYBRID_CSV_DATE',
    },
    {
        name: 'HTML login response',
        options: { html: true },
        code: 'HYBRID_DOWNLOAD',
    },
]) {
    test(`Hybrid does not save a ${scenario.name}`, async (t) => {
        const { client, outputDir } = await fixture(t, scenario.options);

        await assert.rejects(client.retrieve('manual', '2026-10-22'), {
            code: scenario.code,
        });

        assert.deepEqual(await readdir(outputDir), []);
    });
}

test('Hybrid restores cookies and the APEX session after restart without another login', async (t) => {
    const { client, state, newClient } = await fixture(t);
    await client.retrieve('cashless', '2026-10-22');
    const originalSession = client.session;
    await client.close();

    const restarted = newClient();
    await restarted.start();
    const result = await restarted.retrieve('manual', '2026-10-22');

    assert.equal(result.rows, 2);
    assert.equal(restarted.session, originalSession);
    assert.equal(state.logins, 1);
});

test('Hybrid prevents a second browser from using the same account session directory', async (t) => {
    const { newClient } = await fixture(t);

    await assert.rejects(newClient().start(), { code: 'WORKER_ACTIVE' });
});

test('Hybrid uses different browser processes and cookie stores for two accounts on the same host', async (t) => {
    const { client, state, newClient } = await fixture(t);
    const other = newClient({ name: 'other', username: 'other-user' });
    await other.start();
    await client.refreshSession();
    const firstCookies = await client.context.cookies();

    await other.refreshSession();
    await client.refreshSession();

    assert.notEqual(client.browser, other.browser);
    assert.notEqual(client.session, other.session);
    assert.deepEqual(await client.context.cookies(), firstCookies);
    assert.notDeepEqual(await other.context.cookies(), firstCookies);
    assert.equal(state.logins, 2);
});

test('Hybrid ignores a corrupt saved session and logs in again', async (t) => {
    const { client, state, newClient, profile, config } = await fixture(t);
    await client.refreshSession();
    await client.close();
    await writeFile(
        path.join(sessionDirectory(profile, config), 'session.json'),
        '{broken',
    );

    const restarted = newClient();
    await restarted.start();
    await restarted.refreshSession();

    assert.equal(state.logins, 2);
});

test('Hybrid pauses at midnight, logs in once at 00:30 WIB and keeps the session at 12:30', async (t) => {
    let now = new Date('2026-10-22T16:59:59Z');
    const { client, state } = await fixture(t, { clock: () => now });
    await client.refreshSession();
    const homeReads = state.homeReads;

    now = new Date('2026-10-22T17:00:00Z');
    await assert.rejects(client.refreshSession(), { code: 'HYBRID_MIDNIGHT' });
    await assert.rejects(client.retrieve('manual', '2026-10-22'), {
        code: 'HYBRID_MIDNIGHT',
    });
    now = new Date('2026-10-22T17:29:59Z');
    await assert.rejects(client.refreshSession(), { code: 'HYBRID_MIDNIGHT' });
    assert.equal(state.logins, 1);
    assert.equal(state.homeReads, homeReads);
    assert.equal(sessionClock(now).date, '2026-10-23');

    now = new Date('2026-10-22T17:30:00Z');
    assert.equal((await client.refreshSession()).action, 'login');
    assert.equal(state.logins, 2);
    now = new Date('2026-10-23T05:30:00Z');
    assert.equal((await client.refreshSession()).action, 'refresh');
    assert.equal(state.logins, 2);
});

test('Hybrid serializes report downloads and keep-alive refresh in the same browser', async (t) => {
    const { client, state } = await fixture(t);

    const results = await Promise.all([
        client.retrieve('cashless', '2026-10-22'),
        client.refreshSession(),
        client.retrieve('manual', '2026-10-22'),
    ]);

    assert.equal(results[0].rows, 2);
    assert.equal(results[1].action, 'refresh');
    assert.equal(results[2].rows, 2);
    assert.equal(state.logins, 1);
    assert.deepEqual(state.downloads, ['57', '40']);
});

test('Hybrid resident worker serves both accounts without extra logins and hands saved sessions back on shutdown', async (t) => {
    const { state, profile, config, cleanup, newClient } = await fixture(t, {
        start: false,
    });
    config.profiles = [
        profile,
        { ...profile, name: 'other', username: 'other-user' },
    ];
    const service = await startHybridService(config);
    cleanup.push(() => service.close());
    await service.maintain();
    assert.equal(state.logins, 2);

    const status = await requestHybridService(config, { action: 'status' });
    const result = await requestHybridService(config, {
        action: 'reports',
        sources: ['fixture', 'other'],
        reports: ['cashless', 'manual'],
        date: '2026-10-22',
    });

    assert.equal(status.browsers, 2);
    assert.deepEqual(status.sources, ['fixture', 'other']);
    assert.equal(result.results.length, 4);
    assert.ok(result.results.every((entry) => entry.result.rows === 2));
    assert.equal(state.logins, 2);
    await assert.rejects(
        requestHybridService(config, {
            action: 'reports',
            sources: ['invalid'],
            reports: ['manual'],
            date: '2026-10-22',
        }),
        { code: 'HYBRID_SERVICE_REQUEST' },
    );
    const tokenPath = path.join(config.sessionDir, 'service', 'token');
    const token = await readFile(tokenPath, 'utf8');
    await writeFile(tokenPath, 'incorrect-token');
    await assert.rejects(requestHybridService(config, { action: 'status' }), {
        code: 'HYBRID_SERVICE_AUTH',
    });
    await writeFile(tokenPath, token);

    await service.close();
    assert.equal(
        await requestHybridService(config, { action: 'status' }),
        null,
    );
    const standalone = newClient();
    await standalone.start();
    await standalone.retrieve('manual', '2026-10-22');
    assert.equal(state.logins, 2);
});

test('Hybrid worker refreshes every five minutes and logs both accounts in once after the midnight pause', async (t) => {
    let now = new Date('2026-10-22T16:00:00Z');
    const { profile, config, state, cleanup } = await fixture(t, {
        start: false,
        clock: () => now,
    });
    config.profiles = [
        profile,
        { ...profile, name: 'other', username: 'other-user' },
    ];
    const events = [];
    const service = await startHybridService(config, (event, fields) =>
        events.push({ event, ...fields }),
    );
    cleanup.push(() => service.close());
    await service.maintain();
    const initialReads = state.homeReads;

    now = new Date('2026-10-22T16:04:59Z');
    await service.maintain();
    assert.equal(state.homeReads, initialReads);
    now = new Date('2026-10-22T16:05:00Z');
    await service.maintain();
    assert.equal(state.homeReads, initialReads + 2);
    assert.equal(state.logins, 2);
    now = new Date('2026-10-22T17:00:00Z');
    await service.maintain();
    await service.maintain();
    assert.equal(
        events.filter((entry) => entry.event === 'hybrid_session_waiting')
            .length,
        2,
    );
    assert.equal(state.homeReads, initialReads + 2);
    now = new Date('2026-10-22T17:30:00Z');
    await service.maintain();
    await service.maintain();
    assert.equal(state.logins, 4);
});

test('queue-managed Hybrid preserves Retry-After from a rate limited report page', async (t) => {
    const { client, state } = await fixture(t);
    await client.authenticate();
    client.page.setDefaultTimeout(500);
    await client.page.route('**/apex/f?**', async (route) => {
        const url = new URL(route.request().url());
        if ((url.searchParams.get('p') || '').startsWith('113:57:')) {
            return route.fulfill({
                status: 429,
                headers: { 'Retry-After': '180' },
                body: 'Rate limited',
            });
        }
        return route.continue();
    });
    await assert.rejects(
        client.retrieve('cashless', '2026-10-22', { automaticRetry: true }),
        (error) => {
            assert.equal(error.code, 'UPSTREAM_HTTP');
            assert.equal(error.httpStatus, 429);
            assert.equal(error.retryAfter, '180');
            return true;
        },
    );
    assert.equal(state.downloads.length, 0);
});

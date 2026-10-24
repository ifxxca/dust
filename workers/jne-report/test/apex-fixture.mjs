import http from 'node:http';

export async function apexFixture(options = {}) {
    const state = {
        submissions: 0,
        logins: 0,
        loginVisits: 0,
        historyReads: 0,
        pollReads: 0,
        navigationFailures: 0,
        downloads: [],
        uploaded: false,
        uploadAttempts: 0,
        progress: [],
        failed: null,
        authenticated: false,
        expired: false,
    };
    const job = {
        id: 17,
        customer_account: 'TEST001',
        date_from: '2026-10-01',
        date_thru: options.dateThru ?? '2026-10-02',
        report_mode: 'P',
        national_account: options.nationalAccount ?? 'N',
        claim_token: 'fixture-claim',
        status: 'RUNNING',
        lease_seconds: 300,
        max_file_kb: 1024,
    };
    const hidden =
        '<input type="hidden" id="pFlowId" value="100"><input type="hidden" id="pInstance" value="123">';
    const form = () =>
        hidden +
        '<form method="post" action="/process"><label for="P45_CUST">Customer</label><input id="P45_CUST" name="customer" required>' +
        '<select id="P45_NA" name="national" onchange="window.location.href=\'/f?p=100:45:123&amp;national=\'+this.value"><option value="Y"' +
        (state.national === 'Y' ? ' selected' : '') +
        '>YES</option><option value="N"' +
        (state.national !== 'Y' ? ' selected' : '') +
        '>NO</option></select>' +
        '<input id="P45_DATE1" name="from" type="date" required><input id="P45_DATE2" name="thru" type="date" required>' +
        '<select id="P45_PARAM_TYPE" name="mode"><option value="' +
        (options.badMode ? 'A' : 'P') +
        '">Parameter</option></select>' +
        (options.branch
            ? '<label for="branch">Branch</label><select id="branch" required><option value="">Choose</option><option value="BR"' +
              (options.branchDefault ? ' selected' : '') +
              '>Fixture branch</option></select>'
            : '') +
        '<button type="submit">Process</button></form>' +
        (options.branch
            ? '<script>document.querySelector("#branch").addEventListener("change", () => { for (const id of ["P45_CUST", "P45_DATE1", "P45_DATE2"]) document.getElementById(id).value = "";' +
              (options.branchDefault
                  ? 'document.getElementById("P45_PARAM_TYPE").value="A";'
                  : '') +
              ' });</script>'
            : '');
    const columns = [
        'FILENAME',
        'STATUS',
        'CREATED_DATE',
        'DOWNLOAD',
        'ERROR',
        'ID_ACCOUNT',
        'DATE_FROM',
        'DATE_THRU',
    ];
    const row = (
        id,
        status,
        created,
        error = '',
        downloadable = status === 'Done',
    ) => {
        const parts = options.historyMinutes
            ? Object.fromEntries(
                  new Intl.DateTimeFormat('en-GB', {
                      timeZone: 'Asia/Jakarta',
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hourCycle: 'h23',
                  })
                      .formatToParts(new Date(created))
                      .map(({ type, value }) => [type, value]),
              )
            : null;
        const createdLabel = parts
            ? parts.day +
              '-' +
              parts.month.toUpperCase() +
              '-' +
              parts.year +
              ' ' +
              parts.hour +
              ':' +
              parts.minute
            : created;
        const values = [
            'report-' +
                (options.duplicateMetadata && id === '3' ? '2' : id) +
                '.csv',
            status,
            createdLabel,
            downloadable ? '<a href="/csv?id=' + id + '">CSV</a>' : '',
            error,
            'TEST001',
            job.date_from,
            job.date_thru,
        ];
        return (
            '<tr><td>' +
            (options.noSelection
                ? ''
                : '<input name="f01" type="checkbox" value="' + id + '">') +
            '</td>' +
            values
                .map(
                    (value, i) => '<td headers="C' + i + '">' + value + '</td>',
                )
                .join('') +
            '</tr>'
        );
    };
    const server = http.createServer(async (request, response) => {
        const url = new URL(request.url, 'http://localhost');
        const send = (body, type = 'text/html', code = 200) => {
            response.writeHead(code, { 'Content-Type': type });
            response.end(body);
        };
        const redirect = (to) => {
            response.writeHead(302, { Location: to });
            response.end();
        };
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        if (url.pathname.startsWith('/api/internal/report-jobs/')) {
            if (
                request.headers.authorization !== 'Bearer ' + 'x'.repeat(40) ||
                request.headers['x-worker-id'] !== 'jne-report-1'
            )
                return send('{}', 'application/json', 401);
            const endpoint = url.pathname.split('/').at(-1);
            if (endpoint === 'claim')
                return send(JSON.stringify({ data: job }), 'application/json');
            if (request.headers['x-report-claim'] !== job.claim_token)
                return send('{}', 'application/json', 403);
            if (endpoint === 'progress') {
                state.progress.push(JSON.parse(body).status);
                return send(
                    JSON.stringify({ data: { status: state.progress.at(-1) } }),
                    'application/json',
                );
            }
            if (endpoint === 'fail') {
                state.failed = JSON.parse(body);
                return send(
                    '{"data":{"status":"NEEDS_ATTENTION"}}',
                    'application/json',
                );
            }
            if (endpoint === 'upload') {
                state.uploadAttempts++;
                if (options.uploadFailure)
                    return send('{}', 'application/json', 503);
                state.uploaded = body.includes(Buffer.from('AWB,ID_ACCOUNT'));
                if (options.lostUploadResponse && state.uploadAttempts === 1)
                    return send('{}', 'application/json', 503);
                return send(
                    '{"data":{"status":"COMPLETED"}}',
                    'application/json',
                );
            }
        }
        if (url.pathname === '/login' && request.method === 'POST') {
            state.logins++;
            state.authenticated = true;
            return redirect('/f?p=100:45:123');
        }
        if (url.pathname === '/login') {
            state.loginVisits++;
            if (state.authenticated) return redirect('/f?p=100:45:123');
            return send(
                '<form method="post"><input id="P101_USERNAME" name="username"><input id="P101_PASSWORD" name="password" type="password"><button id="P101_LOGIN">Login</button></form>',
            );
        }
        if (url.pathname === '/process') {
            state.submissions++;
            state.submitted = new URLSearchParams(body.toString());
            state.created = new Date().toISOString();
            return send(
                hidden +
                    (options.uncertain
                        ? ''
                        : '<div class="t-Alert--success">Accepted</div>'),
            );
        }
        if (url.pathname === '/f') {
            if (!state.authenticated) return redirect('/login');
            const page = (url.searchParams.get('p') || '').split(':')[1];
            if (page === '45') {
                state.national =
                    url.searchParams.get('national') || state.national || 'N';
                if (options.deniedReport)
                    return send(hidden + '<div>Access denied</div>');
                if (options.navigationParameters) {
                    let html = form();
                    const parameterFields = html
                        .match(
                            /<label for="P45_CUST">.*?<select id="P45_PARAM_TYPE"/,
                        )[0]
                        .replace(/<select id="P45_PARAM_TYPE"$/, '');
                    if (url.searchParams.get('mode') !== 'P')
                        html = html.replace(parameterFields, '');
                    html = html.replace(
                        '<select id="P45_PARAM_TYPE" name="mode">',
                        '<select id="P45_PARAM_TYPE" name="mode" onchange="window.location.href=\'/f?p=100:45:123&amp;mode=\'+encodeURIComponent(this.value)">',
                    );
                    html = html.replace(
                        '<option value="P">Parameter</option>',
                        '<option value="A"' +
                            (url.searchParams.get('mode') !== 'P'
                                ? ' selected'
                                : '') +
                            '>Upload Connote</option><option value="P"' +
                            (url.searchParams.get('mode') === 'P'
                                ? ' selected'
                                : '') +
                            '>Input Parameter</option>',
                    );
                    return send(html);
                }
                if (options.dynamicParameters) {
                    const original = form();
                    const parameterFields = original
                        .match(
                            /<label for="P45_CUST">.*?<select id="P45_PARAM_TYPE"/,
                        )[0]
                        .replace(/<select id="P45_PARAM_TYPE"$/, '');
                    const uploadForm = original
                        .replace(
                            parameterFields,
                            '<div id="parameter-controls"></div>',
                        )
                        .replace(
                            '<option value="P">Parameter</option>',
                            '<option value="A">Upload Connote</option><option value="P">Input Parameter</option>',
                        );
                    return send(
                        uploadForm +
                            '<script>document.querySelector("#P45_PARAM_TYPE").addEventListener("change", function () { if (this.value === "P") setTimeout(() => { document.querySelector("#parameter-controls").innerHTML = ' +
                            JSON.stringify(parameterFields) +
                            '; }, 100); });</script>',
                    );
                }
                return send(form());
            }
            if (page === '46') {
                state.historyReads++;
                if (
                    state.submissions &&
                    state.navigationFailures <
                        (options.historyNavigationFailures ?? 0)
                ) {
                    state.navigationFailures++;
                    return send('Temporarily unavailable', 'text/plain', 503);
                }
                if (options.emptyHistory && !state.submissions)
                    return send(
                        hidden +
                            '<div class="a-IRR-noDataMsg">No data found</div>',
                    );
                if (options.expire && state.submissions && !state.expired) {
                    state.expired = true;
                    state.authenticated = false;
                    return redirect('/login');
                }
                let rows = row('1', 'Done', '2026-01-01T00:00:00Z');
                if (state.submissions) {
                    state.pollReads++;
                    const historyState =
                        options.historyStates?.[
                            Math.min(
                                state.pollReads - 1,
                                options.historyStates.length - 1,
                            )
                        ];
                    const status =
                        historyState?.status ??
                        (options.neverReady || state.historyReads < 3
                            ? 'Processing'
                            : 'Done');
                    rows += row(
                        '2',
                        status,
                        state.created,
                        historyState?.error ??
                            (options.pushError ? 'Error On Push' : ''),
                        historyState?.download ?? status === 'Done',
                    );
                    if (options.ambiguous)
                        rows += row('3', status, state.created);
                }
                let table =
                    '<table class="a-IRR-table"><tr><th>Select</th>' +
                    columns
                        .map(
                            (column, i) =>
                                '<th id="C' + i + '">' + column + '</th>',
                        )
                        .join('') +
                    '</tr>' +
                    rows +
                    '</table>';
                if (options.noMetadata)
                    table = table.replace(
                        /<td headers="C[567]">.*?<\/td>/g,
                        '',
                    );
                return send(hidden + table);
            }
        }
        if (url.pathname === '/csv') {
            state.downloads.push(url.searchParams.get('id'));
            if (
                options.downloadUnavailable ||
                (options.retryDownload && state.downloads.length === 1)
            )
                return send('Temporarily unavailable', 'text/plain', 503);
            response.writeHead(200, {
                'Content-Type': 'text/csv',
                'Content-Disposition': 'attachment; filename="report.csv"',
            });
            return response.end(
                options.invalidCsv
                    ? '<html>Login</html>'
                    : 'AWB,ID_ACCOUNT,STATUS_WEB\n' +
                          'FIXTURE,TEST001,Delivered\n'.repeat(
                              options.awbCount ?? 1,
                          ),
            );
        }
        send('Not found', 'text/plain', 404);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return {
        state,
        job,
        url: 'http://127.0.0.1:' + server.address().port,
        close: () =>
            new Promise((resolve) => {
                server.closeAllConnections();
                server.close(resolve);
            }),
    };
}

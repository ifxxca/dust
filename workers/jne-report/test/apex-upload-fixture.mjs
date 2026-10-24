import http from 'node:http';
import path from 'node:path';

export async function apexUploadFixture(options = {}) {
    const state = { uploads: [], logins: 0, downloads: [] };
    const hidden =
        '<input id="pFlowId" type="hidden" value="100"><input id="pInstance" type="hidden" value="123">';
    const server = http.createServer(async (request, response) => {
        const url = new URL(request.url, 'http://localhost');
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const send = (text, type = 'text/html') => {
            response.writeHead(200, { 'Content-Type': type });
            response.end(text);
        };
        if (url.pathname === '/login' && request.method === 'POST') {
            state.logins++;
            response.writeHead(302, { Location: '/f?p=100:45:123' });
            return response.end();
        }
        if (url.pathname === '/login')
            return send(
                '<form method="post"><input id="P101_USERNAME" name="username"><input id="P101_PASSWORD" name="password" type="password"><button id="P101_LOGIN">Login</button></form>',
            );
        if (url.pathname === '/process') {
            const form = await new Response(body, {
                headers: { 'Content-Type': request.headers['content-type'] },
            }).formData();
            const file = form.get('file');
            const awbs = (await file.text()).trim().split(/\r?\n/);
            state.uploads.push({
                name: file.name,
                awbs,
                created: new Date().toISOString(),
                historyReads: 0,
            });
            return send(
                hidden + '<div class="t-Alert--success">Accepted</div>',
            );
        }
        if (url.pathname === '/csv') {
            const upload =
                state.uploads[Number(url.searchParams.get('id')) - 1];
            state.downloads.push(upload.name);
            response.setHeader(
                'Content-Disposition',
                'attachment; filename="result.csv"',
            );
            return send(
                (options.analytics
                    ? 'AWB,ID_ACCOUNT,STATUS_WEB,SHIPPER_NAME,TGL_ENTRY,SERVICE,DEST,AMOUNT,WEIGHT,QTY\n'
                    : 'AWB,ID_ACCOUNT,STATUS_WEB\n') +
                    upload.awbs
                        .map(
                            (awb, i) =>
                                `${awb},ACCOUNT${(i % 2) + 1},${options.analytics ? `DELIVERED TO [PENERIMA | 23-10-2026 08:30 | ${i % 2 ? 'TAMBUN SELATAN-CIKARANG' : 'BANDUNG'} ]` : 'Delivered'}${options.analytics ? `,QA Dashboard Sender,22-OCT-2026 08:30,${i % 2 ? 'YES' : 'REG'},${i % 2 ? 'CKR10020' : 'BDO10000'},${10000 + i * 5000},1.5,1` : ''}`,
                        )
                        .join('\n') +
                    '\n',
                'text/csv',
            );
        }
        if ((url.searchParams.get('p') || '').split(':')[1] === '45')
            return send(
                hidden +
                    '<form action="/process" method="post" enctype="multipart/form-data"><label>Type<select id="P45_PARAM_TYPE" name="mode"><option value="A">Upload Connote</option><option value="P">Input Parameter</option></select></label><label>File<input type="file" id="P45_BLOB_CONTENT" name="file" required></label><button>Process</button></form>',
            );
        const columns = [
            'FILENAME',
            'STATUS',
            'CREATED_DATE',
            'CREATED_USER',
            'DOWNLOAD',
            'ERROR',
        ];
        const rows = state.uploads
            .map((upload, index) => {
                upload.historyReads++;
                return (
                    '<tr><td><input name="f01" type="checkbox" value="' +
                    (index + 1) +
                    '"></td>' +
                    [
                        upload.name,
                        options.delayedDownload && upload.historyReads === 1
                            ? 'Error'
                            : 'Done',
                        upload.created,
                        'fixture-user',
                        options.delayedDownload && upload.historyReads < 3
                            ? ''
                            : '<a href="/csv?id=' + (index + 1) + '">CSV</a>',
                        '',
                    ]
                        .map(
                            (cell, i) =>
                                '<td headers="C' + i + '">' + cell + '</td>',
                        )
                        .join('') +
                    '</tr>'
                );
            })
            .join('');
        return send(
            hidden +
                '<table class="a-IRR-table"><tr><th>Select</th>' +
                columns
                    .map((c, i) => '<th id="C' + i + '">' + c + '</th>')
                    .join('') +
                '</tr>' +
                rows +
                '</table>',
        );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + server.address().port;
    return {
        state,
        config: (directory) => ({
            loginUrl: url + '/login',
            username: 'fixture-user',
            password: 'fixture-secret',
            sessionPath: path.join(directory, 'apex-session.json'),
            navigationTimeout: 3000,
            downloadTimeout: 3000,
            reportTimeout: 10000,
            pollInterval: 10,
            maxFileBytes: 20971520,
            extraFields: {},
            successSelector: '.t-Alert--success',
            historyDateFormat: 'ISO8601',
            timezone: 'Asia/Jakarta',
            clockSkew: 1000,
        }),
        close: () =>
            new Promise((resolve) => {
                server.closeAllConnections();
                server.close(resolve);
            }),
    };
}

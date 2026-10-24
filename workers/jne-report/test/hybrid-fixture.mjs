import http from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HybridClient } from '../src/hybrid.mjs';

export async function fixture(t, options = {}) {
    const state = {
        logins: 0,
        downloads: [],
        resets: 0,
        expired: false,
        sessions: new Map(),
        homeReads: 0,
    };
    const server = http.createServer(async (request, response) => {
        const url = new URL(request.url, 'http://localhost');
        const chunks = [];
        for await (const chunk of request) {
            chunks.push(chunk);
        }
        const send = (body, type = 'text/html') => {
            response.writeHead(200, { 'Content-Type': type });
            response.end(body);
        };
        const redirect = (location) => {
            response.writeHead(302, { Location: location });
            response.end();
        };
        if (url.pathname === '/login') {
            const fields = new URLSearchParams(
                Buffer.concat(chunks).toString(),
            );
            if (
                !['fixture-user', 'other-user'].includes(
                    fields.get('username'),
                ) ||
                fields.get('password') !== 'fixture-secret'
            ) {
                return redirect('/apex/f?p=113:LOGIN_DESKTOP::::::');
            }
            state.logins++;
            state.sessions.set(String(state.logins), fields.get('username'));
            response.setHeader(
                'Set-Cookie',
                `authenticated=${state.logins}; Path=/; HttpOnly`,
            );
            return redirect(`/apex/f?p=113:1:${state.logins}`);
        }
        if (url.pathname === '/reset') {
            state.resets++;
            return send('{}', 'application/json');
        }
        const [app, page, session, action] = (
            url.searchParams.get('p') || ''
        ).split(':');
        if (page === 'LOGIN_DESKTOP') {
            return send(
                '<form action="/login" method="post"><label>Username<input name="username"></label><label>Password<input name="password" type="password"></label><button>Login</button></form>',
            );
        }
        if (
            !state.sessions.has(session) ||
            !request.headers.cookie
                ?.split(';')
                .some(
                    (cookie) => cookie.trim() === `authenticated=${session}`,
                ) ||
            (options.expire && !state.expired && page !== '1')
        ) {
            state.expired = true;
            return redirect('/apex/f?p=113:LOGIN_DESKTOP::::::');
        }
        if (app !== '113') {
            response.writeHead(403);
            return response.end();
        }
        if (action?.endsWith('_CSV')) {
            state.downloads.push(page);
            if (
                options.download503Always ||
                (options.download503Once && state.downloads.length === 1)
            ) {
                response.writeHead(503, { 'Content-Type': 'text/plain' });
                return response.end('Temporary failure');
            }
            if (options.downloadTimeoutOnce && state.downloads.length === 1) {
                await new Promise((resolve) => setTimeout(resolve, 500));
                if (response.destroyed) return;
            }
            const columns =
                page === '57' ? '"Cnote No","HO Date"' : '"Cnote no","Date"';
            const date = options.wrongDate ? '21-OCT-2026' : '22-OCT-2026';
            return send(
                options.html
                    ? '<html>Login</html>'
                    : `${columns}\n"001","${date} 01:00"\n"002","${date} 23:59"\n`,
                options.html ? 'text/html' : 'text/csv; charset=utf-8',
            );
        }
        const hidden = `<input id="pFlowId" type="hidden" value="113"><input id="pInstance" type="hidden" value="${session}">`;
        if (page === '1') {
            state.homeReads++;
            return send(hidden);
        }
        const select = (name, option) =>
            `<label>${name}<select><option>${option}</option></select></label>`;
        const input = (name, value = '') =>
            `<label>${name}<input value="${options.paddedDates && name.startsWith('Date ') && value ? ` ${value.toLowerCase()} ` : value}" name="${name === 'Date From' ? 'from' : 'thru'}"></label>`;
        send(
            hidden +
                `<form action="/apex/f"><input type="hidden" name="p" value="113:${page}:${session}">` +
                select(
                    'User Id (Value Required)',
                    page === '57' ? '&lt; ALL &gt;' : '&lt;ALL USERS&gt;',
                ) +
                input('Date From', url.searchParams.get('from') || '') +
                input('Date Thru', url.searchParams.get('thru') || '') +
                (page === '57'
                    ? input('Marketplace') +
                      input('Service') +
                      input('Merchant')
                    : select('Connote', 'ALL') +
                      select('Services', '&lt; ALL &gt;') +
                      select('Payment Type', '&lt; ALL &gt;') +
                      input('Shipper / Cust Id') +
                      input('Disc#')) +
                '<button>View</button></form><button id="actions">Actions</button><div id="menu" hidden><button role="menuitem" id="reset">Reset</button><button role="menuitem" id="download">Download</button></div>' +
                `<script>
            ${options.resetManualDates && page === '40' ? 'document.querySelectorAll("select").forEach(select=>select.addEventListener("change",()=>{document.querySelectorAll("label").forEach(label=>{if(/^Date (From|Thru)/.test(label.textContent))label.querySelector("input").value="23-OCT-2026";});}));' : ''}
            document.getElementById('actions').onclick=()=>document.getElementById('menu').hidden=false;
            document.getElementById('reset').onclick=()=>{document.getElementById('menu').hidden=true;const d=document.createElement('div');d.setAttribute('role','dialog');d.innerHTML='<button id="apply">Apply</button>';document.body.append(d);document.getElementById('apply').onclick=async()=>{await fetch('/reset',{method:'POST'});d.remove();};};
            document.getElementById('download').onclick=()=>{document.getElementById('menu').hidden=true;const d=document.createElement('div');d.setAttribute('role','dialog');d.innerHTML='<a href="/apex/f?p=113:${page}:${session}:IR[fixture]_CSV::::"><img alt="CSV"></a>';document.body.append(d);};
            </script>`,
        );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'hybrid-test-'));
    const outputDir = path.join(workspaceDir, 'reports');
    await mkdir(outputDir);
    const profile = {
        name: 'fixture',
        loginUrl: `http://127.0.0.1:${server.address().port}/apex/f?p=113:LOGIN_DESKTOP::::::`,
        username: 'fixture-user',
        password: 'fixture-secret',
    };
    const config = {
        outputDir,
        navigationTimeout: 3000,
        downloadTimeout: 3000,
        maxFileBytes: 100000,
        sessionDir: path.join(workspaceDir, 'sessions'),
        clock: options.clock || (() => new Date('2026-10-22T16:00:00Z')),
    };
    const client = new HybridClient(profile, config);
    const clients = [client];
    const cleanup = [];
    t.after(async () => {
        for (const operation of cleanup.reverse()) {
            await operation();
        }
        await Promise.all(clients.map((current) => current.close()));
        await new Promise((resolve) => server.close(resolve));
        await rm(workspaceDir, { recursive: true, force: true });
    });
    if (options.start !== false) {
        await client.start();
    }
    const newClient = (changes = {}) => {
        const current = new HybridClient({ ...profile, ...changes }, config);
        clients.push(current);
        return current;
    };
    return { client, state, outputDir, profile, config, newClient, cleanup };
}

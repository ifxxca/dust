const http = require('node:http');

function cashlessFixture() {
    const state = {
        news: 0,
        logins: 0,
        scans: [],
        approvals: [],
        hos: {},
        settings: {},
        cookie: 'fixture-auth',
    };
    const html = (ho, approved = false) => `<!doctype html><html><body>
        <input id="pFlowId" type="hidden" value="113"><input id="pInstance" type="hidden" value="1">
        <form method="post" action="/apex/f?p=113:80:1"><input name="request" id="request" type="hidden">
        <input id="P80_NO" value="${ho}" disabled><input id="P80_DATE" value="28-OCT-2026 10:00">
        <button type="button" onclick="submitAction('NEW')">New</button>
        ${approved ? '<button type="button">Print</button><button type="button">Print Label</button>' : '<button type="button" onclick="submitAction(\'APPROVE\')">Approve</button>'}
        <input id="P80_CNOTE" maxlength="16"><input id="P80_ERR"><input id="P80_COD"></form>
        <div id="Connote Reports"><input class="a-IRR-search-field"><div id="rows">${rows(ho)}</div>
        <button id="Connote Reports_actions_button" type="button" onclick="document.getElementById('menu').hidden=false">Actions <span></span></button>
        <div role="menu" id="menu" hidden><button role="menuitem" onclick="document.getElementById('download').hidden=false">Download</button></div>
        </div><div role="dialog" aria-label="Download" id="download" hidden><a href="/apex/f?p=113:80:1:${state.settings.plainCsv ? 'CSV' : 'IR[CONNOTE]_CSV'}">CSV</a></div>
        <script>
        window.apex={da:{gEventList:[{triggeringElement:'P80_CNOTE',bindEventType:'keypress',actionList:[{action:'NATIVE_EXECUTE_PLSQL_CODE',ajaxIdentifier:'fixture-scan'}]}]},jQuery:()=>({on:(name,handler)=>document.addEventListener(name.split('.')[0],handler)})};
        function submitAction(value){document.getElementById('request').value=value;document.querySelector('form').submit();}
        document.addEventListener('keydown',event=>{if(event.key==='Escape'){document.getElementById('download').hidden=true;document.getElementById('menu').hidden=true;}});
        document.getElementById('P80_CNOTE').addEventListener('keypress',async event=>{if(event.key!=='Enter')return;event.preventDefault();
            const fields=new URLSearchParams({p_request:'PLUGIN=fixture-scan'});
            for(const [name,value] of [['P80_NO',document.getElementById('P80_NO').value],['P80_DATE',document.getElementById('P80_DATE').value],['P80_CNOTE',event.target.value]]){fields.append('p_arg_names',name);fields.append('p_arg_values',value);}
            try{const response=await fetch('/apex/wwv_flow.show',{method:'POST',body:fields});const result=await response.json();
            for(const item of result.item)document.getElementById(item.id).value=item.value;
            const rows=await fetch('/rows');document.getElementById('rows').innerHTML=await rows.text();
            document.getElementById('Connote Reports').dispatchEvent(new CustomEvent('apexafterrefresh',{bubbles:true}));}catch{}
        });</script></body></html>`;
    const rows = (ho) =>
        `<table class="a-IRR-table"><tr><th>Cnote No</th></tr>${(
            state.hos[ho] || []
        )
            .slice(0, 50)
            .map((awb) => `<tr><td>${awb}</td></tr>`)
            .join('')}</table>`;
    let currentHo = 'HO-015-LANDING';
    const handler = async (request, response) => {
        const url = new URL(request.url, 'http://fixture');
        const body = [];
        for await (const chunk of request) body.push(chunk);
        const raw = Buffer.concat(body).toString();
        const send = (value, type = 'text/html', status = 200) => {
            response.writeHead(status, { 'Content-Type': type });
            response.end(value);
        };
        if (url.pathname === '/fixture/reset') {
            state.news = 0;
            state.logins = 0;
            state.scans = [];
            state.approvals = [];
            state.hos = {};
            state.settings = raw ? JSON.parse(raw) : {};
            currentHo = 'HO-015-LANDING';
            return send('{}', 'application/json');
        }
        if (url.pathname === '/fixture/state')
            return send(JSON.stringify(state), 'application/json');
        if (url.pathname === '/login') {
            state.logins++;
            response.setHeader(
                'Set-Cookie',
                `auth=${state.cookie}; Path=/; HttpOnly`,
            );
            response.writeHead(302, { Location: '/apex/f?p=113:1:1' });
            return response.end();
        }
        if (!request.headers.cookie?.includes(`auth=${state.cookie}`))
            return send(
                '<form method="post" action="/login"><label>Username<input name="user"></label><label>Password<input name="password" type="password"></label><button>Login</button></form>',
            );
        const fields = new URLSearchParams(raw);
        if (url.pathname === '/apex/wwv_flow.show') {
            const names = fields.getAll('p_arg_names'),
                values = fields.getAll('p_arg_values');
            const awb = values[names.indexOf('P80_CNOTE')],
                ho = values[names.indexOf('P80_NO')];
            state.scans.push({ awb, ho });
            let message = 'Data connote berhasil disimpan';
            if (awb.startsWith('DUP'))
                message = 'Connote pernah di HO dg nomor :HO-015-OLD';
            else if (awb.startsWith('MISSING'))
                message = `Connote ${awb} tidak ditemukan.`;
            else if (awb.startsWith('DATA'))
                message = 'Destinasi tidak lengkap';
            else if (awb.startsWith('ORION'))
                message = `Connote ${awb} sudah dientry di orion`;
            else if (awb.startsWith('UNKNOWN'))
                message = 'Respons server tidak dikenal';
            else {
                state.hos[ho] ||= [];
                if (!state.hos[ho].includes(awb)) state.hos[ho].push(awb);
            }
            if (awb.startsWith('LOST')) return response.destroy();
            if (awb.startsWith('FAIL'))
                return send('<html>Proxy failed</html>', 'text/html', 503);
            if (awb.startsWith('SLOW'))
                await new Promise((resolve) =>
                    setTimeout(resolve, state.settings.delay || 200),
                );
            return send(
                JSON.stringify({
                    item: [
                        { id: 'P80_ERR', value: message },
                        {
                            id: 'P80_CNOTE',
                            value: awb.startsWith('DUP') ? awb : '',
                        },
                    ],
                }),
                'application/json',
            );
        }
        if (url.pathname === '/rows') return send(rows(currentHo));
        const parts = (url.searchParams.get('p') || '').split(':');
        if (parts[1] === '1')
            return send(
                '<input id="pFlowId" type="hidden" value="113"><input id="pInstance" type="hidden" value="1">',
            );
        if (parts[3] === 'CSV' || parts[3]?.endsWith('_CSV')) {
            const awbs = state.settings.extraCsv
                ? [...(state.hos[currentHo] || []), 'EXTRA']
                : state.hos[currentHo] || [];
            return send(
                '"Cnote No","HO No"\n' +
                    awbs
                        .map(
                            (awb) =>
                                `"${state.settings.textPrefix ? "'" : ''}${awb}","${currentHo}"`,
                        )
                        .join('\n'),
                'text/csv',
            );
        }
        if (fields.get('request') === 'NEW') {
            currentHo = `HO-015-TEST-${++state.news}`;
            state.hos[currentHo] = [];
        }
        if (fields.get('request') === 'APPROVE') {
            state.approvals.push(currentHo);
            if (state.settings.lostApproval) return response.destroy();
            return send(html(currentHo, !state.settings.unconfirmedApproval));
        }
        return send(
            html(
                currentHo,
                state.approvals.includes(currentHo) &&
                    !state.settings.unconfirmedApproval,
            ),
        );
    };
    return { handler, state };
}
module.exports = { cashlessFixture };
if (require.main === module) {
    const { handler } = cashlessFixture();
    http.createServer(handler).listen(Number(process.env.PORT));
}

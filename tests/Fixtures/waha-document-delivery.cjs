// Local stand-in for the documented WAHA sendText/sendFile contract.
// It deliberately models acceptance followed by a lost response; it cannot prove live delivery.
const http = require('node:http');
let scenario = 'success';
let messages = [];
let reads = [];
http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const json = (status, data) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(data));
    };
    if (request.url === '/fixture/reset') {
        scenario = body.scenario || 'success';
        messages = [];
        reads = [];
        return json(200, { ok: true });
    }
    if (request.url === '/fixture/state') return json(200, { messages, reads });
    if (request.headers['x-api-key'] !== 'test-private-key') return json(401, {});
    if (request.method === 'GET' && request.url === '/api/sessions/office') return json(200, { name: 'office', status: 'WORKING' });
    if (request.method === 'POST' && request.url === '/api/office/chats/628123456789%40c.us/messages/read') {
        if (body.messages !== 30 || body.days !== 7) return json(422, {});
        reads.push({ endpoint: request.url, ...body });
        if (scenario === 'read_then_disconnect') return response.destroy();
        return json(201, { ids: [] });
    }
    if (request.method === 'POST' && ['/api/sendText', '/api/sendFile'].includes(request.url)) {
        if (body.session !== 'office' || body.chatId !== '628123456789@c.us') return json(422, {});
        if (request.url === '/api/sendFile' && (!body.file?.data || !body.file?.filename || !body.file?.mimetype)) return json(422, {});
        messages.push({ endpoint: request.url, ...body });
        if (scenario === 'accepted_then_disconnect') return response.destroy();
        return json(201, { id: `simulation-message-${messages.length}` });
    }
    return json(501, { error: 'Endpoint outside this simulation contract' });
}).listen(Number(process.env.PORT), '127.0.0.1');

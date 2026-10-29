const http = require('node:http');
const { cashlessFixture } = require('./cashless-fixture.cjs');
const { handler } = cashlessFixture();
http.createServer(handler).listen(Number(process.env.PORT));

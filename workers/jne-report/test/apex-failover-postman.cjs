const http = require('node:http');

const { apexFixture } = require('./apex-fixture.cjs');

const delayed = process.env.APEX_SIMULATION_DELAYED_REPORT === '1';
void apexFixture(
    delayed
        ? {
              historyStates: [
                  ...Array.from({ length: 8 }, () => ({
                      status: 'Error',
                      download: false,
                      error: 'Error API 500.',
                  })),
                  { status: 'Done', download: true, error: '-' },
              ],
          }
        : {},
).then((fixture) => {
    let primaryRequests = 0;
    http.createServer((request, response) => {
        const url = new URL(request.url, 'http://fixture');
        if (url.pathname === '/fixture-state') {
            response.writeHead(200, { 'Content-Type': 'application/json' });
            return response.end(
                JSON.stringify({
                    primaryRequests,
                    logins: fixture.state.logins,
                    submissions: fixture.state.submissions,
                    downloads: fixture.state.downloads.length,
                    pollReads: fixture.state.pollReads,
                }),
            );
        }
        if (url.searchParams.get('node') === '01') {
            primaryRequests++;
            response.writeHead(503, { 'Content-Type': 'text/html' });
            return response.end('<h1>Service unavailable</h1>');
        }
        return fixture.handler(request, response);
    }).listen(Number(process.env.PORT));
});

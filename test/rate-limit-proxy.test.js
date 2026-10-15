// Behind a trusted proxy, X-Forwarded-For is the real client: each client
// gets its own login limit.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.MATSCHEMA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'matschema-rate-limit-proxy-'));
process.env.TRUST_PROXY = '1';

const app = require('../src/app');

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const failedLogin = (forwardedFor) =>
  fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': forwardedFor },
    body: 'username=admin&password=wrong'
  }).then((res) => res.status);

test('each client behind the proxy has its own login limit', async () => {
  for (let i = 0; i < 8; i += 1) {
    assert.equal(await failedLogin('203.0.113.1'), 401);
  }
  assert.equal(await failedLogin('203.0.113.1'), 429);
  assert.equal(await failedLogin('203.0.113.2'), 401);
});

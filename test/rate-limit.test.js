// The login rate limit and X-Forwarded-For. Without a proxy in front, the
// header is the client's own claim and must not change who is limited.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.MATSCHEMA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'matschema-rate-limit-'));
delete process.env.TRUST_PROXY;
delete process.env.COOKIE_SECURE;
delete process.env.FORCE_HTTPS;

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

test('a faked X-Forwarded-For does not get around the login limit', async () => {
  const statuses = [];
  for (let i = 1; i <= 9; i += 1) {
    statuses.push(await failedLogin(`10.0.0.${i}`));
  }
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 401, 401, 401, 429]);
});

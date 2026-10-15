const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Before requiring the app: these are read when it loads.
process.env.NODE_ENV = 'test';
process.env.MATSCHEMA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'matschema-auth-'));

const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { createUser } = require('../src/db');

let server;
let baseUrl;

test.before(async () => {
  await createUser({ username: 'admin', passwordHash: await bcrypt.hash('correct-horse', 4) });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

// A tiny browser: keeps the session cookie and doesn't follow redirects.
function browser() {
  let cookie = '';
  return async function request(pathname, form) {
    const res = await fetch(baseUrl + pathname, {
      method: form ? 'POST' : 'GET',
      redirect: 'manual',
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {})
      },
      body: form ? new URLSearchParams(form).toString() : undefined
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return res;
  };
}

async function loggedIn(password) {
  const request = browser();
  const res = await request('/auth/login', { username: 'admin', password });
  assert.equal(res.headers.get('location'), '/backend');
  return request;
}

test('changing the password logs out the other sessions, not this one', async () => {
  const laptop = await loggedIn('correct-horse');
  const phone = await loggedIn('correct-horse');
  assert.equal((await phone('/backend')).status, 200);

  await laptop('/backend/settings/password', {
    currentPassword: 'correct-horse',
    newPassword: 'new-password-1',
    confirmPassword: 'new-password-1'
  });

  assert.equal((await laptop('/backend')).status, 200);
  const phoneAfter = await phone('/backend');
  assert.equal(phoneAfter.status, 302);
  assert.equal(phoneAfter.headers.get('location'), '/auth/login');

  // The new password works for a fresh login.
  await loggedIn('new-password-1');
});

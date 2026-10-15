const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { trustProxySetting } = require('../src/env');

test('X-Forwarded-For is only trusted behind a proxy', () => {
  // No setting: one hop behind an HTTPS proxy, none otherwise.
  assert.equal(trustProxySetting('', false), false);
  assert.equal(trustProxySetting('', true), 1);
  // An explicit setting wins.
  assert.equal(trustProxySetting('false', true), false);
  assert.equal(trustProxySetting('0', true), false);
  assert.equal(trustProxySetting('2', false), 2);
  assert.equal(trustProxySetting('loopback, 10.0.0.0/8', false), 'loopback, 10.0.0.0/8');
});

// Loads the app in a fresh process with only the given variables set.
function loadApp(env) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'matschema-env-'));
  // NODE_ENV and SESSION_SECRET are set (if only to ''), so a local .env
  // can't fill them in: load-env never overrides a variable that's set.
  return spawnSync(process.execPath, ['-e', "require('./src/app')"], {
    cwd: path.join(__dirname, '..'),
    env: { PATH: process.env.PATH, MATSCHEMA_DATA_DIR: dataDir, NODE_ENV: '', SESSION_SECRET: '', ...env },
    encoding: 'utf8'
  });
}

test('without NODE_ENV, the app counts as production and needs SESSION_SECRET', () => {
  const missing = loadApp({});
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /SESSION_SECRET must be set/);

  assert.equal(loadApp({ SESSION_SECRET: 'a-long-test-secret' }).status, 0);
  assert.equal(loadApp({ NODE_ENV: 'development' }).status, 0);
});

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

test('production payments fail closed without a private session signing key', () => {
  const config = path.resolve(__dirname, '../src/config/env.js');
  for (const secret of ['', 'change-this-secret', 'short-test-key']) {
    const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(config)})`], {
      env: { ...process.env, NODE_ENV: 'production', OMIDPAY_ENABLED: 'true', JWT_SECRET: secret },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /private JWT_SECRET/);
  }
  const valid = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(config)})`], {
    env: { ...process.env, NODE_ENV: 'production', OMIDPAY_ENABLED: 'true', JWT_SECRET: 'local-test-signing-key-with-32-characters' },
    encoding: 'utf8',
  });
  assert.equal(valid.status, 0, valid.stderr);
});

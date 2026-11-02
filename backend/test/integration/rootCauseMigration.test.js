const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
if (process.env.NODE_ENV !== 'test' || !/^rookhposh_payment_test_[a-f0-9]+$/.test(process.env.DB_NAME || '')) throw new Error('Migration verification requires a disposable database.');
const pool = require('../../src/config/database');
const { ensureRuntimeSchema } = require('../../src/database/runtimeSetup');
const migration = require('../../src/database/sessionRevocationSchema');

async function snapshot() {
  const [tables] = await pool.query('SHOW TABLES');
  const result = {};
  for (const row of tables) {
    const table = Object.values(row)[0];
    assert.match(table, /^[a-z0-9_]+$/);
    const [rows] = await pool.query('SELECT * FROM ' + table);
    const serialized = rows.map(item => JSON.stringify(item)).sort().join('\n');
    result[table] = { rows: rows.length, sha256: createHash('sha256').update(serialized).digest('hex') };
  }
  return result;
}

test('RCA migration preserves every existing table row, repeats safely and rolls back only an empty extension', async t => {
  t.after(() => pool.end());
  const before = await snapshot();
  assert.ok(before.users && before.products && before.pro_usages, 'An initialized baseline database is required.');
  await ensureRuntimeSchema();
  const after = await snapshot();
  for (const [table, value] of Object.entries(before)) assert.deepEqual(after[table], value, 'Existing data changed in ' + table);
  assert.ok(after.virtual_tryon_session_revocations);
  assert.ok(after.virtual_tryon_terms_acceptances);
  await ensureRuntimeSchema(); assert.deepEqual(await snapshot(), after);
  if (after.virtual_tryon_session_revocations.rows === 0) {
    assert.equal((await migration.rollbackSessionRevocations(pool, { execute: true })).executed, true);
    await migration.ensureSessionRevocations(pool);
    assert.deepEqual(await snapshot(), after);
  }
  if (after.virtual_tryon_terms_acceptances.rows === 0) {
    const termsMigration = require('../../src/database/tryonTermsSchema');
    assert.equal((await termsMigration.rollbackTryonTerms(pool, { execute: true })).executed, true);
    await termsMigration.ensureTryonTerms(pool);
    assert.deepEqual(await snapshot(), after);
  }
  console.log('MIGRATION_PRESERVATION=' + JSON.stringify({ baseline_tables: Object.keys(before).length, final_tables: Object.keys(after).length, preserved_tables: Object.keys(before).length, preserved_rows: Object.values(before).reduce((sum, item) => sum + item.rows, 0), repeatable: true }));
});

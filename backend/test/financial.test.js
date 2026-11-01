const assert = require('node:assert/strict');
const test = require('node:test');
const pool = require('../src/config/database');
const financial = require('../src/repositories/financialStore');

test('supports only fixed financial date ranges and rejects invalid dates before querying', async (t) => {
  t.mock.method(pool, 'query', () => { throw new Error('Invalid filters must not reach SQL'); });
  for (const query of [{ range: '30d) OR 1=1' }, { start_date: '2026-02-30', end_date: '2026-03-01' },
    { start_date: '2026-11-01' }, { start_date: '2026-11-02', end_date: '2026-11-01' }]) {
    await assert.rejects(financial.report('company', query), { status: 400 });
  }
  await assert.rejects(financial.report('unknown', {}), { status: 400 });
});

test('includes the whole final day in a custom financial report without interpolating dates', () => {
  assert.deepEqual(financial.reportRange({ start_date: '2026-11-01', end_date: '2026-11-02' }), {
    range: 'custom', sql: 't.created_at>=? AND t.created_at<?', params: ['2026-11-01', '2026-11-03'],
  });
  assert.equal(financial.reportRange({ range: 'all' }).sql, '');
  assert.equal(financial.reportRange({ range: '7d' }).params.length, 0);
});

test('never silently truncates an oversized Excel financial report', async (t) => {
  let calls = 0;
  t.mock.method(pool, 'query', async () => { calls += 1; return [[{ total_rows: 20001 }]]; });
  await assert.rejects(financial.report('sellers', {}, { exportAll: true }), { status: 413 });
  assert.equal(calls, 1);
});

test('never rounds an unsafe aggregate into an inaccurate income value', async (t) => {
  t.mock.method(pool, 'query', async (sql) => sql.includes('AS income')
    ? [[{ income: '9007199254740992', payments: 1 }]] : [[]]);
  await assert.rejects(financial.companyOverview(), { status: 503 });
});

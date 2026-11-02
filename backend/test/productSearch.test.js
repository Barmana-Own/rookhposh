const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSearch, searchClause, productStatus, productPagination } = require('../src/utils/productSearch');
test('product search normalizes Persian/Arabic text and digits without treating SQL wildcards as syntax', () => {
  assert.equal(normalizeSearch('  پيراهن كتان ۱۲٣ '), 'پیراهن کتان 123');
  const query = searchClause("%_!' OR 1=1");
  assert.equal(query.params[0], "%!%!_!!' OR 1=1%"); assert.equal(query.sql.includes('1=1'), false); assert.equal(query.params.length, 4);
});
test('numeric product searches include an exact parameterized ID and empty search has no clause', () => {
  assert.equal(searchClause('  '), null); assert.equal(searchClause('۱۲۳').params.at(-1), '123'); assert.match(searchClause('123').sql, /p.id=\?/);
});
test('search and status reject arrays, objects, excessive text and unsupported filters', () => {
  for (const term of [[], {}, 'x'.repeat(121)]) assert.throws(() => normalizeSearch(term), error => error.status === 400);
  assert.equal(productStatus('all'), undefined); assert.equal(productStatus(null, 'pending'), 'pending'); assert.throws(() => productStatus('bogus'), error => error.status === 400);
});
test('pagination accepts bounded integers and rejects malformed, duplicate and excessive parameters', () => {
  assert.deepEqual(productPagination({ page: '۲', limit: '25' }), { page: 2, limit: 25 });
  assert.deepEqual(productPagination({}), {});
  for (const page of [-1, 0, '1e20', '1a', ['1', '2'], {}, '100001']) assert.throws(() => productPagination({ page }), error => error.status === 400);
  assert.throws(() => productPagination({ limit: '101' }), error => error.status === 400);
});

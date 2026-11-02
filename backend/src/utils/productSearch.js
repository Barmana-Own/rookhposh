const ApiError = require('./apiError');
const { normalizeDigits } = require('./number');

function normalizeSearch(value) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > 120) throw new ApiError(400, 'عبارت جستجو باید حداکثر ۱۲۰ نویسه باشد.');
  return normalizeDigits(value.normalize('NFKC')).replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();
}
function searchClause(value) {
  const search = normalizeSearch(value);
  if (!search) return null;
  const pattern = '%' + search.replace(/[!%_]/g, '!$&') + '%';
  const fields = ['p.title', 'p.description', 'u.fullname', "JSON_UNQUOTE(JSON_EXTRACT(p.pending_changes,'$.title'))"];
  const clauses = fields.map(field => "REPLACE(REPLACE(" + field + ",'ي','ی'),'ك','ک') LIKE ? ESCAPE '!'");
  const params = fields.map(() => pattern);
  if (/^[1-9][0-9]{0,14}$/.test(search)) { clauses.push('p.id=?'); params.push(search); }
  return { sql: '(' + clauses.join(' OR ') + ')', params };
}
function productStatus(value, fallback) {
  if (value == null || value === '') return fallback;
  if (!['all', 'active', 'pending', 'rejected', 'inactive'].includes(value)) throw new ApiError(400, 'وضعیت محصول معتبر نیست.');
  return value === 'all' ? undefined : value;
}
function productPagination(query = {}) {
  const result = {};
  for (const [key, max] of [['page', 100000], ['limit', 100]]) {
    if (query[key] == null || query[key] === '') continue;
    const raw = typeof query[key] === 'string' ? normalizeDigits(query[key]) : query[key];
    const value = Number(raw);
    if (!['number', 'string'].includes(typeof raw) || !/^\d+$/.test(String(raw)) || !Number.isSafeInteger(value) || value < 1 || value > max) throw new ApiError(400, 'صفحه‌بندی محصولات معتبر نیست.');
    result[key] = value;
  }
  return result;
}
module.exports = { normalizeSearch, searchClause, productStatus, productPagination };

// Data-preserving rollback: refuse to remove any extension containing operational data.
// Never used by startup. After jobs exist, keep the additive schema and roll forward.
async function rollbackTryon(connection, { execute = false } = {}) {
  const { rollbackSessionRevocations } = require('./sessionRevocationSchema');
  const { rollbackTryonTerms } = require('./tryonTermsSchema');
  await rollbackSessionRevocations(connection);
  await rollbackTryonTerms(connection);
  const tables = ['virtual_tryon_jobs', 'virtual_tryon_files', 'virtual_tryon_attempts', 'virtual_tryon_audit', 'product_review_decisions', 'product_review_views'];
  const counts = {};
  for (const table of tables) {
    const [[row]] = await connection.query('SELECT COUNT(*) AS total FROM ' + table);
    counts[table] = Number(row.total);
  }
  const [[products]] = await connection.query("SELECT COUNT(*) AS total FROM products WHERE review_revision<>1 OR review_status IS NOT NULL OR reviewed_by IS NOT NULL");
  const [[providers]] = await connection.query('SELECT COUNT(*) AS total FROM virtual_tryon_providers WHERE id<>1 OR updated_by IS NOT NULL OR secret_ciphertext IS NOT NULL');
  const [[reasons]] = await connection.query("SELECT COUNT(*) AS total FROM product_rejection_reasons WHERE code LIKE 'reason_%'");
  if (Object.values(counts).some(Boolean) || products.total || providers.total || reasons.total) throw new Error('Rollback refused: retain/export operational data and use a compatible forward release.');
  if (!execute) return { safe: true, counts, executed: false };
  for (const table of ['product_review_views', 'product_review_decisions', 'product_rejection_reasons', 'virtual_tryon_audit', 'virtual_tryon_attempts', 'virtual_tryon_files', 'virtual_tryon_jobs', 'virtual_tryon_providers']) await connection.query('DROP TABLE ' + table);
  for (const column of ['review_revision','review_status','reject_reason_id','reject_comment','reviewed_by','reviewed_at']) await connection.query('ALTER TABLE products DROP COLUMN ' + column);
  await connection.query('ALTER TABLE pro_usages DROP INDEX uk_pro_usage_tryon_job, DROP INDEX idx_pro_usage_owner, DROP COLUMN visitor_hash, DROP COLUMN tryon_job_id, DROP COLUMN completed_at');
  await connection.query('ALTER TABLE pro_uploads DROP INDEX idx_pro_upload_visitor, DROP COLUMN visitor_hash, DROP COLUMN tryon_job_id');
  await rollbackSessionRevocations(connection, { execute: true });
  await rollbackTryonTerms(connection, { execute: true });
  return { safe: true, executed: true };
}
module.exports = { rollbackTryon };

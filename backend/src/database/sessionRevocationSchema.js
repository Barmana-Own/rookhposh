const pool = require('../config/database');
async function ensureSessionRevocations(connection = pool) {
  await connection.query(`CREATE TABLE IF NOT EXISTS virtual_tryon_session_revocations (
    owner_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    expires_at BIGINT UNSIGNED NOT NULL,
    revoked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_tryon_revocation_expiry (expires_at)
  ) ENGINE=InnoDB`);
}
async function rollbackSessionRevocations(connection, { execute = false } = {}) {
  let total;
  try { const [[row]] = await connection.query('SELECT COUNT(*) AS total FROM virtual_tryon_session_revocations'); total = Number(row.total); }
  catch (error) { if (error.code === 'ER_NO_SUCH_TABLE') return { safe: true, exists: false, executed: false }; throw error; }
  if (total) throw new Error('Rollback refused: retain session revocation data until its expiry.');
  if (execute) await connection.query('DROP TABLE virtual_tryon_session_revocations');
  return { safe: true, exists: true, executed: execute };
}
module.exports = { ensureSessionRevocations, rollbackSessionRevocations };

const pool = require('../config/database');

async function ensureTryonTerms(connection = pool) {
  await connection.query(`CREATE TABLE IF NOT EXISTS virtual_tryon_terms_acceptances (
    owner_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    terms_version VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    accepted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    expires_at DATETIME(3) NOT NULL,
    INDEX idx_tryon_terms_expiry (expires_at)
  ) ENGINE=InnoDB`);
}

async function rollbackTryonTerms(connection, { execute = false } = {}) {
  let total;
  try { const [[row]] = await connection.query('SELECT COUNT(*) AS total FROM virtual_tryon_terms_acceptances'); total = Number(row.total); }
  catch (error) { if (error.code === 'ER_NO_SUCH_TABLE') return { safe: true, exists: false, executed: false }; throw error; }
  if (total) throw new Error('Rollback refused: retain terms acceptance records until their expiry.');
  if (execute) await connection.query('DROP TABLE virtual_tryon_terms_acceptances');
  return { safe: true, exists: true, executed: execute };
}

module.exports = { ensureTryonTerms, rollbackTryonTerms };

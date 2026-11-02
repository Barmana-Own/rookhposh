const pool = require('../config/database');
const SESSION_SECONDS = 180 * 86400;
async function isRevoked(hash) {
  const [[row]] = await pool.query('SELECT owner_hash FROM virtual_tryon_session_revocations WHERE owner_hash=? AND expires_at>?', [hash, Math.floor(Date.now() / 1000)]);
  return Boolean(row);
}
async function revoke(hash) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS + 60;
  await pool.query('INSERT INTO virtual_tryon_session_revocations(owner_hash,expires_at) VALUES(?,?) ON DUPLICATE KEY UPDATE expires_at=GREATEST(expires_at,VALUES(expires_at))', [hash, expires]);
}
async function purgeExpired() {
  await pool.query('DELETE FROM virtual_tryon_session_revocations WHERE expires_at<=? ORDER BY expires_at LIMIT 500', [Math.floor(Date.now() / 1000)]);
}
module.exports = { SESSION_SECONDS, isRevoked, revoke, purgeExpired };

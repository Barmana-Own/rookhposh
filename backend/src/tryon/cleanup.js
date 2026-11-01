const pool = require('../config/database');
const images = require('./images');
const { ACTIVE_STATES } = require('./config');

async function purgeOne(id) {
  const [[job]] = await pool.query('SELECT id,user_id,owner_kind,legacy_usage_id,legacy_upload_id,status,deleted_at FROM virtual_tryon_jobs WHERE id=?', [id]);
  if (!job?.deleted_at || ACTIVE_STATES.includes(job.status)) return false;
  const [assets] = await pool.query('SELECT * FROM virtual_tryon_files WHERE job_id=?', [id]);
  const pending = await images.staged(id);
  for (const asset of assets) await images.remove(asset);
  if (pending?.asset) await images.remove(pending.asset);
  await images.clearStage(id);
  await pool.query('DELETE FROM virtual_tryon_files WHERE job_id=?', [id]);
  if (job.legacy_upload_id) await pool.query("UPDATE pro_uploads SET image='' WHERE id=? AND tryon_job_id=?", [job.legacy_upload_id, id]);
  if (job.legacy_usage_id && job.owner_kind === 'account') {
    await pool.query('UPDATE pro_usages SET input_image=NULL,product_image=NULL,output_image=NULL WHERE id=? AND user_id=?', [job.legacy_usage_id, job.user_id]);
  }
  await pool.query('UPDATE virtual_tryon_jobs SET images_purged_at=NOW(3),provider_output_ciphertext=NULL,device_json=NULL,network_ciphertext=NULL WHERE id=? AND deleted_at IS NOT NULL', [id]);
  return true;
}
async function purgeDeleted() {
  const [jobs] = await pool.query("SELECT id FROM virtual_tryon_jobs WHERE deleted_at IS NOT NULL AND images_purged_at IS NULL AND status NOT IN ('validating','processing','saving') ORDER BY deleted_at LIMIT 20");
  for (const job of jobs) {
    try { await purgeOne(job.id); }
    catch { console.error(JSON.stringify({ component: 'tryon-cleanup', code: 'PRIVATE_FILE_PURGE_FAILED', job_id: job.id })); }
  }
}
module.exports = { purgeOne, purgeDeleted };

const pool = require('../config/database');
const ApiError = require('../utils/apiError');

const VERSION = 'tryon-first-use-2026-11-01';
const REGISTRATION_VERSION = 'registration-policy-2026-11-01';
const policy = {
  version: VERSION,
  title: 'قوانین استفاده از پرو آنلاین',
  paragraphs: [
    'فقط تصویر خودتان یا تصویری را بارگذاری کنید که اجازه استفاده از آن را دارید.',
    'تصویر شما و لباس انتخابی برای ساخت خروجی به سرویس هوش مصنوعی ارسال می‌شوند.',
    'تصاویر و خروجی‌ها به‌صورت خصوصی در سوابق پرو نگهداری می‌شوند. سوابق مهمان به همین مرورگر وابسته‌اند.',
  ],
};

async function receipt(owner, { touch = false } = {}) {
  if (owner.kind === 'account') return { version: REGISTRATION_VERSION, acceptedAt: null };
  const [[row]] = await pool.query(
    'SELECT accepted_at FROM virtual_tryon_terms_acceptances WHERE owner_hash=? AND terms_version=? AND expires_at>NOW(3)',
    [owner.hash, VERSION],
  );
  if (!row) return null;
  if (touch) await pool.query(
    'UPDATE virtual_tryon_terms_acceptances SET expires_at=DATE_ADD(NOW(3),INTERVAL 180 DAY) WHERE owner_hash=? AND terms_version=? AND expires_at>NOW(3)',
    [owner.hash, VERSION],
  );
  return { version: VERSION, acceptedAt: row.accepted_at };
}

async function status(owner) {
  return { ...policy, required: !await receipt(owner) };
}

async function accept(owner, input) {
  if (input?.accepted !== true || input.version !== VERSION) throw new ApiError(400, 'قوانین فعلی را مطالعه و تأیید کنید.');
  if (owner.kind !== 'account') await pool.query(
    `INSERT INTO virtual_tryon_terms_acceptances(owner_hash,terms_version,expires_at) VALUES(?,?,DATE_ADD(NOW(3),INTERVAL 180 DAY))
     ON DUPLICATE KEY UPDATE accepted_at=IF(terms_version=VALUES(terms_version) AND expires_at>NOW(3),accepted_at,NOW(3)),
       terms_version=VALUES(terms_version),expires_at=VALUES(expires_at)`,
    [owner.hash, VERSION],
  );
  return status(owner);
}

async function authorize(owner, { explicitConsent = false, legacy = false } = {}) {
  if (legacy) return { version: null, acceptedAt: null };
  // Keep cached clients with an explicit processing checkbox compatible.
  if (explicitConsent) return { version: 'tryon-2026-11-01', acceptedAt: new Date() };
  const accepted = await receipt(owner, { touch: true });
  if (!accepted) throw new ApiError(428, 'پیش از اولین پرو، قوانین استفاده را تأیید کنید.');
  // Registration policy is the account authorization source; do not invent a historical acceptance timestamp.
  return accepted;
}

async function purgeExpired() {
  await pool.query('DELETE FROM virtual_tryon_terms_acceptances WHERE expires_at<=NOW(3) ORDER BY expires_at LIMIT 500');
}

module.exports = { VERSION, status, accept, authorize, purgeExpired };

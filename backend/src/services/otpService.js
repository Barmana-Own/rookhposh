const { createHmac, randomBytes, randomInt, timingSafeEqual } = require('node:crypto');
const ApiError = require('../utils/apiError');
const sms = require('./smsService');

const TTL_MS = 2 * 60 * 1000;
const RESEND_MS = TTL_MS;
const HOUR_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_MOBILE = 5;
const MAX_SENDS_TOTAL = 200;
const MAX_RECORDS = 10000;

function createOtpService({ sendOtp = (payload) => sms.sendOtp(payload), now = Date.now } = {}) {
  const secret = randomBytes(32);
  const records = new Map();
  let sends = [];
  const digest = (mobile, code) => createHmac('sha256', secret).update(`${mobile}:${code}`).digest();

  function discard(record) {
    record.challenge?.digest.fill(0);
    record.challenge = null;
  }

  function prune(time) {
    sends = sends.filter((sent) => sent > time - HOUR_MS);
    for (const [mobile, record] of records) {
      record.sends = record.sends.filter((sent) => sent > time - HOUR_MS);
      if (record.challenge && record.challenge.expiresAt <= time && !record.pending) discard(record);
      if (!record.pending && !record.challenge && record.sends.length === 0) records.delete(mobile);
    }
  }

  async function issue(mobile, context = {}) {
    const time = now();
    prune(time);
    const record = records.get(mobile) || { sends: [], challenge: null, pending: false, resendAt: 0 };
    if (record.pending || time < record.resendAt) {
      throw new ApiError(429, 'برای ارسال مجدد کد، دو دقیقه صبر کنید.');
    }
    if (record.sends.length >= MAX_SENDS_PER_MOBILE) {
      throw new ApiError(429, 'تعداد درخواست‌های این شماره بیش از حد مجاز است. یک ساعت بعد تلاش کنید.');
    }
    if (sends.length >= MAX_SENDS_TOTAL || (!records.has(mobile) && records.size >= MAX_RECORDS)) {
      throw new ApiError(429, 'تعداد درخواست‌های ارسال زیاد است. لطفاً کمی بعد تلاش کنید.');
    }

    // Reserve the send before awaiting the provider so concurrent requests cannot double-send.
    discard(record);
    const code = String(randomInt(100000, 1000000));
    const challenge = {
      digest: digest(mobile, code),
      attempts: MAX_ATTEMPTS,
      expiresAt: time + TTL_MS,
      ready: false,
      store_slug: context.store_slug || '',
    };
    record.challenge = challenge;
    record.pending = true;
    record.resendAt = time + RESEND_MS;
    record.sends.push(time);
    sends.push(time);
    records.set(mobile, record);

    try {
      await sendOtp({ mobile, code });
      const acceptedAt = now();
      challenge.ready = true;
      challenge.expiresAt = acceptedAt + TTL_MS;
      record.resendAt = acceptedAt + RESEND_MS;
      return {
        expires_in: TTL_MS / 1000,
        resend_after: RESEND_MS / 1000,
        delivery: 'sms',
      };
    } catch (error) {
      discard(record);
      record.resendAt = now() + RESEND_MS;
      // A timed-out request may already have sent an SMS; retain cooldown and send quotas.
      throw error;
    } finally {
      record.pending = false;
    }
  }

  function consume(mobile, code) {
    const record = records.get(mobile);
    const challenge = record?.challenge;
    const invalid = () => new ApiError(401, 'کد تایید معتبر نیست یا منقضی شده است.');
    if (!challenge || !challenge.ready || record.pending) throw invalid();
    if (challenge.expiresAt <= now()) {
      discard(record);
      throw invalid();
    }

    const candidate = digest(mobile, code);
    const matches = timingSafeEqual(challenge.digest, candidate);
    candidate.fill(0);
    if (!matches) {
      challenge.attempts -= 1;
      if (challenge.attempts === 0) discard(record);
      throw invalid();
    }

    const context = { store_slug: challenge.store_slug };
    // Consume synchronously before account queries or creation can yield to another request.
    discard(record);
    return context;
  }

  return { issue, consume };
}

module.exports = { ...createOtpService(), createOtpService };

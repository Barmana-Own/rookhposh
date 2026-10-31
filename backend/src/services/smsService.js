const ApiError = require('../utils/apiError');
const { kavenegar } = require('../config/env');

const ACCEPTED_STATUSES = new Set([1, 2, 4, 5, 10]);

function deliveryError(kind, status) {
  // Provider errors can contain the API key, recipient or code. Log only safe metadata.
  console.error('otp_delivery_failed', { provider: 'kavenegar', kind, status });
  return new ApiError(503, 'ارسال پیامک انجام نشد. لطفاً کمی بعد دوباره تلاش کنید.');
}

function createSmsSender({ config = kavenegar, fetchImpl = globalThis.fetch } = {}) {
  return async ({ mobile, code }) => {
    if (!config.apiKey || !config.template) throw deliveryError('configuration');

    let response;
    let payload;
    try {
      response = await fetchImpl(
        `https://api.kavenegar.com/v1/${encodeURIComponent(config.apiKey)}/verify/lookup.json`,
        {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ receptor: mobile, token: code, template: config.template, type: 'sms' }),
          signal: AbortSignal.timeout(10000),
          redirect: 'error',
        },
      );
      payload = await response.json();
    } catch {
      throw deliveryError('transport');
    }

    const entry = Array.isArray(payload?.entries) ? payload.entries[0] : null;
    if (!response.ok || payload?.return?.status !== 200 || !entry?.messageid
        || !ACCEPTED_STATUSES.has(Number(entry.status))) {
      throw deliveryError('provider', Number(payload?.return?.status) || response.status);
    }

    return { messageId: entry.messageid };
  };
}

module.exports = { sendOtp: createSmsSender(), createSmsSender };

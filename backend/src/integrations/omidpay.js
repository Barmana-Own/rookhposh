const ApiError = require('../utils/apiError');
const { omidpay } = require('../config/env');

const API_URL = 'https://ref.omidpayment.ir/ref-payment/RestServices/mts/';
const GATEWAY_URL = 'https://omid.shaparak.ir/_ipgw_/merchant/token';
const MAX_AMOUNT_RIAL = 999999999999;
const MAX_RESPONSE_BYTES = 64 * 1024;

function amountInRials(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value))) {
    throw new ApiError(400, 'مبلغ پرداخت باید یک عدد صحیح مثبت باشد.');
  }
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > Math.floor(MAX_AMOUNT_RIAL / 10)) {
    throw new ApiError(400, 'مبلغ پرداخت خارج از محدوده مجاز است.');
  }
  return amount * 10;
}

function succeeded(result) {
  // The tables use ER_SUCCEED; the official response examples use erSucceed.
  return typeof result === 'string' && result.replaceAll('_', '').toLowerCase() === 'ersucceed';
}

function bankAmount(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+(?:\.0+)?$/.test(String(value))) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function requireConfiguration() {
  if (!omidpay.enabled || !omidpay.terminalId || !omidpay.userId || !omidpay.password || !omidpay.merchantId) {
    throw new ApiError(503, 'درگاه پرداخت هنوز آماده استفاده نیست. لطفاً با پشتیبانی تماس بگیرید.');
  }
  return omidpay;
}

async function request(method, payload) {
  const config = requireConfiguration();
  try {
    const response = await fetch(new URL(`${method}/`, API_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ WSContext: { UserId: config.userId, Password: config.password }, ...payload }),
      signal: AbortSignal.timeout(12000),
      redirect: 'error',
    });
    if (!response.ok || !response.body) throw new Error('gateway unavailable');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) throw new Error('gateway response too large');
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel();
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid gateway response');
    return data;
  } catch {
    // Never expose the upstream body, credentials, or request options in an API error.
    throw new ApiError(502, 'ارتباط با درگاه پرداخت برقرار نشد. وضعیت پرداخت را دوباره بررسی کنید.');
  }
}

function assertSuccess(data) {
  if (!succeeded(data.Result)) {
    const error = new ApiError(502, 'درگاه پرداخت درخواست را تأیید نکرد. لطفاً وضعیت پرداخت را بررسی کنید.');
    error.gatewayCode = /^[A-Za-z_]{1,80}$/.test(data.Result) ? data.Result : 'INVALID_RESPONSE';
    throw error;
  }
}

async function createToken({ orderId, amountRial, callbackUrl }) {
  const config = requireConfiguration();
  const data = await request('generateTokenWithNoSign', {
    TransType: 'EN_GOODS',
    ReserveNum: orderId,
    MerchantId: config.merchantId,
    TerminalId: config.terminalId,
    Amount: String(amountRial),
    RedirectUrl: callbackUrl,
  });
  assertSuccess(data);
  if (typeof data.Token !== 'string' || !/^[A-Za-z0-9_+\/=.-]{1,256}$/.test(data.Token)) {
    throw new ApiError(502, 'توکن دریافتی از درگاه پرداخت معتبر نیست.');
  }
  return data.Token;
}

async function verify({ token, amountRial }) {
  // Callback fields are untrusted. Obtain the reference and amount from the bank itself.
  const inquiry = await request('inquiryMerchantToken', { Token: token });
  assertSuccess(inquiry);
  const reference = inquiry.ReferenceNum;
  if (typeof reference !== 'string' || !/^\d{1,32}$/.test(reference)
      || ![0, '0', '00'].includes(inquiry.ResponseCode) || bankAmount(inquiry.Amount) !== amountRial) {
    throw new ApiError(409, 'پرداخت توسط بانک تأیید نشده یا مبلغ آن با سفارش مطابقت ندارد.');
  }
  const verified = await request('verifyMerchantTrans', { Token: token, RefNum: String(reference) });
  assertSuccess(verified);
  if (bankAmount(verified.Amount) !== amountRial || verified.RefNum !== reference) {
    throw new ApiError(409, 'اطلاعات تأیید پرداخت با سفارش مطابقت ندارد.');
  }
  return { reference: String(reference), amountRial };
}

module.exports = { GATEWAY_URL, amountInRials, succeeded, requireConfiguration, createToken, verify };

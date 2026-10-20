const provider = require('../integrations/omidpay');
const store = require('../repositories/paymentStore');
const ApiError = require('../utils/apiError');
const { createHash, randomUUID } = require('node:crypto');

function validId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw new ApiError(400, 'شناسه پرداخت معتبر نیست.');
  return id;
}

function configuredUrl(value, requiredPath = null) {
  try {
    const url = new URL(value);
    const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password
        || url.search || url.hash || (requiredPath && url.pathname.replace(/\/$/, '') !== requiredPath)) throw new Error('invalid URL');
    return url;
  } catch {
    throw new ApiError(503, 'آدرس بازگشت درگاه پرداخت به‌درستی تنظیم نشده است.');
  }
}

function publicStatus(payment) {
  return {
    id: payment.id,
    transaction_id: payment.transaction_id,
    status: payment.state === 'success' ? 'success' : payment.state === 'failed' ? 'failed' : 'pending',
    amount: Number(payment.amount),
    reference: payment.state === 'success' ? payment.bank_reference : null,
    return_path: payment.role === 'Seller' ? '/seller/dashboard' : '/user',
  };
}

function gatewayResponse(payment, token) {
  return {
    id: payment.id,
    transaction_id: payment.transaction_id,
    status: 'redirect_required',
    amount: Number(payment.amount_rial) / 10,
    gateway: { url: provider.GATEWAY_URL, method: 'POST', fields: { token, language: 'fa' } },
  };
}

async function create(userId, amount, transaction, requestKey = randomUUID()) {
  if (typeof requestKey !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(requestKey)) {
    throw new ApiError(400, 'شناسه درخواست پرداخت معتبر نیست.');
  }
  const amountRial = provider.amountInRials(amount);
  const config = provider.requireConfiguration();
  const callback = configuredUrl(config.callbackBaseUrl, '/api/payments/omidpay/callback');
  configuredUrl(config.frontendUrl);
  const requestHash = createHash('sha256').update(JSON.stringify({
    amountRial, type: transaction.type, packageId: transaction.package_id || null,
    quantity: transaction.metadata?.token_quantity || null,
  })).digest('hex');
  const payment = await store.create(userId, amountRial, transaction, requestKey, requestHash);
  if (payment.existing) {
    if (payment.state === 'pending' && payment.token) return gatewayResponse(payment, payment.token);
    if (payment.state === 'success') return publicStatus(await store.get(payment.id, userId));
    if (payment.state === 'verified') return reconcile(payment.id, null, userId);
    throw new ApiError(409, 'این پرداخت قبلاً ثبت شده است. نتیجه را از بخش تراکنش‌ها پیگیری کنید.');
  }
  try {
    const token = await provider.createToken({
      orderId: payment.order_id, amountRial, callbackUrl: `${callback.href.replace(/\/$/, '')}/${payment.id}`,
    });
    await store.attachToken(payment.id, token);
    return gatewayResponse(payment, token);
  } catch (error) {
    await store.failInitialization(payment.id);
    throw error;
  }
}

async function reconcile(id, callbackToken = null, userId = null) {
  validId(id);
  let payment = await store.get(id, userId);
  if (callbackToken !== null && (typeof callbackToken !== 'string' || callbackToken !== payment.token)) {
    throw new ApiError(400, 'اطلاعات بازگشت درگاه معتبر نیست.');
  }
  if (payment.state === 'success' || payment.state === 'failed') return publicStatus(payment);
  if (payment.state === 'verified') {
    await store.finalize(id);
    return publicStatus(await store.get(id, userId));
  }
  if (!payment.token) return publicStatus(payment);
  const lockId = await store.claim(id);
  if (!lockId) return publicStatus(payment);
  try {
    const verified = await provider.verify({ token: payment.token, amountRial: Number(payment.amount_rial) });
    await store.recordVerification(id, lockId, verified.reference);
  } catch (error) {
    await store.releaseClaim(id, lockId, error.gatewayCode || 'VERIFICATION_UNAVAILABLE');
    // Only log a correlation ID and a controlled error code, never bank payloads or card data.
    console.warn('Payment verification pending', { paymentId: id, code: error.gatewayCode || 'VERIFICATION_UNAVAILABLE' });
    throw error;
  }
  await store.finalize(id);
  payment = await store.get(id, userId);
  return publicStatus(payment);
}

async function status(id, userId) {
  validId(id);
  return publicStatus(await store.get(id, userId));
}

function resultUrl(id) {
  validId(id);
  const { omidpay } = require('../config/env');
  return new URL(`/payments/result/${id}`, configuredUrl(omidpay.frontendUrl)).href;
}

module.exports = { create, reconcile, status, resultUrl };

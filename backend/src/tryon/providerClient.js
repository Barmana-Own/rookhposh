const { selectFinalImageCandidate, decodeImageCandidate } = require('../utils/proImageResponse');
const images = require('./images');
const network = require('./network');

class ProviderFailure extends Error {
  constructor(code, { recoverable = false, uncertain = false, retryAfter = 0, httpStatus, requestId } = {}) {
    super(code);
    this.code = code;
    Object.assign(this, { recoverable, uncertain, retryAfter, httpStatus, requestId });
  }
}

function retryAfter(value, now = Date.now()) {
  const numeric = Number(value);
  if (value != null && Number.isFinite(numeric) && numeric >= 0) return Math.min(86400, Math.ceil(numeric));
  const date = new Date(value).getTime();
  return Number.isFinite(date) ? Math.min(86400, Math.max(0, Math.ceil((date - now) / 1000))) : 0;
}

function requestIdOf(headers, secret = '') {
  const value = String(headers['x-request-id'] || headers['request-id'] || '');
  const fragments = secret ? Array.from({ length: Math.max(0, secret.length - 7) }, (_v, i) => secret.slice(i, i + 8)) : [];
  return /^[A-Za-z0-9_.:-]{1,100}$/.test(value) && (!secret || (!value.includes(secret) && !fragments.some((part) => value.includes(part)))) ? value : null;
}

async function payloadFor(provider, input, garment) {
  const options = provider.options || {};
  const person = await images.inspect(input);
  const cloth = await images.inspect(garment);
  if (provider.adapter === 'json_images') {
    return {
      body: Buffer.from(JSON.stringify({
        [options.person_field || 'person_image']: 'data:' + person.mime + ';base64,' + input.toString('base64'),
        [options.cloth_field || 'cloth_image']: 'data:' + cloth.mime + ';base64,' + garment.toString('base64'),
        ...(provider.model ? { model: provider.model } : {}),
      })),
      contentType: 'application/json',
    };
  }
  const form = new FormData();
  const openai = provider.adapter === 'openai_edit';
  form.append(openai ? 'image[]' : provider.adapter === 'rookhposh_multipart' ? 'person' : options.person_field || 'person',
    new Blob([input], { type: person.mime }), 'person.' + person.extension);
  form.append(openai ? 'image[]' : provider.adapter === 'rookhposh_multipart' ? 'cloth' : options.cloth_field || 'cloth',
    new Blob([garment], { type: cloth.mime }), 'cloth.' + cloth.extension);
  if (provider.adapter !== 'rookhposh_multipart' && provider.model) form.append('model', provider.model);
  if (openai) {
    form.append('prompt', options.prompt || 'Dress the person in the second reference garment. Preserve the person and garment identity; return one final realistic try-on image.');
    form.append('n', '1');
  }
  const encoded = new Request(provider.endpoint, { method: 'POST', body: form });
  return { body: Buffer.from(await encoded.arrayBuffer()), contentType: encoded.headers.get('content-type') };
}

function failureFromResponse(response, secret) {
  const requestId = requestIdOf(response.headers, secret);
  // Inspect only classification signals; never persist or expose the provider's response body.
  const text = response.body.toString('utf8').slice(0, 8000);
  if (/(?:safety|content_policy|moderation|nsfw|policy_violation|responsible_ai)/i.test(text)) {
    return new ProviderFailure('SAFETY_REJECTED', { httpStatus: response.status, requestId });
  }
  if ([400, 413, 422].includes(response.status)) return new ProviderFailure('INPUT_REJECTED', { httpStatus: response.status, requestId });
  if ([401, 403].includes(response.status)) return new ProviderFailure('PROVIDER_AUTH', { recoverable: true, httpStatus: response.status, requestId });
  if (response.status === 429) return new ProviderFailure('RATE_LIMITED', { recoverable: true, retryAfter: retryAfter(response.headers['retry-after']), httpStatus: 429, requestId });
  return new ProviderFailure('PROVIDER_HTTP_' + response.status, { recoverable: response.status >= 500, httpStatus: response.status, requestId });
}

async function generate(provider, job, input, garment, { signal, transport = network.request } = {}) {
  const payload = await payloadFor(provider, input, garment);
  let response;
  try {
    let endpoint = provider.endpoint;
    if (job.legacy_endpoint && provider.id === 1) endpoint = new URL('/' + job.legacy_endpoint, provider.endpoint).href;
    response = await transport(endpoint, {
      method: 'POST', body: payload.body, signal, timeoutMs: provider.timeout_seconds * 1000,
      headers: {
        'content-type': payload.contentType, accept: 'image/*,application/json',
        'idempotency-key': 'rookhposh-' + job.id,
        ...(provider.apiKey ? { authorization: 'Bearer ' + provider.apiKey } : {}),
      },
    });
  } catch (error) {
    if (error instanceof ProviderFailure) throw error;
    const timeout = ['ETIMEDOUT', 'ABORT_ERR'].includes(error.code);
    throw new ProviderFailure(timeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_NETWORK', {
      recoverable: !error.sent, uncertain: Boolean(error.sent),
    });
  }
  if (response.status < 200 || response.status >= 300) throw failureFromResponse(response, provider.apiKey);
  const requestId = requestIdOf(response.headers, provider.apiKey);
  let output;
  try {
    if (String(response.headers['content-type'] || '').startsWith('image/')) output = response.body;
    else {
      let data;
      try { data = JSON.parse(response.body.toString('utf8')); } catch { data = response.body.toString('utf8'); }
      if (data?.success === false || ['failed', 'error'].includes(data?.status)) throw failureFromResponse(response, provider.apiKey);
      const candidate = selectFinalImageCandidate(data);
      const decoded = decodeImageCandidate(candidate);
      if (decoded) output = decoded.bytes;
      else if (candidate?.kind === 'url') {
        const url = network.parseEndpoint(candidate.source, { image: true });
        const hosts = new Set([new URL(provider.endpoint).hostname, ...(provider.options?.output_hosts || [])]);
        if (!hosts.has(url.hostname)) throw new ProviderFailure('INVALID_OUTPUT', { recoverable: true, requestId });
        return { source: url.href, requestId };
      }
    }
    await images.inspect(output);
  } catch (error) {
    if (error instanceof ProviderFailure) throw error;
    throw new ProviderFailure('INVALID_OUTPUT', { recoverable: true, requestId });
  }
  return { bytes: output, requestId };
}

module.exports = { generate, payloadFor, ProviderFailure, failureFromResponse, retryAfter };

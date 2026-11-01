const dns = require('node:dns').promises;
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const ApiError = require('../utils/apiError');
const { providerOrigin } = require('./config');

function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && [0, 2].includes(c))))
      || (a === 100 && b >= 64 && b <= 127) || (a === 198 && ([18, 19].includes(b) || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  if (net.isIP(address) === 6) {
    const value = address.toLowerCase();
    return /^[23]/.test(value) && !value.startsWith('2001:db8:') && !value.startsWith('2002:');
  }
  return false;
}

function parseEndpoint(value, { image = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw Object.assign(new ApiError(400, 'Endpoint معتبر نیست.'), { code: 'INVALID_ENDPOINT', sent: false }); }
  const trustedLegacy = url.origin === providerOrigin.origin;
  if (url.username || url.password || url.hash || (!image && url.search)
      || (url.protocol !== 'https:' && !(trustedLegacy && url.protocol === 'http:'))
      || (url.port && url.port !== '443' && !trustedLegacy)) {
    throw Object.assign(new ApiError(400, 'فقط Endpoint امن و بدون اطلاعات محرمانه در URL مجاز است.'), { code: 'INVALID_ENDPOINT', sent: false });
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(hostname) && !publicAddress(hostname)) throw Object.assign(new ApiError(400, 'آدرس شبکه خصوصی مجاز نیست.'), { code: 'UNSAFE_DESTINATION', sent: false });
  return url;
}

async function request(value, { method = 'GET', body, headers = {}, timeoutMs = 30000, maxBytes = 32 * 1024 * 1024, signal, image = false } = {}) {
  const url = parseEndpoint(value, { image });
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const started = Date.now();
  let addresses;
  if (net.isIP(hostname)) addresses = [{ address: hostname, family: net.isIP(hostname) }];
  else addresses = await new Promise((resolve, reject) => {
    const fail = () => reject(Object.assign(new Error('DNS deadline reached.'), { code: 'ETIMEDOUT', sent: false }));
    const onAbort = () => reject(Object.assign(new Error('Request cancelled.'), { code: 'ABORT_ERR', sent: false }));
    const timer = setTimeout(fail, Math.min(5000, timeoutMs));
    signal?.addEventListener('abort', onAbort, { once: true });
    dns.lookup(hostname, { all: true }).then(resolve, reject).finally(() => {
      clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
    });
    if (signal?.aborted) onAbort();
  });
  if (!addresses.length || addresses.some((item) => !publicAddress(item.address))) {
    throw Object.assign(new ApiError(400, 'مقصد شبکه مجاز نیست.'), { code: 'UNSAFE_DESTINATION', sent: false });
  }
  const selected = addresses[0];
  return new Promise((resolve, reject) => {
    let sent = false;
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      method, headers: { ...headers, ...(body ? { 'content-length': body.length } : {}) },
      signal, servername: hostname,
      lookup: (_host, options, callback) => callback(null, options?.all ? [selected] : selected.address, selected.family),
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) res.destroy(Object.assign(new Error('Provider response too large.'), { code: 'RESPONSE_TOO_LARGE', sent }));
        else chunks.push(chunk);
      });
      res.on('error', (error) => reject(Object.assign(error, { sent })));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.once('socket', (socket) => {
      if (!socket.connecting) sent = true;
      const event = url.protocol === 'https:' ? 'secureConnect' : 'connect';
      socket.once(event, () => { sent = true; });
    });
    req.once('finish', () => { sent = true; });
    const deadline = setTimeout(() => req.destroy(Object.assign(new Error('Provider deadline reached.'), { code: 'ETIMEDOUT', sent })), Math.max(1, timeoutMs - (Date.now() - started)));
    req.on('close', () => clearTimeout(deadline));
    req.once('error', (error) => reject(Object.assign(error, { sent })));
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { publicAddress, parseEndpoint, request };

const http = require('node:http');
const https = require('node:https');
const {
  decodeImageCandidate,
  detectImageMime,
  selectFinalImageCandidate,
} = require('../utils/proImageResponse');

const MAX_UPSTREAM_BODY_BYTES = 32 * 1024 * 1024;

function requestUpstream(target, options, body) {
  const transport = target.protocol === 'https:' ? https : http;
  const requestBody = body && !['GET', 'HEAD'].includes(options.method)
    ? (Buffer.isBuffer(body) ? body : Buffer.from(body))
    : null;
  const headers = { ...(options.headers || {}) };

  if (requestBody) {
    headers['content-length'] = String(requestBody.length);
    delete headers['transfer-encoding'];
  }

  return new Promise((resolve, reject) => {
    const request = transport.request(target, { ...options, headers }, resolve);

    request.setTimeout(300000, () => {
      const timeoutError = new Error('Pro API request timed out.');
      timeoutError.code = 'ETIMEDOUT';
      request.destroy(timeoutError);
    });
    request.once('error', reject);

    if (requestBody) {
      request.write(requestBody);
    }
    request.end();
  });
}

function readResponseBody(response, maxBytes = MAX_UPSTREAM_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    response.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        const sizeError = new Error('Pro API response exceeded the maximum size.');
        sizeError.code = 'ERESPONSETOOLARGE';
        response.destroy(sizeError);
        return;
      }
      chunks.push(chunk);
    });
    response.on('end', () => resolve(Buffer.concat(chunks)));
    response.on('error', reject);
  });
}

function copyResponseHeaders(res, response) {
  ['content-type', 'content-disposition', 'cache-control', 'content-length'].forEach((name) => {
    const value = response.headers[name];
    if (value) res.setHeader(name, value);
  });
}

function sendImageBuffer(res, statusCode, bytes) {
  const mimeType = detectImageMime(bytes);
  if (!mimeType) return false;
  res.status(statusCode || 200);
  res.setHeader('content-type', mimeType);
  res.setHeader('content-length', String(bytes.length));
  res.setHeader('cache-control', 'no-store');
  res.end(bytes);
  return true;
}

function allowedImageHosts(origin) {
  const hosts = new Set([
    'kwai-kolors-kolors-virtual-try-on.hf.space',
    '91.107.232.169',
  ]);
  try {
    if (origin) hosts.add(new URL(origin).hostname);
  } catch {
    // Invalid origins are rejected later by URL construction.
  }
  return hosts;
}

function createProApiProxy(origin) {
  const permittedImageHosts = allowedImageHosts(origin);
  return async (req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    try {
      const target = new URL(req.url || '/', origin);
      const headers = {};
      ['accept', 'content-type', 'content-length', 'user-agent'].forEach((name) => {
        if (req.headers[name]) headers[name] = req.headers[name];
      });

      const response = await requestUpstream(target, { method: req.method, headers }, req.body);

      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      if (response.statusCode >= 200 && response.statusCode < 300 && contentType.includes('json')) {
        const body = await readResponseBody(response);
        let payload;
        try {
          payload = JSON.parse(body.toString('utf8'));
        } catch {
          payload = null;
        }

        const imageCandidate = selectFinalImageCandidate(payload);
        const decodedImage = decodeImageCandidate(imageCandidate);
        if (decodedImage && sendImageBuffer(res, response.statusCode, decodedImage.bytes)) return;

        if (imageCandidate?.kind === 'url') {
          const imageTarget = new URL(imageCandidate.source, target);
          const isPermittedTarget = ['http:', 'https:'].includes(imageTarget.protocol)
            && permittedImageHosts.has(imageTarget.hostname);
          if (!isPermittedTarget) {
            res.status(response.statusCode || 502);
            copyResponseHeaders(res, response);
            res.end(body);
            return;
          }
          const imageResponse = await requestUpstream(imageTarget, {
            method: 'GET',
            headers: {
              accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              'user-agent': 'Rookhposh-Pro-Proxy/1.0',
            },
          });

          if (imageResponse.statusCode >= 200 && imageResponse.statusCode < 300) {
            const imageBody = await readResponseBody(imageResponse);
            if (sendImageBuffer(res, imageResponse.statusCode, imageBody)) return;
          } else {
            imageResponse.resume();
          }
        }

        res.status(response.statusCode || 502);
        copyResponseHeaders(res, response);
        res.end(body);
        return;
      }

      res.status(response.statusCode || 502);
      copyResponseHeaders(res, response);
      response.pipe(res);
    } catch (error) {
      error.status = error.code === 'ETIMEDOUT' ? 504 : 502;
      error.message = error.code === 'ETIMEDOUT'
        ? 'پاسخ سرویس پرو بیش از حد طول کشید.'
        : 'ارتباط با سرویس پرو آنلاین برقرار نشد.';
      next(error);
    }
  };
}

function createProOutputProxy(origin) {
  const allowedHosts = allowedImageHosts(origin);

  return async (req, res, next) => {
    try {
      const source = String(req.query?.url || '');
      if (!source) {
        res.status(400).json({ success: false, message: 'آدرس تصویر خروجی ارسال نشده است.' });
        return;
      }

      let target;
      try {
        target = new URL(source);
      } catch {
        res.status(400).json({ success: false, message: 'آدرس تصویر خروجی نامعتبر است.' });
        return;
      }
      if (!allowedHosts.has(target.hostname)) {
        res.status(400).json({ success: false, message: 'منبع تصویر خروجی مجاز نیست.' });
        return;
      }

      const response = await requestUpstream(target, {
        method: 'GET',
        headers: {
          accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'user-agent': 'Rookhposh-Pro-Proxy/1.0',
        },
      });
      if (response.statusCode >= 200 && response.statusCode < 300) {
        const imageBody = await readResponseBody(response);
        if (sendImageBuffer(res, response.statusCode, imageBody)) return;
        res.status(502).json({ success: false, message: 'پاسخ منبع، تصویر معتبر نبود.' });
        return;
      }
      res.status(response.statusCode || 502);
      copyResponseHeaders(res, response);
      response.pipe(res);
    } catch (error) {
      error.status = error.code === 'ETIMEDOUT' ? 504 : 502;
      error.message = error.code === 'ETIMEDOUT'
        ? 'پاسخ سرویس پرو بیش از حد طول کشید.'
        : 'ارتباط با سرویس پرو آنلاین برقرار نشد.';
      next(error);
    }
  };
}

module.exports = { createProApiProxy, createProOutputProxy };

const http = require('node:http');
const https = require('node:https');

const imageKeys = ['image_url', 'imageUrl', 'output_image', 'outputImage', 'result_url', 'resultUrl', 'image', 'url', 'result', 'output'];

function requestUpstream(target, options, body) {
  const transport = target.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(target, options, resolve);

    request.setTimeout(300000, () => {
      request.destroy(new Error('Pro API request timed out.'));
    });
    request.once('error', reject);

    if (body && !['GET', 'HEAD'].includes(options.method)) {
      request.write(body);
    }
    request.end();
  });
}

function readResponseBody(response) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
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

function findImageUrl(payload) {
  if (!payload || typeof payload !== 'object') return '';
  for (const key of imageKeys) {
    const value = payload[key];
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
    if (value && typeof value === 'object') {
      const nested = findImageUrl(value);
      if (nested) return nested;
    }
  }
  return '';
}

function createProApiProxy(origin) {
  return async (req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    try {
      const target = new URL(req.url || '/', origin);
      const headers = {};
      ['accept', 'content-type', 'content-length', 'user-agent', 'authorization'].forEach((name) => {
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

        const imageUrl = findImageUrl(payload);
        if (imageUrl) {
          const imageTarget = new URL(imageUrl, target);
          const imageResponse = await requestUpstream(imageTarget, {
            method: 'GET',
            headers: {
              accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              'user-agent': 'Rookhposh-Pro-Proxy/1.0',
            },
          });

          if (imageResponse.statusCode >= 200 && imageResponse.statusCode < 300) {
            res.status(imageResponse.statusCode);
            copyResponseHeaders(res, imageResponse);
            imageResponse.pipe(res);
            return;
          }

          imageResponse.resume();
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
      next(error);
    }
  };
}

function createProOutputProxy(origin) {
  const allowedHosts = new Set([
    'kwai-kolors-kolors-virtual-try-on.hf.space',
    '91.107.232.169',
  ]);
  try {
    if (origin) allowedHosts.add(new URL(origin).hostname);
  } catch {
    // Keep the built-in provider allowlist when the configured origin is invalid.
  }

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
      res.status(response.statusCode || 502);
      copyResponseHeaders(res, response);
      response.pipe(res);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { createProApiProxy, createProOutputProxy };

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 240;
const buckets = new Map();

function basicRateLimit(req, res, next) {
  const key = req.ip || 'anonymous';
  const now = Date.now();
  if (!buckets.has(key) && buckets.size >= 10000) {
    for (const [address, bucket] of buckets) if (bucket.resetAt < now) buckets.delete(address);
    if (buckets.size >= 10000) return res.status(429).json({ success: false, message: 'Too many requests' });
  }
  const current = buckets.get(key) || { count: 0, resetAt: now + WINDOW_MS };

  if (now > current.resetAt) {
    current.count = 0;
    current.resetAt = now + WINDOW_MS;
  }

  current.count += 1;
  buckets.set(key, current);

  if (current.count > MAX_REQUESTS) {
    return res.status(429).json({ success: false, message: 'Too many requests' });
  }

  return next();
}

function hardenHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  next();
}

module.exports = { basicRateLimit, hardenHeaders };

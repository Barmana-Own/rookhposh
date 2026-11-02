function createRateLimit({ windowMs = 60000, maxRequests = 240 } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const key = req.ip || 'anonymous';
    const now = Date.now();
    if (!buckets.has(key) && buckets.size >= 10000) {
      for (const [address, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(address);
      if (buckets.size >= 10000) return res.status(429).json({ success: false, message: 'تعداد درخواست‌ها بیش از حد مجاز است.' });
    }
    const current = buckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now >= current.resetAt) { current.count = 0; current.resetAt = now + windowMs; }
    current.count += 1;
    buckets.set(key, current);
    if (current.count > maxRequests) return res.status(429).json({ success: false, message: 'تعداد درخواست‌ها بیش از حد مجاز است؛ کمی بعد تلاش کنید.' });
    return next();
  };
}
const basicRateLimit = createRateLimit();

function hardenHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  next();
}

module.exports = { basicRateLimit, hardenHeaders, createRateLimit };

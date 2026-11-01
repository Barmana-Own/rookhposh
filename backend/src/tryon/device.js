const net = require('node:net');
const { seal } = require('./config');

const geometry = (value, maximum) => Number.isFinite(value) && value > 0 && value <= maximum ? value : null;

function collect(req, input, jobId) {
  if (input.diagnostics_consent !== true) return { device: null, network: null, consent: false };
  const ua = String(req.headers['user-agent'] || '').slice(0, 512);
  const safe = input.device && typeof input.device === 'object' && !Array.isArray(input.device) ? input.device : {};
  const platform = /Windows NT ([0-9.]+)/.exec(ua) || /Android ([0-9.]+)/.exec(ua)
    || /(?:iPhone OS|CPU OS) ([0-9_]+)/.exec(ua) || /Mac OS X ([0-9_]+)/.exec(ua);
  let os = null;
  if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  const browser = /Edg\/([0-9.]+)/.exec(ua) ? 'Edge' : /Firefox\/([0-9.]+)/.test(ua) ? 'Firefox'
    : /Chrome\/([0-9.]+)/.test(ua) ? 'Chrome' : /Version\/([0-9.]+).*Safari/.test(ua) ? 'Safari' : null;
  const deviceType = /iPad|Tablet/.test(ua) ? 'tablet' : /Mobile|iPhone|Android/.test(ua) ? 'mobile'
    : /Windows NT|Macintosh|X11/.test(ua) ? 'desktop' : null;
  const device = {
    user_agent: ua || null, device_type: deviceType, os, os_version: platform?.[1]?.replaceAll('_', '.') || null,
    browser, device_model: null,
    screen_width: geometry(safe.screen_width, 16384), screen_height: geometry(safe.screen_height, 16384),
    viewport_width: geometry(safe.viewport_width, 16384), viewport_height: geometry(safe.viewport_height, 16384),
    pixel_ratio: geometry(safe.pixel_ratio, 8),
    language: typeof safe.language === 'string' && /^[A-Za-z0-9-]{1,35}$/.test(safe.language) ? safe.language : null,
    source: 'browser-provided; not independently verified',
  };
  // Compatibility tokens on modern Windows/Android user agents do not prove the real OS version.
  if (os === 'Windows' || /Android 10; K\)/.test(ua)) device.os_version = null;
  // Express resolves this through the configured trusted loopback proxy; never accept an IP in the body.
  const ip = String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  return { device, network: net.isIP(ip) ? seal(JSON.stringify({ ip }), 'network:' + jobId) : null, consent: true };
}

module.exports = { collect };

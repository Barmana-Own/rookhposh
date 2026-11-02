// Native Firefox WebDriver BiDi smoke test. Uses only the disposable loopback fixture.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const base = new URL(process.env.NETWORK_BASE_URL);
const fixture = JSON.parse(fs.readFileSync(process.env.NETWORK_METADATA, 'utf8'));
const dir = path.resolve(process.env.NETWORK_FIREFOX_RESULTS);
assert(base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.port && fixture.kind === 'public-ui-isolated');
fs.mkdirSync(dir, { recursive: true });
const profile = path.join(dir, 'profile-' + crypto.randomBytes(6).toString('hex'));
const downloads = path.join(dir, 'downloads');
fs.mkdirSync(profile); fs.mkdirSync(downloads, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const result = { browser: 'Firefox', checks: [], isolated: true };
let browser, socket, proxy;
async function main() {
  assert.equal((await fetch(new URL('/_fixture/state', base)).then(r => r.json())).fixture, fixture.kind);
  // All Firefox HTTP(S) traffic is confined to this proxy and this one fixture origin.
  proxy = http.createServer((req, res) => {
    let url; try { url = new URL(req.url); } catch { res.writeHead(400).end(); return; }
    if (url.origin !== base.origin) { res.writeHead(204).end(); return; }
    const upstream = http.request(url, { method: req.method, headers: req.headers }, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    res.on('close', () => upstream.destroy());
    req.on('aborted', () => upstream.destroy()); req.pipe(upstream);
  });
  proxy.on('connect', (_req, connection) => connection.end('HTTP/1.1 403 Forbidden\r\n\r\n'));
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const proxyPort = proxy.address().port;
  const prefs = {
    'network.proxy.type': 1, 'network.proxy.http': '127.0.0.1', 'network.proxy.http_port': proxyPort,
    'network.proxy.ssl': '127.0.0.1', 'network.proxy.ssl_port': proxyPort, 'network.proxy.no_proxies_on': '',
    'network.proxy.allow_hijacking_localhost': true, 'network.trr.mode': 5,
    'browser.download.folderList': 2, 'browser.download.dir': downloads, 'browser.download.useDownloadDir': true,
    'browser.helperApps.neverAsk.saveToDisk': 'image/png,image/jpeg,image/webp,application/octet-stream',
    'browser.download.alwaysOpenPanel': false, 'dom.webnotifications.enabled': false,
    'datareporting.healthreport.uploadEnabled': false, 'toolkit.telemetry.enabled': false,
    'app.update.enabled': false, 'browser.shell.checkDefaultBrowser': false,
  };
  fs.writeFileSync(path.join(profile, 'user.js'), Object.entries(prefs).map(([k, v]) => 'user_pref(' + JSON.stringify(k) + ',' + JSON.stringify(v) + ');').join('\n'));
  let address = '', stderr = '';
  browser = spawn(process.env.E2E_FIREFOX_PATH, ['--headless', '--no-remote', '--profile', profile, '--remote-debugging-port', '0', '--width', '1280', '--height', '1000'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.on('data', chunk => { stderr += chunk; address ||= /WebDriver BiDi listening on (ws:\/\/127\.0\.0\.1:\d+)/.exec(stderr)?.[1] || ''; });
  for (let n = 0; !address && n < 100; n++) { if (browser.exitCode !== null) throw Error('Firefox exited before BiDi initialization'); await sleep(100); }
  assert(address, 'Firefox BiDi did not become available');
  socket = new WebSocket(address + '/session');
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0; const pending = new Map();
  socket.addEventListener('message', event => {
    const value = JSON.parse(event.data), request = pending.get(value.id);
    if (!request) return;
    pending.delete(value.id); clearTimeout(request.timer);
    if (value.type === 'error') request.reject(Error(value.error + ': ' + value.message)); else request.resolve(value.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('BiDi timeout: ' + method)); }, 60000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const session = await command('session.new', { capabilities: { alwaysMatch: { acceptInsecureCerts: false } } });
  result.version = session.capabilities.browserVersion;
  const { context } = await command('browsingContext.create', { type: 'tab' });
  const evaluate = async expression => {
    const response = await command('script.evaluate', { target: { context }, expression, awaitPromise: true, userActivation: true });
    if (response.type !== 'success') throw Error('Firefox page evaluation failed: ' + (response.exceptionDetails?.text || response.type));
    return response.result.value;
  };
  const wait = async expression => { for (let n = 0; n < 240; n++) { if (await evaluate(expression)) return; await sleep(250); } throw Error('Firefox condition timed out'); };
  const click = text => evaluate(`(() => {const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Button not ready');b.click();return true;})()`);
  await command('browsingContext.navigate', { context, url: new URL(fixture.productPath, base).href, wait: 'interactive' });
  await wait(`!!document.querySelector('#public-tryon-title')`);
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  result.checks.push('public metadata, responsive media, RTL layout');
  await evaluate(`(() => {const bytes=Uint8Array.from(atob(${JSON.stringify(fixture.input)}),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'person.png',{type:${JSON.stringify(fixture.inputMime)}}));const input=document.querySelector('input[aria-label="فایل تصویر شخص"]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
  await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='ساخت خروجی پرو'&&!b.disabled)`);
  const before = await fetch(new URL('/_fixture/state', base)).then(r => r.json());
  for (let sample = 0; sample < 2; sample++) {
    await click('ساخت خروجی پرو');
    if (sample === 0) { await wait(`!!document.querySelector('[role="dialog"]')`); await click('پذیرش قوانین و ساخت خروجی'); }
    await wait(`document.querySelector('.public-success')?.textContent.includes('خروجی با موفقیت ذخیره شد.')`);
    await wait(`(()=>{const i=document.querySelector('img[alt="آخرین خروجی موفق پرو آنلاین"]');return !!i?.complete&&i.naturalWidth>0;})()`);
    result.checks.push('completed output decoded ' + (sample + 1));
    if (sample === 0) await click('پرو جدید');
  }
  await click('دانلود خروجی');
  let file;
  for (let n = 0; !file && n < 160; n++) {
    file = fs.readdirSync(downloads).find(name => /^rookhposh-tryon-.*\.(png|jpg|jpeg|webp)$/.test(name)); await sleep(100);
  }
  assert(file, 'Firefox did not save a real download');
  const bytes = fs.readFileSync(path.join(downloads, file));
  assert.equal(hash(bytes), hash(Buffer.from(fixture.output, 'base64')));
  result.download = { bytes: bytes.length, sha256: hash(bytes), filename: file };
  result.checks.push('actual browser download matches original output bytes');
  await evaluate(`document.querySelector('.public-history-toggle').click();true`);
  await wait(`document.querySelectorAll('.public-history-card').length===1`);
  result.checks.push('previous output accordion contains the earlier completed job');
  const shot = await command('browsingContext.captureScreenshot', { context, origin: 'document' });
  fs.writeFileSync(path.join(dir, 'firefox-completed.png'), Buffer.from(shot.data, 'base64'));
  await command('browsingContext.navigate', { context, url: new URL(fixture.productPath, base).href, wait: 'interactive' });
  await wait(`(()=>{const i=document.querySelector('img[alt="آخرین خروجی موفق پرو آنلاین"]');return !!i?.complete&&i.naturalWidth>0;})()`);
  result.checks.push('latest successful output survives navigation');
  const after = await fetch(new URL('/_fixture/state', base)).then(r => r.json());
  assert.equal(after.calls - before.calls, 2); assert.equal(after.uses - before.uses, 2); assert.equal(after.customer_amount - before.customer_amount, 0);
  result.checks.push('one provider call and seller usage per job; customer charge zero');
  await command('browser.close'); result.status = 'PASS';
}
main().catch(error => {
  result.status = error.message.startsWith('BiDi timeout:') ? 'BLOCKED' : 'FAIL';
  result.error = error.message; process.exitCode = result.status === 'BLOCKED' ? 2 : 1;
}).finally(async () => {
  socket?.close();
  if (browser && browser.exitCode === null) browser.kill();
  if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
});

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  chromium
} = require('@playwright/test');
const base = process.env.NETWORK_BASE_URL,
  metadata = JSON.parse(fs.readFileSync(process.env.NETWORK_METADATA, 'utf8')),
  dir = process.env.NETWORK_RESULTS;
const target = new URL(base);
if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || !target.port || metadata.kind !== 'public-ui-isolated') throw Error('Isolated fixture required');
fs.mkdirSync(dir, {
  recursive: true
});
const result = {
  label: process.env.NETWORK_LABEL,
  profiles: [],
  interactive: [],
  concurrency: [],
  provider: 'controlled 200ms, same original output bytes; no external AI calls'
};
const profiles = ['queue20', 'interactive', 'baseline'].includes(process.env.NETWORK_PHASE) ? [] : [['Fast4G', 50, 4_000_000], ['Slow4G', 150, 1_600_000], ['Slow3G', 400, 400_000], ['HighLatency', 1000, 1_600_000], ['DelayedAPI', 0, 20_000_000]];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function interactive(browser) {
  if (process.env.NETWORK_PHASE === 'queue20') return;
  for (let sample = 0; sample < 5; sample++) {
    const context = await browser.newContext({
      viewport: {
        width: 1440,
        height: 1000
      },
      baseURL: base,
      extraHTTPHeaders: {
        'X-Forwarded-For': '203.0.113.' + (sample + 1)
      }
    });
    await context.route(url => ['cdn.kavenegar.com', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname), r => r.fulfill({
      status: 200,
      body: ''
    }));
    const page = await context.newPage();
    await page.bringToFront();
    const ownedResourceReads = [];
    const outputTransfers = [];
    const visibility = [];
    await page.exposeFunction('recordBenchmarkVisibility', value => visibility.push({ at: Date.now(), hidden: value }));
    await page.addInitScript(() => {
      document.addEventListener('visibilitychange', () => window.recordBenchmarkVisibility(document.hidden));
      window.__benchmarkUploads = [];
      document.addEventListener('load', event => {
        if (event.target instanceof HTMLImageElement && event.target.alt === 'آخرین خروجی موفق پرو آنلاین') window.__benchmarkOutputLoaded = performance.timeOrigin + performance.now();
      }, true);
      const originalOpen = XMLHttpRequest.prototype.open, originalSend = XMLHttpRequest.prototype.send;
      const jobs = new WeakSet();
      XMLHttpRequest.prototype.open = function (method, url, ...args) {
        if (method === 'POST' && new URL(url, location.href).pathname.endsWith('/pro/jobs')) jobs.add(this);
        else jobs.delete(this);
        return originalOpen.call(this, method, url, ...args);
      };
      XMLHttpRequest.prototype.send = function (...args) {
        if (jobs.has(this)) {
          const started = performance.now();
          this.upload.addEventListener('loadend', () => window.__benchmarkUploads.push(performance.now() - started), { once: true });
        }
        return originalSend.apply(this, args);
      };
    });
    let submitAt, termsFinishedAt, jobId, acceptAt, serverMs, inputHash, inputBytes;
    page.on('request', r => {
      if (r.method() === 'GET' && new URL(r.url()).pathname.startsWith('/api/tryon/jobs/')) ownedResourceReads.push({ at: Date.now(), kind: new URL(r.url()).pathname.includes('/images/') ? 'image' : 'job' });
      if (r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/pro/jobs')) {
        submitAt = Date.now();
        const p = JSON.parse(r.postData());
        const bytes = Buffer.from(p.image.split(',')[1], 'base64');
        inputHash = crypto.createHash('sha256').update(bytes).digest('hex');
        inputBytes = bytes.length;
      }
    });
    page.on('requestfinished', r => {
      if (r.method() === 'GET' && new URL(r.url()).pathname.endsWith('/images/output')) outputTransfers.push(r.timing());
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/tryon/terms') {
        const t = r.timing();
        termsFinishedAt = t.startTime + t.responseEnd;
      }
    });
    page.on('response', async r => {
      if (r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/pro/jobs') && r.status() === 202) {
        jobId = (await r.json()).data.id;
        acceptAt = Date.now();
        serverMs = Number(r.headers()['server-timing']?.split('dur=')[1]) || null;
      }
    });
    await page.goto(base + metadata.productPath, {
      waitUntil: 'networkidle',
      timeout: 90000
    });
    const selection = Date.now();
    await page.getByLabel('فایل تصویر شخص').setInputFiles({
      name: 'person.' + (metadata.inputMime === 'image/jpeg' ? 'jpg' : 'png'),
      mimeType: metadata.inputMime,
      buffer: Buffer.from(metadata.input, 'base64')
    });
    const start = page.getByRole('button', {
      name: 'ساخت خروجی پرو',
      exact: true
    });
    await start.waitFor();
    for (let n = 0; n < 100 && !(await start.isEnabled()); n++) await sleep(50);
    if (!(await start.isEnabled())) throw Error('Generation was not ready');
    const selectionMs = Date.now() - selection;
    await start.click();
    const terms = page.getByRole('dialog', {
      name: 'قوانین استفاده از پرو آنلاین',
      exact: true
    });
    await terms.waitFor();
    const clickAt = Date.now();
    await terms.getByRole('button', {
      name: 'پذیرش قوانین و ساخت خروجی',
      exact: true
    }).click();
    await page.getByText('خروجی با موفقیت ذخیره شد.', {
      exact: true
    }).waitFor({
      timeout: 30000
    });
    const completedObservedAt = Date.now();
    await page.getByAltText('آخرین خروجی موفق پرو آنلاین').waitFor({
      timeout: 30000
    });
    await page.waitForFunction(() => {
      const i = document.querySelector('.public-result-stage img');
      return i?.complete && i.naturalWidth > 0;
    });
    const renderedAt = Date.now();
    const c0 = Date.now(),
      state = await context.request.get('/_fixture/state', { maxRetries: 2 }).then(r => r.json()),
      c1 = Date.now();
    const clockOffset = (c0 + c1) / 2 - state.serverEpoch;
    const event = state.providerEvents.find(e => e.id === jobId);
    const marks = await page.evaluate(() => performance.getEntriesByName('rookhposh.tryon.accepted').map(e => e.detail));
    const record = {
      sample,
      jobId,
      selectionMs,
      preparationAfterTermsMs: termsFinishedAt ? submitAt - termsFinishedAt : null,
      clickToPostMs: submitAt - clickAt,
      submissionMs: acceptAt - submitAt,
      serverMs,
      inputHash,
      inputBytes,
      xhrUploadLoadEndMs: await page.evaluate(() => window.__benchmarkUploads),
      outputTransfers: outputTransfers.map(timing => ({ startAfterClickMs: timing.startTime - clickAt, ttfbMs: timing.responseStart, totalMs: timing.responseEnd })),
      imageLoadAfterClickMs: await page.evaluate(() => window.__benchmarkOutputLoaded) - clickAt,
      completedObservedMs: completedObservedAt - clickAt,
      totalRenderedMs: renderedAt - clickAt,
      providerRoundTripMs: event ? event.ended - event.started : null,
      providerEndToRenderedMs: event ? renderedAt - event.ended - clockOffset : null,
      clockOffsetMs: clockOffset,
      clockUncertaintyMs: (c1 - c0) / 2,
      stages: state.stageTimes?.[jobId],
      runtimeTimings: state.workerTimings?.find(e => e.job_id === jobId),
      hiddenAtCompletion: await page.evaluate(() => document.hidden),
      visibility: visibility.map(e => ({ ...e, at: e.at - clickAt })),
      ownedResourceReads: ownedResourceReads.map(e => ({ atMs: e.at - clickAt, kind: e.kind })),
      marks
    };
    result.interactive.push(record);
    console.log(JSON.stringify({
      interactive: sample,
      total: record.totalRenderedMs,
      submission: record.submissionMs,
      provider: record.providerRoundTripMs
    }));
    fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(result, null, 2));
    await context.close();
  }
}
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.E2E_CHROME_PATH
  });
  try {
    for (const [name, latency, bits] of profiles) {
      const context = await browser.newContext({
        viewport: {
          width: 1440,
          height: 1000
        },
        baseURL: base,
        extraHTTPHeaders: {
          'X-Forwarded-For': '192.0.2.' + (30 + result.profiles.length)
        }
      });
      await context.route(url => ['cdn.kavenegar.com', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname), r => r.fulfill({
        status: 200,
        body: ''
      }));
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__perf = {
          cls: 0,
          lcp: null
        };
        new PerformanceObserver(list => {
          for (const e of list.getEntries()) window.__perf.lcp = e.startTime;
        }).observe({
          type: 'largest-contentful-paint',
          buffered: true
        });
        new PerformanceObserver(list => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
        }).observe({
          type: 'layout-shift',
          buffered: true
        });
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', {
        cacheDisabled: true
      });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency,
        downloadThroughput: bits / 8,
        uploadThroughput: bits / 16
      });
      let requests = 0,
        bytes = 0,
        errors = [],
        api = [],
        delayed = false;
      cdp.on('Network.loadingFinished', e => bytes += e.encodedDataLength);
      page.on('request', () => requests++);
      page.on('requestfailed', r => {
        if (r.url().includes('/api/stores/')) api.push({
          failure: r.failure()?.errorText,
          timing: r.timing()
        });
      });
      page.on('response', r => {
        if (new URL(r.url()).pathname.startsWith('/api/stores/') && !new URL(r.url()).pathname.includes('/pro/')) api.push({
          kind: new URL(r.url()).pathname.includes('/media/') ? 'public-image' : 'metadata',
          status: r.status(),
          bytes: Number(r.headers()['content-length'] || 0),
          timing: r.request().timing()
        });
      });
      page.on('pageerror', e => errors.push(e.message));
      if (name === 'DelayedAPI') await page.route('**/api/stores/*', async route => {
        if (!delayed) {
          delayed = true;
          await sleep(14000);
        }
        try { await route.continue(); }
        catch (error) { if (!route.request().failure() && !page.isClosed()) throw error; }
      });
      const start = Date.now();
      await page.goto(base + metadata.productPath, {
        waitUntil: 'domcontentloaded',
        timeout: 100000
      });
      await page.waitForFunction(() => document.querySelector('#public-tryon-title, [data-testid="public-recovery"], .public-state:not([role="status"])'), {}, {
        timeout: 100000
      });
      const useful = (await page.locator('#public-tryon-title').count()) > 0,
        usableMs = Date.now() - start;
      let settled = true;
      await page.waitForLoadState('networkidle', {
        timeout: 15000
      }).catch(() => settled = false);
      const perf = await page.evaluate(() => ({
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
        lcp: window.__perf?.lcp ?? null,
        cls: window.__perf?.cls ?? null,
        ttfb: performance.getEntriesByType('navigation')[0]?.responseStart ?? null
      }));
      const record = {
        name,
        latency,
        bits,
        useful,
        usableMs,
        requests,
        bytes,
        settled,
        ...perf,
        api,
        errors
      };
      result.profiles.push(record);
      await page.screenshot({
        path: path.join(dir, name + '.png'),
        fullPage: true,
        animations: 'disabled'
      });
      console.log(JSON.stringify(record));
      fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(result, null, 2));
      await context.close();
    }
    await interactive(browser);
    const control = await browser.newContext({
      baseURL: base
    });
    const state = await control.request.get('/_fixture/state', { maxRetries: 2 }).then(r => r.json());
    if (state.fixture !== 'public-ui-isolated') throw Error('Wrong fixture');
    for (const count of process.env.NETWORK_PHASE === 'interactive' ? [] : process.env.NETWORK_PHASE === 'queue20' ? [20] : [1, 5, 10, 20]) {
      await control.request.post('/_fixture/hold', { maxRetries: 2 });
      const before = await control.request.get('/_fixture/state', { maxRetries: 2 }).then(r => r.json());
      const clients = await Promise.all(Array.from({
        length: count
      }, async (_, index) => {
        const c = await browser.newContext({
          baseURL: base,
          extraHTTPHeaders: {
            'X-Forwarded-For': '198.51.100.' + (index + 1)
          }
        });
        const t = await c.request.get('/api/tryon/terms', { maxRetries: 2 }).then(r => r.json());
        await c.request.post('/api/tryon/terms', {
          headers: {
            Origin: base
          },
          data: {
            version: t.data.version,
            accepted: true
          }
        });
        const start = Date.now();
        const response = await c.request.post(metadata.productPath.replace('/stores/', '/api/stores/') + '/pro/jobs', {
          headers: {
            Origin: base
          },
          data: {
            image: 'data:' + metadata.inputMime + ';base64,' + metadata.input,
            image_index: 0,
            request_key: crypto.randomUUID(),
            diagnostics_consent: false
          }
        });
        if (response.status() !== 202) throw Error('Job rejected ' + response.status());
        return {
          context: c,
          id: (await response.json()).data.id,
          accepted: Date.now(),
          acceptServerMs: Number(response.headers()['server-timing']?.split('dur=')[1]) || null,
          createMs: Date.now() - start
        };
      }));
      const release = Date.now();
      await control.request.post('/_fixture/release', { maxRetries: 2 });
      let after;
      for (let n = 0; n < 300; n++) {
        after = await control.request.get('/_fixture/state', { maxRetries: 2 }).then(r => r.json());
        if (after.uses - before.uses === count) break;
        await sleep(250);
      }
      if (after.uses - before.uses !== count) throw Error('Jobs did not settle');
      const settledAfterReleaseMs = Date.now() - release;
      const jobs = [];
      for (const c of clients) {
        const response = await c.context.request.get('/api/tryon/jobs/' + c.id, { maxRetries: 2 });
        const j = (await response.json()).data;
        if (j.status !== 'completed') throw Error('Job failed');
        const output = await c.context.request.get(j.images.output.url + '?download=1', { maxRetries: 2 });
        const b = await output.body();
        if (crypto.createHash('sha256').update(b).digest('hex') !== crypto.createHash('sha256').update(Buffer.from(metadata.output, 'base64')).digest('hex')) throw Error('Output changed');
        jobs.push({
          id: c.id,
          createMs: c.createMs,
          acceptServerMs: c.acceptServerMs,
          created: j.created_at,
          started: j.started_at,
          completed: j.completed_at
        });
        await c.context.close();
      }
      const events = after.providerEvents.filter(e => clients.some(c => c.id === e.id));
      const record = {
        count,
        workerTimings: after.workerTimings?.filter(e => clients.some(c => c.id === e.job_id)),
        stageTimes: Object.fromEntries(clients.map(c => [c.id, after.stageTimes?.[c.id]])),
        completionAfterReleaseMs: Date.now() - release,
        settledAfterReleaseMs,
        calls: after.calls - before.calls,
        uses: after.uses - before.uses,
        customerAmount: after.customer_amount - before.customer_amount,
        cpuUserMicros: after.cpu.user - before.cpu.user,
        cpuSystemMicros: after.cpu.system - before.cpu.system,
        rss: after.memory.rss,
        events,
        jobs
      };
      if (record.calls !== count || record.customerAmount !== 0) throw Error('Accounting invariant');
      result.concurrency.push(record);
      console.log(JSON.stringify({
        concurrency: count,
        duration: record.completionAfterReleaseMs,
        calls: record.calls,
        uses: record.uses
      }));
      fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(result, null, 2));
    }
    await control.close();
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(dir, 'exit'), '0');
})().catch(error => {
  console.error(error.stack);
  fs.writeFileSync(path.join(dir, 'exit'), '1');
  process.exitCode = 1;
});

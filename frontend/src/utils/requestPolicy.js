export const READ_TIMEOUT_MS = 12_000;
export const FILE_TIMEOUT_MS = 300_000;

export function parseRetryAfter(value, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) ? Math.max(0, ms) : 0;
}

export function isCancelled(error) {
  return error?.code === 'ERR_CANCELED' || error?.name === 'AbortError' || error?.cancelled;
}

export function isTransient(error) {
  if (isCancelled(error)) return false;
  return [0, 408, 429, 500, 502, 503, 504].includes(Number(error?.status ?? 0));
}

export function pollDelay({ failures = 0, reads = 0, hidden = false, retryAfterMs = 0 } = {}) {
  const delay = failures ? Math.min(30_000, 1000 * (2 ** Math.min(failures - 1, 5))) : hidden ? 8000 : Math.min(2000, 500 * (2 ** Math.min(reads, 2)));
  return Math.max(delay, hidden ? 8000 : 0, retryAfterMs);
}

function cancelled() {
  return Object.assign(new Error('Request cancelled'), { code: 'ERR_CANCELED', cancelled: true });
}

export function waitForRetry(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    const abort = () => { clearTimeout(timer); reject(cancelled()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

// Only explicit GET callers use this policy. Mutations are never retried here.
export async function readWithRetry(action, { signal, retries = 2, random = Math.random, sleep = waitForRetry } = {}) {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw cancelled();
    try {
      if (globalThis.navigator?.onLine === false) throw { status: 0, code: 'OFFLINE', message: 'اتصال اینترنت قطع است.' };
      return await action();
    } catch (error) {
      if (signal?.aborted || isCancelled(error)) throw cancelled();
      if (!isTransient(error) || attempt >= retries || globalThis.navigator?.onLine === false) throw error;
      const delay = error.retryAfterMs || 400 * (2 ** attempt) * (0.75 + random() * 0.5);
      // Long server cooldowns return a recoverable state, rather than hold a hidden retry open.
      if (delay > 8000) throw error;
      await sleep(delay, signal);
    }
  }
}

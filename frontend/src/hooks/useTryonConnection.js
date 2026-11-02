import { useEffect, useRef } from 'react';
import { tryonApi } from '../services/tryonApi.js';
import { activeTryonStates } from '../utils/tryon.js';
import { pollDelay } from '../utils/requestPolicy.js';

export function useTryonConnection({ job, pendingKey, recoveringJobId, revision, token, onJob, onConnection }) {
  const callbacks = useRef({ onJob, onConnection });
  useEffect(() => { callbacks.current = { onJob, onConnection }; }, [onJob, onConnection]);
  const id = recoveringJobId || job?.id;
  const status = job?.status;
  const enabled = Boolean(pendingKey || recoveringJobId || id && activeTryonStates.has(status));
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true, inFlight = false, halted = false, timer, failures = 0, reads = 0, retryAt = 0;
    const controller = new AbortController();
    const schedule = delay => { if (active) { clearTimeout(timer); timer = setTimeout(poll, Math.min(delay, 2_147_483_647)); } };
    async function poll() {
      if (!active || inFlight || halted) return;
      if (Date.now() < retryAt) { schedule(retryAt - Date.now()); return; }
      if (globalThis.navigator?.onLine === false) {
        callbacks.current.onConnection({ reconnecting: true, offline: true });
        schedule(8000); return;
      }
      inFlight = true;
      let terminal = false;
      try {
        let next;
        try {
          next = pendingKey ? await tryonApi.byRequest(pendingKey, token, controller.signal) : await tryonApi.job(id, token, controller.signal);
        } catch (error) {
          if (!pendingKey || error.status !== 404) throw error;
          const history = await tryonApi.history(1, token, controller.signal);
          next = history.active_job;
        }
        if (active && next) {
          failures = 0; reads++;
          callbacks.current.onJob(next);
          callbacks.current.onConnection({ reconnecting: false, offline: false });
          terminal = !activeTryonStates.has(next.status);
        } else if (active) {
          failures++;
          callbacks.current.onConnection({ reconnecting: true, offline: false, recoveryMissing: true });
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          if ([400, 401, 403, 404, 410].includes(error.status)) {
            halted = true; terminal = true;
            callbacks.current.onConnection({ trackingStopped: true, reconnecting: false, offline: false,
              error: error.message || 'دریافت وضعیت این عملیات مجاز یا ممکن نیست.' });
          } else {
            failures++; retryAt = Date.now() + (error.retryAfterMs || 0);
            callbacks.current.onConnection({ reconnecting: true, offline: globalThis.navigator?.onLine === false });
          }
        }
      } finally {
        inFlight = false;
        if (!terminal) schedule(pollDelay({ failures, reads, hidden: globalThis.document?.hidden, retryAfterMs: Math.max(0, retryAt - Date.now()) }));
      }
    }
    const connected = () => { clearTimeout(timer); void poll(); };
    const visible = () => { if (!globalThis.document?.hidden) connected(); };
    globalThis.addEventListener?.('online', connected);
    globalThis.document?.addEventListener('visibilitychange', visible);
    schedule(500);
    return () => {
      active = false; clearTimeout(timer); controller.abort();
      globalThis.removeEventListener?.('online', connected);
      globalThis.document?.removeEventListener('visibilitychange', visible);
    };
  }, [enabled, id, status, pendingKey, recoveringJobId, revision, token]);
}
